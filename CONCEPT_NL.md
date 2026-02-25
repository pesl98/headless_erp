🛸 Project Overzicht: Het Autonome "Headless" ERP
1. De Kernvisie
Dit is geen programma waar mensen in werken; dit is een digitaal organisme dat zichzelf bestuurt. In een normaal ERP zit de mens aan het stuur. In dit systeem is de Database de Kapitein en zijn AI-agents de bemanningsleden. De mens kijkt alleen mee via het dashboard (de Operator Console) of geeft opdrachten via Telegram.

2. Hoe het werkt (De "Magic" in 3 stappen)
Ingress (De Ingang): Een signaal komt binnen (bijv. een klant via Telegram of jouw portaal). Dit wordt een erp_task_event in de database.

Instant Trigger (De Vonk): De database ziet de nieuwe taak en schiet onmiddellijk een signaal naar de juiste AI-agent (bijv. de sales_agent) via een database-trigger (pg_net). Dit gebeurt in minder dan 1 seconde.

Governance (De Wet): De agent probeert de taak uit te voeren, maar de database controleert alles met Predicate Calculus. Als een agent een fout maakt (bijv. een order goedkeurt van een klant zonder krediet), grijpt de database in met een RAISE EXCEPTION. De agent moet het dan opnieuw proberen of om hulp vragen.

3. Wat we al hebben (De "Agent Fleet")
Op je dashboard zie je de huidige status van je "vloot":

Finance Agent: Heeft de hoogste autoriteit (€250.000) voor boekhoudkundige taken.

Sales Agent: Verwerkt bestellingen en past automatisch kortingen toe op basis van klant-tiers.

Inventory Watcher: Houdt de voorraad in de gaten en slaat alarm als er te weinig is.

Concierge Agent: Jouw persoonlijke AI-assistent in Telegram die orders voorbereidt.

4. Waarom dit "Toekomstbestendig" is
Omdat alles is vastgelegd in formele logica en database-triggers, kan een AI van over 6 maanden (zoals Gemini 4 of Claude 5) dit project in één keer "begrijpen".

De AI ziet de 26 tabellen en hun relaties.

De AI begrijpt de "wetten" van je bedrijf via de erp_agent_constraints.

De AI kan nieuwe functies toevoegen (zoals een Bank-koppeling of HR-module) simpelweg door het bestaande "event-dispatch" patroon te volgen.


Prompt:  
Build a Headless ERP system on Supabase + Next.js. The defining constraint is:
the database is the execution engine, not a persistence store. Business logic
lives in PL/pgSQL triggers. AI agents are workers that respond to database
events. The human operator is a read-only observer.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Database:      Supabase (PostgreSQL 15) with pg_cron, pg_net, pgvector
- Edge runtime:  Supabase Edge Functions (Deno/TypeScript)
- Frontend:      Next.js 14 App Router, Tailwind CSS, server components
- AI:            Claude Opus 4.5 via Anthropic SDK (agents + Telegram bot)
- External:      Telegram Bot API (inbound orders via chat)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ARCHITECTURAL INVARIANTS — never violate these
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Every external signal enters through erp_task_events INSERT. No agent
   is called directly by the frontend or another agent. The DB dispatch
   trigger calls agents.

2. Every constraint that governs agent behaviour is enforced by a PL/pgSQL
   trigger that fires RAISE EXCEPTION on violation. Agents must handle errors
   and self-correct. Application-layer validation is a courtesy, not the gate.

3. An agent never reads from a table it doesn't need. The erp_agents table
   has a database_role column. RLS will eventually bind each role to its domain.

4. The erp_task_events status column only accepts:
   'pending' | 'processing' | 'completed' | 'failed'
   (not 'processed' — this is a common mistake)

5. erp_sales_order_items.line_total is GENERATED ALWAYS AS (quantity * unit_price).
   Never INSERT it. Never UPDATE it.

6. The Supabase JS client throws plain objects, not Error instances.
   Always extract error messages with:
   typeof err === 'object' && 'message' in err
     ? String(err.message)
     : JSON.stringify(err)
   Never use instanceof Error on Supabase errors.

7. pg_net functions live in the net schema, not extensions.
   Call: net.http_post(url := ..., body := ..., headers := ...)
   It returns a request_id immediately. The HTTP call is async.

