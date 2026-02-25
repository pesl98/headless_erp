# Headless ERP — System Architecture

> The database does not serve the application. The database **is** the application.

---

## 1. Architectural Philosophy

Traditional ERP systems are built around the assumption that a human sits in front of a screen and makes decisions. Data flows inward from the UI, logic lives in the application layer, and the database is a dumb persistence store.

This system inverts that entirely.

**The database is the execution engine.** Business logic is expressed as PL/pgSQL triggers, predicate constraints, and asynchronous dispatch mechanisms that activate automatically when data changes. No human manually confirms an order, checks inventory, or posts a journal entry. That work is done by domain-specific agents responding to database-emitted events.

**The human is an observer.** The Operator Console shows what happened and why. It does not provide the controls to make it happen. The only legitimate inputs into the system are external signals: a customer placing an order, a supplier confirming delivery, a scheduled clock tick.

**The database is the ultimate arbiter of truth.** An agent can attempt any operation, but if that operation violates a stored constraint — credit limit exceeded, double-entry imbalance, refrigerated product routed to an ambient warehouse — the database raises an exception and the transaction is aborted. The agent must self-correct. Governance is not a PDF policy manual. It is a `RAISE EXCEPTION`.

---

## 2. System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SIGNALS                             │
│   Telegram Bot  ·  Customer Portal  ·  OpenClaw  ·  pg_cron        │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTP POST to inbound Edge Functions
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     EVENT-DRIVEN INGRESS                            │
│   inbound-order · concierge-bot · (future: bank-feed, email-relay) │
│   → INSERT INTO erp_task_events (status='pending')                 │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ AFTER INSERT trigger fires synchronously
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DISPATCH TRIGGER LAYER                           │
│   erp_dispatch_on_task_insert                                       │
│   → net.http_post → target agent Edge Function (async, ~1 second)  │
│   Fallback: pg_cron fires sales-agent every 5 minutes              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Agent reads pending events, claims them
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   AUTONOMOUS TASK EXECUTION                         │
│   sales-agent · finance-agent · procurement-agent · hr-agent       │
│   Each agent: reads payload → evaluates logic → writes to DB       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Every write passes through trigger chain
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│               PREDICATE CALCULUS ENFORCEMENT                        │
│   BEFORE/AFTER triggers on every mutated table                     │
│   erp_agent_constraints (JSONB AST rules, evaluated recursively)   │
│   → RAISE EXCEPTION on violation, agent must self-correct          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ On success, cascade triggers emit next event
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CASCADING STATE PROPAGATION                      │
│   order confirmed → inventory deducted → INVOICE_CUSTOMER emitted  │
│   stock below reorder → REORDER_TRIGGERED emitted                  │
│   The dispatch trigger picks up the new event and the cycle repeats│
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Event-Driven Ingress

Every external signal — a Telegram message, a portal form submission, a bank webhook, a cron heartbeat — enters the system through one path: an INSERT into `erp_task_events`.

`erp_task_events` is the system's single intake valve. It is not a log. It is a durable, prioritised work queue. Nothing executes until it passes through this table.

### The Dispatch Trigger

```sql
CREATE TRIGGER erp_dispatch_on_task_insert
  AFTER INSERT ON erp_task_events
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION erp_dispatch_task_event();
```

`erp_dispatch_task_event()` runs inside the INSERT transaction. It reads `NEW.target_agent`, resolves the corresponding Edge Function slug, and calls `net.http_post` to wake the agent asynchronously. The HTTP call is non-blocking — `pg_net` returns a request ID and the transaction commits. The agent is already running before the INSERT has been acknowledged to the caller.

**Measured latency:** inbound-order INSERT at `10:20:03.608` → agent marks event `completed` at `10:20:04.596`. 988ms end-to-end, including cold-start.

### Fallback Scheduling

If the dispatch call fails (transient network error, cold boot), a pg_cron job polls for `pending` events every 5 minutes and calls the sales-agent directly. No event can be permanently stuck. Every event has two paths to execution.

### Task Event Schema

