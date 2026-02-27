# Headless ERP: Autonomous Multi-Agent OS on PostgreSQL

> "The GUI is a bottleneck for human slowness. This system doesn't have one."

<img width="1360" height="742" alt="image" src="https://github.com/user-attachments/assets/40ba202e-564d-4baf-a34b-e19602e537ce" />

<img width="1918" height="952" alt="image" src="https://github.com/user-attachments/assets/c774b3d1-6436-4b5a-a305-f92f0af8b26d" />


## 1. The Vision
This is not a traditional ERP system. This is an **Autonomous Enterprise Operating System**. Instead of a rigid software monolith where humans manually enter data, this architecture treats the database (PostgreSQL/Supabase) as both the sole 'Source of Truth' and the 'Execution Engine'.

Operations are not carried out by humans behind screens, but by **Domain-Specific AI Agents** that interact directly with the database layer via the **Model Context Protocol (MCP)**.

## 2. Core Architecture (AI-Agent-Driven System Design)
This project implements the principles outlined in the specification: `Headless Enterprise Resource Planning Architecture`.

### A. Tri-Partite Memory System
Agents do not operate in a vacuum. They utilize a layered memory model hosted natively in PostgreSQL:
* **Semantic Memory:** Vector-based storage (`pgvector`) for unstructured knowledge and historical context.
* **Short-Term Context:** Chronological message history for immediate interaction loops.
* **Structured Memory:** The concrete facts, financial ledgers, and state changes that constitute the core ERP schema.

### B. Mathematical Governance via Predicate Calculus
Unlike legacy systems where business logic is scattered across frontend or backend code, this system enforces absolute behavioral boundaries at the database level using **First-Order Predicate Calculus**.
* Business rules are stored as Abstract Syntax Trees (AST) in JSONB format.
* A recursive PL/pgSQL engine evaluates these constraints during every transaction.
* If an AI agent attempts an action that violates these mathematical rules, the database triggers a `RAISE EXCEPTION`, forcing the agent to self-correct.



### C. Active Orchestration Engine
Supabase transforms the passive database into an active participant:
* **pg_cron & pg_net:** Periodic heartbeats and asynchronous execution loops.
* **pgmq:** Durable message queuing for multi-agent task routing.
* **Row-Level Security (RLS):** Cryptographic isolation ensuring agents can only access data within their specific domain.

## 3. Why This Changes Everything
The traditional junior role in consultancy and IT—focused on low-complexity tasks like data entry, basic reporting, and routine analysis—is now economically obsolete.
**This system automates the architecture itself:**
1. **Zero UI:** Eliminates human latency and manual entry errors.
2. **Self-Healing:** Agents debug their own logic against rigid database constraints.
3. **Provable Compliance:** Governance is enforced by mathematical logic, not PDF manuals.

## 4. What Is Actually Built

This is a working system, not a prototype. The following is live on Supabase:

### Infrastructure
- **PostgreSQL schema** — 26 ERP tables across sales, procurement, inventory, finance, HR, and agent domains
- **Database triggers** — credit limit enforcement, inventory deduction on order confirm, double-entry bookkeeping, refrigeration constraint, real-time event dispatch via `net.http_post`
- **pg_cron** — automated job scheduler (sales agent every 5 minutes, payroll on 25th of month)
- **Event-Driven Ingress** — every external signal enters via `erp_task_events` INSERT, which immediately wakes the target agent

### Agent Layer
| Agent | Status | Role |
|-------|--------|------|
| `sales_agent` | ✅ Active (automated) | Reviews and confirms draft orders, applies tier discounts |
| `concierge_agent` | ✅ Active (Telegram bot) | Takes orders from external users via Claude Opus |
| `finance_agent` | ✅ Active (automated) | Posts double-entry journals, advances orders to invoiced |
| `procurement_agent` | 🔜 Planned | Purchase orders when stock runs low |
| `inventory_watcher` | 🔜 Planned | Monitors stock levels and triggers reorders |
| `hr_payroll_agent` | 🔜 Planned | Payroll runs and timesheet approval |

### External Interfaces
- **Operator Console** — Next.js app with live dashboards for queue, sales, inventory, finance, HR
- **Customer Portal** — public order submission form with live product catalogue
- **Telegram Bot** (Concierge Agent) — Claude Opus 4.6 powered chatbot for customers to place orders conversationally
- **OpenClaw** — local AI assistant with direct Supabase access for internal operators

