import React from 'react'

type StatusVariant =
  | 'active'
  | 'sleeping'
  | 'suspended'
  | 'terminated'
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'draft'
  | 'confirmed'
  | 'invoiced'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'returned'
  | 'approved'
  | 'ordered'
  | 'received'
  | 'on_hold'
  | 'gold'
  | 'platinum'
  | 'silver'
  | 'standard'
  | 'disbursed'
  | 'computed'
  | string

const CONFIGS: Record<
  string,
  { bg: string; color: string; dot: string; label?: string }
> = {
  active:       { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e', dot: '#22c55e' },
  sleeping:     { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6', dot: '#3b82f6' },
  suspended:    { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', dot: '#f59e0b' },
  terminated:   { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', dot: '#ef4444' },
  pending:      { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', dot: '#f59e0b' },
  processing:   { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6', dot: '#3b82f6' },
  completed:    { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e', dot: '#22c55e' },
  failed:       { bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', dot: '#ef4444' },
  draft:        { bg: 'rgba(61,90,122,0.2)',   color: '#7a9abf', dot: '#7a9abf' },
  confirmed:    { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6', dot: '#3b82f6' },
  invoiced:     { bg: 'rgba(168,85,247,0.1)',  color: '#a855f7', dot: '#a855f7' },
  shipped:      { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', dot: '#60a5fa' },
  delivered:    { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e', dot: '#22c55e' },
  cancelled:    { bg: 'rgba(239,68,68,0.08)',  color: '#f87171', dot: '#f87171' },
  returned:     { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', dot: '#f59e0b' },
  approved:     { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e', dot: '#22c55e' },
  ordered:      { bg: 'rgba(59,130,246,0.1)',  color: '#3b82f6', dot: '#3b82f6' },
  received:     { bg: 'rgba(34,197,94,0.12)',  color: '#4ade80', dot: '#4ade80' },
  on_hold:      { bg: 'rgba(245,158,11,0.1)',  color: '#f59e0b', dot: '#f59e0b' },
  gold:         { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', dot: '#f59e0b' },
  platinum:     { bg: 'rgba(59,130,246,0.12)', color: '#93c5fd', dot: '#93c5fd' },
  silver:       { bg: 'rgba(148,163,184,0.1)', color: '#94a3b8', dot: '#94a3b8' },
  standard:     { bg: 'rgba(61,90,122,0.15)',  color: '#7a9abf', dot: '#7a9abf' },
  disbursed:    { bg: 'rgba(34,197,94,0.1)',   color: '#22c55e', dot: '#22c55e' },
  computed:     { bg: 'rgba(168,85,247,0.1)',  color: '#a855f7', dot: '#a855f7' },
}

const FALLBACK = { bg: 'rgba(61,90,122,0.15)', color: '#7a9abf', dot: '#7a9abf' }

interface StatusBadgeProps {
  status: StatusVariant
  pulse?: boolean
  size?: 'xs' | 'sm' | 'md'
}

export function StatusBadge({ status, pulse = false, size = 'sm' }: StatusBadgeProps) {
  const cfg = CONFIGS[status] ?? FALLBACK
  const sizeMap = { xs: '0.6rem', sm: '0.7rem', md: '0.75rem' }
  const padMap = { xs: '2px 6px', sm: '3px 8px', md: '4px 10px' }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: padMap[size],
        background: cfg.bg,
        border: `1px solid ${cfg.color}30`,
        borderRadius: 3,
        fontFamily: 'var(--font-ibm-mono, monospace)',
        fontSize: sizeMap[size],
        fontWeight: 600,
        letterSpacing: '0.08em',
        color: cfg.color,
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: cfg.dot,
          flexShrink: 0,
          animation: pulse && status === 'active' ? 'pulse-ring 2s infinite' : 'none',
        }}
      />
      {status.replace(/_/g, ' ')}
    </span>
  )
}

interface PriorityBadgeProps {
  priority: number
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const color =
    priority >= 9 ? '#ef4444' :
    priority >= 7 ? '#f59e0b' :
    priority >= 5 ? '#3b82f6' :
    '#7a9abf'

  const bg =
    priority >= 9 ? 'rgba(239,68,68,0.1)' :
    priority >= 7 ? 'rgba(245,158,11,0.1)' :
    priority >= 5 ? 'rgba(59,130,246,0.1)' :
    'rgba(61,90,122,0.15)'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 6px',
        background: bg,
        border: `1px solid ${color}30`,
        borderRadius: 3,
        fontFamily: 'var(--font-ibm-mono, monospace)',
        fontSize: '0.65rem',
        fontWeight: 700,
        color,
      }}
    >
      P{priority}
    </span>
  )
}
