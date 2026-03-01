import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

// ─── System prompt ─────────────────────────────────────────────────────────────
// Describes the AST grammar completely. Small enough to fit in a system prompt
// without burning tokens, precise enough that Claude stays on-grammar.

const SYSTEM_PROMPT = `You are a predicate compiler for a headless ERP system.
Your job: convert natural language business rules into a strictly typed JSON AST.

## Grammar (exhaustive — no other node types exist)

\`\`\`
const       { "type": "const",      "value": <number|string|boolean> }
field       { "type": "field",      "name": "<field_name>" }
arithmetic  { "type": "arithmetic", "op": "+"|"-"|"*"|"/", "left": <node>, "right": <node> }
comparison  { "type": "comparison", "op": ">"|"<"|">="|"<="|"eq"|"ne", "left": <node>, "right": <node> }
logical-2   { "type": "logical",    "op": "and"|"or",  "left": <node>, "right": <node> }
logical-1   { "type": "logical",    "op": "not",       "left": <node> }
\`\`\`

Use "eq" for string/boolean equality and "ne" for inequality.
Use ">" / "<" / ">=" / "<=" for numeric comparisons only.

## Available context fields

| field            | type   | example values                              |
|------------------|--------|---------------------------------------------|
| invoice_amount   | number | 12000                                       |
| order_value      | number | 8500                                        |
| customer_tier    | string | "platinum" \| "gold" \| "silver" \| "standard" |
| unit_price       | number | 58.50                                       |
| market_avg       | number | 50.00                                       |
| credit_remaining | number | 15000                                       |
| quantity         | number | 100                                         |

If the user refers to a concept that maps to one of these fields, use it.
If they refer to something with NO matching field, reply with JSON:
{ "error": "Unknown field: <what they said>. Available fields: invoice_amount, order_value, customer_tier, unit_price, market_avg, credit_remaining, quantity" }

## Conversation memory
If the user says "also" / "and also" / "but" / "except" / "additionally" — they are refining the PREVIOUS predicate. Compose using logical AND/OR as appropriate.
If they say "instead" / "new rule" / "start over" — ignore the previous predicate.

## Output format
Return ONLY a JSON object with this structure:
{
  "ast": <the AST node>,
  "summary": "<one short sentence explaining the rule in plain language>"
}

No markdown. No code fences. No explanation outside the JSON. Pure JSON only.

## Examples

User: "reject orders where the invoice is over 10000"
→ {"ast":{"type":"comparison","op":">","left":{"type":"field","name":"invoice_amount"},"right":{"type":"const","value":10000}},"summary":"Reject when invoice_amount exceeds 10,000."}

User: "flag if unit price is more than 10% above market average"
→ {"ast":{"type":"comparison","op":">","left":{"type":"field","name":"unit_price"},"right":{"type":"arithmetic","op":"*","left":{"type":"field","name":"market_avg"},"right":{"type":"const","value":1.1}}},"summary":"Reject when unit_price is more than 10% above market_avg."}

User: "only for standard or silver customers"
→ {"ast":{"type":"logical","op":"or","left":{"type":"comparison","op":"eq","left":{"type":"field","name":"customer_tier"},"right":{"type":"const","value":"standard"}},"right":{"type":"comparison","op":"eq","left":{"type":"field","name":"customer_tier"},"right":{"type":"const","value":"silver"}}},"summary":"Match when customer is standard or silver tier."}
`

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface RequestBody {
  messages: ChatMessage[]
}

interface CompilerResponse {
  ast?: unknown
  summary?: string
  error?: string
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured in .env.local' },
      { status: 500 }
    )
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { messages } = body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages array required' }, { status: 400 })
  }

  try {
    const client = new Anthropic({ apiKey })

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    })

    const raw = response.content[0]?.type === 'text' ? response.content[0].text : ''

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()

    let parsed: CompilerResponse
    try {
      parsed = JSON.parse(cleaned) as CompilerResponse
    } catch {
      return NextResponse.json(
        { error: `Claude returned non-JSON: ${cleaned.slice(0, 200)}` },
        { status: 422 }
      )
    }

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 422 })
    }

    return NextResponse.json({
      ast: parsed.ast,
      summary: parsed.summary ?? '',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