```
erp_task_events
  event_id       UUID          primary key
  event_type     VARCHAR       ORDER_NEGOTIATION | INVOICE_CUSTOMER | REORDER_TRIGGERED | PAYROLL_RUN | ...
  target_agent   VARCHAR       FK to erp_agents.role_name
  payload        JSONB         full context the agent needs — no secondary DB reads required at claim time
  status         VARCHAR       pending → processing → completed | failed
  priority       INTEGER       1–10, higher = processed first
  error_message  TEXT          populated on failure for operator inspection
  processed_at   TIMESTAMPTZ   set when the agent completes or fails
```

---

## 4. Telegram → Confirmed Order: Full Signal Trace

This is the canonical end-to-end path through the system.

```
Step 1 — External Signal (Telegram)
  Customer sends: "I need 2x 2TB NVMe drives"

Step 2 — Concierge Agent (concierge-bot Edge Function)
  Claude Opus 4.6 agentic loop, max 8 iterations
  Tools available:
    search_products(query)         → erp_products
    lookup_customer(email)         → erp_customers
    check_inventory(sku)           → erp_inventory
    get_pending_orders(email)      → erp_sales_orders
    submit_order_request(payload)  → inbound-order Edge Function

  Executes tool chain:
    search_products("nvme")        → SSD-NVM-002T @ $199
    check_inventory("SSD-NVM-002T")→ 45 units available
    lookup_customer(email)         → Premium tier customer
    Shows summary, waits for confirmation
    submit_order_request(...)      → calls inbound-order

Step 3 — Event-Driven Ingress (inbound-order Edge Function)
  Resolves product UUIDs and unit prices
  Finds or creates customer record
  INSERT erp_sales_orders (status='draft')
    → BEFORE INSERT trigger erp_credit_limit_check fires
    → Draft orders skip credit evaluation (enforced in trigger)
    → INSERT succeeds
  INSERT erp_sales_order_items (line_total is GENERATED AS quantity * unit_price)
  INSERT erp_task_events (ORDER_NEGOTIATION, status='pending', priority=8)
    → AFTER INSERT trigger erp_dispatch_on_task_insert fires immediately
    → net.http_post → https://.../functions/v1/sales-agent

Step 4 — Autonomous Task Execution (sales-agent Edge Function)
  Claims event: UPDATE erp_task_events SET status='processing'
  Reads sales order from payload
  Verifies order still in 'draft' status
  Checks inventory: current_quantity_available >= requested quantity
  Checks credit: current_balance + discounted_value <= maximum_credit_limit
  Applies tier discount: standard=0%, premium=5%, vip=10%
  UPDATE erp_sales_orders SET status='confirmed', discount_percent=5, total_invoice_value=378.10
    → AFTER UPDATE trigger erp_sales_order_confirmed_trigger fires
    → erp_inventory.current_quantity_available -= 2     (atomic deduction)
    → INSERT erp_task_events (INVOICE_CUSTOMER, target_agent='finance_agent')
       → dispatch trigger fires again → finance-agent woken (future)
  UPDATE erp_customers SET current_balance += 378.10
  UPDATE erp_task_events SET status='completed', processed_at=NOW()

Step 5 — Cascade (DB Trigger, automatic)
  INVOICE_CUSTOMER event now in queue, waiting for finance_agent
  Inventory stock reduced in erp_inventory

Step 6 — Observer Layer (Operator Console)
  /queue page shows event as completed
  /sales page shows order as confirmed
  No human action was required or taken
```

---

## 5. Agentic Governance

Agents are not free to act arbitrarily. Each agent operates within a layered permission structure enforced entirely inside the database.

### 5.1 Financial Authority Limits

Each agent row in `erp_agents` carries a `financial_authority_limit` (NUMERIC). An agent cannot execute a transaction whose value exceeds this limit without escalating to a higher-authority agent. This is not application logic — it is a column that the constraint evaluator reads before any financial write is permitted.

### 5.2 Predicate Calculus Enforcement

Business rules are stored in `erp_agent_constraints` as Abstract Syntax Trees in JSONB:

