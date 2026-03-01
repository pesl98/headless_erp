'use client'

import { useState, useRef, useEffect } from 'react'
import { MessageSquare, Send, Loader, Sparkles, RotateCcw, Copy, Check } from 'lucide-react'
import type { ASTNode } from '@/lib/predicate-evaluator'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  ast?: ASTNode
  summary?: string
  error?: string
}

interface Props {
  onASTGenerated: (ast: ASTNode, astText: string) => void
}

// ─── Example prompts ──────────────────────────────────────────────────────────

const EXAMPLES = [
  'reject invoices over €10,000',
  'flag when unit price is more than 10% above market average',
  'only apply to standard or silver tier customers',
  'block orders where order value exceeds remaining credit',
  'reject if platinum customer AND order value over €5,000',
]

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onInject,
}: {
  msg: ChatMessage
  onInject?: (ast: ASTNode, text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const isUser = msg.role === 'user'

  function copyAST() {
    if (!msg.ast) return
    navigator.clipboard.writeText(JSON.stringify(msg.ast, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 12,
      }}
    >
      {/* Role label */}
      <div
        style={{
          fontFamily: 'var(--font-ibm-mono, monospace)',
          fontSize: '0.58rem',
          letterSpacing: '0.08em',
          color: 'var(--txt-muted)',
          marginBottom: 4,
          paddingLeft: isUser ? 0 : 2,
        }}
      >
        {isUser ? 'YOU' : 'COMPILER'}
      </div>

      {/* Bubble */}
      <div
        style={{
          maxWidth: '90%',
          background: isUser
            ? 'rgba(59,130,246,0.12)'
            : msg.error
            ? 'rgba(239,68,68,0.08)'
            : 'rgba(168,85,247,0.08)',
          border: `1px solid ${
            isUser
              ? 'rgba(59,130,246,0.25)'
              : msg.error
              ? 'rgba(239,68,68,0.2)'
              : 'rgba(168,85,247,0.2)'
          }`,
          borderRadius: 6,
          padding: '10px 12px',
        }}
      >
        {/* User text or error */}
        {isUser && (
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-barlow, sans-serif)',
              fontSize: '0.8125rem',
              color: 'var(--txt-primary)',
              lineHeight: 1.5,
            }}
          >
            {msg.content}
          </p>
        )}

        {!isUser && msg.error && (
          <p
            style={{
              margin: 0,
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.72rem',
              color: '#ef4444',
              lineHeight: 1.5,
            }}
          >
            ⚠ {msg.error}
          </p>
        )}

        {/* Summary */}
        {!isUser && !msg.error && msg.summary && (
          <p
            style={{
              margin: '0 0 10px',
              fontFamily: 'var(--font-barlow, sans-serif)',
              fontSize: '0.8125rem',
              color: 'var(--txt-primary)',
              lineHeight: 1.5,
            }}
          >
            {msg.summary}
          </p>
        )}

        {/* AST preview */}
        {!isUser && !msg.error && msg.ast && (
          <pre
            style={{
              margin: '0 0 10px',
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.65rem',
              color: '#a855f7',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 4,
              padding: '8px 10px',
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {JSON.stringify(msg.ast, null, 2)}
          </pre>
        )}

        {/* Action buttons */}
        {!isUser && !msg.error && msg.ast && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() =>
                onInject?.(msg.ast!, JSON.stringify(msg.ast, null, 2))
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(168,85,247,0.2)',
                border: '1px solid rgba(168,85,247,0.4)',
                borderRadius: 4,
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.65rem',
                color: '#a855f7',
              }}
            >
              <Sparkles size={10} />
              Inject into editor
            </button>
            <button
              onClick={copyAST}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'transparent',
                border: '1px solid var(--border-mid)',
                borderRadius: 4,
                padding: '5px 10px',
                cursor: 'pointer',
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.65rem',
                color: copied ? '#22c55e' : 'var(--txt-muted)',
              }}
            >
              {copied ? <Check size={10} /> : <Copy size={10} />}
              {copied ? 'Copied!' : 'Copy JSON'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main chat component ──────────────────────────────────────────────────────

export function PredicateChat({ onASTGenerated }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    // Build conversation history for the API (only role + content)
    const apiMessages = updatedMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }))

    try {
      const res = await fetch('/api/predicate-compiler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      const data = await res.json() as {
        ast?: ASTNode
        summary?: string
        error?: string
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.summary ?? '',
        ast: data.ast,
        summary: data.summary,
        error: data.error,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', error: msg },
      ])
    } finally {
      setLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
    setInput('')
  }

  return (
    <div className="erp-card" style={{ display: 'flex', flexDirection: 'column', height: 480 }}>
      {/* Header */}
      <div
        style={{
          padding: '11px 14px',
          borderBottom: '1px solid var(--border-dim)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          flexShrink: 0,
        }}
      >
        <MessageSquare size={12} color="#a855f7" />
        <span className="label" style={{ fontSize: '0.65rem' }}>
          NATURAL LANGUAGE → PREDICATE
        </span>
        <span
          style={{
            marginLeft: 6,
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.58rem',
            color: 'var(--txt-muted)',
          }}
        >
          describe a business rule in plain English
        </span>
        {messages.length > 0 && (
          <button
            onClick={clearChat}
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
            title="Clear conversation"
          >
            <RotateCcw size={11} />
            <span style={{ fontFamily: 'var(--font-ibm-mono, monospace)', fontSize: '0.6rem' }}>
              clear
            </span>
          </button>
        )}
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 14px 0',
        }}
      >
        {messages.length === 0 && (
          <div>
            {/* Empty state */}
            <div
              style={{
                textAlign: 'center',
                padding: '20px 0 18px',
                color: 'var(--txt-muted)',
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.7rem',
              }}
            >
              <Sparkles size={24} color="var(--txt-muted)" style={{ margin: '0 auto 10px', display: 'block' }} />
              Describe any business rule in plain language.
              <br />
              Claude compiles it to a predicate AST.
            </div>

            {/* Example prompts */}
            <div
              style={{
                fontFamily: 'var(--font-ibm-mono, monospace)',
                fontSize: '0.6rem',
                color: 'var(--txt-muted)',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              TRY AN EXAMPLE:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => sendMessage(ex)}
                  style={{
                    textAlign: 'left',
                    background: 'var(--bg-base)',
                    border: '1px solid var(--border-dim)',
                    borderRadius: 4,
                    padding: '7px 10px',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-barlow, sans-serif)',
                    fontSize: '0.78rem',
                    color: 'var(--txt-secondary)',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)'
                    e.currentTarget.style.color = 'var(--txt-primary)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-dim)'
                    e.currentTarget.style.color = 'var(--txt-secondary)'
                  }}
                >
                  &ldquo;{ex}&rdquo;
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            onInject={onASTGenerated}
          />
        ))}

        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 0 12px',
              color: 'var(--txt-muted)',
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.68rem',
            }}
          >
            <Loader size={12} color="#a855f7" style={{ animation: 'spin 1s linear infinite' }} />
            compiling…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--border-dim)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage(input)
              }
            }}
            placeholder="e.g. reject orders where invoice exceeds €10,000…"
            disabled={loading}
            style={{
              flex: 1,
              background: 'var(--bg-base)',
              border: '1px solid var(--border-mid)',
              borderRadius: 4,
              padding: '8px 12px',
              fontFamily: 'var(--font-barlow, sans-serif)',
              fontSize: '0.8125rem',
              color: 'var(--txt-primary)',
              outline: 'none',
              opacity: loading ? 0.5 : 1,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)'
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-mid)'
            }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading
                ? 'rgba(168,85,247,0.2)'
                : 'rgba(168,85,247,0.05)',
              border: `1px solid ${input.trim() && !loading ? 'rgba(168,85,247,0.5)' : 'var(--border-dim)'}`,
              borderRadius: 4,
              padding: '8px 14px',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              color: input.trim() && !loading ? '#a855f7' : 'var(--txt-muted)',
              fontFamily: 'var(--font-ibm-mono, monospace)',
              fontSize: '0.7rem',
              transition: 'all 0.15s',
            }}
          >
            <Send size={12} />
            compile
          </button>
        </div>
        <div
          style={{
            marginTop: 5,
            fontFamily: 'var(--font-ibm-mono, monospace)',
            fontSize: '0.58rem',
            color: 'var(--txt-muted)',
          }}
        >
          Multi-turn: say &ldquo;also&rdquo; or &ldquo;but only for…&rdquo; to refine the previous rule · Enter to send
        </div>
      </div>
    </div>
  )
}