8. The credit limit trigger fires BEFORE INSERT on erp_sales_orders for ALL
   inserts including drafts. Drafts must skip the check:
   IF NEW.order_status = 'draft' THEN RETURN NEW; END IF;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE SCHEMA — 26 tables, grouped by domain
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AGENT DOMAIN
  erp_agents              — role_name, display_name, system_prompt,
                            operational_status, financial_authority_limit,
                            database_role, avatar_emoji
  erp_agent_constraints   — target_agent_role, target_table,
                            triggering_operation, logic_ast JSONB,
                            violation_message, is_active
  erp_agent_memory        — agent_id, raw_content TEXT,
                            embedding_vector VECTOR(1536),
                            contextual_metadata JSONB
  erp_agent_message_history — agent_id, session_id, role, content,
                               tool_call_id (for Telegram session persistence)
  erp_agent_skills        — agent_id, skill_name, domain_knowledge,
                            activation_condition JSONB
  erp_agent_tool_assignments — agent_id, tool_id (M2M)
  erp_mcp_tools           — tool_name, semantic_description,
                            input_schema JSONB, execution_handler,
                            target_endpoint, is_active
  erp_authorization_logs  — target_record_id, target_table, authorizing_agent,
                            authorizing_role, reason (immutable audit trail)
  erp_task_events         — event_type, target_agent, payload JSONB,
                            status, priority INT (1-10), error_message,
                            processed_at

SALES DOMAIN
  erp_customers           — customer_name, contact_email, maximum_credit_limit,
                            current_balance, account_status,
                            customer_tier (standard|premium|vip)
  erp_sales_orders        — customer_id, closing_agent_id, order_status
                            (draft|confirmed|invoiced|paid|cancelled),
                            total_invoice_value, discount_percent,
                            order_creation_date TIMESTAMPTZ DEFAULT now()
  erp_sales_order_items   — sales_order_id, product_id, quantity, unit_price,
                            line_total NUMERIC GENERATED ALWAYS AS
                              (quantity * unit_price) STORED

PROCUREMENT DOMAIN
  erp_suppliers           — company_name, payment_terms, lead_time_days,
                            reliability_score, is_preferred, is_active
  erp_purchase_orders     — supplier_id, executing_agent_id, order_status,
                            expected_delivery_date, total_order_value
  erp_purchase_order_items — purchase_order_id, product_id, quantity_ordered,
                              quantity_received, unit_price,
                              line_total NUMERIC GENERATED ALWAYS AS
                                (quantity_ordered * unit_price) STORED

INVENTORY DOMAIN
  erp_products            — stock_keeping_unit (unique), product_name,
                            category, standard_unit_cost, standard_sale_price,
                            requires_refrigeration BOOLEAN, is_active
  erp_inventory           — product_id, warehouse_id,
                            current_quantity_available INT,
                            reorder_point INT, calculated_safety_stock INT,
                            max_stock_level INT
  erp_warehouses          — facility_name, location_address,
                            is_climate_controlled BOOLEAN,
                            maximum_capacity_volume, current_used_volume

FINANCE DOMAIN
  erp_accounts            — account_code, account_name,
                            account_classification, parent_account_id,
                            currency_code CHAR(3), is_active
  erp_financial_transactions — executing_agent_id, posted_timestamp,
                               semantic_description, source_document_type,
                               source_document_reference UUID,
                               currency_code, is_reversed
  erp_journal_entries     — transaction_id, account_id, absolute_amount,
                            is_credit_entry BOOLEAN, memo

HR DOMAIN
  erp_employees           — department_id, first_name, last_name, email,
                            job_title, employment_type, employment_status,
                            annual_base_salary, official_hire_date
  erp_departments         — department_name, department_code, parent_dept_id,
                            budget_annual, head_agent_id
  erp_timesheets          — employee_id, date_of_labor, hours_worked,
                            overtime_hours, approval_status, approved_by
  erp_payroll_manifests   — payroll_agent_id, pay_period_start, pay_period_end,
                            total_gross_pay, total_net_pay, employee_count,
                            status (draft|approved|disbursed)
  erp_payroll_line_items  — manifest_id, employee_id, regular_hours,
                            overtime_hours, gross_pay, tax_withheld, net_pay

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TRIGGER CHAIN — implement all five
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. erp_dispatch_on_task_insert
   Table: erp_task_events | AFTER INSERT | WHEN (NEW.status = 'pending')
   Action: resolve NEW.target_agent to Edge Function slug, call
   net.http_post(url, jsonb_build_object('event_id', NEW.event_id, ...))
   Wrap in EXCEPTION WHEN OTHERS → RAISE WARNING (never block the INSERT)

   Slug map:
     sales_agent       → sales-agent
     finance_agent     → finance-agent
     procurement_agent → procurement-agent
     inventory_watcher → inventory-watcher
     hr_payroll_agent  → hr-payroll-agent
     logistics_agent   → logistics-agent

