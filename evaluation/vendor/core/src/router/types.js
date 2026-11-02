/**
 * Router types — policy data model + routing decision shape.
 *
 * A Policy is an ordered list of rules + a fallback agent. Each rule has a
 * Match clause (predicates over the task) and a list of preferred agents
 * (in order). Forbidden agents act as a hard exclude.
 *
 * Routing produces a Decision: the chosen agent, the rule that fired (if any),
 * the ranked candidate list, and a human-readable explanation. The Decision
 * is what we persist to `task_runs.routing` for "why this agent?" UX.
 *
 * Routing dimensions per the implementation plan:
 *   - Capability         — does the agent support what the task needs?
 *   - Cost               — per-task USD; cheaper preferred when tied
 *   - Latency            — local CLI vs remote API
 *   - Trust              — user-configured; some agents are not allowed on
 *                          some domains (banking, etc.)
 *   - Recency of success — agents that succeeded recently get a boost
 *   - User override      — explicit "always use X for this kind of task"
 *
 * None of these are special-cased in the router code — they're all expressed
 * as Match predicates that the rule engine evaluates uniformly.
 */

export const MATCH_KIND = Object.freeze({
  URL_PATTERN: "url_pattern",
  TASK_KIND: "task_kind",
  KEYWORDS: "keywords",
  TIME_OF_DAY: "time_of_day",
  CAPABILITY_REQUIRED: "capability_required",
  CAPABILITY_LEVEL: "capability_level",
});

export const DECISION_SOURCE = Object.freeze({
  RULE: "rule",
  OVERRIDE: "override",
  LLM_FALLBACK: "llm_fallback",
  DEFAULT_FALLBACK: "default_fallback",
  NO_AGENT_AVAILABLE: "no_agent_available",
});

/**
 * @typedef {Object} Match
 *   A predicate over a Task. Multiple Match objects combined with logical AND.
 *
 * @property {keyof MATCH_KIND} kind
 * @property {string} [pattern]              — for URL_PATTERN (glob with * and **)
 * @property {string[]} [kinds]              — for TASK_KIND (allowlist)
 * @property {string[]} [terms]              — for KEYWORDS (any-of, case-insensitive)
 * @property {object} [window]               — for TIME_OF_DAY:
 *                                             { fromHour: 0-23, toHour: 0-23 }
 * @property {string} [capability]           — for CAPABILITY_REQUIRED:
 *                                             only consider agents that
 *                                             support this capability flag
 * @property {string} [maxCapability]        — for CAPABILITY_LEVEL:
 *                                             reject agents whose task
 *                                             capability would exceed this
 *                                             (e.g., 'write_dom' blocks
 *                                             destructive tasks)
 */

/**
 * @typedef {Object} Rule
 * @property {string} id
 * @property {Match[]} match                 — all-of (logical AND)
 * @property {string[]} preferred            — agent ids in priority order
 * @property {string[]} [forbidden]          — agent ids never picked when this rule matches
 * @property {string} [reason]               — human explanation used in Decision.explain
 */

/**
 * @typedef {Object} Policy
 * @property {Rule[]} rules
 * @property {string} fallback               — default agent id when nothing matches
 * @property {Override[]} [overrides]        — explicit user-pinned mappings
 * @property {boolean} [llmFallbackEnabled=false]
 */

/**
 * @typedef {Object} Override
 *   "For tasks matching X, always use agent Y." User-pinned, highest priority.
 *
 * @property {Match[]} match
 * @property {string} agentId
 * @property {string} [reason]
 */

/**
 * @typedef {Object} Decision
 * @property {string|null} chosenAgentId
 * @property {keyof DECISION_SOURCE} source
 * @property {string|null} ruleId            — rule that fired, if any
 * @property {string[]} candidates           — full ranked list considered
 * @property {string[]} forbidden            — ids removed by forbidden clauses
 * @property {string[]} unavailable          — ids removed because not detected/installed
 * @property {string} explanation            — one-paragraph human-readable
 */

/**
 * @typedef {Object} Availability
 *   Snapshot of which agents are usable right now.
 *
 * @property {string[]} installed            — agents the user has installed
 * @property {string[]} configured           — agents with browser-memex configured
 * @property {Record<string, number>} [recentSuccessRate]
 *                                           — agent id → 0..1 (recent success rate)
 * @property {Record<string, number>} [recentLatencyMs]
 *                                           — agent id → typical P95 ms
 * @property {Record<string, number>} [recentCostUsd]
 *                                           — agent id → typical cost per task
 */
