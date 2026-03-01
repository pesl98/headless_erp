import { supabase } from '@/lib/supabase'
import { PredicatePlayground } from './PredicatePlayground'

export const revalidate = 30

async function getRulesData() {
  const [{ data: skills }, { data: constraints }] = await Promise.all([
    supabase
      .from('erp_agent_skills')
      .select('id, skill_name, event_type, activation_condition, agent_id')
      .order('agent_id'),
    supabase
      .from('erp_agent_constraints')
      .select('id, constraint_name, logic_ast, scope, severity')
      .order('scope'),
  ])
  return { skills: skills ?? [], constraints: constraints ?? [] }
}

export default async function RulesPage() {
  const { skills, constraints } = await getRulesData()

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div className="anim-fade-up" style={{ marginBottom: 28 }}>
        <div className="label" style={{ marginBottom: 6, color: '#ef4444' }}>
          GOVERNANCE ENGINE
        </div>
        <h1
          style={{
            fontSize: '1.6rem',
            fontWeight: 700,
            color: 'var(--txt-primary)',
            letterSpacing: '-0.02em',
            margin: 0,
          }}
        >
          Predicate Calculus Evaluator
        </h1>
        <p
          style={{
            fontSize: '0.8125rem',
            color: 'var(--txt-secondary)',
            marginTop: 5,
            maxWidth: 580,
          }}
        >
          Write JSONB predicate ASTs and test them live against order contexts.
          This is the design harness for Phase B — replacing all hardcoded{' '}
          <code
            style={{
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.75rem',
              background: 'var(--bg-card)',
              padding: '1px 4px',
              borderRadius: 3,
              color: 'var(--accent-amber)',
            }}
          >
            if
          </code>{' '}
          statements with data-driven rules stored in{' '}
          <code
            style={{
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.75rem',
              background: 'var(--bg-card)',
              padding: '1px 4px',
              borderRadius: 3,
              color: 'var(--accent-amber)',
            }}
          >
            erp_agent_constraints
          </code>
          .
        </p>
      </div>

      <PredicatePlayground skills={skills} constraints={constraints} />
    </div>
  )
}
