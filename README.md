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
- **PostgreSQL schema** — 14 ERP tables (products, customers, inventory, sales orders, purchase orders, payroll, HR, finance, agent registry, task queue)
- **Database triggers** — credit limit enforcement, inventory deduction on order confirm, double-entry bookkeeping, refrigeration constraint
- **pg_cron** — automated job scheduler running the sales agent every 5 minutes

### Agent Layer
| Agent | Status | Role |
|-------|--------|------|
| `sales_agent` | ✅ Active (automated) | Reviews and confirms draft orders, applies tier discounts |
| `concierge_agent` | ✅ Active (Telegram bot) | Takes orders from external users via Claude Opus |
| `finance_agent` | 🔜 Next | Invoicing and journal entries |
| `procurement_agent` | 🔜 Planned | Purchase orders when stock runs low |
| `inventory_watcher` | 🔜 Planned | Monitors stock levels and triggers reorders |
| `hr_payroll_agent` | 🔜 Planned | Payroll runs and timesheet approval |

### External Interfaces
- **Operator Console** — Next.js app with live dashboards for queue, sales, inventory, finance, HR
- **Customer Portal** — public order submission form with live product catalogue
- **Telegram Bot** (Concierge Agent) — Claude Opus 4.6 powered chatbot for customers to place orders conversationally
- **OpenClaw** — local AI assistant with direct Supabase access for internal operators

### Order Pipeline (live end-to-end)
```
Customer (Telegram or Portal)
    -> inbound-order Edge Function   (creates draft sales order + task event)
    -> sales-agent Edge Function     (confirms order, applies discount, triggers inventory deduction)
    -> finance_agent task event      (queued — awaiting implementation)
```

### Key Design Documents
- [`DESIGN.md`](./DESIGN.md) — full system architecture, schema, and agent design
- [`TELEGRAM_INTEGRATION.md`](./TELEGRAM_INTEGRATION.md) — Telegram bot and OpenClaw integration guide
- [`OPENCLAW_ERP_CONTEXT.md`](./OPENCLAW_ERP_CONTEXT.md) — context file for OpenClaw sessions
- [`NEXT_STEPS.md`](./NEXT_STEPS.md) — implementation roadmap

## 5. Roadmap
- [x] ERP schema (14 tables, triggers, pg_cron)
- [x] Sales agent (automated order review and confirmation)
- [x] Telegram Concierge Bot (Claude Opus 4.6 agentic loop)
- [x] Operator console (Next.js, live dashboards)
- [x] Customer portal (public order form)
- [x] OpenClaw integration context
- [ ] Finance agent (invoicing, journal entries)
- [ ] Procurement agent (auto purchase orders on low stock)
- [ ] Inventory watcher (scheduled stock audits)
- [ ] HR/Payroll agent (payroll runs, timesheet processing)
- [ ] Agent constraint engine (predicate logic rules in JSONB)
- [ ] pgvector semantic memory for agent context

---
*Disclaimer: This project is 'Cooked' for anyone still betting on the billable-hour junior model.*