2. erp_credit_limit_check
   Table: erp_sales_orders | BEFORE INSERT
   IF NEW.order_status = 'draft' THEN RETURN NEW; END IF;  ← critical
   SELECT maximum_credit_limit, current_balance FROM erp_customers
   IF current_balance + NEW.total_invoice_value > maximum_credit_limit THEN
     RAISE EXCEPTION 'Credit limit exceeded...'
   END IF;

3. erp_sales_order_confirmed_trigger
   Table: erp_sales_orders | AFTER UPDATE
   WHEN (OLD.order_status = 'draft' AND NEW.order_status = 'confirmed')
   Action A: UPDATE erp_inventory SET current_quantity_available -= item.quantity
             for each row in erp_sales_order_items where sales_order_id = NEW.id
   Action B: INSERT INTO erp_task_events (INVOICE_CUSTOMER, finance_agent, pending)
             with payload containing sales_order_id, customer_id, total_invoice_value

4. erp_refrigeration_check
   Table: erp_inventory | BEFORE INSERT OR UPDATE
   JOIN erp_products ON product_id, JOIN erp_warehouses ON warehouse_id
   IF product.requires_refrigeration AND NOT warehouse.is_climate_controlled THEN
     RAISE EXCEPTION 'Refrigerated product cannot be stored in ambient warehouse'
   END IF;

5. erp_journal_balance_check
   Table: erp_journal_entries | AFTER INSERT OR UPDATE
   SELECT SUM(CASE WHEN is_credit_entry THEN absolute_amount ELSE -absolute_amount END)
   FROM erp_journal_entries WHERE transaction_id = NEW.transaction_id
   IF result <> 0 THEN RAISE EXCEPTION 'Journal entries do not balance' END IF;

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EDGE FUNCTIONS — four to implement
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All use SUPABASE_SERVICE_ROLE_KEY (not anon). All use verify_jwt: false
(auth is handled at the application level for inbound, agents call each
other internally).

── inbound-order (public intake) ──────────────────────────────
Input:  { customer_email, customer_name, items: [{sku, quantity}], source? }
Steps:
  1. Resolve each SKU to product_id + standard_sale_price from erp_products
     (error on unknown SKU, return 404 with sku name)
  2. Find or create customer by contact_email in erp_customers
     (new customers get: tier='standard', maximum_credit_limit=10000,
      current_balance=0, account_status='active')
  3. INSERT erp_sales_orders (status='draft', total_invoice_value=sum of items)
     The credit limit trigger skips drafts — this will always succeed
  4. INSERT erp_sales_order_items for each item
     DO NOT include line_total — it is GENERATED
  5. INSERT erp_task_events (ORDER_NEGOTIATION, sales_agent, pending,
     priority=8, payload contains full context: sales_order_id, customer_id,
     customer_email, customer_tier, estimated_value, items array with
     product_id/sku/quantity/unit_price)
     The dispatch trigger fires here and wakes sales-agent
  6. Return: { success, event_id, sales_order_id, reference, estimated_value,
               customer_tier, submitted_at }

