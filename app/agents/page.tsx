import { supabase } from '@/lib/supabase'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Bot, Wrench, Brain, ShieldCheck } from 'lucide-react'

export const revalidate = 30

async function getAgentsData() {
  const [{ data: agents }, { data: skills }, { data: tools }, { data: assignments }, { data: constraints }] =
    await Promise.all([
      supabase.from('erp_agents').select('*').order('created_at'),
      supabase.from('erp_agent_skills').select('*'),
      supabase.from('erp_mcp_tools').select('*').order('tool_name'),
      supabase.from('erp_agent_tool_assignments').select('*'),
      supabase.from('erp_agent_constraints').select('*'),
    ])

  return {
    agents: agents ?? [],
    skills: skills ?? [],
    tools: tools ?? [],
    assignments: assignments ?? [],
    constraints: constraints ?? [],
  }
}

export default async function AgentsPage() {
  const { agents, skills, tools, assignments, constraints } = await getAgentsData()

  const skillsByAgent = skills.reduce((acc, s) => {
    if (!acc[s.agent_id]) acc[s.agent_id] = []
    acc[s.agent_id].push(s)
    return acc
  }, {} as Record<string, typeof skills>)

  const toolCountByAgent = assignments.reduce((acc, a) => {
    acc[a.agent_id] = (acc[a.agent_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const constraintsByRole = constraints.reduce((acc, c) => {
    if (!acc[c.target_agent_role]) acc[c.target_agent_role] = []
    acc[c.target_agent_role].push(c)
    return acc
  }, {} as Record<string, typeof constraints>)

  const handlerColor = {
    plpgsql_function: { color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
    edge_function:    { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    external_api:     { color: '#a855f7', bg: 'rgba(168,85,247,0.1)' },
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 28 }}>
        <div className="label" style={{ marginBottom: 6 }}>DIGITAL WORKFORCE</div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--txt-primary)', letterSpacing: '-0.02em', margin: 0 }}>
          Agent Fleet Management
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--txt-secondary)', marginTop: 5 }}>
          All domain-specific AI agents, their skills, MCP tools, and governance constraints
        </p>
      </div>

      {/* Agents table */}
      <div className="erp-card anim-fade-up anim-delay-1" style={{ marginBottom: 20 }}>
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={13} color="#a855f7" />
          <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
            Agent Registry
          </span>
          <span className="label" style={{ marginLeft: 'auto' }}>{agents.length} CONFIGURED</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Role ID</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Authority Limit</th>
                <th style={{ textAlign: 'center' }}>Skills</th>
                <th style={{ textAlign: 'center' }}>Tools</th>
                <th style={{ textAlign: 'center' }}>Constraints</th>
                <th>DB Role</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.agent_id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: '1.1rem' }}>{agent.avatar_emoji}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#e2eaf5' }}>
                          {agent.display_name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.6rem', color: 'var(--txt-muted)', marginTop: 1 }}>
                          {agent.agent_id.slice(0, 12)}…
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>
                      {agent.role_name}
                    </span>
                  </td>
                  <td><StatusBadge status={agent.operational_status} pulse /></td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="num" style={{ fontSize: '0.875rem', color: agent.financial_authority_limit > 0 ? '#f59e0b' : 'var(--txt-muted)' }}>
                      €{Number(agent.financial_authority_limit).toLocaleString()}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.8rem', color: '#a855f7', fontWeight: 600 }}>
                      {(skillsByAgent[agent.agent_id] ?? []).length}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.8rem', color: '#3b82f6', fontWeight: 600 }}>
                      {toolCountByAgent[agent.agent_id] ?? 0}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.8rem', color: '#ef4444', fontWeight: 600 }}>
                      {(constraintsByRole[agent.role_name] ?? []).length}
                    </span>
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--txt-muted)' }}>
                      {agent.database_role}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Skills + Constraints grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 20 }}>
        {/* Skills */}
        <div className="erp-card anim-fade-up anim-delay-2">
          <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Brain size={13} color="#a855f7" />
            <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
              Domain Skills
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Skill</th>
                  <th>Agent</th>
                  <th>Trigger</th>
                </tr>
              </thead>
              <tbody>
                {skills.map((s) => {
                  const agent = agents.find((a) => a.agent_id === s.agent_id)
                  const cond = s.activation_condition as Record<string, unknown>
                  const condStr = cond.always ? 'always' :
                    Array.isArray(cond.event_types) ? (cond.event_types as string[]).join(', ') : '—'
                  return (
                    <tr key={s.skill_id}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#e2eaf5' }}>{s.skill_name}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--txt-muted)', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.domain_knowledge.slice(0, 60)}…
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.9rem' }}>{agent?.avatar_emoji}</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>{agent?.display_name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--txt-muted)' }}>{condStr}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Constraints */}
        <div className="erp-card anim-fade-up anim-delay-3">
          <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={13} color="#ef4444" />
            <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
              Predicate Calculus Constraints
            </span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Op</th>
                  <th>Table</th>
                  <th>Violation Message</th>
                </tr>
              </thead>
              <tbody>
                {constraints.map((c) => (
                  <tr key={c.constraint_id}>
                    <td>
                      <span className="mono" style={{ fontSize: '0.7rem', color: '#f59e0b' }}>{c.target_agent_role}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', padding: '2px 6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 3, color: '#ef4444', fontWeight: 700 }}>
                        {c.triggering_operation}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.65rem', color: 'var(--txt-muted)' }}>{c.target_table}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.72rem', color: 'var(--txt-secondary)' }}>{c.violation_message}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MCP Tools */}
      <div className="erp-card anim-fade-up anim-delay-4">
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border-dim)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Wrench size={13} color="#3b82f6" />
          <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e2eaf5' }}>
            MCP Tool Registry
          </span>
          <span className="label" style={{ marginLeft: 'auto' }}>{tools.length} TOOLS</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="erp-table">
            <thead>
              <tr>
                <th>Tool Name</th>
                <th>Handler</th>
                <th>Endpoint</th>
                <th>Description</th>
                <th style={{ textAlign: 'center' }}>Active</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => {
                const hc = handlerColor[t.execution_handler as keyof typeof handlerColor] ?? handlerColor.plpgsql_function
                return (
                  <tr key={t.tool_id}>
                    <td>
                      <span className="mono" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e2eaf5' }}>{t.tool_name}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', padding: '2px 7px', background: hc.bg, border: `1px solid ${hc.color}30`, borderRadius: 3, color: hc.color, fontWeight: 600 }}>
                        {t.execution_handler}
                      </span>
                    </td>
                    <td>
                      <span className="mono" style={{ fontSize: '0.7rem', color: 'var(--txt-muted)' }}>{t.target_endpoint}</span>
                    </td>
                    <td style={{ maxWidth: 280 }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--txt-secondary)' }}>{t.semantic_description}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.65rem', color: t.is_active ? '#22c55e' : '#ef4444' }}>
                        {t.is_active ? '●' : '○'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
