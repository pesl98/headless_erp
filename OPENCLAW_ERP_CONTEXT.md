# Headless ERP — OpenClaw Context

This file is loaded into OpenClaw's memory so it can interact with the ERP system.

## Connection Details

- **Supabase URL**: `https://rdlxbyrgwofzjxlqbdcc.supabase.co`
- **Anon key** (read-only, safe for queries): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkbHhieXJnd29memp4bHFiZGNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NjgyODgsImV4cCI6MjA4NzM0NDI4OH0.4m3qm47sXD3XxBPegOKlmGTOytdE4CzTjUKcvdD6dsU`
- **Service role key**: stored in environment as `SUPABASE_SERVICE_ROLE_KEY` — needed for writes and Edge Function calls

---

## How to Place a Customer Order

Call the `inbound-order` Edge Function. This is the **only correct way** to create a sales order — it handles customer lookup/creation, inventory checks, draft order creation, and task queue insertion atomically.

```bash
curl -X POST https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/inbound-order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -d '{
    "customer_email": "alice@example.com",
    "customer_name": "Alice Smith",
    "items": [
      { "sku": "CPU-X86-001", "quantity": 2 },
      { "sku": "RAM-DDR5-032", "quantity": 4 }
    ],
    "notes": "Urgent delivery please",
    "source": "openclaw"
  }'
```

**Returns:**
```json
{
  "success": true,
  "event_id": "uuid",
  "sales_order_id": "uuid",
  "reference": "ABCD1234",
  "estimated_value": 1250.00,
  "item_count": 2,
  "is_known_customer": true,
  "customer_tier": "premium"
}
```

**Rules:**
- `customer_email` and `items` (at least one) are required
- `items[].sku` must match `erp_products.stock_keeping_unit` exactly
- New customers are auto-created with a generous credit limit for the agent to review
- The function creates: customer record + draft `erp_sales_orders` + `erp_sales_order_items` + `erp_task_events` (ORDER_NEGOTIATION)

---

## Key Tables

### Products — `erp_products`
```sql
SELECT stock_keeping_unit, product_name, category, standard_sale_price, is_active
FROM erp_products
WHERE is_active = true
ORDER BY category, product_name;
```
| Column | Type | Notes |
|--------|------|-------|
| `stock_keeping_unit` | varchar | **Primary lookup key** — use in order items |
| `product_name` | varchar | Human-readable name |
| `category` | varchar | Product category |
| `standard_sale_price` | numeric | Price per unit |
| `standard_unit_cost` | numeric | Internal cost |
| `requires_refrigeration` | boolean | If true, must go to climate-controlled warehouse |
| `unit_of_measure` | varchar | e.g. UNIT, KG, LITRE |
| `is_active` | boolean | Only active products can be ordered |

### Inventory — `erp_inventory`
```sql
SELECT p.stock_keeping_unit, p.product_name,
       i.current_quantity_available, i.reorder_point, w.facility_name
FROM erp_inventory i
JOIN erp_products p ON p.product_id = i.product_id
JOIN erp_warehouses w ON w.warehouse_id = i.warehouse_id
ORDER BY i.current_quantity_available ASC;
```
| Column | Notes |
|--------|-------|
| `current_quantity_available` | Available stock (already net of reservations) |
| `reorder_point` | Triggers REORDER_TRIGGERED event when stock drops below this |
| `calculated_safety_stock` | Minimum buffer |

### Customers — `erp_customers`
```sql
SELECT customer_name, contact_email, customer_tier,
       maximum_credit_limit, current_balance, account_status
FROM erp_customers
WHERE account_status = 'active';
```
| Column | Notes |
|--------|-------|
| `customer_tier` | `standard` / `premium` / `vip` — affects discounts |
| `maximum_credit_limit` | Sales agent blocks orders exceeding this |
| `current_balance` | Outstanding balance |
| `account_status` | `active` / `suspended` / `closed` |

### Sales Orders — `erp_sales_orders`
```sql
SELECT so.sales_order_id, c.customer_name, so.order_status,
       so.total_invoice_value, so.order_creation_date