── sales-agent (autonomous order reviewer) ────────────────────
Triggered by: dispatch trigger via net.http_post, or pg_cron every 5 min
Accepts: POST or GET (cron sends GET)
Steps:
  1. SELECT pending ORDER_NEGOTIATION events, ORDER BY priority DESC,
     created_at ASC, LIMIT 20
  2. If none: return { processed: 0, message: 'No pending orders.' }
  3. Bulk UPDATE all fetched event_ids to status='processing' (optimistic lock)
  4. For each event:
     A. Fetch sales order — if not found or not 'draft': mark failed/skipped
     B. For each line item: check erp_inventory.current_quantity_available >= quantity
        If insufficient: mark event failed with reason
     C. Fetch customer: check account_status != 'suspended'
        Calculate projected balance, check against maximum_credit_limit
     D. Apply tier discount:  standard=0%, premium=5%, vip=10%
        finalValue = baseValue * (1 - discount/100)
     E. UPDATE erp_sales_orders SET status='confirmed', discount_percent=X,
        total_invoice_value=finalValue WHERE sales_order_id=X AND status='draft'
        (The confirmed trigger fires here: inventory deducted, INVOICE_CUSTOMER emitted)
     F. UPDATE erp_customers SET current_balance += finalValue
     G. UPDATE event: status='completed', processed_at=now()  ← must be 'completed' not 'processed'
        On failure: status='failed', error_message=reason
        On skip: status='pending' (put it back)
  5. Return { success, processed, confirmed, failed, results[] }

── concierge-bot (Telegram → Claude agentic loop) ─────────────
Triggered by: Telegram webhook POST
Steps:
  1. Parse update.message: extract chat.id, text, user metadata
  2. Build deterministic session_id from chat_id:
     '00000000-0000-4000-8000-' + chat_id.toString(16).padStart(12, '0')
  3. Load message history from erp_agent_message_history WHERE session_id=X
     ORDER BY created_at ASC
  4. Send typing action to Telegram
  5. Run Claude Opus agentic loop (max 8 tool_use iterations):
     System prompt from erp_agents WHERE role_name='concierge_agent'
     Tools available:
       search_products(query)       → SELECT from erp_products WHERE name/sku ILIKE
       lookup_customer(email)       → SELECT from erp_customers
       check_inventory(sku)         → JOIN erp_inventory + erp_products
       get_pending_orders(email)    → SELECT sales orders for customer
       submit_order_request(payload)→ calls inbound-order Edge Function internally
  6. Persist each message (user + assistant + tool results) to erp_agent_message_history
  7. Send final text response to Telegram via sendMessage API
  8. Return 200 OK to Telegram (must respond within 5 seconds)

── finance-agent (to build next) ───────────────────────────────
Triggered by: dispatch trigger on INVOICE_CUSTOMER events
Steps:
  1. Claim pending INVOICE_CUSTOMER events (same optimistic lock pattern as sales-agent)
  2. For each: fetch sales order + customer
  3. Call post_journal_entry():
     DR: Accounts Receivable (find account by classification='asset')
     CR: Product Revenue (find account by classification='revenue')
     Amount: total_invoice_value
  4. Generate invoice reference, update sales order status → 'invoiced'
  5. Mark event 'completed'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEDULED JOBS (pg_cron)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SELECT cron.schedule(
  'sales-agent-fallback',
  '*/5 * * * *',
  $$ SELECT net.http_post(
       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/sales-agent',
       body := '{"triggered_by":"pg_cron"}'::jsonb,
       headers := '{"Content-Type":"application/json"}'::jsonb
     ) $$
);

SELECT cron.schedule(
  'payroll-run',
  '0 8 25 * *',
  $$ INSERT INTO erp_task_events (event_type, target_agent, payload, status, priority)
     VALUES ('PAYROLL_RUN', 'hr_payroll_agent', '{}', 'pending', 10) $$
);

SELECT cron.schedule(
  'inventory-check',
  '0 */6 * * *',
  $$ INSERT INTO erp_task_events (event_type, target_agent, payload, status, priority)
     VALUES ('INVENTORY_CHECK', 'inventory_watcher', '{}', 'pending', 5) $$
);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FRONTEND — Next.js Operator Console (7 pages)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

All pages: server components, ISR revalidate: 10 seconds.
No auth required (internal tool). Tailwind, dark sidebar nav.

/                → Dashboard: KPI cards (open orders, inventory alerts,
                   pending events, revenue today), recent activity feed
/agents          → Table of erp_agents with status badges, authority limits,
                   last action timestamp
/sales           → erp_sales_orders table with status filter, customer name,
                   value, discount applied, agent that closed
/inventory       → erp_inventory joined to products and warehouses,
                   highlight rows where current_quantity_available < reorder_point
/finance         → erp_financial_transactions + journal entries summary,
                   account balances grouped by classification
