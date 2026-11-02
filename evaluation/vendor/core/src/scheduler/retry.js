/**
 * Retry policy + circuit breaker primitives.
 *
 * Pure functions — no clocks, no random globals. Callers pass `now` and
 * `rand` (defaults to Math.random) for deterministic testing.
 */

export const CIRCUIT_STATE = Object.freeze({
  CLOSED: "closed",        // OK, requests pass through
  OPEN: "open",            // failures over threshold, requests blocked
  HALF_OPEN: "half_open",  // cooldown elapsed, allow one trial
});

/**
 * Exponential backoff with jitter.
 *
 * @param {number} failureCount        — number of consecutive failures (0 = first attempt)
 * @param {object} [opts]
 * @param {number} [opts.baseMs=1000]
 * @param {number} [opts.maxMs=300000] — 5 min cap
 * @param {number} [opts.jitter=0.2]   — ±20% jitter window
 * @param {() => number} [opts.rand]   — pseudo-random in [0,1); injected for tests
 * @returns {number}                   — delay before next retry, in ms
 */
export function backoffMs(failureCount, opts = {}) {
  const baseMs = opts.baseMs ?? 1000;
  const maxMs = opts.maxMs ?? 5 * 60 * 1000;
  const jitter = opts.jitter ?? 0.2;
  const rand = typeof opts.rand === "function" ? opts.rand : Math.random;

  if (failureCount < 0) failureCount = 0;
  const exp = Math.min(maxMs, baseMs * Math.pow(2, failureCount));
  // Jitter symmetric around exp: [exp - exp*jitter, exp + exp*jitter]
  const offset = exp * jitter * (rand() * 2 - 1);
  return Math.max(0, Math.floor(exp + offset));
}

/**
 * Circuit breaker state machine — given current failure count + last
 * failure time + cooldown rules, decide whether this call is allowed.
 *
 * @param {object} state
 * @param {number} state.failureCount
 * @param {number|null} state.lastFailureAt
 * @param {number} now
 * @param {object} [opts]
 * @param {number} [opts.threshold=5]   — consecutive failures before tripping
 * @param {number} [opts.cooldownMs=300000] — 5 min cooldown before half-open
 * @returns {keyof CIRCUIT_STATE}
 */
export function circuitState(state, now, opts = {}) {
  const threshold = opts.threshold ?? 5;
  const cooldownMs = opts.cooldownMs ?? 5 * 60 * 1000;

  if (!state || state.failureCount < threshold) return CIRCUIT_STATE.CLOSED;
  if (!Number.isFinite(state.lastFailureAt)) return CIRCUIT_STATE.OPEN;
  if (now - state.lastFailureAt > cooldownMs) return CIRCUIT_STATE.HALF_OPEN;
  return CIRCUIT_STATE.OPEN;
}

/**
 * Decide whether a task is permanently failed (give up retrying).
 */
export function isPermanentFailure(failureCount, opts = {}) {
  const maxRetries = opts.maxRetries ?? 5;
  return failureCount >= maxRetries;
}
