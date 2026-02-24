# **Headless Enterprise Resource Planning Architecture: Designing an AI-Agent-Driven System on PostgreSQL and Supabase**

## **The Paradigm Shift to Headless, Autonomous Enterprise Systems**

The traditional Enterprise Resource Planning (ERP) system has historically been defined by monolithic architectures, characterized by rigid, human-centric user interfaces, centralized application logic, and extensive manual data entry requirements.1 As global business processes have grown exponentially more complex, the limitations inherent in UI-centric ERPs have become increasingly apparent. These legacy systems are fundamentally bottlenecked by human interaction speeds, highly susceptible to manual data entry errors, and notoriously difficult to integrate seamlessly with emerging autonomous technologies.4 The enterprise software industry has gradually evolved toward "headless" architectures, which decouple the presentation layer from the underlying business logic and data storage, typically relying on an API-first design.4 However, the advent of large language models (LLMs) and autonomous artificial intelligence agents facilitates a much more profound architectural transformation. Instead of merely replacing the graphical user interface with an API intended for custom human-driven frontend applications, the entire enterprise system can be architected to be operated natively and exclusively by domain-specific AI agents.7

Within this advanced architectural paradigm, the enterprise operates entirely without a conventional user interface. AI agents function as the digital workforce, endowed with specific personas, domain expertise, memory systems, and executable tools.8 A "buyer agent," for instance, operates continuously to autonomously monitor inventory thresholds, negotiate with suppliers via email or API endpoints, and issue structurally sound purchase orders without human intervention.9 Concurrently, a "finance agent" perpetually reconciles incoming bank feeds, balances the general ledger, and generates real-time profit and loss statements.10 To ensure deterministic, safe operations within the fundamentally non-deterministic environment characteristic of large language models, the underlying database must assume the governance and orchestration responsibilities traditionally held by the middle-tier application layer.12

Supabase, built on top of the robust PostgreSQL relational database management system, provides the optimal foundation for this sophisticated architecture.14 By strategically combining the transactional integrity and ACID compliance of PostgreSQL, the semantic vector search capabilities of the pgvector extension, the asynchronous network request handling of pg\_net, the robust job scheduling of pg\_cron, and scalable serverless compute via globally distributed Edge Functions, the database itself is elevated into an intelligent orchestration engine.15 Crucially, the AI agents, their available tools, their historical memory, and the mathematical constraints governing their behaviors are entirely defined within the Supabase schema itself.16 This exhaustive research report delineates the comprehensive design of a headless, agent-driven ERP system, detailing the database schema, the integration of first-order predicate calculus for strict behavioral constraint enforcement, and the complex multi-agent orchestration mechanics required for autonomous enterprise management.

## **Supabase as the Autonomous Agent Operating System**

Architecting an ERP system devoid of a user interface requires shifting the locus of control entirely to the backend infrastructure. The database can no longer remain a passive data repository that merely answers queries initiated by external applications; it must become an active participant in the business process.19 Supabase achieves this active posture through a precise combination of native PostgreSQL extensions and integrated serverless compute layers.14 The architecture relies heavily on moving business logic as close to the data as possible, minimizing network latency and maximizing transactional safety.12

The core of this active architecture is the event-driven execution loop. When an external stimulus occurs—such as an incoming email from a vendor, an API webhook from a logistics provider, or a scheduled temporal event—it is recorded directly into the database.20 The Supabase platform utilizes pg\_cron to continuously schedule and evaluate these internal states, effectively acting as the heartbeat of the autonomous enterprise.21 When a state change requires cognitive processing, the database leverages the pg\_net extension to make asynchronous HTTP requests directly to Supabase Edge Functions.17 These Edge Functions act as the cognitive bridge, housing the LLM inference logic and utilizing the database state to construct the necessary prompts and context windows.16

Furthermore, the architecture demands rigorous tenant isolation and agent scoping. PostgreSQL's Row-Level Security (RLS) is employed extensively to restrict what each specific AI agent can "see" and "do".24 A recruitment agent, operating under a specific PostgreSQL role, is mathematically blocked from querying the financial ledgers, ensuring that even if an LLM hallucinates a malicious or out-of-bounds query, the database engine will reject the execution at the lowest possible level.24 This "defense in depth" strategy is paramount when deploying autonomous systems that possess the authority to execute binding financial and operational actions.16 The entire infrastructure is defined via Data Definition Language (DDL) scripts, allowing the enterprise to be version-controlled, audited, and deployed deterministically.26

## **Defining the Digital Workforce: The Agent Subsystem**

To operate an enterprise without human intervention, the database must encapsulate the definition of the digital workers themselves. The agent subsystem manages the identity, capabilities, parameters, and historical context of the AI agents running the business operations. By utilizing a highly structured schema, the system ensures that agents interact with database functions and external APIs through standardized, dynamically loadable configurations, preventing the hardcoding of logic within the Edge Functions.28

### **Agent Identity and Cognitive Configuration**

The foundational tables establish the existence, designated role, and current operational state of the agents. Every action taken within the ERP is permanently linked to an agent's unique identifier, creating an immutable audit trail of autonomous decisions.30

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| agent\_id | UUID | PRIMARY KEY, DEFAULT gen\_random\_uuid() | The cryptographic unique identifier for the AI agent entity. |
| role\_name | VARCHAR(100) | NOT NULL, UNIQUE | Domain-specific operational role (e.g., procurement\_specialist, payroll\_manager, accounts\_receivable\_clerk). |
| system\_prompt | TEXT | NOT NULL | The core, foundational instructions governing the agent's persona, constraints, and baseline operational behavior.23 |
| operational\_status | VARCHAR(50) | CHECK (operational\_status IN ('active', 'sleeping', 'suspended', 'terminated')) | The current operational state dictating whether the agent is allowed to process the queue. |
| financial\_authority\_limit | DECIMAL(15,2) | DEFAULT 0.00 | The absolute financial boundary for the agent's autonomous purchasing or discounting authority. |
| database\_role | VARCHAR(100) | NOT NULL | The specific PostgreSQL role assigned to the agent for Row-Level Security enforcement.16 |
| created\_at | TIMESTAMPTZ | DEFAULT NOW() | The precise timestamp of the agent's instantiation within the system. |

The system\_prompt serves as the foundational cognitive framework, dynamically injected into the LLM context window during instantiation.23 This prompt instructs the agent on its core objectives, tone, and the methodologies it must employ to solve domain-specific problems. However, text-based prompts alone are fundamentally insufficient for enterprise-grade reliability due to the stochastic nature of language models.24 Therefore, the architecture relies heavily on strict database-level definitions for skills, tools, and constraints.

### **The Distinction Between Skills and Tools**

In an advanced autonomous architecture, it is critical to distinguish between an agent's "skills" and its "tools".32 Tools represent execution—they are the interfaces through which the agent manipulates the environment or retrieves structured data.32 Skills represent expertise—they are packaged domain knowledge, behavioral patterns, and contextual instructions that shape how the agent approaches a problem before it even decides to use a tool.32

The skills schema stores this expertise as retrieveable modules that can be dynamically loaded into the agent's context window depending on the task at hand. This prevents context window bloat while ensuring the agent possesses the necessary domain knowledge.32

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| skill\_id | UUID | PRIMARY KEY | Unique identifier for the packaged expertise module. |
| agent\_id | UUID | REFERENCES agents(agent\_id) | The specific agent that possesses this skill. |
| skill\_name | VARCHAR(100) | NOT NULL | The title of the expertise (e.g., vendor\_negotiation\_tactics, gaap\_revenue\_recognition). |
| domain\_knowledge | TEXT | NOT NULL | The actual text or ruleset imparting the knowledge to the LLM. |
| activation\_condition | JSONB | NOT NULL | The specific environmental or task conditions under which this skill is loaded into the active context. |

When a task is routed to an agent, the orchestration layer queries the skills table to determine which domain knowledge modules are required, appending them to the system prompt dynamically.32 This ensures the "buyer agent" knows exactly how to leverage bulk-discount tiering logic before it attempts to generate a purchase order tool call.

### **The Model Context Protocol (MCP) Tool Registry**

