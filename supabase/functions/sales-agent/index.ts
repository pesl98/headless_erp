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

interface ProcessResult {
  event_id: string;
  sales_order_id: string;
  status: "confirmed" | "failed" | "skipped";
  reason?: string;
  discount_pct?: number;
  final_value?: number;
}

// ── Discount by customer tier ─────────────────────────────────────────────────

function getDiscount(tier: string): number {
  switch (tier?.toLowerCase()) {
    case "vip":
      return 10;
    case "premium":
      return 5;
    default:
      return 0;
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
    // ── 1. Claim pending ORDER_NEGOTIATION events ─────────────────────────
    // Atomically mark them 'processing' so concurrent calls don't double-process.
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

    // Mark all fetched events as 'processing' immediately (optimistic lock)
    const eventIds = events.map((e: TaskEvent) => e.event_id);
    await supabase
      .from("erp_task_events")
      .update({ status: "processing" })
      .in("event_id", eventIds);

    // ── 2. Process each event ─────────────────────────────────────────────
    for (const event of events as TaskEvent[]) {
      const result = await processOrderEvent(supabase, event);
      results.push(result);

      if (result.status === "confirmed") {
        await supabase
          .from("erp_task_events")
          .update({ status: "processed", processed_at: new Date().toISOString() })
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
        // skipped — put back to pending
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
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
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
  event: TaskEvent
): Promise<ProcessResult> {
  const { sales_order_id, customer_id, customer_tier, estimated_value, items } =
    event.payload;

  try {
    // ── A. Verify the sales order still exists and is in 'draft' ─────────
    const { data: order, error: orderFetchError } = await supabase
      .from("erp_sales_orders")
      .select("sales_order_id, order_status, total_invoice_value, discount_percent")
      .eq("sales_order_id", sales_order_id)
      .single();

    if (orderFetchError || !order) {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "failed",
        reason: "Sales order not found or already processed",
      };
    }

    if (order.order_status !== "draft") {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "skipped",
        reason: `Order already in status: ${order.order_status}`,
      };
    }

    // ── B. Check inventory availability for all line items ────────────────
    for (const item of items) {
      const { data: inv, error: invError } = await supabase
        .from("erp_inventory")
        .select("current_quantity_available")
        .eq("product_id", item.product_id)
        .maybeSingle();

      if (invError || !inv) {
        return {
          event_id: event.event_id,
          sales_order_id,
          status: "failed",
          reason: `No inventory record found for SKU ${item.sku}`,
        };
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

    // ── C. Check credit limit for the customer ────────────────────────────
    const { data: customer } = await supabase
      .from("erp_customers")
      .select("maximum_credit_limit, current_balance, account_status")
      .eq("customer_id", customer_id)
      .single();

    if (customer?.account_status === "suspended") {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "failed",
        reason: "Customer account is suspended",
      };
    }

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
          reason: `Credit limit exceeded: order would bring balance to ${projectedBalance.toFixed(2)} vs limit ${customer.maximum_credit_limit}`,
        };
      }
    }

    // ── D. Confirm the order (triggers inventory deduction + INVOICE_CUSTOMER) ──
    // The DB trigger erp_sales_order_confirmed_trigger fires on draft→confirmed
    // and automatically: deducts inventory + inserts INVOICE_CUSTOMER task event.
    const { error: confirmError } = await supabase
      .from("erp_sales_orders")
      .update({
        order_status: "confirmed",
        discount_percent: discountPct,
        total_invoice_value: finalValue,
      })
      .eq("sales_order_id", sales_order_id)
      .eq("order_status", "draft"); // safety check

    if (confirmError) {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "failed",
        reason:
          confirmError instanceof Error
            ? confirmError.message
            : typeof confirmError === "object" && "message" in confirmError
            ? String((confirmError as { message: unknown }).message)
            : JSON.stringify(confirmError),
      };
    }

    // ── E. Update customer balance ────────────────────────────────────────
    if (customer) {
      await supabase
        .from("erp_customers")
        .update({
          current_balance: Number(customer.current_balance) + finalValue,
        })
        .eq("customer_id", customer_id);
    }

    console.log(
      `Confirmed order ${sales_order_id} for customer ${customer_id}`,
      `| tier: ${customer_tier}`,
      `| discount: ${discountPct}%`,
      `| value: ${finalValue}`
    );

    return {
      event_id: event.event_id,
      sales_order_id,
      status: "confirmed",
      discount_pct: discountPct,
      final_value: finalValue,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : JSON.stringify(err);
    return {
      event_id: event.event_id,
      sales_order_id,
      status: "failed",
      reason: message,
    };
  }
}