```json
{
  "type": "comparison",
  "op": "<=",
  "left": { "type": "agent_attr", "name": "financial_authority_limit" },
  "right": { "type": "field", "name": "total_invoice_value" }
}
```

A recursive PL/pgSQL evaluator traverses these trees at transaction time. If any active constraint evaluates to false, `RAISE EXCEPTION` is called. The transaction is aborted. The agent receives the error, logs it, and must either escalate or abandon the operation.

Supported node types: `comparison`, `logical` (AND/OR/NOT), `field`, `literal`, `agent_attr`, `function`.

This separates the *what* (the rule) from the *where* (the enforcement point). Rules can be added, modified, or toggled without touching any application code or redeploying any Edge Function.

### 5.3 Hardcoded Constraint Triggers (Current)

Until the full predicate calculus evaluator is wired in, three rules are enforced by dedicated PL/pgSQL trigger functions:

| Trigger | Table | Timing | Rule |
|---------|-------|--------|------|
| `erp_credit_limit_check` | `erp_sales_orders` | BEFORE INSERT | `current_balance + order_value <= maximum_credit_limit` (skipped for draft orders) |
| `erp_refrigeration_check` | `erp_inventory` | BEFORE INSERT/UPDATE | Refrigerated products cannot be placed in non-climate-controlled warehouses |
| `erp_journal_balance_check` | `erp_journal_entries` | AFTER INSERT/UPDATE | `Σ(debit entries) = Σ(credit entries)` per transaction — double-entry integrity |

These are the current enforcement surface. The predicate calculus engine will subsume them.

### 5.4 Row-Level Security

Each agent has a `database_role` column in `erp_agents`. When RLS is enabled, each role will be bound to the tables it legitimately needs. The `sales_agent` role cannot read payroll data. The `hr_payroll_agent` role cannot write to `erp_sales_orders`. These boundaries cannot be bypassed regardless of what the agent's LLM context instructs it to do.

---

## 6. Complete Trigger Catalogue

| Trigger | Table | Timing | Effect |
|---------|-------|--------|--------|
| `erp_dispatch_on_task_insert` | `erp_task_events` | AFTER INSERT | Calls `net.http_post` to the target agent's Edge Function when a `pending` event is inserted |
| `erp_credit_limit_check` | `erp_sales_orders` | BEFORE INSERT | Rejects orders that would breach the customer's credit ceiling (bypass on `draft` status) |
| `erp_sales_order_confirmed_trigger` | `erp_sales_orders` | AFTER UPDATE | On `draft → confirmed` transition: deducts inventory quantities, emits `INVOICE_CUSTOMER` task event |
| `erp_refrigeration_check` | `erp_inventory` | BEFORE INSERT/UPDATE | Rejects placement of cold-chain products into ambient warehouses |
| `erp_journal_balance_check` | `erp_journal_entries` | AFTER INSERT/UPDATE | Verifies double-entry balance per transaction, raises exception on imbalance |

---

## 7. Schema Map (26 Tables)

Tables are grouped by domain. Foreign key relationships cross domain boundaries as needed.

### Agent Domain
| Table | Purpose |
|-------|---------|
| `erp_agents` | Agent registry: role, system prompt, authority limit, operational status |
| `erp_agent_constraints` | JSONB AST behavioral rules evaluated at transaction time |
| `erp_agent_memory` | pgvector semantic memory: embeddings + raw content for context injection |
| `erp_agent_message_history` | Conversation history per session (used by concierge-bot for persistent Telegram context) |
| `erp_agent_skills` | Domain knowledge and activation conditions per agent |
| `erp_agent_tool_assignments` | Maps which MCP tools each agent may call |
| `erp_mcp_tools` | Tool registry: name, input schema, execution handler, target endpoint |
| `erp_authorization_logs` | Immutable audit trail: every agent action that touches a sensitive record |
| `erp_task_events` | Central event queue: the sole intake path for all autonomous work |

### Sales Domain
| Table | Purpose |
|-------|---------|
| `erp_customers` | Customer records: tier, credit limit, current balance, account status |
| `erp_sales_orders` | Order lifecycle: draft → confirmed → invoiced → paid |
| `erp_sales_order_items` | Line items with `line_total` as a GENERATED column (`quantity * unit_price`) |