Agents require explicit, strictly typed tools to interact with the database and external systems. Instead of hardcoding API calls or SQL queries into the agent's execution logic, the architecture implements a highly centralized, dynamic Tool Registry based on the open standard Model Context Protocol (MCP).29 MCP standardizes how tools are exposed to Large Language Models, utilizing strict JSON schemas to define inputs, outputs, and descriptions.35

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| tool\_id | UUID | PRIMARY KEY | Unique identifier for the actionable tool. |
| tool\_name | VARCHAR(100) | NOT NULL, UNIQUE | The function name exposed to the LLM (e.g., create\_purchase\_order, get\_inventory\_levels). |
| semantic\_description | TEXT | NOT NULL | The natural language description used by the LLM to understand when and why to utilize the tool.29 |
| input\_schema | JSONB | NOT NULL | An OpenAPI-compliant JSON Schema defining the exact parameters, types, and required fields.35 |
| execution\_handler | VARCHAR(50) | CHECK (execution\_handler IN ('plpgsql\_function', 'edge\_function', 'external\_api')) | Determines the internal routing mechanism for the tool execution. |
| target\_endpoint | TEXT | NOT NULL | The specific PostgreSQL function name, Edge Function URL, or external API route.17 |

When an agent needs to act, the orchestration layer queries this table to build the tool payload sent to the LLM via the MCP specification. The LLM evaluates its goals, selects the appropriate tool, and returns a structured JSON object strictly conforming to the input\_schema.35 The orchestration layer receives this JSON, validates it against the schema, and executes the designated target\_endpoint.28 By enforcing strict schema adherence at the registry level, the system guarantees that the LLM cannot hallucinate malformed database queries or invoke non-existent operational paths.39

### **Cognitive Architecture: Tri-Partite Memory Systems**

An autonomous enterprise agent without memory is fundamentally incapable of executing long-running, stateful business processes.40 If a buyer agent negotiates a long-term contract with a supplier on Tuesday, it must possess the ability to recall those exact terms when issuing a purchase order against that contract on Thursday.40 The architecture employs a robust tri-partite memory system natively within PostgreSQL to solve the LLM statelessness problem.16

The first memory tier is the **Short-Term Context (Message History)**. This is stored as chronological JSON arrays representing the immediate conversational or operational interaction loop.16 It provides the agent with immediate context regarding its current task execution, allowing it to remember the previous step in a multi-step workflow.

The second tier is the **Semantic Memory (Vector Store)**. Utilizing the pgvector extension, unstructured data—such as parsed emails, negotiation transcripts, external market analysis reports, and conversational summaries—are embedded into high-dimensional space and stored as vectors.15

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| memory\_id | UUID | PRIMARY KEY | The unique identifier for the semantic memory fragment. |
| agent\_id | UUID | REFERENCES agents(agent\_id) | The specific agent that formed or owns this episodic memory. |
| raw\_content | TEXT | NOT NULL | The original raw text of the observation, communication, or internal thought process. |
| embedding\_vector | VECTOR(1536) | NOT NULL | The high-dimensional vector representation (e.g., utilizing OpenAI's text-embedding-3-small model).43 |
| contextual\_metadata | JSONB | DEFAULT '{}'::jsonb | Structured tags (e.g., supplier IDs, timestamps, sentiment scores) utilized for advanced hybrid filtering.15 |

An HNSW (Hierarchical Navigable Small World) index is applied directly to the embedding\_vector column to ensure sub-millisecond retrieval speeds, even as the enterprise accumulates millions of autonomous interactions over years of operation.44 This allows agents to perform fuzzy conceptual retrieval; an agent can query its memory for "previous disputes regarding shipping delays with Supplier X" and retrieve the exact historical context needed to inform its current negotiation strategy.

The third and most authoritative tier is the **Structured Memory**. This consists of the concrete facts, state changes, and financial ledgers that constitute the core ERP schema.16 When semantic memory conflicts with structured memory (e.g., the agent "remembers" a balance of $500, but the ledger shows $450), the system architecture mathematically prioritizes the structured database state, eliminating hallucinations.

## **Mathematical Governance: The Predicate Calculus Constraint Engine**

The defining innovation of this headless ERP is the rigorous use of first-order predicate calculus to define, encode, and enforce absolute behavioral boundaries on the AI agents. While LLMs exhibit remarkable reasoning capabilities, they are inherently probabilistic and prone to logical drift.7 Implementing critical enterprise business logic solely via natural language prompting is a severe security and operational vulnerability.24 Instead, constraints must be evaluated deterministically at the underlying data layer.19

### **Formalizing Business Rules as First-Order Logic**

In the mathematical framework of first-order logic, an alphabet consists of variables, constants, predicate symbols, and function symbols, systematically combined using logical connectives (such as AND ![][image1], OR ![][image2], NOT ![][image3], IMPLIES ![][image4]) and quantifiers (FORALL ![][image5], EXISTS ![][image6]).48 In the direct context of the PostgreSQL database environment:

* **Constants** are literal values defined within the ruleset (e.g., numeric values like 10000.00, or string literals like 'approved').49  
* **Variables** map dynamically to the state of the database or the proposed mutation during a transaction (e.g., the NEW record in a trigger, or the specific budget\_limit of the executing agent).  
* **Predicates** are boolean functions or relational operators assessing truth values (e.g., ![][image7]).49

Consider a standard enterprise governance constraint: "A buyer agent cannot finalize a purchase order whose total amount exceeds their assigned budgetary limit unless a finance agent has explicitly recorded an authorization." Expressed in predicate calculus, this rule dictates:

![][image8]  
To evaluate these complex, inter-table constraints dynamically without resorting to hardcoding hundreds of static triggers, the system stores the logical formulas as Abstract Syntax Trees (AST) within a native JSONB column.50 The hierarchical structure of JSONB maps perfectly to the deeply nested nature of logical trees.51

### **Storing Predicate Abstract Syntax Trees in JSONB**

The agent\_constraints table acts as the centralized repository for all mathematical rules governing the enterprise.

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| constraint\_id | UUID | PRIMARY KEY | The unique identifier for the logic rule. |
| target\_agent\_role | VARCHAR(100) | REFERENCES agents(role\_name) | The specific operational role this constraint applies to. |
| target\_table | VARCHAR(100) | NOT NULL | The specific ERP table being protected by the rule (e.g., purchase\_orders). |
| triggering\_operation | VARCHAR(10) | CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')) | The specific database manipulation action that triggers evaluation. |
| logic\_ast | JSONB | NOT NULL | The complete predicate calculus formula encoded as a deeply nested JSONB tree.50 |
| violation\_message | TEXT | NOT NULL | The semantic error message returned to the LLM upon constraint violation. |

A JSON representation of the aforementioned budget authorization constraint utilizes a standardized, deterministic schema structure, akin to JSON-Logic implementations 50:

JSON

{  
  "implies": },  
    { "exists": {  
        "query": "SELECT 1 FROM authorization\_logs WHERE target\_record\_id \= $1 AND authorizing\_role \= 'finance'",  
        "params":  
      }  
    }  
  \]  
}

### **The PL/pgSQL Constraint Evaluation Engine**

When an AI agent attempts to manipulate the ERP data via its MCP tools, an overarching BEFORE INSERT OR UPDATE trigger intercepts the transaction at the lowest database level.54 This trigger invokes a highly optimized, Turing-complete PL/pgSQL function explicitly designed to interpret and evaluate the JSONB Abstract Syntax Tree against the current, highly specific database state.56

This evaluation function operates as a recursive logical interpreter natively within PostgreSQL.58 It recursively traverses the JSONB tree, unpacking the logical operators (AND, OR, NOT, IMPLIES). For attribute variables, it utilizes PostgreSQL's native JSON path query capabilities (jsonb\_path\_query and jsonb\_extract\_path) to extract the proposed values from the NEW record structure.60 For existential (![][image6]) or universal (![][image5]) quantifiers that require checking other tables, the PL/pgSQL interpreter uses dynamic SQL (EXECUTE) safely parameterized with the extracted variables to determine truth values.52

If the base condition ![][image9] (where ![][image10] represents the total database state and ![][image11] represents the specific variable assignment extracted from the proposed NEW record) evaluates to false, the database engine explicitly rejects the transaction. It initiates a RAISE EXCEPTION command, halting the commit process and surfacing the semantic violation\_message.49

