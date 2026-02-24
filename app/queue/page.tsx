import { supabase } from '@/lib/supabase'
import { StatusBadge, PriorityBadge } from '@/components/ui/StatusBadge'
import { ListOrdered, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react'

export const revalidate = 10

async function getQueueData() {
  const { data: events } = await supabase
    .from('erp_task_events')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100)

  return { events: events ?? [] }
}

export default async function QueuePage() {
  const { events } = await getQueueData()

  const byStatus = {
    pending:    events.filter((e) => e.status === 'pending'),
    processing: events.filter((e) => e.status === 'processing'),
    completed:  events.filter((e) => e.status === 'completed'),
    failed:     events.filter((e) => e.status === 'failed'),
  }

  const EVENT_TYPE_COLORS: Record<string, { color: string; bg: string }> = {
    REORDER_TRIGGERED:   { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    PAYROLL_RUN:         { color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
    BANK_RECONCILIATION: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    INVOICE_CUSTOMER:    { color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
    CREDIT_REVIEW:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
    ORDER_NEGOTIATION:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)' },
    RFQ_REQUESTED:       { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 28 }}>
        <div className="label" style={{ marginBottom: 6 }}>ORCHESTRATION LAYER</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--txt-primary)', letterSpacing: '-0.02em', margin: 0 }}>
          Task Event Queue
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--txt-secondary)', marginTop: 5 }}>
          Asynchronous event log driving the three-layer agent execution loop: Ingestion → Routing → Cognitive Processing
        </p>
      </div>

      {/* Status summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {[
          { label: 'Pending', count: byStatus.pending.length,    color: '#f59e0b', icon: <Clock size={15} /> },
          { label: 'Processing', count: byStatus.processing.length, color: '#3b82f6', icon: <Loader2 size={15} /> },
          { label: 'Completed', count: byStatus.completed.length,  color: '#22c55e', icon: <CheckCircle size={15} /> },
          { label: 'Failed', count: byStatus.failed.length,     color: '#ef4444', icon: <XCircle size={15} /> },
        ].map(({ label, count, color, icon }, i) => (
          <div key={label} className={`erp-card anim-fade-up anim-delay-${i + 1}`} style={{ padding: '16px 20px', borderColor: `${color}25` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="label">{label}</span>
              <span style={{ color }}>{icon}</span>
            </div>
            <div className="num" style={{ fontSize: '1.8rem', fontWeight: 700, color, lineHeight: 1 }}>{count}</div>
          </div>
        ))}
      </div>

      {/* Full event log */}
      <div className="erp-card anim-fade-up anim-delay-2">
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ListOrdered size={13} color="#ef4444" />
          <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
            Event Log
          </span>
          <span className="label" style={{ marginLeft: 'auto' }}>{events.length} EVENTS</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Event Type</th>
                <th>Target Agent</th>
                <th>Status</th>
                <th>Payload Preview</th>
                <th>Created</th>
                <th>Processed</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const typeColor = EVENT_TYPE_COLORS[event.event_type] ?? { color: '#7a9abf', bg: 'rgba(122,154,191,0.1)' }
                const payloadStr = JSON.stringify(event.payload)
                const payloadPreview = payloadStr.length > 80 ? payloadStr.slice(0, 80) + '…' : payloadStr

                return (
                  <tr key={event.event_id}>
                    <td>
                      <PriorityBadge priority={event.priority} />
                    </td>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-ibm-mono, monospace)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        background: typeColor.bg,
                        border: `1px solid ${typeColor.color}30`,
                        borderRadius: 3,
                        color: typeColor.color,
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                      }}>
                        {event.event_type}
                      </span>
                    </td>
                    <td>
                      {event.target_agent ? (
                        <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>
                          {event.target_agent}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--txt-muted)', fontSize: '0.75rem' }}>unassigned</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={event.status} size="xs" />
                    </td>
                    <td style={{ maxWidth: 320 }}>
                      <code style={{
                        fontFamily: 'var(--font-ibm-mono, monospace)',
                        fontSize: '0.68rem',
                        color: 'var(--txt-secondary)',
                        background: 'var(--bg-panel)',
                        padding: '2px 6px',
                        borderRadius: 3,
                        border: '1px solid var(--border-dim)',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {payloadPreview}
                      </code>
                    </td>
                    <td>
                      <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.68rem', color: 'var(--txt-muted)' }}>
                        {new Date(event.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        <br />
                        <span style={{ fontSize: '0.62rem' }}>
                          {new Date(event.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td>
                      {event.processed_at ? (
                        <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.68rem', color: '#22c55e' }}>
                          {new Date(event.processed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--txt-muted)', fontSize: '0.75rem' }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--txt-muted)', padding: '40px 12px' }}>
                    Queue is empty
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Architecture note */}
      <div className="erp-card anim-fade-up anim-delay-5" style={{ marginTop: 18, padding: '14px 20px' }}>
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {[
            { step: '01', label: 'STIMULUS', desc: 'External webhooks, bank feeds, pg_cron triggers → INSERT into erp_task_events' },
            { step: '02', label: 'ROUTING', desc: 'pg_net async HTTP → Supabase Edge Function selects domain agent by event_type' },
            { step: '03', label: 'EXECUTION', desc: 'LLM reasons with system_prompt + skills + semantic memory → MCP tool call' },
            { step: '04', label: 'CONSTRAINT', desc: 'Predicate calculus BEFORE trigger validates → EXCEPTION or COMMIT' },
          ].map(({ step, label, desc }) => (
            <div key={step} style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="num" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3b82f6' }}>{step}</span>
                <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: '#3b82f6' }}>{label}</span>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--txt-muted)', margin: 0, lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
