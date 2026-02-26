import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ── Types ─────────────────────────────────────────────────────────────────────

interface InvoiceEvent {
  event_id: string;
  payload: {
    sales_order_id: string;
    customer_id: string;
    amount: number;
    currency: string;
  };
}

interface ProcessResult {
  event_id: string;
  sales_order_id: string;
  status: "invoiced" | "failed" | "skipped";
  reason?: string;
  transaction_id?: string;
  amount?: number;
}

// ── Extract error message from unknown catch value ────────────────────────────

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return JSON.stringify(err);
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
    // ── 1. Resolve the finance agent's UUID ───────────────────────────────────
    const { data: agent, error: agentError } = await supabase
      .from("erp_agents")
      .select("agent_id, financial_authority_limit")
      .eq("role_name", "finance_agent")
      .single();

    if (agentError || !agent) {
      throw new Error("finance_agent not found in erp_agents");
    }

    // ── 2. Claim pending INVOICE_CUSTOMER events ──────────────────────────────
    const { data: events, error: fetchError } = await supabase
      .from("erp_task_events")
      .select("event_id, payload")
      .eq("event_type", "INVOICE_CUSTOMER")
      .eq("status", "pending")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(20);

    if (fetchError) throw fetchError;

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending invoices." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Optimistic lock — mark all fetched events as 'processing'
    const eventIds = events.map((e: InvoiceEvent) => e.event_id);
    await supabase
      .from("erp_task_events")
      .update({ status: "processing" })
      .in("event_id", eventIds);

    // ── 3. Process each event ─────────────────────────────────────────────────
    for (const event of events as InvoiceEvent[]) {
      const result = await processInvoiceEvent(supabase, agent.agent_id, event);
      results.push(result);

      if (result.status === "invoiced") {
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
        // skipped — release back to queue
        await supabase
          .from("erp_task_events")
          .update({ status: "pending" })
          .eq("event_id", event.event_id);
      }
    }

    const invoiced = results.filter((r) => r.status === "invoiced").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: events.length,
        invoiced,
        failed,
        results,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = extractMessage(err);
    console.error("finance-agent error:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// ── Process a single INVOICE_CUSTOMER event ───────────────────────────────────

async function processInvoiceEvent(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  event: InvoiceEvent
): Promise<ProcessResult> {
  const { sales_order_id, amount, currency } = event.payload;

  try {
    // ── A. Verify the sales order is in 'confirmed' state ─────────────────────
    const { data: order, error: orderError } = await supabase
      .from("erp_sales_orders")
      .select("sales_order_id, order_status, total_invoice_value, currency_code")
      .eq("sales_order_id", sales_order_id)
      .single();

    if (orderError || !order) {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "failed",
        reason: "Sales order not found",
      };
    }

    if (order.order_status !== "confirmed") {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "skipped",
        reason: `Order in unexpected status: ${order.order_status}`,
      };
    }

    const invoiceAmount = Number(order.total_invoice_value) || amount;
    const invoiceCurrency = order.currency_code || currency || "USD";

    // ── B. Post double-entry journal via post_journal_entry() RPC ─────────────
    //   DR 12000  Accounts Receivable   = invoiceAmount  (asset increases)
    //   CR 41000  Product Revenue       = invoiceAmount  (revenue increases)
    // The deferrable balance-check trigger validates at transaction COMMIT.
    const { data: txId, error: journalError } = await supabase.rpc(
      "post_journal_entry",
      {
        p_agent_id: agentId,
        p_description: `Invoice for confirmed sales order ${sales_order_id}`,
        p_source_type: "invoice",
        p_source_doc_id: sales_order_id,
        p_currency: invoiceCurrency,
        p_entries: [
          {
            account_code: "12000",
            amount: invoiceAmount,
            is_credit: false,
            memo: `AR — Order ${sales_order_id.slice(0, 8).toUpperCase()}`,
          },
          {
            account_code: "41000",
            amount: invoiceAmount,
            is_credit: true,
            memo: `Revenue — Order ${sales_order_id.slice(0, 8).toUpperCase()}`,
          },
        ],
      }
    );

    if (journalError) {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "failed",
        reason: `Journal post failed: ${extractMessage(journalError)}`,
      };
    }

    // ── C. Advance sales order: confirmed → invoiced ──────────────────────────
    const { error: updateError } = await supabase
      .from("erp_sales_orders")
      .update({ order_status: "invoiced" })
      .eq("sales_order_id", sales_order_id)
      .eq("order_status", "confirmed"); // safety: only advance if still confirmed

    if (updateError) {
      return {
        event_id: event.event_id,
        sales_order_id,
        status: "failed",
        reason: `Order status update failed: ${extractMessage(updateError)}`,
      };
    }

    // ── D. Write to authorization log ─────────────────────────────────────────
    await supabase.from("erp_authorization_logs").insert({
      target_record_id: sales_order_id,
      target_table: "erp_sales_orders",
      authorizing_agent: agentId,
      authorizing_role: "finance_agent",
      reason: `Invoice posted. Journal tx: ${txId}. Amount: ${invoiceCurrency} ${invoiceAmount.toFixed(2)}`,
    });

    console.log(
      `Invoiced order ${sales_order_id}`,
      `| ${invoiceCurrency} ${invoiceAmount}`,
      `| journal tx: ${txId}`
    );

    return {
      event_id: event.event_id,
      sales_order_id,
      status: "invoiced",
      transaction_id: txId,
      amount: invoiceAmount,
    };
  } catch (err: unknown) {
    return {
      event_id: event.event_id,
      sales_order_id,
      status: "failed",
      reason: extractMessage(err),
    };
  }
}
