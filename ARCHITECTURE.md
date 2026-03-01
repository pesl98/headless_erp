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
       → dispatch trigger fires again → finance-agent woken (~3s)
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

## 5. Petri Net State-Safety Audit

We use Petri Net formalism as a **design review lens** — not a runtime engine. The model below maps the live system onto Places (database states), Transitions (agents and triggers), and Tokens (order UUIDs) to formally verify reachability and deadlock-freedom.

### Token Flow Diagram

```
PLACES (○ = state)          TRANSITIONS (→ = agent/trigger)
─────────────────────────────────────────────────────────────────

 [INTAKE]
  ○ P0  inbound signal (Telegram / portal / curl)
     │
     → T0  inbound-order Edge Function
     │     (creates draft order + task event)
     ▼
  ○ P1  erp_task_events.status = 'pending'  (ORDER_NEGOTIATION)
  ○ P2  erp_sales_orders.status = 'draft'
     │
     → T1  erp_dispatch_on_task_insert trigger
     │     (net.http_post to sales-agent, async, ~1s)
     ▼
  ○ P3  erp_task_events.status = 'processing'  (ORDER_NEGOTIATION)

 [SALES AGENT DECISION]
  P3 ──→ T2  sales-agent Edge Function
             ├─ Skill Injection: load ORDER_NEGOTIATION SOPs
             ├─ SOP: market_intelligence_price_validation
             │   price > market_avg × 1.10?
             │   YES → P4a  event.failed + order stays 'draft'  ← TERMINAL (rejected)
             │
             ├─ inventory check, credit check
             │
             └─ price OK, checks pass
                 → T3  UPDATE erp_sales_orders SET status='confirmed'
                     (AFTER UPDATE trigger fires)
                 ▼
  ○ P4b erp_sales_orders.status = 'confirmed'
  ○ P5  erp_task_events.status = 'completed'  (ORDER_NEGOTIATION)
  ○ P6  erp_inventory.quantity_available -= order_qty   (CASCADE)
  ○ P7  erp_task_events.status = 'pending'  (INVOICE_CUSTOMER)  ← emitted by trigger

 [FINANCE AGENT DECISION]
  P7 ──→ T4  erp_dispatch_on_task_insert trigger
             (net.http_post to finance-agent)
     ▼
  ○ P8  erp_task_events.status = 'processing'  (INVOICE_CUSTOMER)

  P8 ──→ T5  finance-agent Edge Function
             ├─ Skill Injection: load INVOICE_CUSTOMER SOPs
             ├─ SOP: high_value_invoice_approval_gate
             │   amount > €10,000?
             │   YES → P9a  order.status = 'pending_review'
             │              event.status = 'completed' (with gate note)
             │              Telegram alert to operator
             │              ○ P9a = INTENTIONAL HUMAN GATE (not a deadlock)
             │
             └─ amount ≤ €10,000
                 → T6  post_journal_entry() RPC
                 │     DR 12000 Accounts Receivable
                 │     CR 41000 Product Revenue
                 ▼
  ○ P9b erp_financial_transactions row created
  ○ P10 erp_sales_orders.status = 'invoiced'
  ○ P11 erp_task_events.status = 'completed'  (INVOICE_CUSTOMER)  ← TERMINAL (success)
```

### Deadlock Analysis

| Scenario | Place | Risk | Mitigation |
|----------|-------|------|------------|
| sales-agent crashes mid-execution | P3 (`processing`) | Token stuck — no transition eligible | **pg_cron** resets `processing` events older than 5 min back to `pending` → T1 re-fires |
| finance-agent crashes mid-execution | P8 (`processing`) | Token stuck | Same pg_cron fallback — every 5 minutes |
| Dispatch `net.http_post` fails | P1 (`pending`) | Event never claimed | pg_cron fallback polls and calls agent directly |
| order in `pending_review` | P9a | Token waiting for human | **Intentional gate** — not a deadlock. Operator re-queues via console. Documented explicitly. |
| market price check rejects order | P4a | Token at `failed` | Terminal state. Operator can re-submit or adjust pricing. |

**Conclusion:** No permanent deadlock exists. Every `processing` state has a pg_cron escape path within 5 minutes. The only blocked state is `pending_review`, which is a deliberate human-in-the-loop gate with a documented resolution path. All tokens (order UUIDs) can reach the `invoiced` terminal state if business rules are satisfied.

### Reachability

From any `draft` order, the `invoiced` state is reachable iff:
- All SKUs priced ≤ market_avg × 1.10
- Sufficient inventory exists
- Customer credit limit not breached
- Invoice amount ≤ €10,000 (or human approval granted)

---

## 6. Agentic Governance

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

### 5.3 Skill Injection Loop (Layer 2 — SOPs)