### Order Pipeline (live end-to-end, ~1 second)
```
Customer (Telegram or Portal)
    -> inbound-order Edge Function        (creates draft sales order + task event INSERT)
    -> erp_dispatch_on_task_insert        (DB trigger: net.http_post fires immediately)
    -> sales-agent Edge Function v3       (confirms order, applies tier discount, deducts inventory)
    -> erp_sales_order_confirmed_trigger  (DB trigger: emits INVOICE_CUSTOMER event)
    -> finance-agent Edge Function        (posts DR AR / CR Revenue, advances order to invoiced)
```

### Key Design Documents
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — full system architecture, signal flow, trigger catalogue, open features
- [`TELEGRAM_INTEGRATION.md`](./TELEGRAM_INTEGRATION.md) — Telegram bot and OpenClaw integration guide
- [`OPENCLAW_ERP_CONTEXT.md`](./OPENCLAW_ERP_CONTEXT.md) — context file for OpenClaw sessions
- [`NEXT_STEPS.md`](./NEXT_STEPS.md) — implementation roadmap

## 5. Quick Start

Clone and run the full stack locally in about 10 minutes.

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Supabase CLI | latest | `npm i -g supabase` |
| Deno | 1.40+ | [deno.land](https://deno.land) |
| Anthropic API key | — | [console.anthropic.com](https://console.anthropic.com) |
| Telegram Bot Token | — | Message [@BotFather](https://t.me/BotFather) on Telegram |

---

### Step 1 — Clone

```bash
git clone https://github.com/pesl98/headless_erp.git
cd headless_erp
```

### Step 2 — Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → New project
2. Note your **Project ID**, **API URL**, and **service role key** (Settings → API)

Link the CLI to your project:
```bash
supabase login
supabase link --project-ref YOUR_PROJECT_ID
```

### Step 3 — Apply database migrations

```bash
supabase db push
```

This creates all 26 ERP tables, triggers, pg_cron jobs, and the `post_journal_entry` PL/pgSQL function.

> **Note:** Enable the `pg_cron`, `pg_net`, and `pgmq` extensions in Supabase Dashboard → Database → Extensions before running migrations.

### Step 4 — Set Edge Function secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set TELEGRAM_BOT_TOKEN=your-telegram-token
```

### Step 5 — Deploy Edge Functions

```bash
supabase functions deploy inbound-order
supabase functions deploy sales-agent
supabase functions deploy finance-agent
supabase functions deploy concierge-bot
```

### Step 6 — Register the Telegram webhook

```bash
curl -X POST "https://api.telegram.org/botYOUR_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://YOUR_PROJECT_ID.supabase.co/functions/v1/concierge-bot"}'
```

### Step 7 — Start the operator console

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll see live dashboards for queue, sales, inventory, finance, and HR.

### Step 8 — Smoke test

Send your Telegram bot: `Hello, what products do you have?`

Then verify the pipeline ran:
```sql
SELECT event_type, status FROM erp_task_events ORDER BY created_at DESC LIMIT 5;
```

See [`TELEGRAM_TESTING.md`](./TELEGRAM_TESTING.md) for the full test script with 10 test cases.

---

## 6. Roadmap
- [x] ERP schema (26 tables, all domains)
- [x] Database triggers (credit limit, refrigeration, double-entry, cascade confirm, event dispatch)
- [x] Event-dispatch trigger (`erp_dispatch_on_task_insert` via `net.http_post`)
- [x] pg_cron fallback scheduler
- [x] Sales agent v3 (order confirmation in ~1 second end-to-end)
- [x] Telegram Concierge Bot (Claude Opus 4.6 agentic loop)
- [x] Operator console (Next.js, 7 live dashboards)
- [x] Customer portal (public order form)
- [x] OpenClaw integration context
- [x] Finance agent (invoicing, double-entry journal posting, ~4s end-to-end)
- [ ] Predicate calculus evaluator (replace hardcoded triggers with JSONB AST engine)
- [ ] Procurement agent (auto purchase orders on low stock)
- [ ] Inventory watcher (scheduled stock audits)
- [ ] HR/Payroll agent (payroll runs, timesheet approval)
- [ ] Semantic memory pipeline (pgvector read/write per agent invocation)
- [ ] Row-Level Security (required before production)

---

## License

MIT License

Copyright (c) 2025 pesl98

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---
*Disclaimer: This project is 'Cooked' for anyone still betting on the billable-hour junior model.*
