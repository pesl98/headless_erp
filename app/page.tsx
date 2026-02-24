import { supabase } from '@/lib/supabase'
import { MetricCard } from '@/components/ui/MetricCard'
import { StatusBadge, PriorityBadge } from '@/components/ui/StatusBadge'
import {
  Bot,
  ListOrdered,
  ShoppingCart,
  AlertTriangle,
  Activity,
  Zap,
} from 'lucide-react'

export const revalidate = 30

async function getDashboardData() {
  const [
    { count: activeAgents },
    { count: pendingTasks },
    { count: inventoryAlerts },
    { data: agents },
    { data: recentEvents },
    { count: totalOrders },
  ] = await Promise.all([
    supabase
      .from('erp_agents')
      .select('*', { count: 'exact', head: true })
      .eq('operational_status', 'active'),
    supabase
      .from('erp_task_events')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'processing']),
    supabase
      .from('erp_inventory')
      .select('*', { count: 'exact', head: true })
      .filter('current_quantity_available', 'lte', 'reorder_point'),
    supabase
      .from('erp_agents')
      .select('*')
      .order('created_at'),
    supabase
      .from('erp_task_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('erp_sales_orders')
      .select('*', { count: 'exact', head: true }),
  ])

  return {
    activeAgents: activeAgents ?? 0,
    pendingTasks: pendingTasks ?? 0,
    inventoryAlerts: inventoryAlerts ?? 0,
    totalOrders: totalOrders ?? 0,
    agents: agents ?? [],
    recentEvents: recentEvents ?? [],
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  const now = new Date()
  const timeStr = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Page header */}
      <div
        className="anim-fade-up"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <div>
          <div className="label" style={{ marginBottom: 6 }}>
            COMMAND CENTER
          </div>
          <h1
            style={{
              fontSize: '1.6rem',
              fontWeight: 700,
              color: 'var(--txt-primary)',
              letterSpacing: '-0.02em',
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Operational Overview
          </h1>
          <p
            style={{
              fontSize: '0.8125rem',
              color: 'var(--txt-secondary)',
              marginTop: 5,
              margin: '5px 0 0',
            }}
          >
            Real-time status of the autonomous agent fleet and ERP subsystems
          </p>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontFamily: 'var(--font-ibm-mono, monospace)',
          }}
        >
          <div style={{ fontSize: '0.65rem', color: 'var(--txt-muted)', letterSpacing: '0.1em' }}>
            SYSTEM TIME UTC
          </div>
          <div style={{ fontSize: '1.1rem', color: '#3b82f6', fontWeight: 600, letterSpacing: '0.05em' }}>
            {timeStr}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--txt-muted)', marginTop: 2 }}>
            {now.toISOString().slice(0, 10)}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          marginBottom: 28,
        }}
      >
        <MetricCard
          label="Active Agents"
          value={data.activeAgents}
          sub="of 6 configured"
          accent="green"
          icon={<Bot size={16} />}
          animDelay={0}
        />
        <MetricCard
          label="Pending Tasks"
          value={data.pendingTasks}
          sub="in event queue"
          accent="amber"
          icon={<ListOrdered size={16} />}
          animDelay={60}
        />
        <MetricCard
          label="Sales Orders"
          value={data.totalOrders}
          sub="total recorded"
          accent="blue"
          icon={<ShoppingCart size={16} />}
          animDelay={120}
        />
        <MetricCard
          label="Stock Alerts"
          value={data.inventoryAlerts}
          sub="below reorder point"
          accent={data.inventoryAlerts > 0 ? 'red' : 'green'}
          icon={<AlertTriangle size={16} />}
          animDelay={180}
        />
      </div>

      {/* Main content grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18 }}>

        {/* Agent Fleet */}
        <div className="erp-card anim-fade-up anim-delay-3">
          <div
            style={{
              padding: '14px 18px 10px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={13} color="#3b82f6" />
              <span
                style={{
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#e2eaf5',
                }}
              >
                Digital Workforce
              </span>
            </div>
            <span className="label">{data.agents.length} AGENTS</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 0,
            }}
          >
            {data.agents.map((agent, i) => (
              <div
                key={agent.agent_id}
                style={{
                  padding: '16px 18px',
                  borderRight: i % 3 !== 2 ? '1px solid var(--border-dim)' : 'none',
                  borderBottom: i < data.agents.length - 3 ? '1px solid var(--border-dim)' : 'none',
                  transition: 'background 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: '1.25rem' }}>{agent.avatar_emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        color: 'var(--txt-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {agent.display_name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-ibm-mono, monospace)',
                        fontSize: '0.6rem',
                        color: 'var(--txt-muted)',
                        marginTop: 1,
                        letterSpacing: '0.05em',
                      }}
                    >
                      {agent.role_name}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <StatusBadge status={agent.operational_status} size="xs" pulse />
                  <span
                    className="num"
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--txt-secondary)',
                    }}
                  >
                    €{Number(agent.financial_authority_limit).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Task Queue Preview */}
        <div className="erp-card anim-fade-up anim-delay-4">
          <div
            style={{
              padding: '14px 18px 10px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Zap size={13} color="#f59e0b" />
            <span
              style={{
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.7rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#e2eaf5',
              }}
            >
              Event Queue
            </span>
          </div>

          <div style={{ padding: '4px 0' }}>
            {data.recentEvents.length === 0 ? (
              <div style={{ padding: '24px 18px', color: 'var(--txt-muted)', fontSize: '0.8125rem', textAlign: 'center' }}>
                No events
              </div>
            ) : (
              data.recentEvents.map((event) => (
                <div
                  key={event.event_id}
                  style={{
                    padding: '10px 18px',
                    borderBottom: '1px solid var(--border-dim)',
                    transition: 'background 0.1s',
                    cursor: 'default',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-ibm-mono, monospace)',
                        fontSize: '0.65rem',
                        fontWeight: 600,
                        color: '#e2eaf5',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {event.event_type}
                    </span>
                    <PriorityBadge priority={event.priority} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--txt-muted)',
                        fontFamily: 'var(--font-ibm-mono, monospace)',
                      }}
                    >
                      → {event.target_agent ?? 'unassigned'}
                    </span>
                    <StatusBadge status={event.status} size="xs" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Architecture note */}
      <div
        className="erp-card anim-fade-up anim-delay-6"
        style={{
          marginTop: 18,
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.6rem',
            color: '#3b82f6',
            letterSpacing: '0.1em',
            flexShrink: 0,
          }}
        >
          ARCH
        </div>
        <div style={{ width: 1, height: 24, background: 'var(--border-mid)' }} />
        <p style={{ fontSize: '0.75rem', color: 'var(--txt-muted)', margin: 0, lineHeight: 1.6 }}>
          Headless ERP architecture: AI agents operate exclusively via MCP tools → predicate calculus constraints enforced at database layer → pg_cron orchestrates autonomous workflows → pgmq routes events between domain agents. No human UI required for operations.
        </p>
      </div>
    </div>
  )
}