Before any agent executes business logic, it performs a **skill injection query** — a SELECT against `erp_agent_skills` filtered by `agent_id` and `event_type`. The retrieved SOP text is injected directly into the agent's decision logic at runtime. This separates *what the agent knows* from *what the agent does*.

```
Agent wakes (event claimed)
  │
  ├─► SELECT erp_agent_skills WHERE agent_id = ? AND event_type IN (...)
  │         ↓ returns SOPs as domain_knowledge text + activation_condition JSONB
  │
  ├─► Extract behavioral parameters from activation_condition
  │   e.g. threshold_eur: 10000, threshold_pct: 10
  │
  └─► Execute business logic informed by SOPs
```

**Live SOPs (7 total across all agents):**

| Agent | SOP Name | Trigger Condition | Effect |
|-------|----------|------------------|--------|
| `finance_agent` | `high_value_invoice_approval_gate` | `amount > €10,000` | Freeze order to `pending_review`, send Telegram alert to operator |
| `finance_agent` | `gaap_revenue_recognition` | always | Enforce ASC 606 revenue recognition |
| `finance_agent` | `double_entry_enforcement` | always | Every debit must have a matching credit |
| `sales_agent` | `market_intelligence_price_validation` | `unit_price > market_avg × 1.10` | Reject order, log deviation in `erp_authorization_logs` |
| `sales_agent` | `discount_authority_matrix` | always | Platinum: 20%, Gold: 10%, Silver: 5%, Standard: 0% |
| `procurement_agent` | `vendor_negotiation_tactics` | `REORDER_TRIGGERED` | Competitive bidding tiers, preferred supplier priority |
| `hr_payroll_agent` | `payroll_tax_computation` | `PAYROLL_RUN` | Withhold 20% income tax (>€50k), 15% below |

**Market Intelligence (erp_market_intelligence):**
The `market_intelligence_price_validation` SOP queries `erp_market_intelligence` — a table of 3-month rolling average prices per SKU sourced from market feeds. The sales agent compares each order line's `unit_price` against this benchmark. Any SKU priced >10% above the market average is rejected before order confirmation, and the deviation is logged in `erp_authorization_logs` for audit.

**Human-in-the-Loop Gate:**
The `high_value_invoice_approval_gate` introduces a deliberate human gate at the invoicing stage. Any invoice exceeding €10,000 is frozen at `pending_review`. The finance agent does not post the journal entry — it sends a Telegram notification to the operator and stops. This demonstrates that the system knows its own authority boundary: large financial events require human confirmation, not just database approval.

---

### 5.4 Hardcoded Constraint Triggers (Current)

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

## 7. Complete Trigger Catalogue

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
| Sales Agent | `sales_agent` | ✅ Active (automated) | €25,000 | `ORDER_NEGOTIATION` |
| Concierge Agent | `concierge_agent` | ✅ Active (Telegram) | none (intake only) | inbound order negotiation via chat |
| Finance Agent | `finance_agent` | ✅ Active (automated) | €250,000 | `INVOICE_CUSTOMER` |
| Procurement Agent | `procurement_agent` | 🔜 Planned | €50,000 | `REORDER_TRIGGERED` |
| Inventory Watcher | `inventory_watcher` | 🔜 Planned | none (read-only sentinel) | `INVENTORY_CHECK` → emits `REORDER_TRIGGERED` |
| HR/Payroll Agent | `hr_payroll_agent` | 🔜 Planned | €5,000 | `PAYROLL_RUN`, `TIMESHEET_APPROVAL` |

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
- `finance-agent` Edge Function — invoice posting, double-entry journals, `pending_review` gate
- Skill Injection Layer 2 — 7 SOPs in `erp_agent_skills` (finance + sales + procurement + HR)
- Market intelligence — `erp_market_intelligence` table, 3-month benchmarks, price deviation check
- Petri Net state-safety audit — deadlock-free proof, human-gate documented

---

### ✅ Finance Agent — Complete
The `finance-agent` Edge Function is live. On every `INVOICE_CUSTOMER` event it:
1. Queries `erp_agent_skills` (Skill Injection Layer 2) to load active SOPs
2. Enforces the `high_value_invoice_approval_gate` SOP: invoices > €10,000 are frozen to `pending_review` and the operator is notified via Telegram
3. For amounts ≤ €10,000: posts `DR 12000 Accounts Receivable / CR 41000 Product Revenue` via `post_journal_entry()` RPC
4. Advances order to `invoiced` and writes to `erp_authorization_logs`

**Measured latency:** draft → invoiced in under 5 seconds end-to-end.

---

### ✅ Skill Injection (Layer 2) — Complete
7 SOPs live across 3 agents. See Section 6.3 for full detail.

Market intelligence price validation active for all `ORDER_NEGOTIATION` events.
High-value invoice approval gate active for all `INVOICE_CUSTOMER` events.

---

