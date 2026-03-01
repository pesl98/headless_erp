'use client'

import { useState, useCallback, useEffect } from 'react'
import { ShieldCheck, ShieldX, AlertTriangle, ChevronRight, Play, RotateCcw, Database, BookOpen, MessageSquare, ChevronDown } from 'lucide-react'
import {
  type ASTNode,
  type EvaluationContext,
  type TraceNode,
  type EvalResult,
  evaluateRuleFromJSON,
  renderAST,
} from '@/lib/predicate-evaluator'
import { PredicateChat } from './PredicateChat'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Preset {
  name: string
  description: string
  sop: string
  ast: ASTNode
  context: Partial<EvaluationContext>
}

interface Skill {
  id: string
  skill_name: string
  event_type: string
  activation_condition: unknown
  agent_id: string
}

interface Constraint {
  id: string
  constraint_name: string
  logic_ast: unknown
  scope: string
  severity: string
}

interface Props {
  skills: Skill[]
  constraints: Constraint[]
}

// ─── Prebuilt predicates (mirror the live SOPs) ────────────────────────────

const PREBUILT: Preset[] = [
  {
    name: 'Invoice Approval Gate',
    description: 'Freeze orders when invoice_amount > €10,000',
    sop: 'high_value_invoice_approval_gate',
    ast: {
      type: 'comparison',
      op: '>',
      left: { type: 'field', name: 'invoice_amount' },
      right: { type: 'const', value: 10000 },
    },
    context: { invoice_amount: 12000 },
  },
  {
    name: 'Market Price Check',
    description: 'Reject if unit_price > market_avg × 1.10',
    sop: 'market_intelligence_price_validation',
    ast: {
      type: 'comparison',
      op: '>',
      left: { type: 'field', name: 'unit_price' },
      right: {
        type: 'arithmetic',
        op: '*',
        left: { type: 'field', name: 'market_avg' },
        right: { type: 'const', value: 1.1 },
      },
    },
    context: { unit_price: 58.5, market_avg: 50.0 },
  },
  {
    name: 'Platinum Discount Tier',
    description: 'Pass when customer_tier = "platinum"',
    sop: 'discount_authority_matrix',
    ast: {
      type: 'comparison',
      op: 'eq',
      left: { type: 'field', name: 'customer_tier' },
      right: { type: 'const', value: 'platinum' },
    },
    context: { customer_tier: 'gold' },
  },
  {
    name: 'Credit Limit Guard',
    description: 'Block order if order_value exceeds credit_remaining',
    sop: '(erp_credit_limit_check trigger)',
    ast: {
      type: 'comparison',
      op: '>',
      left: { type: 'field', name: 'order_value' },
      right: { type: 'field', name: 'credit_remaining' },
    },
    context: { order_value: 18000, credit_remaining: 15000 },
  },
  {
    name: 'Compound: High-Risk Standard Customer',
    description: 'AND composition — large order AND low-tier customer',
    sop: 'custom',
    ast: {
      type: 'logical',
      op: 'and',
      left: {
        type: 'comparison',
        op: '>',
        left: { type: 'field', name: 'order_value' },
        right: { type: 'const', value: 5000 },
      },
      right: {
        type: 'comparison',
        op: 'eq',
        left: { type: 'field', name: 'customer_tier' },
        right: { type: 'const', value: 'standard' },
      },
    },
    context: { order_value: 8500, customer_tier: 'standard' },
  },
]

const DEFAULT_CONTEXT: EvaluationContext = {
  invoice_amount: 12000,
  order_value: 8500,
  customer_tier: 'gold',
  unit_price: 58.5,
  market_avg: 50.0,
  credit_remaining: 15000,
}

// ─── Trace tree renderer ──────────────────────────────────────────────────────