### Procurement Domain
| Table | Purpose |
|-------|---------|
| `erp_suppliers` | Supplier records: lead time, reliability score, preferred flag |
| `erp_purchase_orders` | Purchase order lifecycle, executing agent, expected delivery |
| `erp_purchase_order_items` | Line items per purchase order |

### Inventory Domain
| Table | Purpose |
|-------|---------|
| `erp_products` | Product catalogue: SKU, pricing, refrigeration flag, unit of measure |
| `erp_inventory` | Stock levels per product per warehouse: available quantity, reorder point, safety stock |
| `erp_warehouses` | Warehouse registry: climate-controlled flag, capacity tracking |

### Finance Domain
| Table | Purpose |
|-------|---------|
| `erp_accounts` | Chart of accounts with account classification and parent hierarchy |
| `erp_financial_transactions` | Transaction header: executing agent, timestamp, source document reference |
| `erp_journal_entries` | Individual debit/credit lines, balance enforced by trigger |

### HR Domain
| Table | Purpose |
|-------|---------|
| `erp_employees` | Employee records: salary, employment type, department, hire date |
| `erp_departments` | Department hierarchy with budget and head agent |
| `erp_timesheets` | Daily hours records with approval workflow |
| `erp_payroll_manifests` | Payroll run header: period, totals, disbursement status |
| `erp_payroll_line_items` | Per-employee payroll calculations: gross, tax, net |

---

## 8. Agent Registry

| Agent | Role Name | Status | Financial Authority | Processes |
|-------|-----------|--------|--------------------:|-----------|
| Sales Agent | `sales_agent` | ✅ Active (automated) | configurable | `ORDER_NEGOTIATION` |
| Concierge Agent | `concierge_agent` | ✅ Active (Telegram) | none (intake only) | inbound order negotiation via chat |
| Finance Agent | `finance_agent` | 🔜 Next | configurable | `INVOICE_CUSTOMER`, `BANK_RECONCILIATION` |
| Procurement Agent | `procurement_agent` | 🔜 Planned | configurable | `REORDER_TRIGGERED` |
| Inventory Watcher | `inventory_watcher` | 🔜 Planned | none (read-only sentinel) | `INVENTORY_CHECK` → emits `REORDER_TRIGGERED` |
| HR/Payroll Agent | `hr_payroll_agent` | 🔜 Planned | configurable | `PAYROLL_RUN`, `TIMESHEET_APPROVAL` |

---

## 9. External Interfaces

### Inbound (signals that create task events)
| Interface | Technology | Event Type Created |
|-----------|------------|-------------------|
| Telegram Bot | Supabase Edge Function + Claude Opus 4.6 | `ORDER_NEGOTIATION` |
| Customer Portal | Next.js form + `inbound-order` Edge Function | `ORDER_NEGOTIATION` |
| OpenClaw | Local AI with direct Supabase access | Any event type via raw SQL or curl |
| pg_cron | Scheduled PostgreSQL jobs | `PAYROLL_RUN`, `INVENTORY_CHECK`, fallback `ORDER_NEGOTIATION` sweep |
| (Planned) Bank Feed | `bank-feed` Edge Function + webhook | `BANK_RECONCILIATION` |
| (Planned) Supplier Portal | Mirror of customer portal | `GOODS_RECEIVED`, `SUPPLIER_INVOICE` |
| (Planned) Email Relay | Inbound email parsing Edge Function | LLM-classified event type |

### Outbound (read-only observer surfaces)
| Interface | Technology | Purpose |
|-----------|------------|---------|
| Operator Console | Next.js + Supabase REST | Live dashboards for queue, sales, inventory, finance, HR |
| Telegram replies | Telegram Bot API | Customer-facing order status and confirmation messages |

---

## 10. Open Features & Next Steps