FROM erp_sales_orders so
JOIN erp_customers c ON c.customer_id = so.customer_id
ORDER BY so.order_creation_date DESC;
```
**Order status flow:** `draft` → `confirmed` → `invoiced` → `paid`

### Task Event Queue — `erp_task_events`
```sql
SELECT event_type, target_agent, status, priority, payload, created_at
FROM erp_task_events
WHERE status = 'pending'
ORDER BY priority DESC, created_at ASC;
```
| Event type | Target agent | Triggered by |
|------------|-------------|--------------|
| `ORDER_NEGOTIATION` | `sales_agent` | inbound-order Edge Function |
| `INVOICE_CUSTOMER` | `finance_agent` | sales order confirmed trigger |
| `REORDER_TRIGGERED` | `procurement_agent` | inventory drops below reorder_point |
| `PAYROLL_RUN` | `hr_payroll_agent` | pg_cron on 25th of month |
| `INVENTORY_CHECK` | `inventory_watcher` | pg_cron every 30 min |

### Agents — `erp_agents`
| role_name | display_name | authority_limit |
|-----------|-------------|----------------|
| `sales_agent` | Sales Agent | $25,000 |
| `finance_agent` | Finance Agent | $250,000 |
| `procurement_agent` | Procurement Agent | $50,000 |
| `hr_payroll_agent` | HR & Payroll Agent | $5,000 |
| `inventory_watcher` | Inventory Watcher | $0 |
| `logistics_agent` | Logistics Agent | $10,000 |
| `concierge_agent` | Concierge Agent | $0 |

### Suppliers — `erp_suppliers`
```sql
SELECT company_name, contact_email, lead_time_days,
       reliability_score, is_preferred, payment_terms
FROM erp_suppliers
WHERE is_active = true
ORDER BY reliability_score DESC;
```

### Warehouses — `erp_warehouses`
```sql
SELECT facility_name, is_climate_controlled,
       maximum_capacity_volume, current_used_volume
FROM erp_warehouses
WHERE is_active = true;
```
Note: `requires_refrigeration = true` products can only go to `is_climate_controlled = true` warehouses.

---

## Common Queries

**Check pending orders:**
```sql
SELECT c.customer_name, c.contact_email, so.total_invoice_value,
       so.order_status, so.order_creation_date
FROM erp_sales_orders so
JOIN erp_customers c ON c.customer_id = so.customer_id
WHERE so.order_status IN ('draft', 'pending_review')
ORDER BY so.order_creation_date DESC;
```

**Check low stock:**
```sql
SELECT p.stock_keeping_unit, p.product_name,
       i.current_quantity_available, i.reorder_point
FROM erp_inventory i
JOIN erp_products p ON p.product_id = i.product_id
WHERE i.current_quantity_available <= i.reorder_point
ORDER BY i.current_quantity_available ASC;
```

**See what's in the task queue:**
```sql
SELECT event_type, target_agent, status, priority,
       created_at, processed_at
FROM erp_task_events
ORDER BY priority DESC, created_at DESC
LIMIT 20;
```

**Get order line items:**
```sql
SELECT so.sales_order_id, c.customer_name,
       p.product_name, soi.quantity, soi.unit_price, soi.line_total
FROM erp_sales_order_items soi
JOIN erp_sales_orders so ON so.sales_order_id = soi.sales_order_id
JOIN erp_products p ON p.product_id = soi.product_id
JOIN erp_customers c ON c.customer_id = so.customer_id
WHERE so.sales_order_id = '<uuid>';
```

---

## Operator Console (Next.js)

- **URL**: `http://localhost:3000` (dev) or deploy via Vercel
- Pages: `/` Dashboard · `/agents` · `/finance` · `/inventory` · `/sales` · `/hr` · `/queue`
- Data refreshes every 10 seconds (ISR revalidate)

---

## Architecture Notes

- **No RLS** — all tables are open (anon key can read everything). Service role needed for writes.
- **Double-entry trigger** — `erp_journal_entries` enforces Σ(DR) = Σ(CR) per transaction
- **Credit limit trigger** — blocks `erp_sales_orders` INSERT if `total_invoice_value > customer.maximum_credit_limit`
- **Cascade trigger** — confirming a sales order auto-deducts inventory and emits INVOICE_CUSTOMER event
- **Refrigeration trigger** — blocks assigning cold products to non-climate-controlled warehouses