This error is elegantly caught by the Supabase Edge Function managing the agent's execution loop and is fed directly back into the agent's LLM context window. The agent, possessing advanced error-correction prompts and logical reasoning capabilities, recognizes its constraint violation, processes the violation\_message, and autonomously revises its operational approach to comply with the mathematical boundaries.31 This mechanism is profoundly powerful: it translates abstract enterprise governance policies into cryptographically secure, mathematically rigorous database constraints that even a hallucinating or highly capable autonomous AI is physically incapable of bypassing.19

## **Comprehensive ERP Database Schema Definition**

With the agent orchestration mechanisms and logical governance engines firmly established, the core ERP data structures must be defined. Because this is a strictly headless system driven entirely by highly rational, algorithmic agents, the schema relies heavily on absolute normalization, robust foreign keys, exhaustive indexing, and complex constraints. There are no human-facing user interface layers available to "patch" bad data, interpret ambiguous fields, or bypass bad design; the schema *is* the entire application.24 The following sections detail the core operational modules required to run the enterprise.

### **1\. General Ledger and Financial Accounting**

Financial integrity requires an absolutely rigorous double-entry accounting structure. Instead of relying on a naive polymorphic ledger design—which severely breaks referential integrity and is prone to orphaned records—the system implements a strictly normalized, mathematically sound schema.66

#### **Chart of Accounts and Transaction Headers**

The Chart of Accounts defines the financial categorization, ensuring the Finance Agent correctly routes all economic value according to standard accounting principles.10

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| account\_id | UUID | PRIMARY KEY | The unique cryptographic identifier for the account.68 |
| account\_code | VARCHAR(20) | UNIQUE, NOT NULL | Standardized Chart of Accounts numbering (e.g., 11000 for Cash, 21000 for Accounts Payable).11 |
| account\_classification | VARCHAR(50) | NOT NULL | Top-level financial classification: Asset, Liability, Equity, Revenue, Expense.10 |
| currency\_code | CHAR(3) | NOT NULL DEFAULT 'USD' | The strict ISO 4217 currency designation.69 |
| is\_active | BOOLEAN | DEFAULT TRUE | Indicates if the Finance Agent can post new entries to this account. |

Financial events are grouped under a single transaction header, which ensures that multiple journal lines belong to the same logical event.68

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| transaction\_id | UUID | PRIMARY KEY | The header identifier for a specific double-entry event.68 |
| executing\_agent\_id | UUID | REFERENCES agents(agent\_id) | The specific AI agent responsible for initiating the financial transaction. |
| posted\_timestamp | TIMESTAMPTZ | DEFAULT NOW() | The exact, unalterable timestamp of the financial event.68 |
| semantic\_description | TEXT | NOT NULL | The natural language description generated by the agent detailing the economic reality of the event.68 |
| source\_document\_reference | UUID | NULL | A polymorphic-like reference pointer to an Invoice, Purchase Order, or Payroll manifest. |

#### **Journal Entries (The Mathematical Ledger)**

The journal\_entries table stores the individual credit and debit line items. A critical PostgreSQL trigger evaluates every insertion into this table to enforce the fundamental accounting equation: ![][image12] for any given transaction\_id.68 If an agent attempts to submit unbalanced journal entries, the trigger aborts the entire transaction block.

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| entry\_id | UUID | PRIMARY KEY | The unique identifier for the specific line item. |
| transaction\_id | UUID | REFERENCES financial\_transactions(transaction\_id) | The strict foreign key link to the parent transaction header.68 |
| account\_id | UUID | REFERENCES accounts(account\_id) | The specific financial account being modified by the entry.68 |
| absolute\_amount | DECIMAL(15,2) | NOT NULL, CHECK (absolute\_amount \>= 0\) | The absolute financial value of the entry.68 |
| is\_credit\_entry | BOOLEAN | NOT NULL | True indicates a Credit calculation, False indicates a Debit calculation.68 |

By enforcing double-entry balancing via a core database trigger rather than an application-level check, the headless ERP guarantees that a rogue, compromised, or hallucinating finance agent cannot inadvertently create unbalanced, mathematically invalid financial states within the enterprise.19

### **2\. Supply Chain, Inventory, and Procurement Management**

The procurement module interacts continuously and intimately with the inventory module. An autonomous "Buyer Agent" utilizes advanced forecasting models, constantly evaluates stock levels against demand signals, and autonomously generates binding purchase orders.9

#### **Product Catalog and Physical Warehousing**

The schema must meticulously define the physical reality of the products and where they are stored.

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| product\_id | UUID | PRIMARY KEY | The internal, unique identifier for the product.9 |
| stock\_keeping\_unit | VARCHAR(100) | UNIQUE, NOT NULL | The standardized SKU for the item.9 |
| product\_name | VARCHAR(255) | NOT NULL | The semantic name of the product.9 |
| standard\_unit\_cost | DECIMAL(10,2) | NOT NULL | The moving average or standard cost used for inventory valuation. |
| requires\_refrigeration | BOOLEAN | DEFAULT FALSE | A critical environmental constraint flag.9 |

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| warehouse\_id | UUID | PRIMARY KEY | The unique identifier for the physical storage facility.9 |
| facility\_name | VARCHAR(100) | NOT NULL | The semantic name of the warehouse location.9 |
| is\_climate\_controlled | BOOLEAN | NOT NULL | Indicates if the warehouse can legally store refrigerated products.9 |
| maximum\_capacity\_volume | DECIMAL(15,2) | NOT NULL | The total physical volume available for storage. |

The integration of boolean environmental flags (such as requires\_refrigeration and is\_climate\_controlled) serves as a direct input for the Predicate Calculus engine.9 A logic rule can dictate: ![][image13]. If an AI logistics agent attempts to route a shipment of frozen pharmaceuticals to a dry warehouse, the database instantly and deterministically rejects the query.55

#### **Inventory State, Thresholds, and Autonomous Reordering**

Instead of merely storing the current stock count, the system maintains strict threshold data. A recurring pg\_cron job acts as an independent "Watcher Agent," perpetually evaluating these thresholds across all locations.21 When current\_quantity\_available falls below the defined reorder\_point, an event is placed onto an internal pgmq queue instructing the Buyer Agent to commence procurement operations.9

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| inventory\_record\_id | UUID | PRIMARY KEY | The surrogate key for the specific stock line.9 |
| product\_id | UUID | REFERENCES products(product\_id) | The specific item held in stock.9 |
| warehouse\_id | UUID | REFERENCES warehouses(warehouse\_id) | The exact location of the stock.9 |
| current\_quantity\_available | INTEGER | DEFAULT 0 | The real-time, currently available on-hand units.9 |
| reorder\_point | INTEGER | NOT NULL | The calculated threshold that triggers automatic procurement activities.9 |
| calculated\_safety\_stock | INTEGER | NOT NULL | The buffer inventory level required to prevent critical stockouts during supply chain delays. |

#### **Supplier Relations and Purchase Orders**

When the Buyer Agent receives a procurement stimulus, it queries the suppliers table, negotiates terms via external email APIs using its semantic memory of past dealings, and generates a formal Purchase Order.9

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| purchase\_order\_id | UUID | PRIMARY KEY | The unique header identifier for the order.9 |
| supplier\_id | UUID | REFERENCES suppliers(supplier\_id) | The external vendor supplying the goods.9 |
| executing\_agent\_id | UUID | REFERENCES agents(agent\_id) | The specific AI agent that negotiated and issued the PO. |
| order\_status | VARCHAR(50) | DEFAULT 'pending' | Tracks the fulfillment state (e.g., pending, approved, received, closed).9 |
| total\_order\_value | DECIMAL(15,2) | NOT NULL | The aggregate financial value of the entire order block. |

### **3\. Sales, CRM, and Order Fulfillment**

The Sales and CRM module is operated by hyper-efficient "Sales Agents." These agents ingest structured and unstructured payloads from external customer portals or direct email communications, negotiate pricing dynamically within their strictly defined financial\_authority\_limit, and create finalized, binding sales orders.8