### Done ✅
- 26-table PostgreSQL schema (sales, procurement, inventory, finance, HR, agents)
- Double-entry balance trigger
- Credit limit enforcement trigger (draft-aware)
- Refrigeration constraint trigger
- Order confirmation cascade trigger (inventory deduction + INVOICE_CUSTOMER event)
- `erp_dispatch_on_task_insert` — real-time event dispatch via `net.http_post`
- pg_cron fallback scheduler (every 5 minutes)
- `sales-agent` Edge Function v3 — autonomous order review and confirmation
- `concierge-bot` Edge Function — Claude Opus 4.6 Telegram agentic loop
- `inbound-order` Edge Function — order intake from portal, Telegram, and OpenClaw
- Operator Console — Next.js (Dashboard, Agents, Sales, Inventory, Finance, HR, Queue)
- Customer Portal — public order submission with live product catalogue
- `OPENCLAW_ERP_CONTEXT.md` — internal operator context file

---

### Priority 1 — Finance Agent
The `INVOICE_CUSTOMER` event is already emitted and queued after every confirmed order. The finance agent reads it, posts a double-entry journal (`DR Accounts Receivable / CR Product Revenue`), and generates a customer invoice.

The infrastructure is ready. What is missing is the Edge Function itself.

**Required tables:** `erp_financial_transactions`, `erp_journal_entries`, `erp_accounts`
**Constraint in play:** `erp_journal_balance_check` — the DB will reject any journal entry set where debits ≠ credits.

---

### Priority 2 — Predicate Calculus Evaluator

The `erp_agent_constraints` table exists and can hold JSONB rules. The recursive evaluator that reads those rules at write time has not been implemented.

Current state: credit limit and refrigeration rules are hardcoded as individual trigger functions. The goal is to replace these with a single generic evaluator attached to all sensitive tables:

```sql
CREATE TRIGGER erp_constraint_evaluator
  BEFORE INSERT OR UPDATE ON erp_sales_orders
  FOR EACH ROW EXECUTE FUNCTION evaluate_agent_constraints();
```

The evaluator traverses the AST tree, resolving `field` nodes against `NEW.*` and `agent_attr` nodes against `erp_agents.*` for the executing agent. Any `comparison` that fails raises a structured exception that the agent can parse and act on.

This makes governance data-driven: a compliance rule can be added via SQL, takes effect immediately, and is applied uniformly across all agents without a code deploy.

---

### Priority 3 — Procurement Agent

**Trigger:** `REORDER_TRIGGERED` events, emitted when inventory falls below `reorder_point`.

**Logic:**
1. Query `erp_suppliers` for active suppliers who carry the product
2. Rank by `reliability_score DESC`, `lead_time_days ASC`
3. Verify candidate supplier is `is_preferred = true` (constraint: agents may not raise POs against non-preferred suppliers without escalation)
4. Create `erp_purchase_orders` + `erp_purchase_order_items`
5. Total order value must not exceed `financial_authority_limit`; escalate to human-flagged review if it does

---

### Priority 4 — Semantic Memory Pipeline

`erp_agent_memory` with `pgvector` embeddings is in the schema but not yet written to or read from.

**Write path:** After each successful agent action, embed a natural-language summary of the decision and insert into `erp_agent_memory` with the agent's UUID and an importance score derived from event priority.

**Read path:** Before building an agent's context window, embed the current task payload and run a cosine similarity search:
```sql
SELECT raw_content FROM erp_agent_memory
WHERE agent_id = $1
ORDER BY embedding_vector <=> $query_embedding
LIMIT 5;
```
The top-5 results are injected into the agent's system prompt as recent episodic context.

This closes the loop between execution and learning. An agent that processed a fraudulent order last week will have that episode in its context when evaluating a similar order today.

---

### Priority 5 — HR/Payroll Agent

pg_cron emits a `PAYROLL_RUN` event on the 25th of each month. The agent:
1. Reads all `erp_employees` with `employment_status = 'active'`
2. Aggregates approved `erp_timesheets` for the pay period
3. Calculates gross/tax/net per employee
4. Inserts `erp_payroll_manifests` + `erp_payroll_line_items`
5. Posts journal entry: `DR Salaries Expense / CR Accrued Liabilities`
6. Marks manifest as `disbursed` after bank transfer confirmation

