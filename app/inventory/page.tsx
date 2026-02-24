import { supabase } from '@/lib/supabase'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Package, Warehouse, Snowflake, AlertTriangle, CheckCircle } from 'lucide-react'

export const revalidate = 30

async function getInventoryData() {
  const [{ data: inventory }, { data: warehouses }, { data: suppliers }, { data: purchaseOrders }] = await Promise.all([
    supabase
      .from('erp_inventory')
      .select(`
        *,
        erp_products(product_name, stock_keeping_unit, requires_refrigeration, category, standard_unit_cost),
        erp_warehouses(facility_name, is_climate_controlled)
      `)
      .order('current_quantity_available'),
    supabase.from('erp_warehouses').select('*'),
    supabase.from('erp_suppliers').select('*').order('reliability_score', { ascending: false }),
    supabase
      .from('erp_purchase_orders')
      .select('*, erp_agents(display_name, avatar_emoji), erp_suppliers(company_name)')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return {
    inventory: inventory ?? [],
    warehouses: warehouses ?? [],
    suppliers: suppliers ?? [],
    purchaseOrders: purchaseOrders ?? [],
  }
}

export default async function InventoryPage() {
  const { inventory, warehouses, suppliers, purchaseOrders } = await getInventoryData()

  const alertCount = inventory.filter((i) => i.current_quantity_available <= i.reorder_point).length
  const totalSku = inventory.length

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 28 }}>
        <div className="label" style={{ marginBottom: 6 }}>SUPPLY CHAIN</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--txt-primary)', letterSpacing: '-0.02em', margin: 0 }}>
          Inventory & Procurement
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--txt-secondary)', marginTop: 5 }}>
          Real-time stock levels, reorder triggers, and autonomous buyer agent procurement queue
        </p>
      </div>

      {/* Warehouse cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 22 }}>
        {warehouses.map((wh, i) => (
          <div
            key={wh.warehouse_id}
            className={`erp-card anim-fade-up anim-delay-${i + 1}`}
            style={{ padding: '16px 18px' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Warehouse size={14} color={wh.is_climate_controlled ? '#3b82f6' : 'var(--txt-muted)'} />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#e2eaf5' }}>
                  {wh.facility_name}
                </span>
              </div>
              {wh.is_climate_controlled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 7px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 3 }}>
                  <Snowflake size={10} color="#3b82f6" />
                  <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.6rem', color: '#3b82f6', fontWeight: 700 }}>COLD</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div className="num" style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3b82f6' }}>
                  {Number(wh.maximum_capacity_volume).toLocaleString()}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--txt-muted)', marginTop: 2 }}>m³ capacity</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontSize: '0.8rem', color: 'var(--txt-secondary)' }}>
                  {inventory.filter((i) => (i.erp_warehouses as Record<string, unknown>)?.facility_name === wh.facility_name).length} SKUs
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stock levels table */}
      <div className="erp-card anim-fade-up anim-delay-2" style={{ marginBottom: 20 }}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Package size={13} color="#f59e0b" />
          <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
            Stock Levels
          </span>
          {alertCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 8, padding: '2px 8px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 3 }}>
              <AlertTriangle size={10} color="#ef4444" />
              <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', color: '#ef4444', fontWeight: 700 }}>
                {alertCount} REORDER ALERTS
              </span>
            </div>
          )}
          <span className="label" style={{ marginLeft: 'auto' }}>{totalSku} SKUs</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th>Category</th>
                <th>Warehouse</th>
                <th style={{ textAlign: 'right' }}>On Hand</th>
                <th style={{ textAlign: 'right' }}>Reorder At</th>
                <th style={{ textAlign: 'right' }}>Safety Stock</th>
                <th>Stock Status</th>
                <th style={{ textAlign: 'right' }}>Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((item) => {
                const product = item.erp_products as Record<string, unknown> | null
                const warehouse = item.erp_warehouses as Record<string, unknown> | null
                const isAlert = item.current_quantity_available <= item.reorder_point
                const isCritical = item.current_quantity_available <= item.calculated_safety_stock
                const stockPct = Math.min(
                  100,
                  (item.current_quantity_available / Math.max(item.max_stock_level, 1)) * 100
                )

                return (
                  <tr key={item.inventory_record_id} style={{ background: isCritical ? 'rgba(239,68,68,0.04)' : isAlert ? 'rgba(245,158,11,0.03)' : 'transparent' }}>
                    <td>
                      <span className="mono" style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
                        {product?.stock_keeping_unit as string}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {!!product?.requires_refrigeration && <Snowflake size={11} color="#3b82f6" />}
                        <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#e2eaf5' }}>
                          {product?.product_name as string}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>{product?.category as string ?? '—'}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>{warehouse?.facility_name as string}</span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="num" style={{ fontSize: '0.875rem', fontWeight: 700, color: isCritical ? '#ef4444' : isAlert ? '#f59e0b' : '#22c55e' }}>
                        {item.current_quantity_available.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="num" style={{ fontSize: '0.8rem', color: 'var(--txt-secondary)' }}>
                        {item.reorder_point}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="num" style={{ fontSize: '0.8rem', color: 'var(--txt-muted)' }}>
                        {item.calculated_safety_stock}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          {isCritical ? (
                            <AlertTriangle size={11} color="#ef4444" />
                          ) : isAlert ? (
                            <AlertTriangle size={11} color="#f59e0b" />
                          ) : (
                            <CheckCircle size={11} color="#22c55e" />
                          )}
                          <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.6rem', fontWeight: 700, color: isCritical ? '#ef4444' : isAlert ? '#f59e0b' : '#22c55e' }}>
                            {isCritical ? 'CRITICAL' : isAlert ? 'REORDER' : 'OK'}
                          </span>
                        </div>
                        <div className="erp-bar" style={{ width: 80 }}>
                          <div
                            className="erp-bar-fill"
                            style={{
                              width: `${stockPct}%`,
                              background: isCritical ? '#ef4444' : isAlert ? '#f59e0b' : '#22c55e',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="num" style={{ fontSize: '0.8rem', color: 'var(--txt-secondary)' }}>
                        €{Number(product?.standard_unit_cost ?? 0).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suppliers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="erp-card anim-fade-up anim-delay-3">
          <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)' }}>
            <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
              Supplier Directory
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Terms</th>
                  <th style={{ textAlign: 'center' }}>Lead (days)</th>
                  <th style={{ textAlign: 'right' }}>Reliability</th>
                  <th style={{ textAlign: 'center' }}>Preferred</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.supplier_id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2eaf5' }}>{s.company_name}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--txt-muted)', marginTop: 1 }}>{s.contact_email}</div>
                    </td>
                    <td><span className="mono" style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>{s.payment_terms}</span></td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="num" style={{ fontSize: '0.8rem', color: s.lead_time_days <= 7 ? '#22c55e' : s.lead_time_days <= 14 ? '#f59e0b' : '#ef4444' }}>
                        {s.lead_time_days}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                        <span className="num" style={{ fontSize: '0.8rem', color: Number(s.reliability_score) >= 0.95 ? '#22c55e' : Number(s.reliability_score) >= 0.85 ? '#f59e0b' : '#ef4444' }}>
                          {(Number(s.reliability_score) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', color: s.is_preferred ? '#22c55e' : 'var(--txt-muted)' }}>
                        {s.is_preferred ? '★ YES' : '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Purchase Orders */}
        <div className="erp-card anim-fade-up anim-delay-4">
          <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)' }}>
            <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
              Purchase Orders
            </span>
          </div>
          {purchaseOrders.length === 0 ? (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--txt-muted)', fontSize: '0.8125rem' }}>
              No purchase orders yet
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>PO ID</th>
                    <th>Supplier</th>
                    <th>Agent</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseOrders.map((po) => {
                    const agent = (po as Record<string, unknown>).erp_agents as { display_name: string; avatar_emoji: string } | null
                    const supplier = (po as Record<string, unknown>).erp_suppliers as { company_name: string } | null
                    return (
                      <tr key={po.purchase_order_id}>
                        <td><span className="mono" style={{ fontSize: '0.7rem', color: 'var(--txt-muted)' }}>{po.purchase_order_id.slice(0, 8)}…</span></td>
                        <td><span style={{ fontSize: '0.8rem' }}>{supplier?.company_name ?? '—'}</span></td>
                        <td>
                          <span style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>
                            {agent?.avatar_emoji} {agent?.display_name}
                          </span>
                        </td>
                        <td><StatusBadge status={po.order_status} size="xs" /></td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="num" style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
                            €{Number(po.total_order_value).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