function TraceTree({ node, depth = 0 }: { node: TraceNode; depth?: number }) {
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const isBool = typeof node.value === 'boolean'
  const valueColor = isBool
    ? node.value ? 'var(--accent-green)' : 'var(--accent-red)'
    : 'var(--accent-amber)'
  const valueStr =
    typeof node.value === 'string' && node.value.length > 40
      ? node.value.slice(0, 40) + '…'
      : String(node.value)

  return (
    <div style={{ paddingLeft: depth * 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 0',
          cursor: hasChildren ? 'pointer' : 'default',
          userSelect: 'none',
        }}
        onClick={() => hasChildren && setOpen((o) => !o)}
      >
        {hasChildren && (
          <ChevronRight
            size={11}
            color="var(--txt-muted)"
            style={{
              flexShrink: 0,
              transform: open ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
            }}
          />
        )}
        {!hasChildren && <div style={{ width: 11, flexShrink: 0 }} />}
        <span
          style={{
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.7rem',
            color: 'var(--txt-secondary)',
          }}
        >
          {node.label}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.7rem',
            color: valueColor,
            marginLeft: 'auto',
            paddingLeft: 8,
          }}
        >
          → {valueStr}
        </span>
      </div>
      {open &&
        hasChildren &&
        node.children.map((child, i) => (
          <TraceTree key={i} node={child} depth={depth + 1} />
        ))}
    </div>
  )
}

// ─── Context editor ───────────────────────────────────────────────────────────

