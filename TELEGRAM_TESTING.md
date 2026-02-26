# Telegram Concierge Bot — Test Script

> **Bot model:** Claude Opus 4.6 (adaptive thinking, max 8 agentic iterations)
> **Full pipeline target:** draft → confirmed → invoiced in under 5 seconds
> **Supabase project:** `rdlxbyrgwofzjxlqbdcc`

---

## Prerequisites

### 1. Confirm the webhook is registered

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

Expected response:
```json
{
  "ok": true,
  "result": {
    "url": "https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/concierge-bot",
    "has_custom_certificate": false,
    "pending_update_count": 0
  }
}
```

If `url` is empty, re-register:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/concierge-bot"}'
```

### 2. Find your bot

Search for your bot's username in Telegram (e.g. `@YourERPConciergeBot`) and open a chat.

### 3. Live product catalogue (real SKUs)

| SKU | Product | Price |
|-----|---------|-------|
| `CPU-X86-001` | Intel Core i9 Processor | €520.00 |
| `MEM-DDR5-032` | 32GB DDR5 RAM Module | €145.00 |
| `SSD-NVM-002T` | 2TB NVMe SSD Drive | €199.00 |
| `BIO-VAC-ALPHA` | BioVax Alpha Vaccine | €89.00 |
| `CHM-REAGENT-A` | Chemical Reagent Type A | €28.00 |
| `PKG-BOX-LG` | Large Shipping Box (50cm³) | €3.50 |

### 4. Known test customers

| Email | Tier | Notes |
|-------|------|-------|
| `procurement@techcorp.de` | Platinum | High credit limit |
| `orders@medtech.ch` | Gold | |
| `buying@startupind.nl` | Standard | |
| `peter@test.com` | Standard | Dev test account |

---

## Test Cases

---

### TC-01 — Bot greeting (`/start`)

**Message to send:**
```
/start
```

**Expected bot response:**
> Hello [Name]! I'm the Concierge Agent for our ERP system.
> I can help you: Browse our product catalogue / Check stock levels / Place orders.
> Just tell me what you're looking for!

**Pass criteria:**
- Responds within 3 seconds
- No tool calls are made (no DB query needed)
- Greeting includes your Telegram first name

---

### TC-02 — Product search by category

**Message to send:**
```
What electronics do you have in stock?
```

**Expected bot behaviour:**
1. Calls `search_products` with query `"Electronics"`
2. Returns results for `CPU-X86-001` and `MEM-DDR5-032`

**Expected bot response (example):**
> We have two electronics products available:
> - **Intel Core i9 Processor** (CPU-X86-001) — €520.00
> - **32GB DDR5 RAM Module** (MEM-DDR5-032) — €145.00
> Would you like to check stock or place an order?

**Pass criteria:**
- Both electronics products listed
- Prices correct
- Bot offers a natural next step

---

### TC-03 — Inventory check by SKU

**Message to send:**
```
How many i9 processors do you have available?
```

**Expected bot behaviour:**
1. Calls `search_products` to resolve "i9 processors" → `CPU-X86-001`
2. Calls `check_inventory` with `sku: "CPU-X86-001"`
3. Reports `quantity_on_hand - quantity_reserved`

**Expected bot response (example):**
> We currently have **X units** of the Intel Core i9 Processor (CPU-X86-001) available.

**Pass criteria:**
- Returns a specific number (not an error)
- Does not hallucinate a quantity

**Verify in DB:**
```sql
SELECT quantity_on_hand, quantity_reserved,
       quantity_on_hand - quantity_reserved AS available
