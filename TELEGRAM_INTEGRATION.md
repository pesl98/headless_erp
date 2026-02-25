# Telegram & OpenClaw Integration

This document explains how external agents — a Telegram bot and the OpenClaw AI assistant — connect to the Headless ERP system.

---

## Overview

The ERP system exposes two external entry points for human interaction:

| Channel | Technology | Best for |
|---------|-----------|---------|
| **Telegram Bot** (Concierge Agent) | Supabase Edge Function + Claude Opus | End-customers placing orders via chat |
| **OpenClaw** | Local AI assistant with direct DB access | Operators, developers, internal staff |

Both channels funnel into the same internal pipeline: the `inbound-order` Edge Function creates a draft sales order and queues an `ORDER_NEGOTIATION` task event. The `sales-agent` Edge Function then picks it up automatically every 5 minutes.

```
  Telegram User         concierge-bot          inbound-order
  ─────────────►  (Edge Function)  ──────────► (Edge Function)
  (chat message)  Claude Opus 4.6               erp_sales_orders (draft)
                  Agentic loop                  erp_task_events  (pending)
                  5 DB tools                           │
                                                       ▼
  OpenClaw              Direct SQL            sales-agent (pg_cron x5min)
  ─────────────────────► queries  ──────────► erp_sales_orders (confirmed)
  (AI assistant)         REST calls            erp_task_events (INVOICE_CUSTOMER)
```

---

## Channel 1: Telegram Concierge Bot

### What it is
A Supabase Edge Function (`concierge-bot`) that acts as a Telegram webhook receiver. When a user sends a message to the bot, the function runs a multi-turn agentic loop powered by **Claude Opus 4.6 with adaptive thinking**.

### Setup
1. Create a bot via @BotFather on Telegram and copy the bot token
2. Set Supabase secrets:
   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC...
   ```
3. Register the webhook:
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/concierge-bot"
   ```
4. Open the bot in Telegram and send /start

### How it works

```
User message
     |
     v
concierge-bot (Edge Function)
     |
     |-- Load last 20 messages from erp_agent_message_history
     |
     |-- Show typing indicator (sendChatAction)
     |
     |-- Agentic loop (max 8 iterations, Claude Opus 4.6):
     |       search_products(query)         -> erp_products
     |       lookup_customer(email, name)   -> erp_customers
     |       check_inventory(sku)           -> erp_inventory
     |       get_pending_orders(email)      -> erp_sales_orders
     |       submit_order_request(...)      -> inbound-order Edge Function
     |
     |-- Save response to erp_agent_message_history
     |
     +-- sendMessage back to Telegram user
```

### Session management
Each Telegram chat_id maps to a deterministic UUID session:

```
session_id = "00000000-0000-4000-8000-" + hex(chat_id).padStart(12, "0")
```

The last 20 message turns are loaded from `erp_agent_message_history` on every request, giving the bot persistent conversation memory.

### Conversation flow example

```
User:  "I need 3 CPUs"
Bot:   [searches products] Found CPU-X86-001 Intel Xeon at $299. Want that one?
User:  "Yes. My email is alice@example.com"
Bot:   [looks up customer] Hi Alice! You are a Premium customer.
       Order summary:
       - 3x CPU-X86-001 Intel Xeon @ $299 = $897
       - Premium discount 5% = -$44.85
       - Total: $852.15
       Confirm? (yes/no)
User:  "yes"
Bot:   [submits order] Order received! Reference: 3F8A21BC
       Your sales team will review it shortly.
```

### Key design decisions
- **verify_jwt: false** — Telegram webhooks do not carry a Supabase JWT; the bot token itself is the authentication gate
- **Plain text only** — Telegram markdown renders inconsistently across clients; agent uses plain text with line breaks
- **Zero-trust rule** — the agent never says "confirmed" until submit_order_request returns `success: true`
- **4000 char limit** — responses truncated to stay within Telegram message size limit
- **Concierge agent registered in DB** — `erp_agents` row with role_name `concierge_agent` so it participates in the agent registry and can be tracked in the operator console

---

## Channel 2: OpenClaw (Local AI Assistant)

### What it is
OpenClaw is a local AI assistant with direct tool access: file system, shell commands, web fetch, and database queries. It acts as an **internal operator interface** for staff and developers who need to query, debug, or manage the ERP.

### Capabilities vs the Telegram bot

| Feature | Telegram Bot | OpenClaw |
|---------|-------------|---------|
| Customer-facing | Yes | Internal only |
| Multi-turn memory | DB-backed per chat_id | File-based sessions |
| Direct DB queries | Via tools only | Full SQL access |
| Run shell commands | No | Yes |
| All ERP tables | 5 tools only | All tables |
| Deploy Edge Functions | No | Yes |
| Cost per message | ~$0.02-0.05 (Opus API) | Local LLM (free) |

### Context file
Load `OPENCLAW_ERP_CONTEXT.md` at the start of each session. It contains:
- Supabase project URL and anon key
- All 14 table schemas with column descriptions and notes
- Common SQL query patterns (pending orders, low stock, queue status)
- inbound-order Edge Function API with example curl

