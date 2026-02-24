# Headless ERP: Autonomous Multi-Agent OS on PostgreSQL

> "The GUI is a bottleneck for human slowness. This system doesn't have one."

<img width="1360" height="742" alt="image" src="https://github.com/user-attachments/assets/40ba202e-564d-4baf-a34b-e19602e537ce" />


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

## 4. Roadmap
- [ ] Implementation of the `agent_constraints` table (Predicate Logic Engine).
- [ ] Setup of `pgvector` for Semantic Memory storage.
- [ ] Integration of the Model Context Protocol (MCP) Tool Registry.
- [ ] Prototype for the first 'Autonomous Buyer Agent'.

---
*Disclaimer: This project is 'Cooked' for anyone still betting on the billable-hour junior model.*
