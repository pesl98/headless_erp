'use client'

import { useState } from 'react'

type Product = {
  product_id: string
  stock_keeping_unit: string
  product_name: string
  standard_sale_price: number
  category: string
  requires_refrigeration: boolean
}

type SuccessData = {
  reference: string
  estimated_value: number
  item_count: number
  is_known_customer: boolean
  customer_tier: string
  submitted_at: string
}

const EDGE_FN_URL =
  'https://rdlxbyrgwofzjxlqbdcc.supabase.co/functions/v1/inbound-order'

const CATEGORY_COLOR: Record<string, string> = {
  Electronics:  '#3b82f6',
  Chemicals:    '#f59e0b',
  Biologics:    '#a855f7',
  Materials:    '#22c55e',
}

function fmt(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function OrderForm({ products }: { products: Product[] }) {
  const [cart, setCart]                 = useState<Record<string, number>>({})
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setEmail]       = useState('')
  const [notes, setNotes]               = useState('')
  const [status, setStatus]             = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [successData, setSuccessData]   = useState<SuccessData | null>(null)
  const [errorMsg, setErrorMsg]         = useState('')

  const cartItems = Object.entries(cart).filter(([, qty]) => qty > 0)
  const estimatedTotal = cartItems.reduce((sum, [sku, qty]) => {
    const p = products.find((x) => x.stock_keeping_unit === sku)
    return sum + (p?.standard_sale_price ?? 0) * qty
  }, 0)

  function setQty(sku: string, qty: number) {
    setCart((prev) => ({ ...prev, [sku]: Math.max(0, qty) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (cartItems.length === 0) { setErrorMsg('Add at least one product.'); return }
    if (!customerEmail)          { setErrorMsg('Email is required.'); return }

    setStatus('submitting')
    setErrorMsg('')

    try {
      const res = await fetch(EDGE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name:  customerName || 'Guest',
          customer_email: customerEmail,
          notes,
          source: 'customer_portal',
          items: cartItems.map(([sku, quantity]) => ({ sku, quantity })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setSuccessData({
        reference:         data.reference,
        estimated_value:   data.estimated_value,
        item_count:        data.item_count,
        is_known_customer: data.is_known_customer,
        customer_tier:     data.customer_tier,
        submitted_at:      data.submitted_at,
      })
      setStatus('success')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
    }
  }

  /* ── SUCCESS STATE ─────────────────────────────────────────── */
  if (status === 'success' && successData) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 24px 60px' }}>
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderTop: '3px solid #22c55e',
            borderRadius: 10,
            padding: '40px 36px',
            textAlign: 'center',
          }}
        >
          {/* Check icon */}
          <div
            style={{
              width: 56, height: 56,
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: 26,
            }}
          >
            ✓
          </div>

          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#e2eaf5', marginBottom: 6 }}>
            Order Request Submitted
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--txt-secondary)', marginBottom: 32 }}>
            Your request has been queued and will be processed by our sales agent.
          </div>

          {/* Reference card */}
          <div
            style={{
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-dim)',
              borderRadius: 8,
              padding: '20px 24px',
              marginBottom: 28,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px 32px',
              textAlign: 'left',
            }}
          >
            {[
              { label: 'REFERENCE',   value: `#${successData.reference}`,         color: '#3b82f6' },
              { label: 'EST. VALUE',  value: fmt(successData.estimated_value),     color: '#22c55e' },
              { label: 'ITEMS',       value: `${successData.item_count} product${successData.item_count !== 1 ? 's' : ''}`, color: '#e2eaf5' },
              { label: 'TIER',        value: successData.customer_tier.toUpperCase(), color: successData.is_known_customer ? '#f59e0b' : 'var(--txt-muted)' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', marginBottom: 4 }}>
                  {label}
                </div>
                <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.9rem', color, fontWeight: 600 }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--txt-muted)', marginBottom: 28 }}>
            {successData.is_known_customer
              ? `You're a recognised customer. Your order has been assigned higher priority.`
              : `A sales agent will review your request and follow up at ${customerEmail}.`}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => {
                setCart({}); setCustomerName(''); setEmail(''); setNotes('')
                setSuccessData(null); setStatus('idle')
              }}
              style={{
                padding: '10px 20px',
                background: 'var(--bg-panel)',
                border: '1px solid var(--border-dim)',
                borderRadius: 6,
                color: 'var(--txt-secondary)',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                fontFamily: 'var(--font-barlow, sans-serif)',
              }}
            >
              New Order
            </button>
            <a
              href="/queue"
              style={{
                padding: '10px 20px',
                background: 'rgba(59,130,246,0.12)',
                border: '1px solid rgba(59,130,246,0.3)',
                borderRadius: 6,
                color: '#3b82f6',
                fontSize: '0.8125rem',
                textDecoration: 'none',
                fontFamily: 'var(--font-barlow, sans-serif)',
                fontWeight: 600,
              }}
            >
              View Queue →
            </a>
          </div>
        </div>
      </div>
    )
  }

  /* ── ORDER FORM ─────────────────────────────────────────────── */
  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 60px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Customer details */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderTop: '2px solid #3b82f6', borderRadius: 8, padding: '20px 20px' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', marginBottom: 14 }}>
              YOUR DETAILS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', letterSpacing: '0.06em', marginBottom: 6 }}>
                  NAME (OPTIONAL)
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Your name or company"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', letterSpacing: '0.06em', marginBottom: 6 }}>
                  EMAIL <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          {/* Product catalogue */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderTop: '2px solid #3b82f6', borderRadius: 8, padding: '20px 20px' }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', marginBottom: 14 }}>
              SELECT PRODUCTS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {products.map((p) => {
                const qty = cart[p.stock_keeping_unit] ?? 0
                const selected = qty > 0
                const catColor = CATEGORY_COLOR[p.category] ?? '#7a9abf'
                return (
                  <div
                    key={p.stock_keeping_unit}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 6,
                      border: `1px solid ${selected ? 'rgba(59,130,246,0.3)' : 'var(--border-dim)'}`,
                      background: selected ? 'rgba(59,130,246,0.06)' : 'var(--bg-panel)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {/* Selection dot */}
                      <div
                        style={{
                          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                          background: selected ? '#3b82f6' : 'var(--border)',
                          border: `2px solid ${selected ? '#3b82f6' : 'var(--border-dim)'}`,
                          transition: 'all 0.15s ease',
                        }}
                      />
                      {/* Product info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', color: '#7a9abf' }}>
                            {p.stock_keeping_unit}
                          </span>
                          <span style={{
                            fontSize: '0.58rem', fontFamily: 'var(--font-ibm-mono, monospace)',
                            color: catColor, padding: '1px 5px',
                            background: `${catColor}18`, border: `1px solid ${catColor}30`,
                            borderRadius: 3, letterSpacing: '0.06em',
                          }}>
                            {p.category.toUpperCase()}
                          </span>
                          {p.requires_refrigeration && (
                            <span style={{ fontSize: '0.58rem', color: '#3b82f6', fontFamily: 'var(--font-ibm-mono, monospace)' }}>❄ COLD</span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#e2eaf5', fontWeight: 500, marginTop: 3 }}>
                          {p.product_name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.78rem', color: '#22c55e', marginTop: 2 }}>
                          {fmt(p.standard_sale_price)} / unit
                        </div>
                      </div>
                      {/* Qty controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        {qty > 0 ? (
                          <>
                            <button type="button" onClick={() => setQty(p.stock_keeping_unit, qty - 1)} style={qtyBtnStyle}>−</button>
                            <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.85rem', color: '#e2eaf5', minWidth: 28, textAlign: 'center' }}>
                              {qty}
                            </span>
                            <button type="button" onClick={() => setQty(p.stock_keeping_unit, qty + 1)} style={{ ...qtyBtnStyle, borderColor: 'rgba(59,130,246,0.4)', color: '#3b82f6' }}>+</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setQty(p.stock_keeping_unit, 1)} style={addBtnStyle}>
                            + Add
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-dim)', borderRadius: 8, padding: '16px 20px' }}>
            <label style={{ display: 'block', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', marginBottom: 8 }}>
              NOTES / SPECIAL REQUIREMENTS (OPTIONAL)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery requirements, preferred timeline, special instructions…"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>
        </div>

        {/* ── RIGHT COLUMN — ORDER SUMMARY ── */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-dim)',
            borderTop: '2px solid #22c55e', borderRadius: 8, padding: '20px',
          }}>
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.12em', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)', marginBottom: 14 }}>
              ORDER SUMMARY
            </div>

            {cartItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--txt-muted)', fontSize: '0.8125rem' }}>
                No products selected yet.
                <br />
                <span style={{ fontSize: '0.75rem' }}>Add items from the catalogue.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {cartItems.map(([sku, qty]) => {
                  const p = products.find((x) => x.stock_keeping_unit === sku)!
                  return (
                    <div key={sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', color: '#7a9abf' }}>{sku}</div>
                        <div style={{ fontSize: '0.78rem', color: '#e2eaf5', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.product_name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--txt-muted)', marginTop: 1 }}>
                          {fmt(p.standard_sale_price)} × {qty}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.85rem', color: '#22c55e', fontWeight: 600, flexShrink: 0 }}>
                        {fmt(p.standard_sale_price * qty)}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {cartItems.length > 0 && (
              <>
                <div style={{ height: 1, background: 'var(--border-dim)', margin: '12px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--txt-secondary)' }}>Est. Total</span>
                  <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '1.1rem', color: '#22c55e', fontWeight: 700 }}>
                    {fmt(estimatedTotal)}
                  </span>
                </div>
              </>
            )}

            {/* Info notice */}
            <div style={{
              background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)',
              borderRadius: 6, padding: '10px 12px', marginBottom: 16,
              fontSize: '0.72rem', color: 'var(--txt-secondary)', lineHeight: 1.5,
            }}>
              Prices are indicative. Final pricing confirmed by the sales agent after review.
            </div>

            {/* Error */}
            {(status === 'error' || errorMsg) && (
              <div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 6, padding: '10px 12px', marginBottom: 12,
                fontSize: '0.78rem', color: '#ef4444',
              }}>
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={status === 'submitting' || cartItems.length === 0}
              style={{
                width: '100%', padding: '12px',
                background: status === 'submitting' || cartItems.length === 0
                  ? 'rgba(59,130,246,0.15)'
                  : 'rgba(59,130,246,0.2)',
                border: `1px solid ${cartItems.length === 0 ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.4)'}`,
                borderRadius: 7,
                color: cartItems.length === 0 ? 'var(--txt-muted)' : '#3b82f6',
                fontSize: '0.875rem', fontWeight: 600,
                fontFamily: 'var(--font-barlow, sans-serif)',
                cursor: status === 'submitting' || cartItems.length === 0 ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
                letterSpacing: '0.02em',
              }}
            >
              {status === 'submitting' ? 'Submitting…' : 'Submit Order Request →'}
            </button>

            <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.68rem', color: 'var(--txt-muted)', fontFamily: 'var(--font-ibm-mono, monospace)' }}>
              ROUTED TO SALES AGENT · APEX
            </div>
          </div>
        </div>
      </div>
    </form>
  )
}

/* ── Shared input style ─────────────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-dim)',
  borderRadius: 6,
  color: '#e2eaf5',
  fontSize: '0.8125rem',
  fontFamily: 'var(--font-barlow, sans-serif)',
  outline: 'none',
  boxSizing: 'border-box',
}

const qtyBtnStyle: React.CSSProperties = {
  width: 28, height: 28,
  background: 'var(--bg-card)',
  border: '1px solid var(--border-dim)',
  borderRadius: 5,
  color: 'var(--txt-secondary)',
  fontSize: '1rem', lineHeight: 1,
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
}

const addBtnStyle: React.CSSProperties = {
  padding: '5px 12px',
  background: 'rgba(59,130,246,0.1)',
  border: '1px solid rgba(59,130,246,0.25)',
  borderRadius: 5,
  color: '#3b82f6',
  fontSize: '0.75rem', fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'var(--font-barlow, sans-serif)',
  whiteSpace: 'nowrap',
}