#### **Customer Profiles and Sales Order Headers**

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| customer\_id | UUID | PRIMARY KEY | The unique identifier for the purchasing entity.9 |
| customer\_name | VARCHAR(255) | NOT NULL | The legal name of the entity. |
| maximum\_credit\_limit | DECIMAL(15,2) | NOT NULL | The maximum allowable financial exposure the company accepts for this customer.55 |
| account\_status | VARCHAR(20) | DEFAULT 'active' | Operational status determining if the Sales Agent is allowed to process orders. |

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| sales\_order\_id | UUID | PRIMARY KEY | The primary sales order header.9 |
| customer\_id | UUID | REFERENCES customers(customer\_id) | The specific entity purchasing the goods.9 |
| closing\_agent\_id | UUID | REFERENCES agents(agent\_id) | The AI agent responsible for closing the sale. |
| total\_invoice\_value | DECIMAL(15,2) | NOT NULL | The sum of all ordered line items. |
| order\_creation\_date | TIMESTAMPTZ | DEFAULT NOW() | The exact timestamp of order finalization. |

When a Sales Order is successfully finalized and its status is updated to "confirmed," a PostgreSQL trigger fires automatically.30 This autonomous trigger executes two immediate, cascading side-effects without requiring any agent intervention:

1. It decrements the anticipated current\_quantity\_available in the core inventory table, reserving the stock for fulfillment.9  
2. It inserts a strictly formatted asynchronous job into the pgmq queue, explicitly instructing the Finance Agent to issue an invoice to the customer and update the General Ledger Accounts Receivable appropriately.11 This demonstrates the profound efficiency of database-level event orchestration driving multi-agent workflows.

### **4\. Human Resources and Autonomous Payroll**

Even within a highly automated, agent-run business structure, human employees will inevitably exist for physical tasks (such as warehouse picking, specialized physical maintenance) or high-level executive oversight.74 The AI "HR Agent" manages the exhaustive complexities of payroll computation, timesheet validations, and departmental organizational structures.73

#### **Employee Rosters and Departmental Hierarchies**

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| employee\_id | UUID | PRIMARY KEY | The unique identifier for the human worker.75 |
| department\_id | UUID | REFERENCES departments(department\_id) | The structural business grouping.74 |
| reporting\_manager\_id | UUID | REFERENCES employees(employee\_id) | A self-referencing hierarchy defining the chain of command.75 |
| annual\_base\_salary | DECIMAL(15,2) | NOT NULL | The negotiated annual or hourly compensation rate.74 |
| official\_hire\_date | DATE | NOT NULL | The date the human worker officially commenced employment.75 |

#### **Timesheet Logging and Automated Payroll Generation**

Human workers interface with the system via simplistic API endpoints to log their hours. The database simply records these facts.

| Column Name | Data Type | Constraints | Description |
| :---- | :---- | :---- | :---- |
| timesheet\_record\_id | UUID | PRIMARY KEY | The unique record identifier.75 |
| employee\_id | UUID | REFERENCES employees(employee\_id) | The specific human worker logging the hours.75 |
| hours\_worked\_duration | DECIMAL(5,2) | CHECK (hours\_worked\_duration \<= 24\) | A physical reality constraint preventing logically impossible time logs. |
| date\_of\_labor | DATE | NOT NULL | The specific calendar date the work was performed. |

A precisely scheduled pg\_cron routine wakes the designated Payroll Agent on the 25th day of every month.21 Upon awakening, the agent runs a complex SQL aggregation query across the timesheets table, autonomously calculates complex tax withholdings based on its internal skill parameters, and writes a finalized payroll manifest.77 Upon successful completion of this manifest, the Payroll Agent utilizes an MCP tool to communicate directly with the Finance Agent, ensuring the General Ledger is updated with the exact wage expenses, tax liabilities, and cash disbursement accruals.10

## **Orchestration: The Autonomous Execution Loop**

A headless ERP utilizing artificial intelligence requires an active, perpetually running execution environment. Relational databases have traditionally been passive constructs—they sit idle, waiting for external applications to issue queries.19 Supabase fundamentally transforms PostgreSQL into an active, self-sustaining orchestration engine through the precise combination of pg\_cron, pgmq, and global Edge Functions.16

### **The Three-Layer Asynchronous Pattern**

The orchestration of the AI agents follows a rigorous three-layer asynchronous pattern natively hosted within the database infrastructure, ensuring maximum reliability and state persistence 20:

1. **Collection (Stimulus Ingestion):** The system continuously receives external stimuli. Webhooks from external financial institutions, parsed emails routed through Supabase Edge Functions, or internal time-based triggers fired by pg\_cron detect that a business action is required.17 These stimuli are rapidly inserted into a durable message queue table utilizing the pgmq extension.17  
2. **Distribution (Task Routing):** A sophisticated database trigger or an active queue listener analyzes the nature of the pending task. If it involves an inventory shortage, the routing layer places the task into the dedicated Procurement Queue. If it represents an invoice dispute, it is routed immediately to the Finance Queue.20  
3. **Processing (Agent Cognitive Execution):** Supabase pg\_net makes a secure, asynchronous HTTP request to a globally distributed Edge Function.17 The Edge Function pulls the task from the queue, identifies the specifically assigned agent (e.g., agent\_id \= 'buyer-01'), retrieves that agent's core system prompt, dynamically loads its required skills, pulls relevant historical context from its semantic memory via pgvector, and constructs a comprehensive prompt payload for the underlying LLM.15

### **Tool Execution, State Mutation, and Self-Healing**

When the LLM formulates a strategic plan to resolve the task, it outputs a tool call strictly conforming to the JSON Schema registered in the MCP tool table.35 The executing Edge Function receives this structured JSON payload, authenticates the cryptographic request, and executes the corresponding SQL function directly via the Supabase REST API (PostgREST).79

Because the execution occurs directly through the database API, it is unconditionally subjected to the Predicate Calculus engine. The BEFORE trigger parses the JSONB constraints.52 If an agent makes a logical error and attempts to over-order stock—violating the mathematical constraint ![][image14]—the database aborts the transaction immediately. The Edge Function catches this explicit SQL error and feeds it seamlessly back into the LLM's context window.72 The LLM, maintaining conversational state memory, observes the database error, analyzes its constraint violation, adjusts its mathematical calculation, and submits a corrected tool call. This closed-loop feedback mechanism creates a self-healing, highly resilient, and mathematically sound automated enterprise.31

## **Security, Governance, and Absolute Tenant Isolation**

In an architectural paradigm where autonomous AI agents operate directly on the core database without human oversight, security models must fundamentally evolve from traditional perimeter defense to internal, granular, cryptographic access control.24 The system employs PostgreSQL's most advanced security primitives to ensure that a compromised, hallucinating, or maliciously prompted agent cannot view, alter, or destroy unauthorized data.

### **Row-Level Security (RLS) as Agent Containment**

PostgreSQL's Row-Level Security (RLS) allows for the definition of absolute policies that act as an invisible, mandatory WHERE clause appended to every single query executed by a specific role.24

Each AI agent operates under a highly specific, restricted database role.16 For example, the HR Agent operates strictly under the hr\_agent\_role. A rigorous RLS policy placed on the employees table ensures that only the designated HR Agent possesses the mathematical capability to modify base salaries:

SQL

CREATE POLICY "HR Agent Exclusive Update Salaries"  
ON employees  
FOR UPDATE  
TO hr\_agent\_role  
USING (true)  
WITH CHECK (true);

Conversely, the Sales Agent operates under the sales\_agent\_role and is entirely, cryptographically blocked from reading or writing to the employees table. This prevents any possibility of cross-domain data leakage or unauthorized manipulation.24

### **Scoped Schemas and Privilege Escalation Management**

To further restrict the potential blast radius of an autonomous agent operating at high velocity, the database itself is partitioned into distinct, isolated schemas (e.g., finance\_schema, inventory\_schema, hr\_schema, agent\_memory\_schema).16 Agents are granted USAGE permissions strictly on the schemas pertinent to their specific operational domain.16

The actual execution of complex MCP tools is handled by highly privileged SECURITY DEFINER functions.84 These specialized functions temporarily elevate privileges to perform complex, multi-table mutations (such as finalizing a sale and deducting inventory simultaneously). Crucially, however, they are tightly constrained by hardcoded parameter validations and the overarching JSONB Predicate Calculus rules engine.84 This meticulous design ensures that the agent's direct SQL access is severely limited to a narrow, thoroughly validated API surface area, utterly mitigating the risk of arbitrary code execution, SQL injection, or destructive DDL commands.16