function ContextEditor({
  context,
  onChange,
}: {
  context: EvaluationContext
  onChange: (ctx: EvaluationContext) => void
}) {
  return (
    <div>
      {Object.entries(context).map(([key, val]) => (
        <div
          key={key}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.7rem',
              color: 'var(--txt-secondary)',
              minWidth: 130,
              flexShrink: 0,
            }}
          >
            {key}
          </span>
          <input
            type={typeof val === 'number' ? 'number' : 'text'}
            value={String(val)}
            onChange={(e) => {
              const raw = e.target.value
              const parsed =
                typeof val === 'number' ? parseFloat(raw) || 0 : raw
              onChange({ ...context, [key]: parsed } as EvaluationContext)
            }}
            style={{
              flex: 1,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
              borderRadius: 3,
              padding: '4px 8px',
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.75rem',
              color: 'var(--txt-primary)',
              outline: 'none',
            }}
          />
        </div>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PredicatePlayground({ skills, constraints }: Props) {
  const [astText, setAstText] = useState<string>(
    JSON.stringify(PREBUILT[0].ast, null, 2)
  )
  const [context, setContext] = useState<EvaluationContext>(
    { ...DEFAULT_CONTEXT, ...PREBUILT[0].context } as EvaluationContext
  )
  const [result, setResult] = useState<EvalResult | null>(null)
  const [activePreset, setActivePreset] = useState<string>(PREBUILT[0].name)
  const [chatOpen, setChatOpen] = useState(true)

  const evaluate = useCallback(() => {
    const r = evaluateRuleFromJSON(astText, context)
    setResult(r)
  }, [astText, context])

  // auto-evaluate on every change
  useEffect(() => {
    evaluate()
  }, [evaluate])

  function loadPreset(preset: Preset) {
    setActivePreset(preset.name)
    setAstText(JSON.stringify(preset.ast, null, 2))
    setContext({ ...DEFAULT_CONTEXT, ...preset.context } as EvaluationContext)
  }

  function loadSkillSOP(skill: Skill) {
    if (!skill.activation_condition) return
    setActivePreset(`SOP: ${skill.skill_name}`)
    setAstText(JSON.stringify(skill.activation_condition, null, 2))
  }

  function handleChatAST(ast: ASTNode, astText: string) {
    setActivePreset('chat')
    setAstText(astText)
    // Scroll to top so user sees the editor update
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // derive human-readable summary
  let summary = ''
  try {
    const ast = JSON.parse(astText) as ASTNode
    summary = renderAST(ast)
  } catch {
    summary = ''
  }

  const parseOk = !result?.error || result.error !== 'Invalid JSON'
  const resultPass = result?.pass ?? false
  const hasError = !!result?.error

  return (
    <>
    <div
      className="anim-fade-up anim-delay-1"
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr 300px',
        gap: 16,
        alignItems: 'start',
      }}
    >
      {/* ── Left: Rule Library ─────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Prebuilt predicates */}
        <div className="erp-card">
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <BookOpen size={12} color="#ef4444" />
            <span className="label" style={{ fontSize: '0.65rem' }}>
              PREBUILT PREDICATES
            </span>
          </div>
          <div style={{ padding: '8px 0' }}>
            {PREBUILT.map((p) => {
              const isActive = activePreset === p.name
              return (
                <button
                  key={p.name}
                  onClick={() => loadPreset(p)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: isActive ? 'rgba(239,68,68,0.08)' : 'transparent',
                    border: 'none',
                    borderLeft: isActive
                      ? '2px solid #ef4444'
                      : '2px solid transparent',
                    padding: '8px 14px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-barlow, sans-serif)',
                      fontSize: '0.8rem',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--txt-primary)' : 'var(--txt-secondary)',
                      marginBottom: 2,
                    }}
                  >
                    {p.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.63rem',
                      color: 'var(--txt-muted)',
                      lineHeight: 1.4,
                    }}
                  >
                    {p.description}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Live SOPs from DB */}
        <div className="erp-card">
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Database size={12} color="#a855f7" />
            <span className="label" style={{ fontSize: '0.65rem' }}>
              LIVE SOPs · DB
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.6rem',
                color: '#a855f7',
                background: 'rgba(168,85,247,0.1)',
                padding: '1px 6px',
                borderRadius: 10,
              }}
            >
              {skills.length}
            </span>
          </div>
          <div style={{ padding: '8px 0' }}>
            {skills.length === 0 && (
              <div
                style={{
                  padding: '12px 14px',
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.65rem',
                  color: 'var(--txt-muted)',
                }}
              >
                No SOPs found in erp_agent_skills
              </div>
            )}
            {skills.map((s) => {
              const isActive = activePreset === `SOP: ${s.skill_name}`
              const hasAst = !!s.activation_condition
              return (
                <button
                  key={s.id}
                  onClick={() => hasAst && loadSkillSOP(s)}
                  disabled={!hasAst}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: isActive ? 'rgba(168,85,247,0.08)' : 'transparent',
                    border: 'none',
                    borderLeft: isActive
                      ? '2px solid #a855f7'
                      : '2px solid transparent',
                    padding: '7px 14px',
                    cursor: hasAst ? 'pointer' : 'default',
                    opacity: hasAst ? 1 : 0.45,
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.68rem',
                      color: isActive ? '#a855f7' : 'var(--txt-secondary)',
                      marginBottom: 1,
                    }}
                  >
                    {s.skill_name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.6rem',
                      color: 'var(--txt-muted)',
                    }}
                  >
                    {s.event_type} · {s.agent_id.slice(0, 8)}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* DB Constraints */}
        {constraints.length > 0 && (
          <div className="erp-card">
            <div
              style={{
                padding: '11px 14px',
                borderBottom: '1px solid var(--border-dim)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <ShieldCheck size={12} color="#f59e0b" />
              <span className="label" style={{ fontSize: '0.65rem' }}>
                CONSTRAINTS · DB
              </span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {constraints.map((c) => (
                <div key={c.id} style={{ padding: '6px 14px' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.68rem',
                      color: 'var(--txt-secondary)',
                    }}
                  >
                    {c.constraint_name ?? '(unnamed)'}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.6rem',
                      color: 'var(--txt-muted)',
                    }}
                  >
                    {c.scope} · {c.severity}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Center: AST Editor ────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Editor card */}
        <div className="erp-card">
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <Play size={12} color="#3b82f6" />
            <span className="label" style={{ fontSize: '0.65rem' }}>
              AST EDITOR
            </span>
            <span
              style={{
                marginLeft: 'auto',
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.6rem',
                color: parseOk ? 'var(--txt-muted)' : '#ef4444',
              }}
            >
              {parseOk ? 'valid json' : 'invalid json'}
            </span>
          </div>
          <div style={{ padding: 14 }}>
            <textarea
              value={astText}
              onChange={(e) => setAstText(e.target.value)}
              spellCheck={false}
              style={{
                width: '100%',
                minHeight: 260,
                background: 'var(--bg-base)',
                border: `1px solid ${parseOk ? 'var(--border-mid)' : '#ef444466'}`,
                borderRadius: 4,
                padding: '10px 12px',
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.78rem',
                color: 'var(--txt-primary)',
                outline: 'none',
                resize: 'vertical',
                lineHeight: 1.6,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Human-readable summary */}
          {summary && (
            <div
              style={{
                margin: '0 14px 14px',
                padding: '8px 12px',
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.15)',
                borderRadius: 4,
              }}
            >
              <div
                className="label"
                style={{ fontSize: '0.58rem', marginBottom: 4, color: '#3b82f6' }}
              >
                HUMAN READABLE
              </div>
              <code
                style={{
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.75rem',
                  color: 'var(--txt-secondary)',
                  wordBreak: 'break-all',
                }}
              >
                {summary}
              </code>
            </div>
          )}
        </div>

        {/* AST grammar reference */}
        <div className="erp-card">
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-dim)',
            }}
          >
            <span className="label" style={{ fontSize: '0.65rem' }}>
              GRAMMAR REFERENCE
            </span>
          </div>
          <div style={{ padding: 14 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 8,
              }}
            >
              {[
                ['const', '{"type":"const","value":10000}'],
                ['field', '{"type":"field","name":"invoice_amount"}'],
                ['comparison', '{"type":"comparison","op":">","left":…,"right":…}'],
                ['arithmetic', '{"type":"arithmetic","op":"*","left":…,"right":…}'],
                ['and / or', '{"type":"logical","op":"and","left":…,"right":…}'],
                ['not', '{"type":"logical","op":"not","left":…}'],
              ].map(([label, example]) => (
                <div
                  key={label}
                  style={{
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: 4,
                    padding: '8px 10px',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      color: '#f59e0b',
                      marginBottom: 4,
                    }}
                  >
                    {label}
                  </div>
                  <code
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.6rem',
                      color: 'var(--txt-muted)',
                      lineHeight: 1.5,
                      display: 'block',
                      wordBreak: 'break-all',
                    }}
                  >
                    {example}
                  </code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Context + Result ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Result badge */}
        <div className="erp-card">
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            {hasError ? (
              <AlertTriangle size={12} color="#f59e0b" />
            ) : resultPass ? (
              <ShieldCheck size={12} color="#22c55e" />
            ) : (
              <ShieldX size={12} color="#ef4444" />
            )}
            <span className="label" style={{ fontSize: '0.65rem' }}>
              RESULT
            </span>
          </div>
          <div style={{ padding: 16 }}>
            {result ? (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: '1.8rem',
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      color: hasError
                        ? '#f59e0b'
                        : resultPass
                        ? '#22c55e'
                        : '#ef4444',
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                    }}
                  >
                    {hasError ? 'ERROR' : resultPass ? 'PASS' : 'FAIL'}
                  </div>
                  <div
                    style={{
                      fontSize: '1.8rem',
                    }}
                  >
                    {hasError ? '⚠️' : resultPass ? '✅' : '❌'}
                  </div>
                </div>
                {result.error && (
                  <div
                    style={{
                      fontFamily: 'var(--font-ibm-mono, monospace)',
                      fontSize: '0.68rem',
                      color: '#f59e0b',
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 4,
                      padding: '6px 10px',
                    }}
                  >
                    {result.error}
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.7rem',
                  color: 'var(--txt-muted)',
                }}
              >
                Type a predicate to evaluate…
              </div>
            )}
          </div>
        </div>

        {/* Context editor */}
        <div className="erp-card">
          <div
            style={{
              padding: '11px 14px',
              borderBottom: '1px solid var(--border-dim)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <span className="label" style={{ fontSize: '0.65rem' }}>
              TEST CONTEXT
            </span>
            <button
              onClick={() => setContext({ ...DEFAULT_CONTEXT, ...PREBUILT[0].context } as EvaluationContext)}
              style={{
                marginLeft: 'auto',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--txt-muted)',
                padding: 0,
              }}
              title="Reset to defaults"
            >
              <RotateCcw size={11} />
              <span
                style={{
                  fontFamily: 'var(--font-ibm-mono, monospace)',
                  fontSize: '0.6rem',
                }}
              >
                reset
              </span>
            </button>
          </div>
          <div style={{ padding: '12px 14px' }}>
            <ContextEditor context={context} onChange={setContext} />
          </div>
          <div
            style={{
              padding: '8px 14px 12px',
              borderTop: '1px solid var(--border-dim)',
            }}
          >
            <div
              className="label"
              style={{ fontSize: '0.58rem', marginBottom: 6 }}
            >
              ADD FIELD
            </div>
            <AddFieldRow
              onAdd={(key, value) => setContext((c) => ({ ...c, [key]: value }))}
            />
          </div>
        </div>

        {/* Trace tree */}
        {result && result.trace && (
          <div className="erp-card">
            <div
              style={{
                padding: '11px 14px',
                borderBottom: '1px solid var(--border-dim)',
              }}
            >
              <span className="label" style={{ fontSize: '0.65rem' }}>
                EVALUATION TRACE
              </span>
            </div>
            <div
              style={{
                padding: '10px 14px',
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              <TraceTree node={result.trace} />
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── Chat panel ───────────────────────────────────────────────── */}
    <div className="anim-fade-up anim-delay-2" style={{ marginTop: 16 }}>
      {/* Collapsible header */}
      <button
        onClick={() => setChatOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          background: 'transparent',
          border: 'none',
          borderBottom: chatOpen ? 'none' : '1px solid var(--border-dim)',
          padding: '10px 0',
          cursor: 'pointer',
          marginBottom: chatOpen ? 10 : 0,
        }}
      >
        <MessageSquare size={13} color="#a855f7" />
        <span
          style={{
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--txt-secondary)',
          }}
        >
          NATURAL LANGUAGE COMPILER
        </span>
        <span
          style={{
            marginLeft: 8,
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.6rem',
            color: '#a855f7',
            background: 'rgba(168,85,247,0.1)',
            padding: '2px 8px',
            borderRadius: 10,
          }}
        >
          minimax-m2.5 · OpenRouter
        </span>
        <ChevronDown
          size={14}
          color="var(--txt-muted)"
          style={{
            marginLeft: 'auto',
            transform: chatOpen ? 'none' : 'rotate(-90deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {chatOpen && <PredicateChat onASTGenerated={handleChatAST} />}
    </div>
    </>
  )
}

// ─── Add field helper ─────────────────────────────────────────────────────────

function AddFieldRow({
  onAdd,
}: {
  onAdd: (key: string, value: number | string) => void
}) {
  const [key, setKey] = useState('')
  const [val, setVal] = useState('')

  function submit() {
    if (!key.trim()) return
    const parsed = parseFloat(val)
    onAdd(key.trim(), isNaN(parsed) ? val : parsed)
    setKey('')
    setVal('')
  }

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        placeholder="field"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{
          flex: 1,
          background: 'var(--bg-base)',
          border: '1px solid var(--border-mid)',
          borderRadius: 3,
          padding: '4px 7px',
          fontFamily: 'var(--font-ibm-mono, monospace)',
          fontSize: '0.7rem',
          color: 'var(--txt-primary)',
          outline: 'none',
        }}
      />
      <input
        placeholder="value"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        style={{
          width: 72,
          background: 'var(--bg-base)',
          border: '1px solid var(--border-mid)',
          borderRadius: 3,
          padding: '4px 7px',
          fontFamily: 'var(--font-ibm-mono, monospace)',
          fontSize: '0.7rem',
          color: 'var(--txt-primary)',
          outline: 'none',
        }}
      />
      <button
        onClick={submit}
        style={{
          background: 'rgba(59,130,246,0.15)',
          border: '1px solid rgba(59,130,246,0.3)',
          borderRadius: 3,
          color: '#3b82f6',
          fontFamily: 'var(--font-ibm-mono, monospace)',
          fontSize: '0.7rem',
          padding: '4px 10px',
          cursor: 'pointer',
        }}
      >
        +
      </button>
    </div>
  )
}