### Placing an order via OpenClaw
```
curl -X POST https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/inbound-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "customer_email": "buyer@company.com",
    "customer_name": "John Buyer",
    "items": [{"sku": "SSD-NVM-002T", "quantity": 2}],
    "source": "openclaw"
  }'
```

### Triggering the sales agent manually
```
curl -X POST https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/sales-agent
```

### Example OpenClaw prompts and queries

**Check pending task queue:**
```sql
SELECT event_type, target_agent, status,
       payload->>'customer_email' AS customer,
       payload->>'estimated_value' AS value,
       created_at
FROM erp_task_events
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC;
```

**Check stock levels:**
```sql
SELECT p.stock_keeping_unit, p.product_name,
       i.current_quantity_available, i.reorder_point
FROM erp_inventory i
JOIN erp_products p ON p.product_id = i.product_id
WHERE i.current_quantity_available <= i.reorder_point;
```

**Manually confirm a draft order (skip the agent):**
```sql
UPDATE erp_sales_orders
SET order_status = 'confirmed'
WHERE sales_order_id = '<uuid>'
  AND order_status = 'draft';
```

---

## The Automated Sales Agent

Once an order enters the queue via either channel, the `sales-agent` Edge Function processes it automatically every 5 minutes via pg_cron.

### Processing logic

```
For each pending ORDER_NEGOTIATION event:

  1. Mark event as 'processing'       (prevents double-processing)
  2. Verify order is still 'draft'
  3. Check inventory                  (all items must have sufficient stock)
  4. Check credit limit               (balance + order <= customer limit)
  5. Apply tier discount:
       standard -> 0%
       premium  -> 5%
       vip      -> 10%
  6. UPDATE order: status='confirmed', discount=X%, value=discounted

        DB trigger fires automatically:
        - erp_inventory.current_quantity_available -= quantity
        - INSERT erp_task_events (INVOICE_CUSTOMER -> finance_agent)

  7. Update customer.current_balance
  8. Mark event as 'processed'

  On any failure:
  - Mark event as 'failed' + error_message
  - Human or OpenClaw resolves and re-queues
```

### Scheduling
```
pg_cron every 5 minutes
  -> pg_net HTTP POST
  -> sales-agent Edge Function
  -> processes up to 20 events per run
```

### Manual trigger
```
curl -X POST https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/sales-agent
```

---

## End-to-End Order Flow (Telegram)

```
Step 1 — Customer (Telegram)
  "I want 2x 2TB NVMe drives"

Step 2 — Concierge Bot (Claude Opus 4.6)
  search_products("nvme") -> SSD-NVM-002T at $199
  check_inventory("SSD-NVM-002T") -> 45 available
  lookup_customer("alice@example.com") -> Premium tier
  Shows summary: 2x $199 = $398, 5% discount -> $378.10
  User confirms -> submit_order_request(...)

Step 3 — inbound-order Edge Function
  Finds customer Alice (Premium)
  Creates erp_sales_orders (draft, value: $398)
  Creates erp_sales_order_items (2x SSD-NVM-002T)
  Inserts erp_task_events (ORDER_NEGOTIATION, priority: 8)
  Returns { success: true, reference: "68A217AE" }

Step 4 — Bot replies to Telegram
  "Order received! Reference: 68A217AE"

Step 5 — sales-agent (within 5 min, pg_cron)
  Stock check: 45 >= 2 OK
  Credit check: balance + $378.10 <= limit OK
  Applies 5% Premium discount -> $378.10
  UPDATE erp_sales_orders SET status='confirmed', discount=5%, value=378.10

Step 6 — DB trigger (automatic)
  erp_inventory: quantity -= 2 (now 43)
  INSERT erp_task_events (INVOICE_CUSTOMER -> finance_agent)

Step 7 — finance_agent (future)
  Generates invoice, posts journal entries, updates GL
```

---

## Deployed Edge Functions Summary

| Function | Endpoint | Triggered by | Purpose |
|----------|----------|-------------|---------|
| `inbound-order` | /functions/v1/inbound-order | Portal, Telegram bot, OpenClaw | Creates draft order + task event |
| `concierge-bot` | /functions/v1/concierge-bot | Telegram webhook | AI chat -> order intake |
| `sales-agent` | /functions/v1/sales-agent | pg_cron every 5 min | Reviews + confirms draft orders |

---

## Relevant Database Tables

| Table | Purpose |
|-------|---------|
| `erp_task_events` | Central task queue — orders wait here as ORDER_NEGOTIATION |
| `erp_sales_orders` | Order lifecycle: draft -> confirmed -> invoiced -> paid |
| `erp_sales_order_items` | Line items (line_total is a generated column) |
| `erp_products` | Product catalogue searched by concierge agent |
| `erp_inventory` | Stock levels checked before confirming orders |
| `erp_customers` | Customer lookup, tier, credit limit |
| `erp_agents` | Agent registry — concierge_agent row links to message history |
| `erp_agent_message_history` | Telegram conversation memory (keyed by session_id from chat_id) |