By intertwining semantic AI reasoning with strict, mathematical relational database governance, the architecture establishes a fundamentally secure environment where autonomous agents can run an entire enterprise at machine speed, completely constrained by infallible rules of logic.

#### **Works cited**

1. Axelor: Open Source Low Code platform for all your business apps, accessed on February 23, 2026, [https://axelor.com/](https://axelor.com/)  
2. Odoo: Open Source ERP and CRM, accessed on February 23, 2026, [https://www.odoo.com/](https://www.odoo.com/)  
3. Chapter 1: Architecture Overview — Odoo 19.0 documentation, accessed on February 23, 2026, [https://www.odoo.com/documentation/19.0/developer/tutorials/server\_framework\_101/01\_architecture.html](https://www.odoo.com/documentation/19.0/developer/tutorials/server_framework_101/01_architecture.html)  
4. Headless ERP for modernisation \- Infor, accessed on February 23, 2026, [https://www.infor.com/en-gb/blog/headless-erp-digital-modernization](https://www.infor.com/en-gb/blog/headless-erp-digital-modernization)  
5. Choosing a Headless Ecommerce Architecture on Top of Business Central: When It Makes Sense (and When It Doesn't), accessed on February 23, 2026, [https://erpsoftwareblog.com/2026/02/choosing-a-headless-ecommerce-architecture-on-top-of-business-central/](https://erpsoftwareblog.com/2026/02/choosing-a-headless-ecommerce-architecture-on-top-of-business-central/)  
6. Patterns for Headless Product Architecture | by Gokhan Mansuroglu | Garanti BBVA Teknoloji | Medium, accessed on February 23, 2026, [https://medium.com/garantibbva-teknoloji/patterns-for-headless-product-architecture-5b90817cf697](https://medium.com/garantibbva-teknoloji/patterns-for-headless-product-architecture-5b90817cf697)  
7. AI Agents: Evolution, Architecture, and Real-World Applications \- arXiv, accessed on February 23, 2026, [https://arxiv.org/html/2503.12687v1](https://arxiv.org/html/2503.12687v1)  
8. How to Build a Finance AI Agent \- Step-by-Step Process \- Aalpha, accessed on February 23, 2026, [https://www.aalpha.net/blog/how-to-build-a-finance-ai-agent/](https://www.aalpha.net/blog/how-to-build-a-finance-ai-agent/)  
9. Creating a Database Model for an Inventory Management System, accessed on February 23, 2026, [https://www.red-gate.com/blog/data-model-for-inventory-management-system/](https://www.red-gate.com/blog/data-model-for-inventory-management-system/)  
10. Chart of accounts — Odoo 19.0 documentation, accessed on February 23, 2026, [https://www.odoo.com/documentation/19.0/applications/finance/accounting/get\_started/chart\_of\_accounts.html](https://www.odoo.com/documentation/19.0/applications/finance/accounting/get_started/chart_of_accounts.html)  
11. Accounting cheat sheet — Odoo 19.0 documentation, accessed on February 23, 2026, [https://www.odoo.com/documentation/19.0/applications/finance/accounting/get\_started/cheat\_sheet.html](https://www.odoo.com/documentation/19.0/applications/finance/accounting/get_started/cheat_sheet.html)  
12. Why I Rely on PostgreSQL Functions for Everything: Pros, Cons, and Best Practice — Article Review | by Vedran Bilopavlović | Medium, accessed on February 23, 2026, [https://medium.com/@vbilopav/why-i-rely-on-postgresql-functions-for-everything-pros-cons-and-best-practice-article-review-987eba321234](https://medium.com/@vbilopav/why-i-rely-on-postgresql-functions-for-everything-pros-cons-and-best-practice-article-review-987eba321234)  
13. Putting database logic in the application instead of trigger, stored procedures, constraints etc, accessed on February 23, 2026, [https://stackoverflow.com/questions/3378686/putting-database-logic-in-the-application-instead-of-trigger-stored-procedures](https://stackoverflow.com/questions/3378686/putting-database-logic-in-the-application-instead-of-trigger-stored-procedures)  
14. Architecture | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/getting-started/architecture](https://supabase.com/docs/guides/getting-started/architecture)  
15. AI & Vectors | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/ai](https://supabase.com/docs/guides/ai)  
16. Build a Personalized AI Assistant with Postgres \- Supabase, accessed on February 23, 2026, [https://supabase.com/blog/natural-db](https://supabase.com/blog/natural-db)  
17. Automatic embeddings | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/ai/automatic-embeddings](https://supabase.com/docs/guides/ai/automatic-embeddings)  
18. Edge Functions Architecture | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/functions/architecture](https://supabase.com/docs/guides/functions/architecture)  
19. Database constraints in Postgres: The last line of defense \- Citus Data, accessed on February 23, 2026, [https://www.citusdata.com/blog/2018/03/19/postgres-database-constraints/](https://www.citusdata.com/blog/2018/03/19/postgres-database-constraints/)  
20. Processing large jobs with Edge Functions, Cron, and Queues \- Supabase, accessed on February 23, 2026, [https://supabase.com/blog/processing-large-jobs-with-edge-functions](https://supabase.com/blog/processing-large-jobs-with-edge-functions)  
21. Supabase Cron, accessed on February 23, 2026, [https://supabase.com/blog/supabase-cron](https://supabase.com/blog/supabase-cron)  
22. Scheduling Edge Functions | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/functions/schedule-functions](https://supabase.com/docs/guides/functions/schedule-functions)  
23. Supabase Development with AI Agents: A Comprehensive Guide to Automating Your Workflow | by Aleksandr Azimbaev \- Medium, accessed on February 23, 2026, [https://medium.com/the-agent-protocol/supabase-development-with-ai-agents-a-comprehensive-guide-to-automating-your-workflow-5cf0eda5bc16](https://medium.com/the-agent-protocol/supabase-development-with-ai-agents-a-comprehensive-guide-to-automating-your-workflow-5cf0eda5bc16)  
24. Introducing: Postgres Best Practices \- Supabase, accessed on February 23, 2026, [https://supabase.com/blog/postgres-best-practices-for-ai-agents](https://supabase.com/blog/postgres-best-practices-for-ai-agents)  
25. Row Level Security | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/database/postgres/row-level-security](https://supabase.com/docs/guides/database/postgres/row-level-security)  
26. Transactional DDL in PostgreSQL: A Competitive Analysis, accessed on February 23, 2026, [https://wiki.postgresql.org/wiki/Transactional\_DDL\_in\_PostgreSQL:\_A\_Competitive\_Analysis](https://wiki.postgresql.org/wiki/Transactional_DDL_in_PostgreSQL:_A_Competitive_Analysis)  
27. suehurst/pg\_script\_library: Postgresql DDL and DML scripts \- GitHub, accessed on February 23, 2026, [https://github.com/suehurst/pg\_script\_library](https://github.com/suehurst/pg_script_library)  
28. MCP Server Explained: A Beginner-Friendly Guide to Model Context Protocol | by Sachin | Feb, 2026, accessed on February 23, 2026, [https://medium.com/@sachintechnossus/mcp-server-explained-a-beginner-friendly-guide-to-model-context-protocol-f90cd38c34ef](https://medium.com/@sachintechnossus/mcp-server-explained-a-beginner-friendly-guide-to-model-context-protocol-f90cd38c34ef)  
29. Tools \- What is the Model Context Protocol (MCP)?, accessed on February 23, 2026, [https://modelcontextprotocol.io/specification/draft/server/tools](https://modelcontextprotocol.io/specification/draft/server/tools)  
30. Understanding PostgreSQL Triggers for Real-time Database Auditing | by Naik's Notebook, accessed on February 23, 2026, [https://naiknotebook.medium.com/understanding-postgresql-triggers-for-real-time-database-auditing-71ed35d39906](https://naiknotebook.medium.com/understanding-postgresql-triggers-for-real-time-database-auditing-71ed35d39906)  
31. The AI Agent Behavioral Validation Testing Playbook \- Galileo AI: The AI Observability and Evaluation Platform, accessed on February 23, 2026, [https://galileo.ai/learn/ai-observability/ai-agent-testing-behavioral-validation](https://galileo.ai/learn/ai-observability/ai-agent-testing-behavioral-validation)  
32. Skills vs Tools for AI Agents: Production Guide \- Arcade.dev, accessed on February 23, 2026, [https://www.arcade.dev/blog/what-are-agent-skills-and-tools/](https://www.arcade.dev/blog/what-are-agent-skills-and-tools/)  
33. What is AI Agent Registry \- A Complete Guide \- TrueFoundry, accessed on February 23, 2026, [https://www.truefoundry.com/blog/ai-agent-registry](https://www.truefoundry.com/blog/ai-agent-registry)  
34. Introducing the Model Context Protocol \- Anthropic, accessed on February 23, 2026, [https://www.anthropic.com/news/model-context-protocol](https://www.anthropic.com/news/model-context-protocol)  
35. OpenAI Tool JSON Schema Explained | by Laurent Kubaski \- Medium, accessed on February 23, 2026, [https://medium.com/@laurentkubaski/openai-tool-schema-explained-05a5ce0e80f8](https://medium.com/@laurentkubaski/openai-tool-schema-explained-05a5ce0e80f8)  
36. Schema Reference \- Model Context Protocol, accessed on February 23, 2026, [https://modelcontextprotocol.io/specification/draft/schema](https://modelcontextprotocol.io/specification/draft/schema)  
37. A Survey of AI Agent Registry Solutions \- arXiv, accessed on February 23, 2026, [https://arxiv.org/html/2508.03095v1](https://arxiv.org/html/2508.03095v1)  
38. Function calling | OpenAI API, accessed on February 23, 2026, [https://developers.openai.com/api/docs/guides/function-calling/](https://developers.openai.com/api/docs/guides/function-calling/)  
39. Schemas: The Secret Sauce for Smarter AI Agents | by O3aistack \- Medium, accessed on February 23, 2026, [https://medium.com/@oaistack/schemas-the-secret-sauce-for-smarter-ai-agents-888c2f8f084d](https://medium.com/@oaistack/schemas-the-secret-sauce-for-smarter-ai-agents-888c2f8f084d)  
40. AI Agent Memory on Your Existing Postgres: We are back to SQL \- GibsonAI, accessed on February 23, 2026, [https://gibsonai.com/blog/ai-agent-memory-on-postgres-back-to-sql](https://gibsonai.com/blog/ai-agent-memory-on-postgres-back-to-sql)  
41. How to Build AI Agents with Redis Memory Management, accessed on February 23, 2026, [https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis/](https://redis.io/blog/build-smarter-ai-agents-manage-short-term-and-long-term-memory-with-redis/)  
42. pgvector: Embeddings and vector similarity | Supabase Docs, accessed on February 23, 2026, [https://supabase.com/docs/guides/database/extensions/pgvector](https://supabase.com/docs/guides/database/extensions/pgvector)  
43. Storing OpenAI embeddings in Postgres with pgvector \- Supabase, accessed on February 23, 2026, [https://supabase.com/blog/openai-embeddings-postgres-vector](https://supabase.com/blog/openai-embeddings-postgres-vector)  
44. The missing pieces to your AI app (pgvector \+ RAG in prod) \- YouTube, accessed on February 23, 2026, [https://www.youtube.com/watch?v=ibzlEQmgPPY](https://www.youtube.com/watch?v=ibzlEQmgPPY)  
45. When to Avoid JSONB in a PostgreSQL Schema \- Hacker News, accessed on February 23, 2026, [https://news.ycombinator.com/item?id=12408634](https://news.ycombinator.com/item?id=12408634)  
46. Check Constraints in SQL Server and First Order Logic \- Cold Logics, accessed on February 23, 2026, [https://coldlogics.wordpress.com/2013/03/04/check-constraints-in-sql-server-and-first-order-logic/](https://coldlogics.wordpress.com/2013/03/04/check-constraints-in-sql-server-and-first-order-logic/)  
47. Build an AI Agent That Turns SQL Databases into Dashboards — No Queries Needed, accessed on February 23, 2026, [https://viveksinghpathania.medium.com/build-an-ai-agent-that-turns-sql-databases-into-dashboards-no-queries-needed-ea78571b2475](https://viveksinghpathania.medium.com/build-an-ai-agent-that-turns-sql-databases-into-dashboards-no-queries-needed-ea78571b2475)  
48. Predicate Calculus: Examples & Definition | Vaia, accessed on February 23, 2026, [https://www.vaia.com/en-us/explanations/engineering/artificial-intelligence-engineering/predicate-calculus/](https://www.vaia.com/en-us/explanations/engineering/artificial-intelligence-engineering/predicate-calculus/)  
49. 8.2 First-Order Logic \- DBIS, accessed on February 23, 2026, [https://www.dbis.informatik.uni-goettingen.de/Teaching/DB/db-rel-calc.pdf](https://www.dbis.informatik.uni-goettingen.de/Teaching/DB/db-rel-calc.pdf)  
50. Documentation: 18: 9.16. JSON Functions and Operators \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/current/functions-json.html](https://www.postgresql.org/docs/current/functions-json.html)  
51. Exploring PL/pgSQL: Strings, arrays, recursion, and parsing JSON | notes.eatonphil.com, accessed on February 23, 2026, [https://notes.eatonphil.com/exploring-plpgsql.html](https://notes.eatonphil.com/exploring-plpgsql.html)  
52. How To Navigate JSON Trees in Postgres using Recursive CTEs \- tatiyants.com, accessed on February 23, 2026, [http://tatiyants.com/how-to-navigate-json-trees-in-postgres-using-recursive-ctes/](http://tatiyants.com/how-to-navigate-json-trees-in-postgres-using-recursive-ctes/)  
53. Documentation: 9.5: JSON Functions and Operators \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/9.5/functions-json.html](https://www.postgresql.org/docs/9.5/functions-json.html)  
54. 9 Using Triggers \- Oracle Help Center, accessed on February 23, 2026, [https://docs.oracle.com/cd/B13789\_01/appdev.101/b10795/adfns\_tr.htm](https://docs.oracle.com/cd/B13789_01/appdev.101/b10795/adfns_tr.htm)  
55. How to Use PostgreSQL Triggers and Functions \- OneUptime, accessed on February 23, 2026, [https://oneuptime.com/blog/post/2026-02-02-postgresql-triggers-functions/view](https://oneuptime.com/blog/post/2026-02-02-postgresql-triggers-functions/view)  
56. Documentation: 18: 8.14. JSON Types \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/current/datatype-json.html](https://www.postgresql.org/docs/current/datatype-json.html)  
57. Postgresql complex logic function ( plpgsql ) \- Stack Overflow, accessed on February 23, 2026, [https://stackoverflow.com/questions/58258681/postgresql-complex-logic-function-plpgsql](https://stackoverflow.com/questions/58258681/postgresql-complex-logic-function-plpgsql)  
58. evaluate() PostgreSQL Function for Evaluating Stored Expressions (Part 1\) | by Christoph Bussler | Towards Dev \- Medium, accessed on February 23, 2026, [https://medium.com/towardsdev/evaluate-postgresql-function-for-evaluating-stored-expressions-1846a19943e9](https://medium.com/towardsdev/evaluate-postgresql-function-for-evaluating-stored-expressions-1846a19943e9)  
59. Documentation: 8.1: PL/pgSQL \- SQL Procedural Language \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/8.1/plpgsql.html](https://www.postgresql.org/docs/8.1/plpgsql.html)  
60. PostgreSQL JSON Functions \- Neon, accessed on February 23, 2026, [https://neon.com/postgresql/postgresql-json-functions](https://neon.com/postgresql/postgresql-json-functions)  
61. ordering logic of the returned json items list in the jsonb\_path\_query\_first function?, accessed on February 23, 2026, [https://stackoverflow.com/questions/78505539/ordering-logic-of-the-returned-json-items-list-in-the-jsonb-path-query-first-fun](https://stackoverflow.com/questions/78505539/ordering-logic-of-the-returned-json-items-list-in-the-jsonb-path-query-first-fun)  
62. Documentation: 18: 7.8. WITH Queries (Common Table Expressions) \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/current/queries-with.html](https://www.postgresql.org/docs/current/queries-with.html)  
63. How do you keep your AI agents vibing with your database schema? : r/vibecoding \- Reddit, accessed on February 23, 2026, [https://www.reddit.com/r/vibecoding/comments/1kx72kj/how\_do\_you\_keep\_your\_ai\_agents\_vibing\_with\_your/](https://www.reddit.com/r/vibecoding/comments/1kx72kj/how_do_you_keep_your_ai_agents_vibing_with_your/)  
64. First Principles: OCI AI Agent Platform is a New Frontier for Enterprise Automation | cloud-infrastructure \- Oracle Blogs, accessed on February 23, 2026, [https://blogs.oracle.com/cloud-infrastructure/first-principles-oci-ai-agent-platform](https://blogs.oracle.com/cloud-infrastructure/first-principles-oci-ai-agent-platform)  
65. 3\. Omnigres (Extended Postgres Datalog) — Postgres as a Rule Engine | by eejai42 | CMCC Deepdive\! | Medium, accessed on February 23, 2026, [https://medium.com/cmcc-deepdive/3-omnigres-extended-postgres-datalog-postgres-as-a-rule-engine-0bf2c41db3fc](https://medium.com/cmcc-deepdive/3-omnigres-extended-postgres-datalog-postgres-as-a-rule-engine-0bf2c41db3fc)  
66. How to design a ledger table that references multiple document types (e.g., Invoices, Purchases) : r/SQL \- Reddit, accessed on February 23, 2026, [https://www.reddit.com/r/SQL/comments/1mwz3oy/how\_to\_design\_a\_ledger\_table\_that\_references/](https://www.reddit.com/r/SQL/comments/1mwz3oy/how_to_design_a_ledger_table_that_references/)  
67. General Ledger db design \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/message-id/20070224023545.27764.qmail%40web63204.mail.re1.yahoo.com](https://www.postgresql.org/message-id/20070224023545.27764.qmail%40web63204.mail.re1.yahoo.com)  
68. Basic SQL double-entry accounting ledger \- how to split journal entries \- Stack Overflow, accessed on February 23, 2026, [https://stackoverflow.com/questions/62359481/basic-sql-double-entry-accounting-ledger-how-to-split-journal-entries](https://stackoverflow.com/questions/62359481/basic-sql-double-entry-accounting-ledger-how-to-split-journal-entries)  
69. Accounting and Invoicing — Odoo 19.0 documentation, accessed on February 23, 2026, [https://www.odoo.com/documentation/19.0/applications/finance/accounting.html](https://www.odoo.com/documentation/19.0/applications/finance/accounting.html)  
70. How to Use PostgreSQL to Manage Business Inventory Data \- DbVisualizer, accessed on February 23, 2026, [https://www.dbvis.com/thetable/how-to-use-sql-to-manage-business-inventory-data-in-postgres-and-visualize-the-data/](https://www.dbvis.com/thetable/how-to-use-sql-to-manage-business-inventory-data-in-postgres-and-visualize-the-data/)  
71. Syntax for conditional logic in PostgreSQL check constraint \- Stack Overflow, accessed on February 23, 2026, [https://stackoverflow.com/questions/70818255/syntax-for-conditional-logic-in-postgresql-check-constraint](https://stackoverflow.com/questions/70818255/syntax-for-conditional-logic-in-postgresql-check-constraint)  
72. What you should know about constraints in PostgreSQL | xata.io, accessed on February 23, 2026, [https://xata.io/blog/constraints-in-postgres](https://xata.io/blog/constraints-in-postgres)  
73. Dolibarr Open Source ERP and CRM \- Web suite for business, accessed on February 23, 2026, [https://www.dolibarr.org/](https://www.dolibarr.org/)  
74. Human resources — Odoo 19.0 documentation, accessed on February 23, 2026, [https://www.odoo.com/documentation/19.0/applications/hr.html](https://www.odoo.com/documentation/19.0/applications/hr.html)  
75. Human resources — Odoo 18.0 documentation, accessed on February 23, 2026, [https://www.odoo.com/documentation/18.0/th/applications/hr.html](https://www.odoo.com/documentation/18.0/th/applications/hr.html)  
76. Documentation: 18: 5.5. Constraints \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/current/ddl-constraints.html](https://www.postgresql.org/docs/current/ddl-constraints.html)  
77. Query Processing Architecture Guide \- SQL Server \- Microsoft Learn, accessed on February 23, 2026, [https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide?view=sql-server-ver17](https://learn.microsoft.com/en-us/sql/relational-databases/query-processing-architecture-guide?view=sql-server-ver17)  
78. ToolRegistry: A Protocol-Agnostic Tool Management Library for Function-Calling LLMs, accessed on February 23, 2026, [https://arxiv.org/html/2507.10593v1](https://arxiv.org/html/2507.10593v1)  
79. Key components of a data-driven agentic AI application | AWS Database Blog, accessed on February 23, 2026, [https://aws.amazon.com/blogs/database/key-components-of-a-data-driven-agentic-ai-application/](https://aws.amazon.com/blogs/database/key-components-of-a-data-driven-agentic-ai-application/)  
80. Best Practices for Agent Access in a Multi-Tenant Supabase Setup \- Answer Overflow, accessed on February 23, 2026, [https://www.answeroverflow.com/m/1466379565193760872](https://www.answeroverflow.com/m/1466379565193760872)  
81. Documentation: 18: 5.10. Schemas \- PostgreSQL, accessed on February 23, 2026, [https://www.postgresql.org/docs/current/ddl-schemas.html](https://www.postgresql.org/docs/current/ddl-schemas.html)  
82. Introduction to PostgreSQL Schemas: A Practical Guide | by Miftahul Huda \- Medium, accessed on February 23, 2026, [https://iniakunhuda.medium.com/introduction-to-postgresql-schemas-a-practical-guide-8089b351b953](https://iniakunhuda.medium.com/introduction-to-postgresql-schemas-a-practical-guide-8089b351b953)  
83. Creating required databases in PostgreSQL \- IBM, accessed on February 23, 2026, [https://www.ibm.com/docs/en/cloud-paks/cp-biz-automation/25.0.1?topic=scripts-creating-required-databases-in-postgresql](https://www.ibm.com/docs/en/cloud-paks/cp-biz-automation/25.0.1?topic=scripts-creating-required-databases-in-postgresql)  
84. Store a formula in a table and use the formula in a function \- Database Administrators Stack Exchange, accessed on February 23, 2026, [https://dba.stackexchange.com/questions/33894/store-a-formula-in-a-table-and-use-the-formula-in-a-function](https://dba.stackexchange.com/questions/33894/store-a-formula-in-a-table-and-use-the-formula-in-a-function)

[image1]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAXCAYAAADQpsWBAAAAqElEQVR4XmNgGAV4ASsQy6ILEgIeQHwRiMXRJXABTiCeA8SzgDgCTQ4nsATiLiCWB+LFQMyPKo0JGBkgGkAaQaCaAeJUvEAHiOczQJyIjY8VoJvMAsQTGRA2YwBQSIFMRfcDzI8gp2OALCCOQRdkgDhtIRBro0uATAfZgiteQE4GOZ2wIBLAMBTk2T4gVoEJ4ADpQBwO44DSmRYDDo8iAW4gVkUXHNEAAJPOEUb/owmCAAAAAElFTkSuQmCC>

[image2]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAXCAYAAADQpsWBAAAAtklEQVR4Xu2RMQoCMRBFR9BCVrAUSwubRbb3Bt5AbyDYWVtsv53FwhaCB/A03sj/iRPCJ9kT7INXZCbJTCZmE5EFrOFME0IF975YwhfcxXSe89/ICd7TgLCCA9ykwTV8azCBlz40SG7wokEwhz08aILwTR8LVVOO8GnhcBa2wFYcTrSzcLAIW2Arfiurc7KccBFu5ia/WSsX4QG2tLUwUX1jFv/sFl4lNwpb+lr537KwWqPBCeEHO+IRK6+aJEAAAAAASUVORK5CYII=>

[image3]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAXCAYAAADQpsWBAAAALklEQVR4XmNgGAWjAB0IAfEOIH5EBG6C6iEaGAPxZHRBQmCQa+JkgATaKKA/AAA5qwxy8zZ99QAAAABJRU5ErkJggg==>

[image4]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABMAAAAXCAYAAADpwXTaAAAAiElEQVR4XmNgGAWjgGqAA4jTgJgHXYIcwAjErUBsjC5BLgAZ1AvELOgS5ACQ6wqAOA7KRgECQCxJIpYD4vlAPBmI+RiggBuIq4F4Fhl4BxB/BeJmIGZnoACYAPFqIJZBlyAVCAPxYiCWR5cgB2QBcQS6IDkAlGinArE0ugQ5AJQUeKH0KBhMAABVixNKp22j3QAAAABJRU5ErkJggg==>

[image5]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAXCAYAAADduLXGAAAAxElEQVR4XmNgGDSAG10AC2AGYi4QYxoQ86PKYYAIIE4FMaqB2ANVDgWwAHE/ECuBODpA3AvEjMgqkABIfioDRBMDJxDPAWJFZBVIIAuI/ZAFQG7aCcSz0PBcIN4NxOIIpQwM0kC8iAHiLkkkDDKkEUkdGIDc2wXElgTE4MAGiGuQ+CA/gPwC8hMGAIX1fAaE++BhiwuAfA5SRCiEwEATiCcDsQED/rAHA1DAgyJgHQP+WIUDkKJDDITTCxiA3KuCLjgiAABjsxc6B/BwKAAAAABJRU5ErkJggg==>

[image6]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAsAAAAXCAYAAADduLXGAAAASUlEQVR4XmNgGDSAEYiFgVgSD+aAKeYB4nognoUD7wLicphiQsCXYRgorgXiRzjwOwZKTMYHBqNiISDewYAZCsihUQRTPApgAACsNxxwpCF9KwAAAABJRU5ErkJggg==>

[image7]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFoAAAAXCAYAAACLbliwAAACMElEQVR4Xu2XTSsFURjHH6HIS0KEhKWU7GQhdbGUkoWVwgeglBWylZcFeUmSna2NksTCRilJsVA2PoUV/n/nTnfucV/OnHtn7i3nV7/ubc7MPDPn5XnOiDgcDofD4XD8d2pgqX7QgBJR1/I3aupgi2ZF0hlFAjunH97CLViZ3GxEGVwQdY+Y2A1WEPjMjPMAz+ER3IdzcBK2JU4tPOyMcXgPl2FDcrMVVXAePsIpWJ7cnBd4z1W4B2u1tqKCD8pOYGewU9g5+YarYhY+xX9tVkk6JkR1stEg1sNL+BHAld8r7Qnz5dPhDeqzqFWT6wzkMx/DLr2hGIhiOWfDS1PMqVz2th3OQncI2+P/U9kshXlHmYFvopZc2EUqE4w9Cl/gotZmCjvyRlTxy2SfdwGrJouPPhqZ5DbGFv+snpZo0oaHXnRtZzNphAewWm9IB6f2sKitiKncgnnw4Zsk+H7Ry9OvYlYIbeMQLz+zg7PF4rmMk23Jc4Kui1oZkcD94jc8E7WHDYrpLLOJY1MTuH9nnDXteCo64AXs1hvCYAx+wndRacUWdngM3sEN+buXDhKHg8VB4+BxEIPUA37sfMFrMUsLnfBKVGFtlZC/SLmcd0VV2Vzhg/bCbVFbTz8mcfj5vSO5fRUy/zJOphTjh3FG4KmoieBtg/l/MHFa7nAvuSnmS9qWqOIMwCX9YKHhaPLlwy4KUcVhujiBPXpDoWG+ZB4MNTdJdHFY2Ib0gw6Hw88PNd1e4tz9YwUAAAAASUVORK5CYII=>

[image8]: <data:image/png;base64,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>

[image9]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAD0AAAAYCAYAAABJA/VsAAAC30lEQVR4Xu2XS6iNURiGX6HINRJCIoUoyvVIOgOJXCYUYSAchNylIwMlSQmRTMSRFMpIUhIyxIQyIYVkSAbMXN53f//ae+211//v27ls2m897f1/a52//a3vtg7QVFO1ahDpHRr/FQ0krWQJGZLYhpMRbkOKTpDRobGH1S8hVX3JMfKe7CE7yQtyhjwjUwtbo2pEp+XPwtDo1IdcJrfIAM+uCD8nT2EZkKVGc1oRvkTGhAtOLeQjmR4uUEfJhdAYUaM5PZFchAU0qpPkMxkbLlCHyarQGFGjOb2M7AuNvq6TP6QdpR14EhkW2GJqFKfVm6aRDrIbGWW5Dua0+EUeky1ksL+pjHra6f6wrHxNjpAn5CCsJ52GHUaRZDgFc9g5L14hnvIxXSVfyKcKeUcW5P6yVIrO0NCYIY3WB+QKzHm/nkeSN2RHfncgpbZGk07mO8zx7UU70tUZkdbhb4ZlmRqoek2voh2lcpNHEdW0kRaT/fkdVr733YOcVM3GXryU/IalSiXqDKdXkNnJd73rESxSWdLE+QarX6cDKMxnjS45rHfllNXWZ5EfZEO4kCKVxwzYj60U/7akKO1CIQAt5AbK3KioleQnmZM8h/N5AmwyHU+ec6PoHuIv3kjeknHhQorOkTaypgr8i8N8shz2487CHB7vradJqfwVFiRJPeg8LJA6wHaYH/l3qWYUzXnOkEgprya2OrBnqd70Xk8mk0UwB27CRk85qek9hDknJ3UISnWVrnqDHJ7pb75LDsG6m75rk07pA1mLeK2nqR6nFRV1Vz/j1MgqLa1R5DbsuvwSNq70qYZcNHbV2hVRSV1TDUQp14p4updTPU4rzf2RokO4A7tVVSONuQ4yBdUFrGbV47Q6rTquk8pNHdeNoErl13O3qB6nt5JryafqUd1XKVutXD13m2p1WlHZC/uXVn2mltJy2kTmhsaulJpgteko6fKxLTT+71Id6gLRVFfoL3MafSD038AYAAAAAElFTkSuQmCC>

[image10]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA0AAAAYCAYAAAAh8HdUAAABE0lEQVR4Xu3SIUtDYRTG8TNUcCgTFJsWsQxsCrJmEpNFwYFrC4LBNBFlVUQwyAzLaxaTXcSoyWARBAd+AcPi1P+zs+G9h9tMAx/4wTjnfe/Ozp3Z0GYSa1jHVL82g9nBgWTGUMcbDrCPJ1zgAcXfo55RNHGNiURd3/CIe/MJUimhjaXYICdoxKJyig/MxQY5xGYsKi184xgjobeI6VDrpWx+Sbq4QxWF5KEYbe7M/MLgsjxb9sipaDSt9hyf5hf3UifMD2nmXGyQDXzhKDYWcGX+nmKW0cFubGiVtxiPDVLBK+ZjQ+9HT1sNdY2sJWyFeu9vcYMaXvqfteZLvGPHMn5r3vyJila+gm3zf3jWuP/5U34AsNUreE1r6AoAAAAASUVORK5CYII=>

[image11]: <data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAYCAYAAADOMhxqAAABFUlEQVR4XtXSvUpDQRCG4REN+IuCIliIENNZWEVRgoWdhY3W2oiXkAQlXWpBTGNhijQK3oAWFrkFA1ZeQAo7sdd3ziQ6OyFgmw+eZnazu2cmIiOVHPZwiMWwNpAiHnGGU7ziKNnhsoF7zLtaFS+YcbUsU7hFIdQv0cZsqMsOKqGmhzzjGmNhTWooYRIrWMCx2DesuX1Z9H0N7KKL754vbLl9v8njSuxaPVlvmEYdD5j422o5wHksis1Bb9QDk1yI9T9G+/+JTV/sv3/JF3u5wZuENb1OJzvni2QV72LfkbRU3/+BbVfT/t/hSdKpZ9H+n4hNs4UmOiiL/TCJf/84lsX+nQNT7cf3/18Z1v+h2cd6LI5QfgDG5CT71hATlgAAAABJRU5ErkJggg==>

[image12]: <data:image/png;base64,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>

[image13]: <data:image/png;base64,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>

[image14]: <data:image/png;base64,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>