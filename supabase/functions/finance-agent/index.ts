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

interface AgentSkill {
  skill_name: string;
  domain_knowledge: string;
  activation_condition: {
    event_types?: string[];
    always?: boolean;
    threshold_eur?: number;
    action?: string;
    notify_channel?: string;
  };
}

interface ProcessResult {
  event_id: string;
  sales_order_id: string;
  status: "invoiced" | "failed" | "skipped" | "pending_review";
  reason?: string;
  transaction_id?: string;
  amount?: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return JSON.stringify(err);
}

async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  text: string
): Promise<void> {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error("Telegram alert failed:", extractMessage(err));
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
    // ── 1. Resolve finance agent UUID ─────────────────────────────────────────
    const { data: agent, error: agentError } = await supabase
      .from("erp_agents")
      .select("agent_id, financial_authority_limit")
      .eq("role_name", "finance_agent")
      .single();

    if (agentError || !agent) {
      throw new Error("finance_agent not found in erp_agents");
    }

    // ── 2. Skill Injection — load INVOICE_CUSTOMER SOPs ───────────────────────
    // Layer 2 of the Cognition Loop: query erp_agent_skills before any action.
    // Skills are injected into the agent's decision logic at runtime.
    const { data: skillRows } = await supabase
      .from("erp_agent_skills")
      .select("skill_name, domain_knowledge, activation_condition")
      .eq("agent_id", agent.agent_id);

    const skills: AgentSkill[] = (skillRows ?? []).filter((s: AgentSkill) => {
      const cond = s.activation_condition;
      return cond?.event_types?.includes("INVOICE_CUSTOMER") || cond?.always;
    });

    // Extract approval threshold from the high_value_invoice_approval_gate SOP
    const approvalSkill = skills.find(
      (s) => s.skill_name === "high_value_invoice_approval_gate"
    );
    const approvalThreshold =
      approvalSkill?.activation_condition?.threshold_eur ?? Infinity;

    console.log(
      `[SOP] Loaded ${skills.length} INVOICE_CUSTOMER skill(s).`,
      `High-value approval threshold: €${approvalThreshold}`
    );

    // ── 3. Atomically claim pending INVOICE_CUSTOMER events ───────────────────
    // Uses claim_task_events() RPC which runs SELECT FOR UPDATE SKIP LOCKED
    // inside a single UPDATE statement — concurrent agent invocations never
    // claim the same event (fixes TOCTOU race condition).
    const { data: events, error: fetchError } = await supabase
      .rpc("claim_task_events", { p_event_type: "INVOICE_CUSTOMER", p_limit: 20 });

    if (fetchError) throw fetchError;

    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "No pending invoices." }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // ── 4. Process each event ─────────────────────────────────────────────────
    for (const event of events as InvoiceEvent[]) {
      const result = await processInvoiceEvent(
        supabase,
        agent.agent_id,
        event,
        approvalThreshold
      );
      results.push(result);

      if (result.status === "invoiced") {
        await supabase
          .from("erp_task_events")
          .update({ status: "completed", processed_at: new Date().toISOString() })
          .eq("event_id", event.event_id);

      } else if (result.status === "pending_review") {
        // SOP gate triggered — event is resolved, order is frozen for human review.
        await supabase
          .from("erp_task_events")
          .update({
            status: "completed",
            processed_at: new Date().toISOString(),
            error_message: `SOP gate: €${result.amount?.toFixed(2)} exceeds €${approvalThreshold} threshold. Order frozen for manual review.`,
          })
          .eq("event_id", event.event_id);

        // Notify the operator via Telegram
        const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
        const operatorChatId = Deno.env.get("OPERATOR_TELEGRAM_CHAT_ID");
        if (botToken && operatorChatId) {
          await sendTelegramAlert(
            botToken,
            operatorChatId,
            `🔔 INVOICE APPROVAL REQUIRED\n\n` +
            `Order: ${event.payload.sales_order_id.slice(0, 8).toUpperCase()}\n` +
            `Amount: €${result.amount?.toFixed(2)}\n\n` +
            `This invoice exceeds the €${approvalThreshold.toLocaleString()} ` +
            `automatic approval threshold (SOP: high_value_invoice_approval_gate).\n\n` +
            `Review in the operator console and re-queue to proceed.`
          );
        } else {
          console.warn("[SOP] OPERATOR_TELEGRAM_CHAT_ID not set — Telegram alert skipped.");
        }

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
    const frozen = results.filter((r) => r.status === "pending_review").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: events.length,
        invoiced,
        frozen_for_review: frozen,
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
  event: InvoiceEvent,
  approvalThreshold: number
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
      return { event_id: event.event_id, sales_order_id, status: "failed", reason: "Sales order not found" };
    }

    if (order.order_status !== "confirmed") {
      return { event_id: event.event_id, sales_order_id, status: "skipped", reason: `Order in unexpected status: ${order.order_status}` };
    }

    const invoiceAmount = Number(order.total_invoice_value) || amount;
    const invoiceCurrency = order.currency_code || currency || "EUR";

    // ── B. SOP: high_value_invoice_approval_gate ──────────────────────────────
    // "Indien de factuurwaarde > €10.000 is, bevries de status op 'pending_review'
    //  en stuur een notificatie naar de operateur voor handmatige goedkeuring."
    if (invoiceAmount > approvalThreshold) {
      console.log(
        `[SOP TRIGGERED] high_value_invoice_approval_gate:`,
        `€${invoiceAmount} > €${approvalThreshold}. Freezing order to pending_review.`
      );

      const { data: freezeData, error: freezeError } = await supabase
        .from("erp_sales_orders")
        .update({ order_status: "pending_review" })
        .eq("sales_order_id", sales_order_id)
        .eq("order_status", "confirmed")
        .select("sales_order_id");

      if (freezeError) {
        return { event_id: event.event_id, sales_order_id, status: "failed", reason: `Freeze failed: ${extractMessage(freezeError)}` };
      }
      if (!freezeData || freezeData.length === 0) {
        return { event_id: event.event_id, sales_order_id, status: "skipped", reason: "Order already frozen or transitioned by another agent invocation" };
      }

      await supabase.from("erp_authorization_logs").insert({
        target_record_id: sales_order_id,
        target_table: "erp_sales_orders",
        authorizing_agent: agentId,
        authorizing_role: "finance_agent",
        reason: `SOP 'high_value_invoice_approval_gate': amount ${invoiceCurrency} ${invoiceAmount.toFixed(2)} ` +
                `exceeds €${approvalThreshold} threshold. Order frozen to pending_review. Human approval required.`,
      });

      return { event_id: event.event_id, sales_order_id, status: "pending_review", amount: invoiceAmount };
    }

    // ── C. Post double-entry journal via post_journal_entry() RPC ─────────────
    //   DR 12000  Accounts Receivable   = invoiceAmount
    //   CR 41000  Product Revenue       = invoiceAmount
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
      return { event_id: event.event_id, sales_order_id, status: "failed", reason: `Journal post failed: ${extractMessage(journalError)}` };
    }

    // ── D. Advance sales order: confirmed → invoiced ──────────────────────────
    // .select() lets us detect 0-rows-affected — if another agent already
    // advanced this order, we skip rather than silently double-logging success.
    const { data: invoicedData, error: updateError } = await supabase
      .from("erp_sales_orders")
      .update({ order_status: "invoiced" })
      .eq("sales_order_id", sales_order_id)
      .eq("order_status", "confirmed")
      .select("sales_order_id");

    if (updateError) {
      return { event_id: event.event_id, sales_order_id, status: "failed", reason: `Status update failed: ${extractMessage(updateError)}` };
    }
    if (!invoicedData || invoicedData.length === 0) {
      return { event_id: event.event_id, sales_order_id, status: "skipped", reason: "Order already invoiced by another agent invocation" };
    }

    // ── E. Write to authorization log ─────────────────────────────────────────
    await supabase.from("erp_authorization_logs").insert({
      target_record_id: sales_order_id,
      target_table: "erp_sales_orders",
      authorizing_agent: agentId,
      authorizing_role: "finance_agent",
      reason: `Invoice posted. Journal tx: ${txId}. Amount: ${invoiceCurrency} ${invoiceAmount.toFixed(2)}`,
    });

    console.log(
      `[OK] Invoiced ${sales_order_id}`,
      `| ${invoiceCurrency} ${invoiceAmount}`,
      `| journal tx: ${txId}`
    );

    return { event_id: event.event_id, sales_order_id, status: "invoiced", transaction_id: txId, amount: invoiceAmount };

  } catch (err: unknown) {
    return { event_id: event.event_id, sales_order_id, status: "failed", reason: extractMessage(err) };
  }
}
