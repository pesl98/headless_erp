'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Bot,
  BarChart3,
  Package,
  ShoppingCart,
  Users,
  ListOrdered,
  ShieldCheck,
  Cpu,
  Circle,
  ExternalLink,
} from 'lucide-react'

const NAV = [
  { href: '/',          label: 'Dashboard',  icon: LayoutDashboard, color: '#3b82f6' },
  { href: '/agents',    label: 'Agents',     icon: Bot,             color: '#a855f7' },
  { href: '/finance',   label: 'Finance',    icon: BarChart3,       color: '#22c55e' },
  { href: '/inventory', label: 'Inventory',  icon: Package,         color: '#f59e0b' },
  { href: '/sales',     label: 'Sales',      icon: ShoppingCart,    color: '#3b82f6' },
  { href: '/hr',        label: 'HR',         icon: Users,           color: '#a855f7' },
  { href: '/queue',     label: 'Queue',      icon: ListOrdered,     color: '#ef4444' },
  { href: '/rules',     label: 'Rules',      icon: ShieldCheck,     color: '#ef4444' },
]

export function Sidebar() {
  const pathname = usePathname()

  // Portal is full-width — hide sidebar there
  if (pathname === '/portal') return null

  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        height: '100%',
        background: 'var(--bg-void)',
        borderRight: '1px solid var(--border-dim)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        position: 'relative',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 16px 16px',
          borderBottom: '1px solid var(--border-dim)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: 'linear-gradient(135deg, #1e4a8f, #3b82f6)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Cpu size={16} color="#ffffff" />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: '#e2eaf5',
              }}
            >
              HEADLESS
            </div>
            <div
              style={{
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.55rem',
                letterSpacing: '0.1em',
                color: 'var(--txt-muted)',
                marginTop: 1,
              }}
            >
              ERP SYSTEM v2.4
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 12,
            padding: '5px 8px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <div
            className="active-pulse"
            style={{
              width: 6,
              height: 6,
              background: '#22c55e',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.6rem',
              letterSpacing: '0.1em',
              color: '#22c55e',
            }}
          >
            SYSTEM ONLINE
          </span>
        </div>
      </div>

      {/* Nav section label */}
      <div
        style={{
          padding: '14px 16px 6px',
        }}
      >
        <span className="label" style={{ fontSize: '0.58rem' }}>
          MODULES
        </span>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
        {NAV.map(({ href, label, icon: Icon, color }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 5,
                marginBottom: 2,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
                background: isActive
                  ? `rgba(59,130,246,0.12)`
                  : 'transparent',
                border: isActive
                  ? `1px solid rgba(59,130,246,0.25)`
                  : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              <Icon
                size={15}
                color={isActive ? '#3b82f6' : 'var(--txt-muted)'}
                style={{ flexShrink: 0 }}
              />
              <span
                style={{
                  fontFamily: 'var(--font-barlow, sans-serif)',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? '#e2eaf5' : 'var(--txt-secondary)',
                  letterSpacing: '0.01em',
                }}
              >
                {label}
              </span>
              {isActive && (
                <div
                  style={{
                    marginLeft: 'auto',
                    width: 3,
                    height: 14,
                    background: '#3b82f6',
                    borderRadius: 2,
                  }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      {/* External Portal link */}
      <div style={{ padding: '8px 8px 4px', borderTop: '1px solid var(--border-dim)' }}>
        <div style={{ padding: '6px 16px 4px' }}>
          <span className="label" style={{ fontSize: '0.58rem' }}>EXTERNAL</span>
        </div>
        <Link
          href="/portal"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            borderRadius: 5,
            marginBottom: 2,
            textDecoration: 'none',
            border: '1px solid transparent',
            background: pathname === '/portal' ? 'rgba(34,197,94,0.1)' : 'transparent',
          }}
        >
          <ExternalLink size={15} color="#22c55e" style={{ flexShrink: 0 }} />
          <span
            style={{
              fontFamily: 'var(--font-barlow, sans-serif)',
              fontSize: '0.8125rem',
              fontWeight: 400,
              color: '#22c55e',
              letterSpacing: '0.01em',
            }}
          >
            Customer Portal
          </span>
        </Link>
      </div>

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid var(--border-dim)',
          padding: '12px 16px',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.58rem',
            color: 'var(--txt-muted)',
            letterSpacing: '0.06em',
            marginBottom: 8,
          }}
        >
          SUPABASE / POSTGRESQL
        </div>

        {/* Status indicators */}
        {[
          { label: 'Database', ok: true },
          { label: 'Agent Runtime', ok: true },
          { label: 'pgmq Queue', ok: true },
        ].map(({ label, ok }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
            }}
          >
            <Circle
              size={5}
              fill={ok ? '#22c55e' : '#ef4444'}
              color="transparent"
            />
            <span
              style={{
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.6rem',
                color: ok ? '#22c55e' : '#ef4444',
                letterSpacing: '0.06em',
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}
