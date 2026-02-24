# Headless ERP: Autonomous Multi-Agent OS on PostgreSQL

> "The GUI is a bottleneck for human slowness. This system doesn't have one."

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

[Image of First-Order Logic Predicate Calculus tree for database constraints]

### C. Active Orchestration Engine
Supabase transforms the passive database into an active participant:
*