/hr              → erp_employees table + pending timesheet approvals count
/queue           → erp_task_events table, newest first, status colour-coded,
                   show event_type, target_agent, payload preview, processed_at

Also:
/portal          → Public customer-facing order form. Shows live product
                   catalogue from erp_products WHERE is_active=true.
                   POSTs to inbound-order Edge Function.
                   Shows returned reference number and estimated_value.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT REGISTRY — seed data
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT six agents:
  sales_agent        — "Reviews draft orders, verifies inventory and credit,
                        applies tier discounts, confirms or rejects"
                        financial_authority_limit: 50000
  concierge_agent    — "Helps customers place orders via Telegram. Searches
                        products, checks inventory, collects order details,
                        submits via inbound-order API"
                        financial_authority_limit: 0
  finance_agent      — "Posts journal entries, generates invoices, reconciles
                        bank transactions against ledger"
                        financial_authority_limit: 500000
  procurement_agent  — "Creates purchase orders when inventory falls below
                        reorder point. Selects preferred suppliers by
                        reliability score and lead time"
                        financial_authority_limit: 100000
  inventory_watcher  — "Read-only sentinel. Checks stock levels, emits
                        REORDER_TRIGGERED events when stock < reorder_point"
                        financial_authority_limit: 0
  hr_payroll_agent   — "Processes payroll runs, approves timesheets,
                        posts salary journal entries"
                        financial_authority_limit: 1000000

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCT SEED DATA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Insert at minimum:
  SKU: SSD-NVM-001T  — 1TB NVMe SSD,   cost: 89,  price: 129, category: Storage
  SKU: SSD-NVM-002T  — 2TB NVMe SSD,   cost: 139, price: 199, category: Storage
  SKU: RAM-DDR5-32G  — 32GB DDR5 RAM,  cost: 89,  price: 149, category: Memory
  SKU: RAM-DDR5-64G  — 64GB DDR5 RAM,  cost: 169, price: 279, category: Memory
  SKU: CPU-R9-7950X  — Ryzen 9 7950X,  cost: 549, price: 699, category: CPU
  SKU: NET-10G-PCIe  — 10GbE NIC,      cost: 89,  price: 149, category: Networking
  SKU: FOOD-WAGYU-1K — Wagyu Beef 1kg, cost: 120, price: 180, category: Food,
                        requires_refrigeration: true

Insert inventory for each product in warehouse 1:
  current_quantity_available: 50-200
  reorder_point: 10
  calculated_safety_stock: 5

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWN GOTCHAS — learn from these
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. net.http_post headers parameter must be JSONB, not TEXT:
   headers := '{"Content-Type":"application/json","Authorization":"Bearer TOKEN"}'::jsonb

2. When the dispatch trigger fails to reach an agent (BOOT_ERROR, cold start),
   the INSERT still commits and the event stays 'pending'. pg_cron picks it up.
   This is intentional — never let the trigger block the INSERT.

3. Claude Opus tool_use responses: when stop_reason is 'tool_use', you MUST
   send all tool results back in a single user message as an array of
   { type: 'tool_result', tool_use_id, content } blocks. Missing any tool_use_id
   causes a 400 error.

4. Telegram requires a 200 response within 5 seconds of the webhook POST.
   If Claude takes longer (it will), use waitUntil() or return 200 immediately
   and process in background. Otherwise Telegram retries and you get duplicate
   messages.

5. The erp_agent_message_history session_id for Telegram is deterministic:
   '00000000-0000-4000-8000-' + chatId.toString(16).padStart(12, '0')
   This means no separate session creation step — the session exists as
   soon as the first message is stored.

6. When INSERTing erp_sales_orders, do NOT include order_creation_date.
   It has DEFAULT now(). Inserting it explicitly causes a NOT NULL constraint
   error if you pass null, or overwrites the server timestamp if you pass a value.

7. The erp_journal_balance_check trigger fires AFTER INSERT. If you insert
   journal entries one at a time, it fires after each one and will fail until
   all entries are inserted. Use a single transaction with multiple INSERTs,
   or insert all entries before the trigger validation window.
   Alternatively, modify the trigger to only fire when all entries for a
   transaction are present (check count vs expected).

8. erp_task_events.status check constraint:
   CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
   Using 'processed' silently fails the UPDATE (no error, just 0 rows updated).
   Always use 'completed'.