FROM erp_inventory
WHERE stock_keeping_unit = 'CPU-X86-001';
```

---

### TC-04 — Known customer lookup

**Message to send:**
```
Can you look up account procurement@techcorp.de for me?
```

**Expected bot behaviour:**
1. Calls `lookup_customer` with `email: "procurement@techcorp.de"`
2. Returns tier (Platinum), credit limit, current balance

**Expected bot response (example):**
> TechCorp GmbH is a **Platinum** account with a credit limit of €X and a current balance of €Y.

**Pass criteria:**
- Correct customer name returned
- Tier displayed as Platinum
- No sensitive data exposed beyond tier/status

---

### TC-05 — Full order flow (known platinum customer)

This is the primary end-to-end test. Run it in sequence — each message builds on the last.

**Step 1 — Express intent:**
```
I'd like to place an order for TechCorp GmbH
```
Bot should ask for items or offer to look up the account.

**Step 2 — Specify items:**
```
We need 2 x CPU-X86-001 and 4 x MEM-DDR5-032
```

**Expected bot behaviour:**
1. Calls `lookup_customer` → confirms TechCorp GmbH (Platinum)
2. Calls `check_inventory` for both SKUs
3. Calculates total: (2 × €520) + (4 × €145) = **€1,620.00**
4. Presents order summary and asks for confirmation

**Expected bot response (example):**
> Here's your order summary for TechCorp GmbH:
> - 2× Intel Core i9 Processor — €1,040.00
> - 4× 32GB DDR5 RAM Module — €580.00
>
> **Total: €1,620.00**
>
> Shall I submit this order? Reply **yes** to confirm.

**Step 3 — Confirm:**
```
yes
```

**Expected bot behaviour:**
1. Calls `submit_order_request` → POSTs to `inbound-order` Edge Function
2. `inbound-order` creates draft order + `ORDER_NEGOTIATION` event
3. Dispatch trigger fires `net.http_post` → `sales-agent` (~1s)
4. `sales-agent` confirms order → `erp_sales_order_confirmed_trigger` fires
5. `INVOICE_CUSTOMER` event emitted → `finance-agent` (~3s)
6. Finance agent posts DR 12000 / CR 41000 journal, advances to `invoiced`

**Expected bot response (example):**
> Your order has been submitted! Reference: **XXXXXXXX**
> Our team will process it shortly.

**Pass criteria:**
- Bot returns a reference ID (first 8 chars of event UUID, uppercased)
- Order reaches `invoiced` status within ~5 seconds

**Verify full pipeline in DB:**
```sql
-- 1. Check order reached 'invoiced'
SELECT sales_order_id, order_status, total_invoice_value, discount_percent
FROM erp_sales_orders
ORDER BY order_creation_date DESC
LIMIT 3;

-- 2. Check task events completed
SELECT event_type, status, processed_at
FROM erp_task_events
ORDER BY created_at DESC
LIMIT 4;

-- 3. Verify journal entries posted
SELECT ft.description, ft.source_type, je.account_code, je.amount, je.is_credit
FROM erp_financial_transactions ft
JOIN erp_journal_entries je ON je.transaction_id = ft.transaction_id
ORDER BY ft.created_at DESC
LIMIT 4;

