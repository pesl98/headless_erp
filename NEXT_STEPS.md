# Headless ERP — Next Steps & Implementation Roadmap

> **Current state:** Sales agent live · Event-dispatch trigger live · Telegram bot live · Operator Console live · Customer Portal live
> **What's done:** The full order pipeline from Telegram/Portal → event INSERT → dispatch trigger → sales-agent → confirmed order runs in under 1 second
> **What's next:** Finance agent, then predicate calculus evaluator, then procurement

---

## ✅ Completed (as of 2026-02-25)

| Item | Notes |
|------|-------|
| `inbound-order` Edge Function | Intake for all channels — creates draft order + task event |
| `sales-agent` Edge Function v3 | Processes `ORDER_NEGOTIATION`, confirms orders, applies tier discounts, updates inventory |
| `concierge-bot` Edge Function | Claude Opus 4.6 Telegram bot — agentic loop with 5 DB tools |
| `erp_dispatch_on_task_insert` trigger | AFTER INSERT on `erp_task_events` — calls `net.http_post` immediately (~1s end-to-end) |
| pg_cron fallback (every 5 min) | Ensures no event is permanently stuck if the dispatch call fails |
| Credit limit trigger (draft-aware) | Drafts skip credit check; confirmed orders are enforced |
| Cascade confirm trigger | `draft → confirmed` deducts inventory, emits `INVOICE_CUSTOMER` |

---

## Priority 1 — Finance Agent (`finance-agent`)
Processes `INVOICE_CUSTOMER` and `BANK_RECONCILIATION` events.

**What to build:**
- Receives `INVOICE_CUSTOMER` events (triggered automatically when a sales order is confirmed)
- Calls `post_journal_entry` plpgsql function:
  - DR Accounts Receivable / CR Product Revenue
- Calls `send_customer_invoice` external API (PDF generation + email)
- Processes `BANK_RECONCILIATION` events weekly — matches bank transactions to journal entries

---

## Priority 2 — Predicate Calculus Evaluator

See `ARCHITECTURE.md §10 Priority 2` for full specification. The short version: replace the three hardcoded constraint trigger functions with a single generic evaluator that reads `erp_agent_constraints.logic_ast` at transaction time. Rules become data. Changing a business rule requires an UPDATE, not a code deploy.

---

## Priority 3 — Procurement Agent (`procurement-agent`)
Processes `REORDER_TRIGGERED` events.

**What to build:**
- Reads inventory deficit from event payload
- Queries preferred suppliers + their lead times / reliability scores
- Selects best supplier (highest reliability, within lead time)
- Creates purchase order via `create_purchase_order` plpgsql function
- Constraint check: order value ≤ agent authority limit + supplier must be `is_preferred = true`

---

## Priority 4 — HR/Payroll Agent (`hr-payroll-agent`)
Processes `PAYROLL_RUN` events (triggered by pg_cron on 25th of each month).

**What to build:**
- Queries all active employees + approved timesheets for the period
- Calculates gross/net pay per employee
- Creates payroll manifest + line items
- Posts journal entry: DR Salaries Expense / CR Accrued Liabilities
- Calls bank transfer external API for disbursement

---

## Priority 5 — MCP Tool Implementations (plpgsql functions)

The tools are registered in `erp_mcp_tools` but the actual plpgsql functions behind them haven't been created. Each tool needs a corresponding PostgreSQL function.

### 2.1 `post_journal_entry` → plpgsql function
```sql
CREATE OR REPLACE FUNCTION post_journal_entry(
  p_agent_id UUID,
  p_description TEXT,
  p_source_type TEXT,
  p_entries JSONB  -- array of {account_code, amount, is_credit, memo}
) RETURNS UUID ...
```
- Inserts into `erp_financial_transactions` + `erp_journal_entries`
- Double-entry trigger validates balance automatically
- Returns `transaction_id`

### 2.2 `create_purchase_order` → plpgsql function
```sql
CREATE OR REPLACE FUNCTION create_purchase_order(
  p_agent_id UUID,
  p_supplier_id UUID,
  p_items JSONB,  -- array of {product_id, quantity, agreed_unit_price}
  p_expected_delivery DATE
) RETURNS UUID ...
```

### 2.3 `confirm_sales_order` → plpgsql function
```sql
CREATE OR REPLACE FUNCTION confirm_sales_order(
  p_agent_id UUID,
  p_sales_order_id UUID,
  p_discount_percent NUMERIC DEFAULT 0
) RETURNS VOID ...
```
- Updates `order_status` → `'confirmed'`
- The AFTER UPDATE trigger handles: inventory deduction + INVOICE_CUSTOMER event

