/**
 * Variable resolution + template interpolation for workflows.
 *
 * Template syntax (intentionally minimal):
 *
 *   ${inputs.<key>}                — pull from WorkflowContext.inputs
 *   ${steps.<stageId>.<path>}      — pull from WorkflowContext.stageOutputs
 *   ${vars.<name>}                 — pull from WorkflowContext.variables
 *
 * No arithmetic, no function calls. Anything more complex belongs in a
 * `CONDITIONAL` stage that calls a JS predicate via a dedicated step kind
 * (deferred — not in v1.0 scope).
 *
 * Resolution is structural: applied recursively over objects/arrays so a
 * stage's params can be a nested object with `${...}` references anywhere.
 */

const TEMPLATE_RE = /\$\{([^}]+)\}/g;

/**
 * Resolve a single dotted-path expression against the context.
 *
 * @param {string} expr  e.g., "inputs.url", "steps.s1.tabId", "vars.userName"
 * @param {object} context
 */
export function resolveExpression(expr, context) {
  const parts = String(expr).split(".");
  if (parts.length < 2) return undefined;
  const root = parts[0];
  const rest = parts.slice(1);
  let cursor;
  switch (root) {
    case "inputs":
      cursor = context?.inputs;
      break;
    case "steps":
      cursor = context?.stageOutputs;
      break;
    case "vars":
      cursor = context?.variables;
      break;
    default:
      return undefined;
  }
  for (const k of rest) {
    if (cursor == null) return undefined;
    cursor = cursor[k];
  }
  return cursor;
}

/**
 * Interpolate `${...}` references in a string, returning a string.
 * Non-string values are coerced via JSON.stringify when embedded mid-string;
 * a single bare `${expr}` returns the raw value (so an object reference stays
 * an object).
 */
export function interpolate(template, context) {
  if (typeof template !== "string") return template;
  const matches = [...template.matchAll(TEMPLATE_RE)];
  if (matches.length === 0) return template;
  if (matches.length === 1 && matches[0][0] === template.trim()) {
    // Pure-reference case: return raw value (may be object/array/etc.)
    return resolveExpression(matches[0][1].trim(), context);
  }
  return template.replace(TEMPLATE_RE, (_full, expr) => {
    const v = resolveExpression(expr.trim(), context);
    if (v === undefined || v === null) return "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  });
}

/**
 * Recursively apply interpolation to every string in a value (object / array /
 * scalar). Returns a NEW object with the same shape and resolved values.
 */
export function resolveValue(value, context) {
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, context));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolveValue(v, context);
    }
    return out;
  }
  if (typeof value === "string") return interpolate(value, context);
  return value;
}

/**
 * Evaluate a CONDITIONAL stage's expression. Returns boolean.
 *
 * Supported forms (chosen for safety — no eval):
 *   - "${vars.x}"                          → truthy / falsy of the resolved value
 *   - "${vars.x} == 'foo'"                 → equality
 *   - "${vars.x} != 'foo'"
 *   - "${vars.x} > 5"
 *   - "${vars.x} < 5"
 *   - "${vars.x} >= 5"
 *   - "${vars.x} <= 5"
 *
 * Operators are lexed; the right-hand side is parsed as JSON if it parses,
 * otherwise treated as a literal string.
 */
export function evaluateCondition(expression, context) {
  if (typeof expression !== "string" || expression.trim().length === 0) return false;
  const trimmed = expression.trim();

  const OP_RE = /^(.*?)\s*(==|!=|>=|<=|>|<)\s*(.*)$/;
  const m = trimmed.match(OP_RE);

  if (!m) {
    // Pure truthiness check
    const v = interpolate(trimmed, context);
    return Boolean(v);
  }

  const left = interpolate(m[1].trim(), context);
  const op = m[2];
  const rightRaw = m[3].trim();
  let right;
  try {
    right = JSON.parse(rightRaw);
  } catch {
    // Strip surrounding quotes if any, otherwise use as-is
    right = rightRaw.replace(/^['"]|['"]$/g, "");
  }

  switch (op) {
    case "==":
      // eslint-disable-next-line eqeqeq
      return left == right;
    case "!=":
      // eslint-disable-next-line eqeqeq
      return left != right;
    case ">":
      return Number(left) > Number(right);
    case "<":
      return Number(left) < Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<=":
      return Number(left) <= Number(right);
    default:
      return false;
  }
}