-- 4. Check authorization log
SELECT authorizing_role, reason, created_at
FROM erp_authorization_logs
ORDER BY created_at DESC
LIMIT 2;
```

---

### TC-06 — New customer (first-time order)

**Message to send:**
```
Hi, I'm Alice from NewCo. I'd like to order 10 x PKG-BOX-LG. My email is alice@newco.io
```

**Expected bot behaviour:**
1. Calls `lookup_customer` → no customer found
2. Calls `check_inventory` for `PKG-BOX-LG`
3. Calculates total: 10 × €3.50 = **€35.00**
4. Presents summary, asks for confirmation
5. On `yes`: calls `submit_order_request` → `inbound-order` creates new customer record automatically (Standard tier, credit limit set to max(€175, €50,000))

**Pass criteria:**
- New customer created in `erp_customers` with `contact_email = 'alice@newco.io'`
- Order submitted and confirmed by sales-agent
- Full pipeline completes to `invoiced`

**Verify new customer created:**
```sql
SELECT customer_name, contact_email, customer_tier, maximum_credit_limit
FROM erp_customers
WHERE contact_email = 'alice@newco.io';
```

---

### TC-07 — Insufficient stock (edge case)

**Message to send:**
```
I need 99999 x CPU-X86-001 please
```

**Expected bot behaviour:**
1. Calls `check_inventory` for `CPU-X86-001`
2. Detects available quantity < 99999
3. Warns the user — does NOT submit the order

**Expected bot response (example):**
> Unfortunately we only have **X units** of the Intel Core i9 Processor in stock. Would you like to order a smaller quantity?

**Pass criteria:**
- Bot does NOT call `submit_order_request` for an unfillable quantity
- Bot offers an alternative (reduced quantity)

> **Note:** The sales-agent has a secondary constraint check — even if the bot submits, the agent may reject or adjust. This test verifies the concierge catches it first.

---

### TC-08 — Unknown SKU

**Message to send:**
```
I want to order 5 x FAKE-SKU-999
```

**Expected bot behaviour:**
1. Calls `search_products` with query `"FAKE-SKU-999"`
2. Finds no match
3. Does NOT call `submit_order_request`
4. Asks for clarification

**Expected bot response (example):**
> I couldn't find a product with SKU `FAKE-SKU-999`. Could you check the SKU, or would you like me to search by product name?

**Pass criteria:**
- No order submitted
- Bot does not hallucinate a product
- Bot offers to search by name

---

### TC-09 — Explicit confirmation required (no accidental orders)

**Message to send:**
```
Order 1 x SSD-NVM-002T for peter@test.com
```

Bot will present summary. Then respond with:
```
Looks good
```

**Expected bot behaviour:**
- Does NOT call `submit_order_request` — "looks good" is ambiguous
- Bot asks explicitly: "Would you like me to submit this order? Reply **yes** to confirm."

Then send:
```
yes
```

Bot should now submit.

**Pass criteria:**
- Order is only submitted after explicit `yes`
- Ambiguous affirmatives ("looks good", "sure", "ok maybe") should prompt re-confirmation
- This validates the `submit_order_request` tool description: *"Only call this after the customer has explicitly confirmed the order summary with 'yes'."*

---

### TC-10 — Conversation memory (session continuity)

Run this across two separate messages (not in the same flow as TC-05).

**Message 1:**
```
I'm interested in your pharmaceutical products
```

Bot will search and describe BioVax Alpha Vaccine.

**Message 2 (send 30 seconds later):**
```
How many are in stock?
```

**Expected bot behaviour:**
- Bot remembers the context from message 1 (`BIO-VAC-ALPHA`)
- Calls `check_inventory` with `sku: "BIO-VAC-ALPHA"` without asking for clarification
- Does NOT ask "which product do you mean?"

**Pass criteria:**
- Correct inventory returned for BioVax without re-specifying the SKU

**Verify session history stored:**
```sql
SELECT role, LEFT(content, 80) AS preview, created_at
FROM erp_agent_message_history
WHERE agent_id = '76ccc6c3-93a8-4102-958f-b93f4038534a'
ORDER BY created_at DESC
LIMIT 6;
```

---

## Pipeline Timing Reference

| Stage | Trigger | Target latency |
|-------|---------|---------------|
| Message received → bot response | Telegram webhook → concierge-bot | < 3s |
| Order submitted → draft order created | `inbound-order` Edge Function | < 500ms |
| Draft → confirmed | `sales-agent` (dispatch trigger) | ~1s |
| Confirmed → invoiced + journal posted | `finance-agent` (dispatch trigger) | ~3s |
| **Total end-to-end** | Telegram message → invoiced | **< 5s** |

---

## Diagnosing Failures

### Bot doesn't respond

1. Check webhook is set correctly (TC-01 prerequisite)
2. Check Edge Function logs in Supabase dashboard → Edge Functions → `concierge-bot` → Logs
3. Verify `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY` secrets are set:
   - Supabase dashboard → Edge Functions → Secrets

### Order stuck in `processing`

```sql
-- Find stuck events
SELECT event_id, event_type, status, created_at, error_message
FROM erp_task_events
WHERE status = 'processing'
ORDER BY created_at DESC;

-- Reset to pending for retry
UPDATE erp_task_events
SET status = 'pending'
WHERE status = 'processing'
  AND created_at < NOW() - INTERVAL '2 minutes';
```

### Order stuck in `confirmed` (finance-agent not firing)

```sql
-- Check for uninvoiced confirmed orders
SELECT sales_order_id, order_status, total_invoice_value
FROM erp_sales_orders
WHERE order_status = 'confirmed'
ORDER BY order_creation_date DESC;

-- Check for pending INVOICE_CUSTOMER events
SELECT event_id, status, error_message
FROM erp_task_events
WHERE event_type = 'INVOICE_CUSTOMER'
ORDER BY created_at DESC
LIMIT 5;
```

The pg_cron fallback will retry any stuck events within 5 minutes.

### Journal balance error

If the finance-agent returns `Journal post failed`:

```sql
-- Check journal trigger is deferrable
SELECT tgname, tgdeferrable, tginitdeferred
FROM pg_trigger
WHERE tgname = 'erp_journal_balance_check';

-- Expected: tgdeferrable = true, tginitdeferred = true
```

If not deferrable, re-apply the migration:
```sql
DROP TRIGGER IF EXISTS erp_journal_balance_check ON erp_journal_entries;
CREATE CONSTRAINT TRIGGER erp_journal_balance_check
  AFTER INSERT OR UPDATE OR DELETE ON erp_journal_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_journal_balance();
```

---

## Quick Smoke Test (30 seconds)

Send these three messages in sequence and verify the pipeline:

```
1. /start
2. What storage products do you have?
3. Order 1 x SSD-NVM-002T for peter@test.com — yes
```

Then run:
```sql
SELECT order_status FROM erp_sales_orders ORDER BY order_creation_date DESC LIMIT 1;
-- Expected: invoiced
```

If you see `invoiced` within 5 seconds of sending message 3, the entire pipeline is healthy.
