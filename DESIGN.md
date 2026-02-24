# Headless ERP — System Design Document

> **Version:** 1.0 · **Date:** 2026-02-24
> **Repository:** https://github.com/pesl98/headless_erp
> **Supabase Project:** `rdlxbyrgwofzjxlqbdcc` (eu-central-1)

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Architecture Philosophy](#2-architecture-philosophy)
3. [Tech Stack](#3-tech-stack)
4. [Database Schema — Complete Reference](#4-database-schema--complete-reference)
5. [Agent Subsystem](#5-agent-subsystem)
6. [MCP Tool Registry](#6-mcp-tool-registry)
7. [Tri-Partite Memory Model](#7-tri-partite-memory-model)
8. [Predicate Calculus Constraints](#8-predicate-calculus-constraints)
9. [Orchestration Layer](#9-orchestration-layer)
10. [ERP Module — Finance](#10-erp-module--finance)
11. [ERP Module — Supply Chain & Inventory](#11-erp-module--supply-chain--inventory)
12. [ERP Module — Sales & CRM](#12-erp-module--sales--crm)
13. [ERP Module — Human Resources & Payroll](#13-erp-module--human-resources--payroll)
14. [Operator Console (Frontend)](#14-operator-console-frontend)
15. [Security Model](#15-security-model)
16. [Key Data Flows](#16-key-data-flows)
17. [Design Decisions & Trade-offs](#17-design-decisions--trade-offs)

---

## 1. Executive Overview

**Headless ERP** is a fully autonomous Enterprise Resource Planning system in which all business operations are executed by specialised AI agents rather than human users. The system is called "headless" because there is no traditional user-facing application form — agents interact with the ERP exclusively through a typed **Model Context Protocol (MCP)** tool registry backed by PostgreSQL functions.

Human operators interact via an **Operator Console** (the Next.js application in this repository) which provides read-only observability into all agent actions, system state, and data integrity. The console is the "mission control" glass — not the control surface.

### Core Design Tenets

| Tenet | Expression |
|-------|-----------|
| **Agents as first-class citizens** | Every business action is attributed to a specific agent with an immutable audit trail |
| **Database as ground truth** | All state lives in PostgreSQL; agents are stateless between invocations |
| **Constraints are code** | Business rules are stored as JSONB predicate-calculus ASTs and evaluated by BEFORE triggers — they cannot be circumvented by agents |
| **Double-entry always balances** | The ledger is enforced at the database layer, not the application layer |
| **Memory is layered** | Short-term (conversation), semantic (vector), and structured (ledger) memory serve different cognitive needs |

---

## 2. Architecture Philosophy

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL STIMULI                             │
│   Bank feeds · Webhooks · EDI · Scheduled triggers (pg_cron)       │
└────────────────────────────┬────────────────────────────────────────┘
                             │  INSERT into erp_task_events
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                              │
│   pg_net async HTTP → Supabase Edge Function (Router)               │
│   Selects domain agent by event_type · Sets status = processing     │
└────────────────────────────┬────────────────────────────────────────┘
                             │  Invoke Agent Edge Function
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      COGNITIVE LAYER                                │
│   LLM + system_prompt + skills + semantic memory → tool call        │
│   Agent reasons about the task and selects the correct MCP tool     │
└────────────────────────────┬────────────────────────────────────────┘
                             │  MCP tool call (plpgsql / edge fn / API)
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CONSTRAINT LAYER                                  │
│   PostgreSQL BEFORE triggers evaluate predicate-calculus ASTs        │
│   EXCEPTION raised if constraint violated → automatic ROLLBACK      │
│   COMMIT only if all constraints satisfied                           │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    STRUCTURED STATE (PostgreSQL)                    │
│   Ledger · Inventory · HR · Sales · Authorization Logs              │
└─────────────────────────────────────────────────────────────────────┘
```

The three-layer execution loop (Ingestion → Routing → Cognitive) maps to a strict separation of concerns:

- **Ingestion** is passive — any external system can write a row to `erp_task_events`.
- **Routing** is deterministic — event type maps to agent role by a lookup table, not LLM reasoning.
- **Cognitive processing** is where the LLM participates — but only after routing has already constrained the action space.
- **Constraint enforcement** is non-negotiable — no LLM output can bypass a BEFORE trigger EXCEPTION.

---

## 3. Tech Stack

### Backend / Database

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Primary datastore | **PostgreSQL 16** (via Supabase) | ACID transactions, JSONB, triggers |
| Vector search | **pgvector** (VECTOR(1536), HNSW index) | Semantic memory for agents |
| Message queue | **pgmq** | Async task routing between components |
| Job scheduling | **pg_cron** | Payroll on 25th, inventory watcher |
| Async HTTP | **pg_net** | Trigger → Edge Function HTTP calls |
| UUID generation | **pgcrypto** (gen_random_uuid) | Stable unique identifiers |
| Edge Functions | **Deno / TypeScript** (Supabase) | Orchestration router + agent invocation |

### Frontend / Operator Console

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | **Next.js 16** (App Router) | Server components, file-based routing |
| Styling | **Tailwind CSS v4** | Utility-first, `@theme {}` CSS variables |
| DB client | **@supabase/supabase-js** | Server-side Supabase queries |
| Icons | **lucide-react** | Consistent icon set |
| Fonts | **IBM Plex Mono + Barlow** (Google Fonts) | Monospace data + clean UI text |
| Runtime | **Node.js 22** | Next.js server |

### Agent Execution

| Component | Technology |
|-----------|-----------|
| LLM | Anthropic Claude (claude-3-5-sonnet) via API |
| Tool protocol | Model Context Protocol (MCP) |
| Agent invocation | Supabase Edge Functions (Deno) |
| Memory retrieval | pgvector cosine similarity search |

---

## 4. Database Schema — Complete Reference

All tables are prefixed with `erp_` and live in the `public` schema. Primary keys use `UUID DEFAULT gen_random_uuid()`.

### 4.1 Agent Subsystem Tables (9 tables)

#### `erp_agents`
The identity record for each autonomous agent.

| Column | Type | Description |
|--------|------|-------------|
| `agent_id` | UUID PK | Unique agent identifier |
| `role_name` | TEXT UNIQUE | Machine-readable role (e.g. `finance_controller`) |
| `display_name` | TEXT | Human-readable name (e.g. "Meridian") |
| `avatar_emoji` | TEXT | Visual identifier in the console |
| `system_prompt` | TEXT | Full LLM system prompt (defines persona, rules, scope) |
| `operational_status` | TEXT | `active` / `sleeping` / `suspended` / `terminated` |
| `financial_authority_limit` | NUMERIC(15,2) | Maximum transaction value agent can authorise |
| `created_at` | TIMESTAMPTZ | |

**Seed data agents:**

| Emoji | Display Name | Role | Status | Authority Limit |
|-------|-------------|------|--------|----------------|
| 🏦 | Meridian | finance_controller | active | €500,000 |
| 📦 | Prometheus | procurement_buyer | active | €50,000 |
| 💼 | Apex | sales_executive | active | €200,000 |
| 👥 | Vega | hr_payroll_manager | active | €1,000,000 |
| 🔍 | Sentinel | inventory_watcher | active | €0 |
| 🚚 | Hermes | logistics_coordinator | sleeping | €25,000 |

---

#### `erp_agent_skills`
Domain knowledge modules attached to agents. An agent's skills are included in its LLM context at invocation time.

| Column | Type | Description |
|--------|------|-------------|
| `skill_id` | UUID PK | |
| `agent_id` | UUID FK → erp_agents | Owning agent |
| `skill_name` | TEXT | Short label (e.g. "IFRS Accounting Standards") |
| `domain_knowledge` | TEXT | Detailed knowledge content passed to LLM |
| `activation_condition` | TEXT | When this skill activates (e.g. "journal_entry_required") |
| `created_at` | TIMESTAMPTZ | |

---

#### `erp_mcp_tools`
The tool registry — every callable action available to agents.

| Column | Type | Description |
|--------|------|-------------|
| `tool_id` | UUID PK | |
| `tool_name` | TEXT UNIQUE | Snake_case tool identifier |
| `semantic_description` | TEXT | Natural language description for LLM |
| `input_schema` | JSONB | JSON Schema defining expected parameters |
| `execution_handler` | TEXT | `plpgsql_function` / `edge_function` / `external_api` |
| `target_endpoint` | TEXT | Function name or URL |
| `is_active` | BOOLEAN | Whether the tool is enabled |
| `created_at` | TIMESTAMPTZ | |

**Seeded tools:**

| Tool Name | Handler | Description |
|-----------|---------|-------------|
| `post_journal_entry` | plpgsql_function | Posts balanced double-entry journal entries |
| `create_purchase_order` | plpgsql_function | Raises purchase orders against approved suppliers |
| `confirm_sales_order` | plpgsql_function | Confirms orders, deducts inventory, raises invoice task |
| `run_payroll_manifest` | edge_function | Generates and disburses monthly payroll |
| `reconcile_bank_statement` | edge_function | Matches bank transactions to journal entries |
| `check_inventory_levels` | plpgsql_function | Reads stock vs. reorder points, emits REORDER_TRIGGERED events |
| `approve_timesheet` | plpgsql_function | Validates and approves employee timesheets |
| `send_customer_invoice` | external_api | Generates PDF invoice and emails customer |

---

#### `erp_agent_tool_assignments`
Many-to-many join — which agents can use which tools.

| Column | Type |
|--------|------|
| `agent_id` | UUID FK → erp_agents |
| `tool_id` | UUID FK → erp_mcp_tools |
| PRIMARY KEY | (agent_id, tool_id) |

---

#### `erp_agent_memory`
Semantic (vector) memory store. Each row is a memory fragment embedded as a 1536-dimensional vector.

| Column | Type | Description |
|--------|------|-------------|
| `memory_id` | UUID PK | |
| `agent_id` | UUID FK | Owning agent |
| `memory_type` | TEXT | `episodic` / `semantic` / `procedural` |
| `content` | TEXT | Raw text of the memory |
| `embedding` | VECTOR(1536) | OpenAI/Anthropic embedding |
| `importance_score` | NUMERIC(3,2) | Salience weighting [0,1] |
| `created_at` | TIMESTAMPTZ | |

**Index:** `CREATE INDEX ON erp_agent_memory USING hnsw (embedding vector_cosine_ops)`

---

#### `erp_agent_message_history`
Short-term (conversation) memory. Last N messages are retrieved for context window.

| Column | Type | Description |
|--------|------|-------------|
| `message_id` | UUID PK | |
| `agent_id` | UUID FK | |
| `session_id` | UUID | Groups messages by invocation session |
| `role` | TEXT | `user` / `assistant` / `tool` |
| `content` | TEXT | Message text |
| `token_count` | INT | For context window management |
| `created_at` | TIMESTAMPTZ | |

---

#### `erp_agent_constraints`
Business rule store — predicate calculus rules as JSONB ASTs.

| Column | Type | Description |
|--------|------|-------------|
| `constraint_id` | UUID PK | |
| `target_agent_role` | TEXT | Role this constraint applies to (or `*` for all) |
| `target_table` | TEXT | Table the constraint guards |
| `triggering_operation` | TEXT | `INSERT` / `UPDATE` / `DELETE` |
| `logic_ast` | JSONB | Predicate calculus expression tree |
| `violation_message` | TEXT | Error message raised on violation |
| `is_active` | BOOLEAN | Hot-toggleable without schema change |
| `created_at` | TIMESTAMPTZ | |

See [Section 8](#8-predicate-calculus-constraints) for full AST format.

---

#### `erp_authorization_logs`
Immutable audit trail for every agent action attempt.

| Column | Type | Description |
|--------|------|-------------|
| `log_id` | UUID PK | |
| `agent_id` | UUID FK | |
| `action_type` | TEXT | Tool name called |
| `target_table` | TEXT | Affected table |
| `record_id` | UUID | Affected record |
| `was_authorized` | BOOLEAN | Whether the action passed constraints |
| `constraint_violated` | TEXT | Constraint ID if rejected |
| `financial_amount` | NUMERIC(15,2) | Value involved (if financial) |
| `created_at` | TIMESTAMPTZ | |

---

#### `erp_task_events`
The central work queue — the primary interface between external stimuli and the agent fleet.

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | UUID PK | |
| `event_type` | TEXT | `REORDER_TRIGGERED` / `PAYROLL_RUN` / `BANK_RECONCILIATION` / `INVOICE_CUSTOMER` / `CREDIT_REVIEW` / `ORDER_NEGOTIATION` / `RFQ_REQUESTED` |
| `target_agent` | TEXT | Agent role to handle this event (nullable = router decides) |
| `payload` | JSONB | Event-specific data |
| `status` | TEXT | `pending` / `processing` / `completed` / `failed` |
| `priority` | INT | 1-10, higher = processed first |
| `created_at` | TIMESTAMPTZ | |
| `processed_at` | TIMESTAMPTZ | When status changed to completed/failed |

---

### 4.2 Finance Module Tables (3 tables)

#### `erp_accounts`
Chart of accounts — the ledger structure.

| Column | Type | Description |
|--------|------|-------------|
| `account_id` | UUID PK | |
| `account_code` | TEXT UNIQUE | Numeric code (e.g. "1000") |
| `account_name` | TEXT | Human label |
| `account_classification` | TEXT | `Asset` / `Liability` / `Equity` / `Revenue` / `Expense` |
| `currency_code` | TEXT | ISO 4217 (e.g. "EUR") |
| `is_active` | BOOLEAN | |

**Seeded chart of accounts (15 accounts):**

| Code | Name | Classification |
|------|------|---------------|
| 1000 | Cash and Cash Equivalents | Asset |
| 1100 | Accounts Receivable | Asset |
| 1200 | Inventory Asset | Asset |
| 1300 | Prepaid Expenses | Asset |
| 1400 | Property Plant & Equipment | Asset |
| 2000 | Accounts Payable | Liability |
| 2100 | Accrued Liabilities | Liability |
| 2200 | Deferred Revenue | Liability |
| 3000 | Retained Earnings | Equity |
| 3100 | Share Capital | Equity |
| 4000 | Product Revenue | Revenue |
| 4100 | Service Revenue | Revenue |
| 5000 | Cost of Goods Sold | Expense |
| 5100 | Salaries & Wages Expense | Expense |
| 5200 | Operating Expenses | Expense |

---

#### `erp_financial_transactions`
Transaction header — each row represents one economic event.

| Column | Type | Description |
|--------|------|-------------|
| `transaction_id` | UUID PK | |
| `executing_agent_id` | UUID FK → erp_agents | Which agent posted this |
| `posted_timestamp` | TIMESTAMPTZ | When posted |
| `semantic_description` | TEXT | Natural language description |
| `source_document_type` | TEXT | `invoice` / `purchase_order` / `payroll` / `adjustment` |
| `currency_code` | TEXT | |

---

#### `erp_journal_entries`
Individual debit/credit lines — must balance per transaction_id.

| Column | Type | Description |
|--------|------|-------------|
| `entry_id` | UUID PK | |
| `transaction_id` | UUID FK → erp_financial_transactions | |
| `account_id` | UUID FK → erp_accounts | |
| `absolute_amount` | NUMERIC(15,2) | Always positive |
| `is_credit_entry` | BOOLEAN | `true` = credit, `false` = debit |
| `memo` | TEXT | Line-level note |

**Double-entry enforcement trigger:**

```sql
-- Fires AFTER INSERT on erp_journal_entries
-- Checks that SUM(debits) = SUM(credits) for the affected transaction_id
-- RAISES EXCEPTION 'Transaction is not balanced...' if not equal
-- This runs WITHIN the same transaction — unbalanced entries never commit
```

**Invariant:** `∀ T ∈ Transactions: Σ(Debits) = Σ(Credits)`

---

### 4.3 Supply Chain Module Tables (6 tables)

#### `erp_products`

| Column | Type | Description |
|--------|------|-------------|
| `product_id` | UUID PK | |
| `stock_keeping_unit` | TEXT UNIQUE | SKU code |
| `product_name` | TEXT | |
| `category` | TEXT | `Electronics` / `Chemicals` / `Biologics` / `Materials` |
| `standard_unit_cost` | NUMERIC(10,2) | Purchase cost per unit |
| `standard_sale_price` | NUMERIC(10,2) | List sale price per unit |
| `requires_refrigeration` | BOOLEAN | Triggers storage constraint |

---

#### `erp_warehouses`

| Column | Type | Description |
|--------|------|-------------|
| `warehouse_id` | UUID PK | |
| `facility_name` | TEXT UNIQUE | |
| `is_climate_controlled` | BOOLEAN | Whether refrigeration is available |
| `maximum_capacity_volume` | NUMERIC(10,2) | m³ |

**Seeded warehouses:**

| Facility | Climate Controlled | Capacity |
|----------|-------------------|---------|
| Frankfurt Main Hub | ✗ | 15,000 m³ |
| Berlin Cold Storage | ✓ | 5,000 m³ |
| Munich Distribution | ✗ | 8,500 m³ |

---

#### `erp_inventory`

| Column | Type | Description |
|--------|------|-------------|
| `inventory_record_id` | UUID PK | |
| `product_id` | UUID FK | |
| `warehouse_id` | UUID FK | |
| `current_quantity_available` | INT | |
| `reorder_point` | INT | Triggers REORDER_TRIGGERED event |
| `calculated_safety_stock` | INT | Critical threshold |
| `max_stock_level` | INT | Maximum capacity for this SKU at this location |

**Refrigeration constraint trigger:**

```sql
-- Fires BEFORE INSERT OR UPDATE on erp_inventory
-- If NEW product requires_refrigeration = true AND warehouse is_climate_controlled = false:
--   RAISE EXCEPTION 'Cannot store refrigerated product in non-climate-controlled warehouse'
```

---

#### `erp_suppliers`

| Column | Type | Description |
|--------|------|-------------|
| `supplier_id` | UUID PK | |
| `company_name` | TEXT | |
| `contact_email` | TEXT | |
| `lead_time_days` | INT | Typical delivery lead time |
| `reliability_score` | NUMERIC(3,2) | [0,1] historical on-time delivery |
| `payment_terms` | TEXT | e.g. "NET30" |
| `is_preferred` | BOOLEAN | Preferred vendor status |

---

#### `erp_purchase_orders`

| Column | Type | Description |
|--------|------|-------------|
| `purchase_order_id` | UUID PK | |
| `supplier_id` | UUID FK | |
| `executing_agent_id` | UUID FK → erp_agents | Agent who raised the PO |
| `order_status` | TEXT | `draft` / `sent` / `acknowledged` / `received` / `cancelled` |
| `total_order_value` | NUMERIC(15,2) | |
| `expected_delivery_date` | DATE | |
| `created_at` | TIMESTAMPTZ | |

---

#### `erp_purchase_order_items`
Line items for purchase orders.

| Column | Type |
|--------|------|
| `item_id` | UUID PK |
| `purchase_order_id` | UUID FK |
| `product_id` | UUID FK |
| `quantity_ordered` | INT |
| `agreed_unit_price` | NUMERIC(10,2) |

---

### 4.4 Sales & CRM Module Tables (3 tables)

#### `erp_customers`

| Column | Type | Description |
|--------|------|-------------|
| `customer_id` | UUID PK | |
| `customer_name` | TEXT | |
| `company_name` | TEXT | |
| `contact_email` | TEXT | |
| `maximum_credit_limit` | NUMERIC(15,2) | Hard cap enforced by trigger |
| `current_balance` | NUMERIC(15,2) | Running outstanding balance |
| `account_status` | TEXT | `active` / `suspended` / `closed` |
| `customer_tier` | TEXT | `standard` / `silver` / `gold` / `platinum` |

---

#### `erp_sales_orders`

| Column | Type | Description |
|--------|------|-------------|
| `sales_order_id` | UUID PK | |
| `customer_id` | UUID FK | |
| `closing_agent_id` | UUID FK → erp_agents | Sales agent |
| `order_status` | TEXT | `draft` / `confirmed` / `invoiced` / `paid` / `cancelled` |
| `total_invoice_value` | NUMERIC(15,2) | |
| `discount_percent` | NUMERIC(5,2) | Agent-applied discount |
| `order_creation_date` | DATE | |

**Credit limit trigger (BEFORE INSERT):**
```sql
-- If customer's current_balance + total_invoice_value > maximum_credit_limit:
--   RAISE EXCEPTION 'Credit limit exceeded for customer %'
```

**Order cascade trigger (AFTER UPDATE):**
```sql
-- When order_status changes to 'confirmed':
--   1. Deduct quantities from erp_inventory for each line item
--   2. INSERT into erp_task_events: INVOICE_CUSTOMER event for finance agent
```

---

#### `erp_sales_order_items`

| Column | Type |
|--------|------|
| `item_id` | UUID PK |
| `sales_order_id` | UUID FK |
| `product_id` | UUID FK |
| `quantity` | INT |
| `unit_price` | NUMERIC(10,2) |
| `line_total` | NUMERIC(15,2) |

---

### 4.5 HR & Payroll Module Tables (5 tables)

#### `erp_departments`

| Column | Type | Description |
|--------|------|-------------|
| `department_id` | UUID PK | |
| `department_name` | TEXT | |
| `department_code` | TEXT UNIQUE | Short code (e.g. "ENG", "FIN") |
| `budget_annual` | NUMERIC(15,2) | Annual personnel budget |

---

#### `erp_employees`

| Column | Type | Description |
|--------|------|-------------|
| `employee_id` | UUID PK | |
| `department_id` | UUID FK | |
| `first_name` | TEXT | |
| `last_name` | TEXT | |
| `email` | TEXT UNIQUE | |
| `job_title` | TEXT | |
| `employment_type` | TEXT | `full_time` / `part_time` / `contractor` |
| `employment_status` | TEXT | `active` / `on_leave` / `terminated` |
| `annual_base_salary` | NUMERIC(15,2) | Gross annual salary |
| `official_hire_date` | DATE | |

---

#### `erp_timesheets`

| Column | Type | Description |
|--------|------|-------------|
| `timesheet_record_id` | UUID PK | |
| `employee_id` | UUID FK | |
| `date_of_labor` | DATE | Work date |
| `hours_worked` | NUMERIC(4,2) | Standard hours |
| `overtime_hours` | NUMERIC(4,2) | Overtime hours |
| `approval_status` | TEXT | `draft` / `submitted` / `approved` / `rejected` |

---

#### `erp_payroll_manifests`
Each row represents one payroll run for all employees in a period.

| Column | Type | Description |
|--------|------|-------------|
| `manifest_id` | UUID PK | |
| `pay_period_start` | DATE | |
| `pay_period_end` | DATE | |
| `total_gross_pay` | NUMERIC(15,2) | Total before deductions |
| `total_net_pay` | NUMERIC(15,2) | Total after deductions |
| `employee_count` | INT | Number of employees in run |
| `status` | TEXT | `draft` / `approved` / `disbursed` |
| `created_at` | TIMESTAMPTZ | |

---

#### `erp_payroll_line_items`
Individual employee payslip data within a manifest.

| Column | Type |
|--------|------|
| `line_item_id` | UUID PK |
| `manifest_id` | UUID FK |
| `employee_id` | UUID FK |
| `gross_pay` | NUMERIC(15,2) |
| `tax_deduction` | NUMERIC(15,2) |
| `net_pay` | NUMERIC(15,2) |

---

## 5. Agent Subsystem

### Agent Lifecycle

```
                    ┌─────────────┐
                    │   SLEEPING  │◄──── pg_cron schedule not triggered
                    └──────┬──────┘
                           │ Event received (matching event_type)
                           ▼
                    ┌─────────────┐
                    │ PROCESSING  │◄──── Edge Function invoked
                    └──────┬──────┘
                           │ LLM reasons, selects tool, calls tool
                           ▼
              ┌────────────┴────────────┐
              │                         │
    Constraint PASS              Constraint FAIL
              │                         │
              ▼                         ▼
      DB Commit + ACTIVE          ROLLBACK + FAILED
      event status                event status logged
```

### Agent Context Window Construction

When an agent is invoked, the Edge Function constructs its context window as:

```
[system_prompt]          ← From erp_agents.system_prompt
[domain_skills]          ← From erp_agent_skills WHERE agent_id = $agent_id
[tool_descriptions]      ← From erp_mcp_tools via erp_agent_tool_assignments
[semantic_memory]        ← Top-K cosine similarity from erp_agent_memory
[message_history]        ← Last N rows from erp_agent_message_history
[task_event_payload]     ← Current erp_task_events.payload (the task)
```

### Financial Authority Limits

Each agent has a `financial_authority_limit`. Any tool call involving a financial amount greater than the limit is rejected at the constraint layer before the transaction commits. This is implemented as a generic constraint with `logic_ast`:

```json
{
  "op": "<=",
  "left": { "field": "total_order_value" },
  "right": { "agent_attr": "financial_authority_limit" }
}
```

---

## 6. MCP Tool Registry

The Model Context Protocol is the exclusive interface through which agents affect the world. Tools are registered in `erp_mcp_tools` with full JSON Schema definitions.

### Tool Execution Handlers

| Handler Type | Execution | Use Case |
|-------------|-----------|---------|
| `plpgsql_function` | Runs a PostgreSQL function in the same transaction | Fast, atomic, constraint-checked |
| `edge_function` | HTTP call to Supabase Edge Function | External APIs, complex orchestration |
| `external_api` | HTTP call to third-party service | Email, payment, logistics APIs |

### Tool Schema Example — `post_journal_entry`

```json
{
  "type": "object",
  "required": ["transaction_description", "entries"],
  "properties": {
    "transaction_description": {
      "type": "string",
      "description": "Human-readable description of the economic event"
    },
    "source_document_type": {
      "type": "string",
      "enum": ["invoice", "purchase_order", "payroll", "adjustment"]
    },
    "entries": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["account_code", "amount", "is_credit"],
        "properties": {
          "account_code": { "type": "string" },
          "amount": { "type": "number", "minimum": 0 },
          "is_credit": { "type": "boolean" },
          "memo": { "type": "string" }
        }
      }
    }
  }
}
```

The agent (LLM) must produce a valid JSON object matching this schema. The Edge Function validates it before calling the `plpgsql_function` target. The PostgreSQL trigger then validates the double-entry balance as a final guard.

---

## 7. Tri-Partite Memory Model

Agents use three complementary memory systems that serve different purposes:

```
┌──────────────────────────────────────────────────────────────┐
│                    MEMORY ARCHITECTURE                        │
├──────────────────┬──────────────────┬────────────────────────┤
│  SHORT-TERM      │  SEMANTIC        │  STRUCTURED            │
│  (Episodic)      │  (Vector)        │  (Ledger)              │
├──────────────────┼──────────────────┼────────────────────────┤
│ Last N messages  │ Embedded text    │ ERP tables             │
│ in session       │ fragments (1536d)│ (inventory, ledger…)   │
├──────────────────┼──────────────────┼────────────────────────┤
│ Retrieved by:    │ Retrieved by:    │ Retrieved by:          │
│ session_id ORDER │ cosine similarity│ SQL query via MCP tool │
│ BY created_at    │ (HNSW index)     │                        │
├──────────────────┼──────────────────┼────────────────────────┤
│ Purpose:         │ Purpose:         │ Purpose:               │
│ Conversation     │ "Have I seen     │ Ground truth state     │
│ continuity       │ something like   │ of the business        │
│                  │ this before?"    │                        │
└──────────────────┴──────────────────┴────────────────────────┘
```

### Semantic Memory Query

```sql
SELECT content, importance_score,
       1 - (embedding <=> $query_embedding) AS similarity
FROM erp_agent_memory
WHERE agent_id = $agent_id
  AND 1 - (embedding <=> $query_embedding) > 0.75
ORDER BY embedding <=> $query_embedding
LIMIT 5;
```

The HNSW index (`hnsw (embedding vector_cosine_ops)`) ensures this query runs in sub-millisecond time even with millions of memory fragments.

### Memory Types

| Type | Description | Example |
|------|-------------|---------|
| `episodic` | Records of specific past events | "On 2025-01-15 I processed a REORDER_TRIGGERED for MEM-DDR5-032" |
| `semantic` | General domain knowledge | "Supplier TechCore GmbH has 97% reliability — prefer for electronics" |
| `procedural` | How-to knowledge | "When credit limit is within 10%, escalate to CREDIT_REVIEW event" |

---

## 8. Predicate Calculus Constraints

Business rules are stored as JSONB Abstract Syntax Trees (ASTs) in `erp_agent_constraints`. A generic BEFORE trigger evaluates the AST and raises an exception if the constraint is violated.

### AST Node Types

| Node Type | Structure | Description |
|-----------|-----------|-------------|
| `comparison` | `{op, left, right}` | `<`, `<=`, `>`, `>=`, `=`, `!=` |
| `logical` | `{op: "AND"/"OR", operands: [...]}` | Boolean combinators |
| `not` | `{op: "NOT", operand}` | Negation |
| `field` | `{field: "column_name"}` | Value from the NEW record |
| `agent_attr` | `{agent_attr: "attribute"}` | Value from the executing agent record |
| `literal` | `{literal: value}` | Constant value |
| `query` | `{query: "SQL", params: [...]}` | Sub-query result |

### Seeded Constraints

#### 1. Finance Controller Authority Limit
```json
{
  "op": "<=",
  "left": { "field": "absolute_amount" },
  "right": { "agent_attr": "financial_authority_limit" }
}
```
*Applies to: `finance_controller` | Table: `erp_journal_entries` | Op: INSERT*

#### 2. Procurement Budget Gate
```json
{
  "op": "AND",
  "operands": [
    {
      "op": "<=",
      "left": { "field": "total_order_value" },
      "right": { "agent_attr": "financial_authority_limit" }
    },
    {
      "op": "=",
      "left": {
        "query": "SELECT is_preferred FROM erp_suppliers WHERE supplier_id = $1",
        "params": ["supplier_id"]
      },
      "right": { "literal": true }
    }
  ]
}
```
*Applies to: `procurement_buyer` | Table: `erp_purchase_orders` | Op: INSERT*
*Effect: Procurement agent can only order from preferred suppliers within authority limit*

#### 3. Sales Discount Policy
```json
{
  "op": "OR",
  "operands": [
    {
      "op": "<=",
      "left": { "field": "discount_percent" },
      "right": { "literal": 10 }
    },
    {
      "op": "=",
      "left": { "field": "customer_tier" },
      "right": { "literal": "platinum" }
    }
  ]
}
```
*Applies to: `sales_executive` | Table: `erp_sales_orders` | Op: INSERT*
*Effect: Discounts over 10% only allowed for platinum tier customers*

---

## 9. Orchestration Layer

### Event-Driven Architecture

The entire system is driven by INSERT operations into `erp_task_events`. This table acts as the central nervous system.

```
External Trigger                 erp_task_events INSERT
     │                                    │
     │   Bank feed webhook                │  event_type: BANK_RECONCILIATION
     │   EDI order notification           │  event_type: ORDER_NEGOTIATION
     │   pg_cron (25th @ 08:00)          │  event_type: PAYROLL_RUN
     │   Inventory watcher agent          │  event_type: REORDER_TRIGGERED
     └───────────────────────────────────►│
                                          │
                             pg_net trigger fires async HTTP
                                          │
                                          ▼
                             Supabase Edge Function: Router
                             - Reads event_type → target_agent
                             - Sets status = 'processing'
                             - Invokes agent Edge Function
                                          │
                                          ▼
                             Agent Edge Function
                             - Builds context window
                             - Calls LLM API
                             - Receives tool call response
                             - Executes MCP tool
                             - Sets status = 'completed' or 'failed'
```

### pg_cron Scheduled Jobs

| Schedule | Event | Handler |
|----------|-------|---------|
| `0 8 25 * *` | `PAYROLL_RUN` → HR agent | Monthly payroll on 25th at 08:00 |
| `*/30 * * * *` | `INVENTORY_CHECK` → Sentinel | Every 30 minutes inventory scan |
| `0 9 * * 1` | `BANK_RECONCILIATION` → Finance | Weekly Monday reconciliation |

### Priority Queue

Events are processed in priority order (higher number = higher priority):

| Priority | Event Types |
|----------|------------|
| 10 | `PAYROLL_RUN` (time-sensitive, compliance) |
| 9 | `CREDIT_REVIEW` (risk management) |
| 8 | `BANK_RECONCILIATION` |
| 7 | `INVOICE_CUSTOMER` |
| 5 | `REORDER_TRIGGERED` |
| 3 | `ORDER_NEGOTIATION` |
| 1 | `RFQ_REQUESTED` |

---

## 10. ERP Module — Finance

### Functional Scope

The Finance module (owned by **Meridian**, the Finance Controller agent) covers:

- Chart of accounts maintenance
- Journal entry posting with double-entry validation
- Bank reconciliation
- Customer invoicing (triggered by sales order confirmation)
- Financial reporting (P&L, Balance Sheet queries)

### Key Invariants

1. **Double-entry balance:** Every transaction must have `Σ(debits) = Σ(credits)`, enforced by PostgreSQL AFTER INSERT trigger on `erp_journal_entries`.

2. **Agent attribution:** Every transaction row records `executing_agent_id` — there is no anonymous financial posting.

3. **Authority limit:** Meridian's `financial_authority_limit` (€500,000) gates individual journal entry amounts.

4. **Immutability:** Journal entries are INSERT-only. Corrections require a reversing entry. There is no UPDATE or DELETE on `erp_journal_entries`.

### Standard Journal Entry Flow (Invoice)

```
Customer invoice confirmed
       │
       ▼
Meridian receives INVOICE_CUSTOMER task event
       │
       ▼
LLM selects post_journal_entry tool
       │
       ▼
Tool call:
  DR  1100 Accounts Receivable    €10,000
  CR  4000 Product Revenue                  €10,000
       │
       ▼
Constraint: amount (€10,000) <= authority (€500,000) ✓
Balance: Σ(DR) = Σ(CR) = €10,000 ✓
       │
       ▼
COMMIT → authorization_log entry
```

---

## 11. ERP Module — Supply Chain & Inventory

### Functional Scope

The Supply Chain module spans two agents:

- **Prometheus** (Procurement Buyer) — raises purchase orders, manages supplier relationships, negotiates RFQs
- **Sentinel** (Inventory Watcher) — monitors stock levels, triggers reorder events, validates storage conditions

### Inventory Alert Logic

Sentinel runs every 30 minutes via pg_cron. Its `check_inventory_levels` tool executes:

```sql
SELECT i.*, p.product_name, p.stock_keeping_unit
FROM erp_inventory i
JOIN erp_products p ON p.product_id = i.product_id
WHERE i.current_quantity_available <= i.reorder_point
ORDER BY (i.current_quantity_available::float / NULLIF(i.reorder_point, 0)) ASC;
```

For each result, Sentinel INSERTs a `REORDER_TRIGGERED` task event, which Prometheus picks up to raise a purchase order.

### Alert Severity Levels

| Condition | Status | Color |
|-----------|--------|-------|
| `qty <= calculated_safety_stock` | **CRITICAL** | Red (#ef4444) |
| `qty <= reorder_point` | **REORDER** | Amber (#f59e0b) |
| `qty > reorder_point` | **OK** | Green (#22c55e) |

### Refrigeration Enforcement

```sql
CREATE OR REPLACE FUNCTION check_refrigeration_constraint()
RETURNS TRIGGER AS $$
DECLARE
  v_requires_refrigeration BOOLEAN;
  v_is_climate_controlled  BOOLEAN;
BEGIN
  SELECT requires_refrigeration INTO v_requires_refrigeration
  FROM erp_products WHERE product_id = NEW.product_id;

  SELECT is_climate_controlled INTO v_is_climate_controlled
  FROM erp_warehouses WHERE warehouse_id = NEW.warehouse_id;

  IF v_requires_refrigeration AND NOT v_is_climate_controlled THEN
    RAISE EXCEPTION 'Cannot store refrigerated product in non-climate-controlled warehouse';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This trigger fires BEFORE INSERT OR UPDATE on `erp_inventory`. No agent — regardless of instructions — can bypass it.

---

## 12. ERP Module — Sales & CRM

### Functional Scope

The Sales module is owned by **Apex** (Sales Executive). It covers:

- Order creation and confirmation
- Customer credit assessment
- Tier-based discount application
- Invoice generation (triggers Finance module)

### Customer Tier Pricing

| Tier | Discount Authority | Credit Priority |
|------|--------------------|----------------|
| `platinum` | Up to 25% | Highest |
| `gold` | Up to 15% | High |
| `silver` | Up to 10% | Medium |
| `standard` | Up to 5% | Standard |

### Order → Invoice Cascade

When a sales order transitions to `confirmed` status, a database trigger automatically:

1. Deducts sold quantities from `erp_inventory`
2. Updates `customer.current_balance` by adding the invoice value
3. INSERTs an `INVOICE_CUSTOMER` task event for Meridian

This ensures that inventory and financials are always consistent with the confirmed order state, without requiring the sales agent to orchestrate these downstream effects manually.

### Credit Limit Enforcement

```sql
CREATE OR REPLACE FUNCTION check_credit_limit()
RETURNS TRIGGER AS $$
DECLARE v_balance NUMERIC; v_limit NUMERIC;
BEGIN
  SELECT current_balance, maximum_credit_limit
  INTO v_balance, v_limit
  FROM erp_customers WHERE customer_id = NEW.customer_id;

  IF (v_balance + NEW.total_invoice_value) > v_limit THEN
    RAISE EXCEPTION 'Credit limit exceeded for customer. Balance: %, Limit: %, Order: %',
      v_balance, v_limit, NEW.total_invoice_value;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## 13. ERP Module — Human Resources & Payroll

### Functional Scope

The HR module is owned by **Vega** (HR & Payroll Manager). It covers:

- Employee record management
- Timesheet validation and approval
- Monthly payroll processing (triggered by pg_cron on 25th)
- Department budget monitoring

### Payroll Processing Flow

```
pg_cron fires on 25th @ 08:00
       │
       ▼
INSERT PAYROLL_RUN into erp_task_events
       │
       ▼
Vega agent invoked (run_payroll_manifest tool)
       │
       ▼
Edge Function:
  1. Query all active employees
  2. Fetch approved timesheets for period
  3. Calculate gross pay (salary + overtime premium)
  4. Apply tax deductions per jurisdiction rules
  5. INSERT erp_payroll_manifest (header)
  6. INSERT erp_payroll_line_items (per employee)
  7. Call post_journal_entry:
     DR  5100 Salaries & Wages Expense  €XXX,XXX
     CR  2100 Accrued Liabilities                €XXX,XXX
  8. Trigger external_api: bank transfer initiation
  9. Update manifest status → 'disbursed'
```

### Department Budget Monitoring

The console displays department payroll utilisation:

```
Payroll Spend / Annual Budget × 100 = Budget %
```

Color coding: < 70% = blue, 70-90% = amber, ≥ 90% = red.

---

## 14. Operator Console (Frontend)

### Design Language

The Operator Console is a **Bloomberg Terminal meets Vercel Dashboard** aesthetic — dark-mode-first, information-dense, monospace-numeric, with strict status color semantics.

**Color System:**

| Color | Hex | Meaning |
|-------|-----|---------|
| Background void | `#04080f` | Deepest level |
| Background base | `#070d1a` | Page background |
| Background card | `#0c1526` | Card surfaces |
| Background panel | `#111c2d` | Nested elements |
| Accent blue | `#3b82f6` | Primary active / info |
| Accent green | `#22c55e` | Healthy / OK / active |
| Accent amber | `#f59e0b` | Warning / reorder |
| Accent red | `#ef4444` | Critical / error / failed |
| Accent purple | `#a855f7` | HR / agent-related |
| Text primary | `#e2eaf5` | Main content |
| Text secondary | `#7a9abf` | Supporting text |
| Text muted | `#3d5a7a` | Disabled / labels |

**Typography:**
- `IBM Plex Mono` — All numbers, codes, SKUs, account codes, percentages, financial values
- `Barlow` — UI labels, headers, paragraph text

**Card anatomy:**
```
┌─ top gradient accent line (2px, color-coded) ────────────────┐
│  Card header (label + icon + count badge)                     │
├───────────────────────────────────────────────────────────────┤
│  Content (table / metric / list)                              │
└───────────────────────────────────────────────────────────────┘
```

### Pages

| Route | Title | Revalidate | Key Components |
|-------|-------|-----------|----------------|
| `/` | Command Center | 30s | 4 KPI cards, agent grid, task queue preview |
| `/agents` | Agent Fleet | 30s | Agent registry, skills, tools, constraints |
| `/finance` | General Ledger | 30s | Account classification cards, chart of accounts, transactions |
| `/inventory` | Inventory & Procurement | 30s | Warehouse cards, stock table, suppliers, POs |
| `/sales` | Orders & CRM | 30s | Sales orders table, credit utilisation bars |
| `/hr` | Employee Roster & Payroll | 30s | Employee table, department budgets, timesheets, payroll |
| `/queue` | Task Event Queue | 10s | Status summary, full event log with payload preview |

### Architecture Pattern

All pages are **Next.js App Router server components** — they fetch data directly from Supabase during SSR and return static HTML. No client-side state management, no `useEffect`, no loading spinners. The `revalidate` export controls ISR (Incremental Static Regeneration) frequency.

```tsx
// Pattern used in every page:
export const revalidate = 30  // ISR: rebuild every 30 seconds

async function getData() {
  const { data } = await supabase.from('erp_...').select('...')
  return data ?? []
}

export default async function Page() {
  const data = await getData()
  return <div>...</div>  // Pure server-rendered HTML
}
```

---

## 15. Security Model

### Row Level Security (RLS)

The Operator Console uses the Supabase **anon key** (read-only by intent). In production:

- RLS should be enabled on all `erp_*` tables
- Anon role should have `SELECT` only on `erp_task_events`, `erp_agents`, `erp_inventory`, `erp_sales_orders`, `erp_employees`, `erp_accounts`, `erp_financial_transactions`
- Write operations (INSERT/UPDATE) should be restricted to the `service_role` key used by Edge Functions
- `erp_agent_memory` and `erp_agent_message_history` should be inaccessible to the anon role

### Agent Isolation

- Each agent has its own `agent_id` — all writes to financial and operational tables require this FK
- `erp_authorization_logs` records every tool call attempt regardless of success/failure
- Financial authority limits are stored in the database, not in agent prompts — they cannot be overridden by a compromised prompt

### Immutability Guarantees

- `erp_journal_entries`: INSERT-only (no UPDATE/DELETE policy)
- `erp_authorization_logs`: INSERT-only
- `erp_agent_constraints`: Changes logged and require human operator action

### Constraint Non-Bypassability

PostgreSQL BEFORE triggers execute inside the same transaction as the agent's tool call. Even if an agent constructs malicious SQL, the trigger evaluates independently. The EXCEPTION raised by a constraint trigger causes an automatic ROLLBACK — the bad write never commits.

---

## 16. Key Data Flows

### Flow 1: Inventory Reorder Cycle

```
[pg_cron] Every 30 min
    │
    ▼ INSERT erp_task_events (INVENTORY_CHECK, priority=5)
    │
    ▼ Sentinel agent invoked
    │
    ▼ check_inventory_levels tool → finds MEM-DDR5-032 qty=8, reorder=10
    │
    ▼ INSERT erp_task_events (REORDER_TRIGGERED, payload={sku, deficit})
    │
    ▼ Prometheus agent invoked
    │
    ▼ create_purchase_order tool → PO for TechCore GmbH (preferred supplier)
    │
    ▼ Constraint: €5,760 < Prometheus authority €50,000 ✓
    ▼ Constraint: TechCore is_preferred = true ✓
    │
    ▼ COMMIT: erp_purchase_orders INSERT
    │
    ▼ INSERT erp_task_events (RFQ_REQUESTED, payload={po_id})
    │
    ▼ erp_authorization_logs: was_authorized=true
```

### Flow 2: Sales Order to Invoice

```
[External] Customer order received
    │
    ▼ INSERT erp_task_events (ORDER_NEGOTIATION)
    │
    ▼ Apex (Sales) agent invoked
    │
    ▼ LLM checks customer tier (gold) → max 15% discount
    ▼ LLM applies 10% discount → total_invoice_value = €18,000
    │
    ▼ confirm_sales_order tool call
    │
    ▼ BEFORE trigger: balance (€15k) + €18k = €33k < limit (€50k) ✓
    │
    ▼ COMMIT sales order status='confirmed'
    │
    ▼ AFTER trigger fires:
    │   ├── Deducts inventory quantities
    │   ├── Updates customer.current_balance += €18,000
    │   └── INSERT INVOICE_CUSTOMER task event
    │
    ▼ Meridian (Finance) agent invoked
    │
    ▼ post_journal_entry:
    │   DR 1100 Accounts Receivable  €18,000
    │   CR 4000 Product Revenue               €18,000
    │
    ▼ Balance check: ✓ → COMMIT
    │
    ▼ send_customer_invoice external API → PDF emailed
```

### Flow 3: Monthly Payroll

```
[pg_cron] 25th @ 08:00
    │
    ▼ INSERT erp_task_events (PAYROLL_RUN, priority=10)
    │
    ▼ Vega (HR) agent invoked
    │
    ▼ run_payroll_manifest tool:
    │   - Queries 5 active employees
    │   - Fetches approved timesheets
    │   - Calculates gross: €21,500/month aggregate
    │   - Tax deductions: €4,300
    │   - Net: €17,200
    │
    ▼ INSERT erp_payroll_manifest (header)
    ▼ INSERT erp_payroll_line_items (5 rows)
    │
    ▼ post_journal_entry:
    │   DR 5100 Salaries & Wages  €21,500
    │   CR 2100 Accrued Liabilities        €21,500
    │
    ▼ Authority check: €21,500 < Vega limit €1,000,000 ✓
    ▼ Balance check: ✓ → COMMIT
    │
    ▼ Bank transfer API → disbursements initiated
    ▼ Manifest status → 'disbursed'
```

---

## 17. Design Decisions & Trade-offs

### Decision 1: Database as Source of Truth for Constraints

**Why:** Storing business rules as JSONB ASTs in the database (vs. hard-coding in application code) allows:
- Hot-toggle constraints without redeployment (`is_active` flag)
- Human operators can inspect all active rules in one table
- Constraint violations are enforced regardless of which client or agent interacts with the DB

**Trade-off:** AST evaluation via trigger is slower than compiled application code. Acceptable because write operations are infrequent relative to reads.

---

### Decision 2: Server Components for the Operator Console

**Why:** The Operator Console is purely observational — no user writes data through the UI. Server components with ISR provide:
- Zero JavaScript bundle for data fetching logic
- Consistent server-side rendering with fresh data on each request cycle
- No client-side state management complexity

**Trade-off:** No real-time WebSocket updates. The queue page (`revalidate = 10`) refreshes every 10 seconds — acceptable latency for an operator overview.

---

### Decision 3: pgvector HNSW over IVFFlat

**Why:** HNSW (Hierarchical Navigable Small World) index provides:
- Better recall at similar query speeds for small-to-medium datasets
- No need to call `VACUUM` / rebuild index after updates
- Works without specifying `lists` parameter upfront

**Trade-off:** Higher memory footprint than IVFFlat. Acceptable for agent memory sizes expected in this system (< 1M vectors per agent).

---

### Decision 4: Tailwind CSS v4 with `@theme` blocks

**Why:** The project scaffolded with `create-next-app@latest` which selected Tailwind v4. The v4 syntax (`@import "tailwindcss"` + `@theme {}`) replaces `tailwind.config.ts` with CSS-native configuration.

**Trade-off:** Tailwind v4 ecosystem is newer — some third-party Tailwind plugins may not be compatible. All styling in this project uses direct CSS classes and custom properties, avoiding this limitation.

---

### Decision 5: No Real-Time Agent Control from Console

**Why:** The console is intentionally read-only. Allowing operators to trigger agent actions from the UI would create a parallel control path outside the constraint system, potentially bypassing business rules.

**Agent control is performed by:** Writing directly to `erp_task_events` (via psql, Supabase Studio, or an authenticated admin API), which flows through the full constraint enforcement pipeline.

---

## Appendix: Project File Structure

```
headless-erp/
├── app/
│   ├── layout.tsx           # Root layout (Sidebar + fonts)
│   ├── globals.css          # Tailwind v4 theme + custom classes
│   ├── page.tsx             # Dashboard (Command Center)
│   ├── agents/page.tsx      # Agent Fleet
│   ├── finance/page.tsx     # General Ledger
│   ├── inventory/page.tsx   # Inventory & Procurement
│   ├── sales/page.tsx       # Sales & CRM
│   ├── hr/page.tsx          # HR & Payroll
│   └── queue/page.tsx       # Task Event Queue
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx      # Navigation (client component)
│   │   └── Header.tsx       # Top header
│   └── ui/
│       ├── StatusBadge.tsx  # Status + Priority badges
│       ├── MetricCard.tsx   # KPI cards
│       └── DataTable.tsx    # Reusable table
├── lib/
│   ├── supabase.ts          # Supabase client
│   └── types.ts             # TypeScript types (all ERP tables)
├── public/                  # Static assets
├── next.config.ts           # Next.js configuration
├── package.json
├── tsconfig.json
├── DESIGN.md                # This document
└── README.md
```

---

*This document was generated as part of the Headless ERP project. The system implements the architecture described in "AI Agents Drive Headless ERP" — a research paper exploring autonomous AI-agent-operated enterprise resource planning on PostgreSQL/Supabase.*
