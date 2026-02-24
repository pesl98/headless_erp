import React from 'react'

interface MetricCardProps {
  label: string
  value: string | number
  sub?: string
  accent?: 'blue' | 'green' | 'amber' | 'red' | 'purple'
  icon?: React.ReactNode
  trend?: { value: number; label: string }
  animDelay?: number
}

const ACCENT_COLORS = {
  blue:   { primary: '#3b82f6', bg: 'rgba(59,130,246,0.07)',  border: 'rgba(59,130,246,0.2)' },
  green:  { primary: '#22c55e', bg: 'rgba(34,197,94,0.07)',   border: 'rgba(34,197,94,0.2)' },
  amber:  { primary: '#f59e0b', bg: 'rgba(245,158,11,0.07)',  border: 'rgba(245,158,11,0.2)' },
  red:    { primary: '#ef4444', bg: 'rgba(239,68,68,0.07)',   border: 'rgba(239,68,68,0.2)' },
  purple: { primary: '#a855f7', bg: 'rgba(168,85,247,0.07)',  border: 'rgba(168,85,247,0.2)' },
}

export function MetricCard({
  label,
  value,
  sub,
  accent = 'blue',
  icon,
  trend,
  animDelay = 0,
}: MetricCardProps) {
  const colors = ACCENT_COLORS[accent]

  return (
    <div
      className="erp-card anim-fade-up"
      style={{
        padding: '18px 20px',
        animationDelay: `${animDelay}ms`,
        borderColor: colors.border,
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${colors.primary}80, ${colors.primary}20, transparent)`,
          borderRadius: '6px 6px 0 0',
        }}
      />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--txt-muted)',
              marginBottom: 10,
            }}
          >
            {label}
          </div>

          <div
            className="num"
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: colors.primary,
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {value}
          </div>

          {sub && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--txt-secondary)',
                marginTop: 6,
                fontWeight: 400,
              }}
            >
              {sub}
            </div>
          )}

          {trend && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                marginTop: 8,
                padding: '2px 6px',
                background: trend.value >= 0
                  ? 'rgba(34,197,94,0.1)'
                  : 'rgba(239,68,68,0.1)',
                borderRadius: 3,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.65rem',
                  color: trend.value >= 0 ? '#22c55e' : '#ef4444',
                  fontWeight: 600,
                }}
              >
                {trend.value >= 0 ? '+' : ''}{trend.value}% {trend.label}
              </span>
            </div>
          )}
        </div>

        {icon && (
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colors.primary,
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