### 2.4 `approve_timesheet` → plpgsql function
### 2.5 `run_payroll_manifest` → plpgsql function or Edge Function
### 2.6 `check_inventory_levels` → plpgsql function (Sentinel agent)

---

## Priority 6 — Predicate Calculus Engine (full evaluator)

The constraints are stored as JSONB ASTs but the trigger that **evaluates** them hasn't been implemented.

### 3.1 Generic constraint evaluator trigger
```sql
CREATE OR REPLACE FUNCTION evaluate_agent_constraints()
RETURNS TRIGGER AS $$
-- Recursively evaluates erp_agent_constraints.logic_ast
-- Supports: comparison, logical AND/OR/NOT, field, literal, agent_attr
-- RAISE EXCEPTION if any active constraint is violated
$$ LANGUAGE plpgsql;
```

This single trigger function, attached to the relevant tables, replaces the hardcoded constraint checks currently on `erp_sales_orders` (credit limit) and `erp_inventory` (refrigeration) with a fully dynamic, database-driven constraint system.

---

## Priority 7 — Semantic Memory Pipeline

### 4.1 Memory write — after each agent action
After every successful agent invocation, write a summary to `erp_agent_memory`:
- Generate embedding via OpenAI/Anthropic Embeddings API
- Insert with `memory_type = 'episodic'`, `importance_score` based on event priority

### 4.2 Memory read — before each agent invocation
Before building the LLM context window:
- Embed the current task event payload
- Run cosine similarity search against `erp_agent_memory` (HNSW index)
- Inject top-5 relevant memories into the system prompt

```sql
SELECT content FROM erp_agent_memory
WHERE agent_id = $1
ORDER BY embedding <=> $query_embedding
LIMIT 5;
```

### 4.3 Memory decay / summarisation
- Periodically summarise episodic memories into `semantic` memories
- Lower `importance_score` of old episodic memories (forgetting curve)

---

## Priority 8 — Additional External Ingress Channels

### 5.1 Supplier Portal
Mirror of the Customer Portal — suppliers can submit invoices, delivery confirmations, or price updates. Triggers `GOODS_RECEIVED` or `SUPPLIER_INVOICE` task events → Procurement agent processes.

### 5.2 Bank Feed Webhook
- Endpoint: `bank-feed` Edge Function
- Accepts bank transaction webhooks (e.g. from Plaid, Salt Edge, or GoCardless)
- Inserts `BANK_RECONCILIATION` events with transaction data in payload
- Finance agent matches transactions to open journal entries

### 5.3 Email Inbound (Postmark / Cloudflare Email Workers)
- Parse inbound emails from customers / suppliers
- LLM extracts intent (order request, complaint, delivery query)
- Routes to the correct task event type

### 5.4 EDI / API Integration
- Accept standard EDI 850 (Purchase Order) and EDI 856 (Ship Notice) documents
- Convert to internal task events

---

## Priority 9 — Operator Console Enhancements

### 6.1 Order Detail Drawer
Click a sales order row → slide-in panel showing:
- Line items with quantities and prices
- Customer credit history
- Agent action log (what the agent decided and why)
- Manual override buttons: Confirm / Cancel / Reassign

### 6.2 Agent Action Log
Currently `erp_authorization_logs` is populated but not displayed anywhere in the console.
- New `/logs` page showing every agent action attempt (authorised and rejected)
- Filter by agent, date range, action type
- Highlight constraint violations in red

### 6.3 Real-time Updates (Supabase Realtime)
Replace the 10-second ISR polling on `/queue` with a **Supabase Realtime** subscription:
```typescript
// In a client component:
supabase
  .channel('task_events')
  .on('postgres_changes', { event: 'INSERT', table: 'erp_task_events' }, handleNewEvent)
  .subscribe()
```
Queue updates instantly when a new event arrives — no refresh needed.

### 6.4 Inventory Alert Notifications
- When Sentinel creates a `REORDER_TRIGGERED` event, also send a browser notification or email to the operator
- Show a notification badge on the Inventory sidebar link

### 6.5 Finance Charts
Add a Recharts line/bar chart to `/finance` showing:
- Monthly revenue vs. expenses (last 12 months)
- Cash flow trend

---

## Priority 10 — Security & Production Hardening

### 7.1 Row Level Security (RLS)
Currently all tables are open (no RLS). Before going to production:

```sql
-- Enable RLS
ALTER TABLE erp_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_sales_orders ENABLE ROW LEVEL SECURITY;
-- etc.

-- Anon key: read-only on safe tables
CREATE POLICY "anon_read_task_events"
  ON erp_task_events FOR SELECT TO anon USING (true);

-- Service role: full access (used by Edge Functions)
-- Already has full access by default
```

### 7.2 API Key Authentication for Portal
The `inbound-order` Edge Function is currently fully public. Add optional API key validation:
```typescript
const apiKey = req.headers.get('x-api-key');
if (apiKey !== Deno.env.get('PORTAL_API_KEY')) {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
}
```

### 7.3 Environment Variables
Move hardcoded Supabase URL and anon key from `lib/supabase.ts` into `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://rdlxbyrgwofzjxlqbdcc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 7.4 Rate Limiting on Portal
Prevent abuse of the public order endpoint:
- Max 10 orders per email per hour
- Max order value of €500,000 (hard cap, not just credit limit)

---

## Priority 11 — Deployment

### 8.1 Deploy to Vercel
```bash
vercel --prod
```
- Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Vercel env vars
- The app will be publicly accessible with a `.vercel.app` domain

### 8.2 Custom Domain
- Point a domain to Vercel
- Separate subdomains: `console.yourdomain.com` (operator) and `orders.yourdomain.com` (portal)

### 8.3 pg_cron Jobs — Activate
The scheduled jobs were defined in the schema but need to be confirmed active:
```sql
SELECT cron.schedule('payroll-run', '0 8 25 * *',
  $$INSERT INTO erp_task_events (event_type, target_agent, payload, status, priority)
    VALUES ('PAYROLL_RUN', 'hr_payroll_agent', '{}', 'pending', 10)$$);

SELECT cron.schedule('inventory-check', '*/30 * * * *',
  $$INSERT INTO erp_task_events (event_type, target_agent, payload, status, priority)
    VALUES ('INVENTORY_CHECK', 'inventory_watcher', '{}', 'pending', 5)$$);
```

---

## Summary — What's Done vs. What's Left

| Layer | Status | Notes |
|-------|--------|-------|
| Database schema (26 tables) | ✅ Done | All domains: sales, procurement, inventory, finance, HR, agents |
| Double-entry trigger | ✅ Done | Σ(DR) = Σ(CR) enforced per transaction |
| Refrigeration constraint trigger | ✅ Done | Blocks cold products → ambient warehouse |
| Credit limit trigger (draft-aware) | ✅ Done | Drafts skip check; confirmed orders enforced |
| Cascade confirm trigger | ✅ Done | Inventory deduction + INVOICE_CUSTOMER event on confirm |
| Event-dispatch trigger | ✅ Done | `net.http_post` fires to target agent on every INSERT |
| pg_cron fallback scheduler | ✅ Done | 5-minute sweep ensures no event is permanently stuck |
| `sales-agent` v3 | ✅ Done | ~1s end-to-end, tier discounts, credit checks |
| `concierge-bot` | ✅ Done | Claude Opus 4.6, Telegram webhook, persistent session memory |
| `inbound-order` | ✅ Done | Handles portal, Telegram, and OpenClaw submissions |
| Operator Console (7 pages) | ✅ Done | Dashboard, Agents, Finance, Inventory, Sales, HR, Queue |
| Customer Portal | ✅ Done | Public order form + live product catalogue |
| OpenClaw context | ✅ Done | `OPENCLAW_ERP_CONTEXT.md` for internal operator sessions |
| `finance-agent` | ❌ Next | `INVOICE_CUSTOMER` queue filling — **Priority 1** |
| Predicate calculus evaluator | ❌ Planned | Replace hardcoded triggers — **Priority 2** |
| `procurement-agent` | ❌ Planned | `REORDER_TRIGGERED` support — Priority 3 |
| `hr-payroll-agent` | ❌ Planned | pg_cron schedule ready, agent missing — Priority 4 |
| MCP plpgsql tool functions | ❌ Planned | `post_journal_entry`, `create_purchase_order` etc — Priority 5 |
| Semantic memory pipeline | ❌ Planned | pgvector read/write per agent invocation — Priority 7 |
| Row-Level Security | ⚠️ Required | Needed before production traffic — Priority 10 |
| Vercel deployment | ❌ Planned | Priority 11 |
| Realtime Console updates | ❌ Nice to have | Replace ISR with Supabase Realtime — Priority 9 |
| Authorization log viewer | ❌ Nice to have | Table exists, not surfaced in UI — Priority 9 |
| Bank feed ingest | ❌ Planned | External bank API integration — Priority 8 |