### Priority 1 — Predicate Calculus Evaluator

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
| `sales-agent` v4 | ✅ Live | ~1s order confirmation, tier discounts, credit checks, market intelligence validation |
| `concierge-bot` | ✅ Live | Claude Opus 4.6 agentic loop, Telegram webhook |
| `inbound-order` | ✅ Live | Order intake from all channels |
| Operator Console | ✅ Live | 7 pages, ISR polling |
| Customer Portal | ✅ Live | Public order form with live product catalogue |
| `finance-agent` | ✅ Live | Double-entry invoicing, high-value approval gate (>€10k), Telegram operator alert |
| Skill Injection Loop (Layer 2) | ✅ Live | SOPs loaded from `erp_agent_skills` at runtime for all active agents |
| Predicate calculus evaluator | 🔜 Planned | Replace hardcoded triggers with JSONB rule engine |
| `procurement-agent` | 🔜 Planned | `REORDER_TRIGGERED` events queued |
| `hr-payroll-agent` | 🔜 Planned | Schema complete, pg_cron schedule ready |
| Semantic memory (pgvector) | 🔜 Planned | Table exists, read/write pipeline not implemented |
| Row-Level Security | ⚠️ Required before production | All tables currently open to service role |
| Realtime Console | 🔜 Nice to have | Replace ISR with Supabase Realtime subscriptions |
| Authorization log viewer | 🔜 Nice to have | `erp_authorization_logs` populated, not surfaced in UI |
| Bank feed ingest | 🔜 Planned | Requires external bank API integration |
| Vercel production deploy | 🔜 Planned | Env vars, custom domain, rate limiting |
| **Minimum Viable Autonomous Company** | 🎯 North Star | All agents live, all SOPs enforced, human intervenes on exceptions only |

---

## 12. North Star — Minimum Viable Autonomous Company (MVAC)

> *"A company that operates itself. Humans set policy. Agents execute. The database is the contract."*

### What it means

An MVAC is the logical endpoint of this architecture: a legal business entity where **every repeatable operational decision is made by an agent**, constrained by SOPs stored in the database, audited in `erp_authorization_logs`, and escalated to a human only when a predicate fails or a threshold is breached.

No one monitors dashboards waiting for work. The system self-directs. The operator is an **exception handler**, not an operator.

---

### The Five Criteria

| # | Criterion | Current state | Gap |
|---|-----------|--------------|-----|
| 1 | **Self-selling** — Inbound leads converted to confirmed orders without human touch | ✅ concierge-bot + sales-agent pipeline live | — |
| 2 | **Self-sourcing** — Reorder triggers fire automatically when stock hits reorder point | 🔜 `procurement-agent` schema ready | Deploy procurement-agent |
| 3 | **Self-accounting** — Every transaction double-entry posted, P&L available in real time | ✅ finance-agent live, GL complete | — |
| 4 | **Self-governing** — Every agent action is SOP-gated, logged, and auditable | ✅ Skill Injection Layer 2 live | Add predicate calculus evaluator |
| 5 | **Self-correcting** — Agents detect anomalies and adjust without human instruction | 🔜 Requires episodic memory (Layer 3) + feedback loop | Build Layer 3 |

---

### The Remaining Build List (ordered)

```
Phase A — Close the operational loop
  ├── procurement-agent          REORDER_TRIGGERED → purchase order → goods received
  ├── hr-payroll-agent           pg_cron monthly → payroll journal entries
  └── bank feed ingest           reconcile GL vs actual bank transactions

Phase B — Make it self-governing
  ├── Predicate calculus evaluator   replace hardcoded triggers with JSONB rule engine
  ├── Row-Level Security             all tables locked to service role per agent
  └── Authorization log viewer       surface erp_authorization_logs in Operator Console

Phase C — Make it self-correcting  (Layer 3)
  ├── Episodic memory (pgvector)     agents remember past decisions and outcomes
  ├── Anomaly detection              flag deviations from historical patterns
  └── SOP self-amendment             agents propose SOP updates; human approves

Phase D — Ship it
  ├── Vercel production deploy       env vars, custom domain, rate limiting
  ├── Realtime Console               Supabase Realtime subscriptions replace ISR
  └── Multi-tenant                   schema-per-company isolation
```

---

### The Provocative Claim

Most ERP software is a **recording system** — it captures what humans decided. This system is an **execution system** — it decides and acts, and records why.

The MVAC thesis is that for a large class of SME operations — commodity trading, distribution, light manufacturing — the full order-to-cash and procure-to-pay cycles can run **with zero human keystrokes** under normal conditions, and the human role shifts entirely to:

1. Setting policy (SOPs in the database)
2. Approving exceptions (Telegram alerts)
3. Reviewing the audit log (not the inbox)

When all five criteria above are met, this project becomes that company.

---

*Last updated: 2026-03-01*
