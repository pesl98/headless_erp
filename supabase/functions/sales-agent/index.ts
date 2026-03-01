import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskEvent {
  event_id: string;
  payload: {
    sales_order_id: string;
    customer_id: string;
    customer_email: string;
    customer_tier: string;
    estimated_value: number;
    items: Array<{
      product_id: string;
      sku: string;
      product_name: string;
      quantity: number;
      unit_price: number;
    }>;
    source?: string;
    notes?: string;
  };
}

interface AgentSkill {
  skill_name: string;
  domain_knowledge: string;
  activation_condition: {
    event_types?: string[];
    always?: boolean;
    threshold_pct?: number;
    action?: string;
    data_source?: string;
  };
}

interface MarketIntelligence {
  product_sku: string;
  market_average_price: number;
}

interface ProcessResult {
  event_id: string;
  sales_order_id: string;
  status: "confirmed" | "failed" | "skipped";
  reason?: string;
  discount_pct?: number;
  final_value?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return JSON.stringify(err);
}

// Tier discounts aligned with erp_agent_skills discount_authority_matrix SOP
function getDiscount(tier: string): number {
  switch (tier?.toLowerCase()) {
    case "platinum": return 20;
    case "gold":     return 10;
    case "silver":   return 5;
    default:         return 0; // standard
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const results: ProcessResult[] = [];
  const errors: string[] = [];

  try {
    // ── 1. Resolve sales agent UUID ───────────────────────────────────────────
    const { data: agent, error: agentError } = await supabase
      .from("erp_agents")
      .select("agent_id")
      .eq("role_name", "sales_agent")
      .single();

    if (agentError || !agent) {
      throw new Error("sales_agent not found in erp_agents");
    }

    // ── 2. Skill Injection — load ORDER_NEGOTIATION SOPs ─────────────────────
    // Layer 2 of the Cognition Loop: query erp_agent_skills before any action.
    const { data: skillRows } = await supabase
      .from("erp_agent_skills")
      .select("skill_name, domain_knowledge, activation_condition")
      .eq("agent_id", agent.agent_id);

    const skills: AgentSkill[] = (skillRows ?? []).filter((s: AgentSkill) => {
      const cond = s.activation_condition;
      return cond?.event_types?.includes("ORDER_NEGOTIATION") || cond?.always;
    });

    // Extract market intelligence SOP parameters
    const marketSkill = skills.find(
      (s) => s.skill_name === "market_intelligence_price_validation"
    );
    const marketThresholdPct = marketSkill?.activation_condition?.threshold_pct ?? 10;

    console.log(
      `[SOP] Loaded ${skills.length} ORDER_NEGOTIATION skill(s).`,
      `Market price deviation threshold: ${marketThresholdPct}%`
    );

    // ── 3. Claim pending ORDER_NEGOTIATION events ─────────────────────────────
    const { data: events, error: fetchError } = await supabase
      .from("erp_task_events")
      .select("event_id, payload")
      .eq("event_type", "ORDER_NEGOTIATION")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(20);

    if (fetchError) throw fetchError;
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending orders." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Mark all fetched events as 'processing' (optimistic lock)
    const eventIds = events.map((e: TaskEvent) => e.event_id);
    await supabase
      .from("erp_task_events")
      .update({ status: "processing" })
      .in("event_id", eventIds);

    // ── 4. Pre-load market intelligence for all SKUs in this batch ────────────
    // Single query covers all events — avoids N+1 inside the loop.
    const allSkus = [
      ...new Set(
        (events as TaskEvent[]).flatMap((e) =>
          e.payload.items?.map((i) => i.sku) ?? []
        )
      ),
    ];

    let marketMap: Map<string, number> = new Map();
    if (marketSkill && allSkus.length > 0) {
      const { data: marketRows } = await supabase
        .from("erp_market_intelligence")
        .select("product_sku, market_average_price")
        .in("product_sku", allSkus)
        // Use the most recent benchmark period per SKU
        .order("reference_period_end", { ascending: false });

      // Keep only the latest row per SKU
      for (const row of (marketRows ?? []) as MarketIntelligence[]) {
        if (!marketMap.has(row.product_sku)) {
          marketMap.set(row.product_sku, Number(row.market_average_price));
        }
      }
      console.log(`[SOP] Market intelligence loaded for ${marketMap.size}/${allSkus.length} SKUs.`);
    }

    // ── 5. Process each event ─────────────────────────────────────────────────
    for (const event of events as TaskEvent[]) {
      const result = await processOrderEvent(
        supabase,
        agent.agent_id,
        event,
        marketMap,
        marketThresholdPct
      );
      results.push(result);

      if (result.status === "confirmed") {
        await supabase
          .from("erp_task_events")
          .update({ status: "completed", processed_at: new Date().toISOString() })
          .eq("event_id", event.event_id);
      } else if (result.status === "failed") {
        await supabase
          .from("erp_task_events")
          .update({
            status: "failed",
            error_message: result.reason ?? "Unknown error",
            processed_at: new Date().toISOString(),
          })
          .eq("event_id", event.event_id);
        errors.push(`${event.event_id}: ${result.reason}`);
      } else {
        // skipped — release back to pending
        await supabase
          .from("erp_task_events")
          .update({ status: "pending" })
          .eq("event_id", event.event_id);
      }
    }

    const confirmed = results.filter((r) => r.status === "confirmed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: events.length,
        confirmed,
        failed,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const message = extractMessage(err);
    console.error("sales-agent error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ── Process a single ORDER_NEGOTIATION event ──────────────────────────────────

async function processOrderEvent(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  event: TaskEvent,
  marketMap: Map<string, number>,
  marketThresholdPct: number
): Promise<ProcessResult> {
  const { sales_order_id, customer_id, customer_tier, estimated_value, items } =
    event.payload;

  try {
    // ── A. Verify order is still in 'draft' ───────────────────────────────────
    const { data: order, error: orderFetchError } = await supabase
      .from("erp_sales_orders")
      .select("sales_order_id, order_status, total_invoice_value, discount_percent")
      .eq("sales_order_id", sales_order_id)
      .single();

    if (orderFetchError || !order) {
      return { event_id: event.event_id, sales_order_id, status: "failed", reason: "Sales order not found or already processed" };
    }

    if (order.order_status !== "draft") {
      return { event_id: event.event_id, sales_order_id, status: "skipped", reason: `Order already in status: ${order.order_status}` };
    }

    // ── B. SOP: market_intelligence_price_validation ──────────────────────────
    // "Vergelijk de voorgestelde verkoopprijs per SKU met de gemiddelde marktprijs
    //  van de laatste 3 maanden. Weiger elk aanbod >10% boven dit gemiddelde."
    if (marketMap.size > 0 && items?.length > 0) {
      for (const item of items) {
        const marketAvg = marketMap.get(item.sku);
        if (marketAvg === undefined) {
          console.warn(`[SOP] No market data for SKU ${item.sku} — proceeding without check.`);
          continue;
        }
        const upperBound = marketAvg * (1 + marketThresholdPct / 100);
        const deviationPct = ((item.unit_price - marketAvg) / marketAvg) * 100;

        if (item.unit_price > upperBound) {
          const reason =
            `SOP 'market_intelligence_price_validation': SKU ${item.sku} ` +
            `unit_price €${item.unit_price.toFixed(2)} is ${deviationPct.toFixed(1)}% above ` +
            `the 3-month market average €${marketAvg.toFixed(2)} ` +
            `(threshold: ${marketThresholdPct}%). Order rejected.`;

          await supabase.from("erp_authorization_logs").insert({
            target_record_id: sales_order_id,
            target_table: "erp_sales_orders",
            authorizing_agent: agentId,
            authorizing_role: "sales_agent",
            reason,
          });

          return { event_id: event.event_id, sales_order_id, status: "failed", reason };
        }

        console.log(
          `[SOP] Market check OK — ${item.sku}:`,
          `€${item.unit_price} vs market avg €${marketAvg}`,
          `(${deviationPct >= 0 ? "+" : ""}${deviationPct.toFixed(1)}%)`
        );
      }
    }

    // ── C. Check inventory availability ───────────────────────────────────────
    for (const item of items) {
      const { data: inv, error: invError } = await supabase
        .from("erp_inventory")
        .select("current_quantity_available")
        .eq("product_id", item.product_id)
        .maybeSingle();

      if (invError || !inv) {
        return { event_id: event.event_id, sales_order_id, status: "failed", reason: `No inventory record for SKU ${item.sku}` };
      }

      if (inv.current_quantity_available < item.quantity) {
        return {
          event_id: event.event_id,
          sales_order_id,
          status: "failed",
          reason: `Insufficient stock for ${item.sku}: need ${item.quantity}, have ${inv.current_quantity_available}`,
        };
      }
    }

    // ── D. Check credit limit ─────────────────────────────────────────────────
    const { data: customer } = await supabase
      .from("erp_customers")
      .select("maximum_credit_limit, current_balance, account_status")
      .eq("customer_id", customer_id)
      .single();

    if (customer?.account_status === "suspended") {
      return { event_id: event.event_id, sales_order_id, status: "failed", reason: "Customer account is suspended" };
    }

    // Apply tier discount per erp_agent_skills discount_authority_matrix SOP
    const discountPct = getDiscount(customer_tier);
    const baseValue = Number(order.total_invoice_value) || estimated_value;
    const finalValue = Math.round(baseValue * (1 - discountPct / 100) * 100) / 100;

    if (customer) {
      const projectedBalance = Number(customer.current_balance) + finalValue;
      if (projectedBalance > Number(customer.maximum_credit_limit)) {
        return {
          event_id: event.event_id,
          sales_order_id,
          status: "failed",
          reason: `Credit limit exceeded: projected balance ${projectedBalance.toFixed(2)} > limit ${customer.maximum_credit_limit}`,
        };
      }
    }

    // ── E. Confirm the order ──────────────────────────────────────────────────
    // The DB trigger erp_sales_order_confirmed_trigger fires on draft→confirmed:
    // deducts inventory quantities + emits INVOICE_CUSTOMER task event.
    const { error: confirmError } = await supabase
      .from("erp_sales_orders")
      .update({
        order_status: "confirmed",
        discount_percent: discountPct,
        total_invoice_value: finalValue,
      })
      .eq("sales_order_id", sales_order_id)
      .eq("order_status", "draft");

    if (confirmError) {
      return { event_id: event.event_id, sales_order_id, status: "failed", reason: extractMessage(confirmError) };
    }

    // ── F. Update customer balance ────────────────────────────────────────────
    if (customer) {
      await supabase
        .from("erp_customers")
        .update({ current_balance: Number(customer.current_balance) + finalValue })
        .eq("customer_id", customer_id);
    }

    // ── G. Authorization log ──────────────────────────────────────────────────
    await supabase.from("erp_authorization_logs").insert({
      target_record_id: sales_order_id,
      target_table: "erp_sales_orders",
      authorizing_agent: agentId,
      authorizing_role: "sales_agent",
      reason:
        `Order confirmed. Tier: ${customer_tier}, discount: ${discountPct}%, ` +
        `final value: €${finalValue.toFixed(2)}. ` +
        `Market intelligence check passed for ${items?.length ?? 0} SKU(s).`,
    });

    console.log(
      `[OK] Confirmed ${sales_order_id}`,
      `| tier: ${customer_tier}`,
      `| discount: ${discountPct}%`,
      `| value: €${finalValue}`
    );

    return { event_id: event.event_id, sales_order_id, status: "confirmed", discount_pct: discountPct, final_value: finalValue };

  } catch (err: unknown) {
    return { event_id: event.event_id, sales_order_id, status: "failed", reason: extractMessage(err) };
  }
}
