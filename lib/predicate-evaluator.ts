// ─────────────────────────────────────────────────────────────────────────────
// Predicate Calculus Evaluator — pure TypeScript, zero dependencies.
// Can be imported by Next.js pages (client or server) and Edge Functions alike.
//
// AST grammar (JSONB-serialisable):
//
//   const       { type:"const", value: number|string|boolean }
//   field       { type:"field", name: string }          ← reads from EvaluationContext
//   arithmetic  { type:"arithmetic", op:"+"|"-"|"*"|"/", left, right }
//   comparison  { type:"comparison", op:">"|"<"|">="|"<="|"eq"|"ne", left, right }
//   logical     { type:"logical", op:"and"|"or", left, right }
//               { type:"logical", op:"not", left }
//
// ─────────────────────────────────────────────────────────────────────────────

export type ASTNode =
  | { type: "const"; value: number | string | boolean }
  | { type: "field"; name: string }
  | {
      type: "arithmetic"
      op: "+" | "-" | "*" | "/"
      left: ASTNode
      right: ASTNode
    }
  | {
      type: "comparison"
      op: ">" | "<" | ">=" | "<=" | "eq" | "ne"
      left: ASTNode
      right: ASTNode
    }
  | { type: "logical"; op: "and" | "or"; left: ASTNode; right: ASTNode }
  | { type: "logical"; op: "not"; left: ASTNode; right?: never }

export type EvaluationContext = Record<string, number | string | boolean>

export type TraceNode = {
  label: string
  value: unknown
  pass?: boolean      // only set on boolean-producing nodes
  children: TraceNode[]
}

export type EvalResult = {
  pass: boolean
  value: unknown
  trace: TraceNode
  error?: string
}

// ─── Core recursive evaluator ────────────────────────────────────────────────

function evalNode(
  node: ASTNode,
  ctx: EvaluationContext
): { value: unknown; trace: TraceNode } {
  switch (node.type) {
    case "const": {
      return {
        value: node.value,
        trace: { label: `const`, value: node.value, children: [] },
      }
    }

    case "field": {
      const v = ctx[node.name]
      if (v === undefined)
        throw new Error(`Field "${node.name}" not found in context`)
      return {
        value: v,
        trace: { label: `field: ${node.name}`, value: v, children: [] },
      }
    }

    case "arithmetic": {
      const l = evalNode(node.left, ctx)
      const r = evalNode(node.right, ctx)
      const lv = l.value as number
      const rv = r.value as number
      let result: number
      switch (node.op) {
        case "+": result = lv + rv; break
        case "-": result = lv - rv; break
        case "*": result = lv * rv; break
        case "/":
          if (rv === 0) throw new Error("Division by zero")
          result = lv / rv
          break
      }
      return {
        value: result,
        trace: {
          label: `${node.op} (arithmetic)`,
          value: result,
          children: [l.trace, r.trace],
        },
      }
    }

    case "comparison": {
      const l = evalNode(node.left, ctx)
      const r = evalNode(node.right, ctx)
      const lv = l.value
      const rv = r.value
      let pass: boolean
      switch (node.op) {
        case ">":  pass = (lv as number) >  (rv as number); break
        case "<":  pass = (lv as number) <  (rv as number); break
        case ">=": pass = (lv as number) >= (rv as number); break
        case "<=": pass = (lv as number) <= (rv as number); break
        case "eq": pass = lv === rv; break
        case "ne": pass = lv !== rv; break
      }
      return {
        value: pass,
        trace: {
          label: `${node.op === "eq" ? "=" : node.op === "ne" ? "≠" : node.op} (comparison)`,
          value: pass,
          pass,
          children: [l.trace, r.trace],
        },
      }
    }

    case "logical": {
      if (node.op === "not") {
        const l = evalNode(node.left, ctx)
        const pass = !l.value
        return {
          value: pass,
          trace: {
            label: "not (logical)",
            value: pass,
            pass: pass as boolean,
            children: [l.trace],
          },
        }
      }
      // and / or
      const l = evalNode(node.left, ctx)
      const r = evalNode(node.right, ctx)
      const pass =
        node.op === "and"
          ? Boolean(l.value) && Boolean(r.value)
          : Boolean(l.value) || Boolean(r.value)
      return {
        value: pass,
        trace: {
          label: `${node.op} (logical)`,
          value: pass,
          pass,
          children: [l.trace, r.trace],
        },
      }
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a predicate AST against a context.
 * Returns { pass, value, trace, error? }.
 */
export function evaluateRule(
  ast: ASTNode,
  ctx: EvaluationContext
): EvalResult {
  try {
    const { value, trace } = evalNode(ast, ctx)
    return { pass: Boolean(value), value, trace }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      pass: false,
      value: undefined,
      trace: { label: "error", value: msg, children: [] },
      error: msg,
    }
  }
}

/**
 * Parse raw JSON string and evaluate. Returns EvalResult with error if JSON is
 * invalid.
 */
export function evaluateRuleFromJSON(
  json: string,
  ctx: EvaluationContext
): EvalResult {
  let ast: ASTNode
  try {
    ast = JSON.parse(json) as ASTNode
  } catch {
    return {
      pass: false,
      value: undefined,
      trace: { label: "parse error", value: json, children: [] },
      error: "Invalid JSON",
    }
  }
  return evaluateRule(ast, ctx)
}

/**
 * Render an AST as a compact human-readable string (for tooltips / summaries).
 * e.g.  (invoice_amount > 10000)
 */
export function renderAST(node: ASTNode): string {
  switch (node.type) {
    case "const":
      return typeof node.value === "string" ? `"${node.value}"` : String(node.value)
    case "field":
      return node.name
    case "arithmetic":
      return `(${renderAST(node.left)} ${node.op} ${renderAST(node.right)})`
    case "comparison": {
      const op = node.op === "eq" ? "=" : node.op === "ne" ? "≠" : node.op
      return `(${renderAST(node.left)} ${op} ${renderAST(node.right)})`
    }
    case "logical":
      if (node.op === "not") return `NOT ${renderAST(node.left)}`
      return `(${renderAST(node.left)} ${node.op.toUpperCase()} ${renderAST(node.right)})`
  }
}
