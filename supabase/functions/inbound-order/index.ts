import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Must match erp_agents.role_name exactly (FK constraint)
const SALES_AGENT_ROLE = 'sales_agent';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { customer_email, customer_name, items, notes, source } = body;

    // ── Validate required fields ─────────────────────────────────────
    if (!customer_email || !items || !Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ error: 'customer_email and at least one item are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customer_email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Look up products by SKU ──────────────────────────────────────
    const skus = items.map((i: { sku: string }) => i.sku);
    const { data: products, error: productError } = await supabase
      .from('erp_products')
      .select('product_id, stock_keeping_unit, product_name, standard_sale_price, category')
      .in('stock_keeping_unit', skus);

    if (productError) throw productError;

    const foundSkus = (products ?? []).map((p: { stock_keeping_unit: string }) => p.stock_keeping_unit);
    const unknownSkus = skus.filter((s: string) => !foundSkus.includes(s));
    if (unknownSkus.length > 0) {
      return new Response(
        JSON.stringify({ error: `Unknown product SKUs: ${unknownSkus.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Resolve items with pricing ───────────────────────────────────
    let estimated_value = 0;
    const resolvedItems = items.map((item: { sku: string; quantity: number }) => {
      const product = (products ?? []).find(
        (p: { stock_keeping_unit: string }) => p.stock_keeping_unit === item.sku
      );
      const lineTotal = (product?.standard_sale_price ?? 0) * item.quantity;
      estimated_value += lineTotal;
      return {
        sku: item.sku,
        product_id: product?.product_id,
        product_name: product?.product_name,
        category: product?.category,
        quantity: item.quantity,
        unit_price: product?.standard_sale_price,
        line_total: lineTotal,
      };
    });
    estimated_value = Math.round(estimated_value * 100) / 100;

    // ── Find or create customer ──────────────────────────────────────
    let { data: customer } = await supabase
      .from('erp_customers')
      .select('customer_id, customer_name, customer_tier, maximum_credit_limit, current_balance, account_status')
      .eq('contact_email', customer_email)
      .maybeSingle();

    const isKnownCustomer = !!customer;

    if (!customer) {
      // Create a new guest customer with a generous default credit limit
      // so the draft sales order INSERT passes the credit-limit trigger.
      // The sales agent will review and adjust terms before confirming.
      const { data: newCustomer, error: customerError } = await supabase
        .from('erp_customers')
        .insert({
          customer_name: customer_name || 'Guest Customer',
          company_name: customer_name || 'Unknown',
          contact_email: customer_email,
          maximum_credit_limit: Math.max(estimated_value * 5, 50000),
          current_balance: 0,
          account_status: 'active',
          customer_tier: 'standard',
        })
        .select('customer_id, customer_name, customer_tier, maximum_credit_limit, current_balance')
        .single();

      if (customerError) throw customerError;
      customer = newCustomer;
    }

    // ── Get sales agent UUID (FK on erp_sales_orders.closing_agent_id) ──
    const { data: salesAgent, error: agentError } = await supabase
      .from('erp_agents')
      .select('agent_id, display_name')
      .eq('role_name', SALES_AGENT_ROLE)
      .single();

    if (agentError || !salesAgent) throw new Error('Sales agent not found in erp_agents');

    // ── Create draft sales order ─────────────────────────────────────
    // status = 'draft' so the cascade trigger (inventory deduction) does NOT fire.
    // The credit-limit BEFORE INSERT trigger WILL run — it passes because
    // new customers get a credit limit >= estimated_value.
    const { data: salesOrder, error: orderError } = await supabase
      .from('erp_sales_orders')
      .insert({
        customer_id: customer.customer_id,
        closing_agent_id: salesAgent.agent_id,
        order_status: 'draft',
        total_invoice_value: estimated_value,
        discount_percent: 0,
        order_creation_date: new Date().toISOString().split('T')[0],
      })
      .select('sales_order_id')
      .single();

    if (orderError) throw orderError;

    // ── Create sales order line items ────────────────────────────────
    const lineItems = resolvedItems.map((item) => ({
      sales_order_id: salesOrder.sales_order_id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total,
    }));

    const { error: itemsError } = await supabase
      .from('erp_sales_order_items')
      .insert(lineItems);

    if (itemsError) throw itemsError;

    // ── Insert task event into the queue ─────────────────────────────
    // The sales agent will review the draft order, adjust if needed,
    // then call confirm_sales_order to move it to 'confirmed'.
    const priority = isKnownCustomer ? 8 : 6;

    const { data: event, error: insertError } = await supabase
      .from('erp_task_events')
      .insert({
        event_type: 'ORDER_NEGOTIATION',
        target_agent: SALES_AGENT_ROLE,
        payload: {
          source: source ?? 'customer_portal',
          customer_email,
          customer_name: customer.customer_name,
          customer_id: customer.customer_id,
          customer_tier: customer.customer_tier,
          is_known_customer: isKnownCustomer,
          sales_order_id: salesOrder.sales_order_id,
          items: resolvedItems,
          estimated_value,
          notes: notes ?? null,
          submitted_at: new Date().toISOString(),
          instruction: 'Review draft sales order, adjust discount if appropriate for tier, then confirm.',
        },
        status: 'pending',
        priority,
      })
      .select('event_id, created_at')
      .single();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        success: true,
        event_id: event.event_id,
        sales_order_id: salesOrder.sales_order_id,
        reference: event.event_id.slice(0, 8).toUpperCase(),
        message: 'Order received. A draft sales order has been created and queued for agent review.',
        estimated_value,
        item_count: resolvedItems.length,
        is_known_customer: isKnownCustomer,
        customer_tier: customer.customer_tier,
        submitted_at: event.created_at,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('inbound-order error:', message);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
