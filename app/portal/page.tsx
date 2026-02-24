import { supabase } from '@/lib/supabase'
import { OrderForm } from '@/components/portal/OrderForm'

export const revalidate = 300

async function getProducts() {
  const { data } = await supabase
    .from('erp_products')
    .select('product_id, stock_keeping_unit, product_name, standard_sale_price, category, requires_refrigeration')
    .order('category')
  return data ?? []
}

export default async function PortalPage() {
  const products = await getProducts()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom: '1px solid var(--border-dim)',
          background: 'var(--bg-void)',
          padding: '0 24px',
          marginBottom: 32,
        }}
      >
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 0 24px' }}>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 14,
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.62rem',
              letterSpacing: '0.1em',
              color: 'var(--txt-muted)',
            }}
          >
            <span>HEADLESS ERP</span>
            <span style={{ color: 'var(--border)' }}>/</span>
            <span style={{ color: '#3b82f6' }}>CUSTOMER PORTAL</span>
          </div>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: '#e2eaf5',
                  fontFamily: 'var(--font-barlow, sans-serif)',
                  letterSpacing: '-0.01em',
                }}
              >
                Place an Order
              </h1>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: '0.875rem',
                  color: 'var(--txt-secondary)',
                  fontFamily: 'var(--font-barlow, sans-serif)',
                }}
              >
                Select products and submit your request. Your order will be routed directly to a sales agent for processing.
              </p>
            </div>

            {/* Live indicator */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 6,
                flexShrink: 0,
              }}
            >
              <div
                className="active-pulse"
                style={{
                  width: 7,
                  height: 7,
                  background: '#22c55e',
                  borderRadius: '50%',
                }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.62rem',
                  letterSpacing: '0.1em',
                  color: '#22c55e',
                }}
              >
                AGENTS ACTIVE
              </span>
            </div>
          </div>

          {/* Stats strip */}
          <div
            style={{
              display: 'flex',
              gap: 24,
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--border-dim)',
            }}
          >
            {[
              { label: 'PRODUCTS AVAILABLE', value: products.length.toString() },
              { label: 'SALES AGENT',         value: 'APEX' },
              { label: 'RESPONSE TIME',       value: '< 60s' },
              { label: 'CURRENCIES',          value: 'EUR' },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.58rem', color: 'var(--txt-muted)', letterSpacing: '0.1em', marginBottom: 3 }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.85rem', color: '#e2eaf5', fontWeight: 600 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Form ─────────────────────────────────────────────────── */}
      <OrderForm products={products} />

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: '1px solid var(--border-dim)',
          padding: '20px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.6rem',
            color: 'var(--txt-muted)',
            letterSpacing: '0.1em',
          }}
        >
          HEADLESS ERP · AUTONOMOUS ENTERPRISE OPERATING SYSTEM · SUPABASE / POSTGRESQL
        </div>
      </div>
    </div>
  )
}