The `erp_journal_balance_check` trigger will reject the journal post if the numbers don't balance. The agent must produce balanced entries or the payroll manifest cannot be marked complete.

---

### Priority 6 — Row-Level Security

All tables are currently open to the service role. Before production traffic:
- Enable RLS on all `erp_*` tables
- Bind each `database_role` to the minimum required access
- `anon` key: read-only access to `erp_products`, `erp_inventory` (for the portal)
- Agent roles: scoped to their domain tables only

RLS is the enforcement layer for Agentic Governance's data isolation guarantee. Without it, an agent can technically read or write any table — the system's architecture guarantees it won't, but the database doesn't prevent it.

---

### Priority 7 — Additional Ingress Channels

| Channel | Edge Function | Event Type | Notes |
|---------|--------------|------------|-------|
| Bank Feed | `bank-feed` | `BANK_RECONCILIATION` | Accepts webhooks from Plaid / GoCardless / Salt Edge |
| Supplier Portal | `inbound-supplier-event` | `GOODS_RECEIVED`, `SUPPLIER_INVOICE` | Mirror of customer portal |
| Inbound Email | `email-relay` | LLM-classified | Parse intent from customer/supplier emails via Claude |
| EDI | `edi-relay` | `ORDER_NEGOTIATION`, `GOODS_RECEIVED` | Accept EDI 850/856 documents, translate to internal events |

Every channel outputs to the same `erp_task_events` INSERT. The dispatch trigger and agent layer are completely channel-agnostic.

---

### Priority 8 — Realtime Operator Console

The Operator Console currently polls on a 10-second ISR interval. Replace with a Supabase Realtime subscription so dashboards update the moment an event is inserted or an order status changes:

```typescript
supabase
  .channel('task_events')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'erp_task_events' }, handler)
  .subscribe()
```

No architectural change required — this is purely a frontend concern.

---

## 11. Status Matrix

| Component | Status | Notes |
|-----------|--------|-------|
| 26-table schema | ✅ Live | All domains: sales, procurement, inventory, finance, HR, agents |
| `erp_dispatch_on_task_insert` trigger | ✅ Live | Real-time agent wakeup via `net.http_post` |
| pg_cron fallback scheduler | ✅ Live | 5-minute polling sweep for `sales_agent` |
| Credit limit trigger | ✅ Live | Draft-aware, rejects overlimit confirmed orders |
| Refrigeration trigger | ✅ Live | Blocks cold-chain misrouting |
| Double-entry balance trigger | ✅ Live | Σ(DR) = Σ(CR) enforced per transaction |
| Order confirmation cascade | ✅ Live | Inventory deduction + INVOICE_CUSTOMER event on confirm |
| `sales-agent` v3 | ✅ Live | ~1s order confirmation, tier discounts, credit checks |
| `concierge-bot` | ✅ Live | Claude Opus 4.6 agentic loop, Telegram webhook |
| `inbound-order` | ✅ Live | Order intake from all channels |
| Operator Console | ✅ Live | 7 pages, ISR polling |
| Customer Portal | ✅ Live | Public order form with live product catalogue |
| `finance-agent` | 🔜 Next | `INVOICE_CUSTOMER` queue is filling |
| Predicate calculus evaluator | 🔜 Planned | Replace hardcoded triggers with JSONB rule engine |
| `procurement-agent` | 🔜 Planned | `REORDER_TRIGGERED` events queued |
| `hr-payroll-agent` | 🔜 Planned | Schema complete, pg_cron schedule ready |
| Semantic memory (pgvector) | 🔜 Planned | Table exists, read/write pipeline not implemented |
| Row-Level Security | ⚠️ Required before production | All tables currently open to service role |
| Realtime Console | 🔜 Nice to have | Replace ISR with Supabase Realtime subscriptions |
| Authorization log viewer | 🔜 Nice to have | `erp_authorization_logs` populated, not surfaced in UI |
| Bank feed ingest | 🔜 Planned | Requires external bank API integration |
| Vercel production deploy | 🔜 Planned | Env vars, custom domain, rate limiting |
