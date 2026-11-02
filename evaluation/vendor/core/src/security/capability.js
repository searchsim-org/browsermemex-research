/**
 * Capability annotations for action primitives.
 *
 * Every action exposed to agents or skills declares its capability level.
 * The dispatcher reads this annotation and applies the user's policy
 * (allow / prompt / deny) before executing.
 *
 * See: docs/adr/0003-capability-annotations.md
 */

export const CAPABILITY = Object.freeze({
  READ_ONLY: "read_only",
  READ_WITH_NETWORK: "read_with_network",
  WRITE_LOCAL: "write_local",
  WRITE_DOM: "write_dom",
  WRITE_NETWORK: "write_network",
  DESTRUCTIVE: "destructive",
});

export const CAPABILITY_ORDER = Object.freeze([
  CAPABILITY.READ_ONLY,
  CAPABILITY.READ_WITH_NETWORK,
  CAPABILITY.WRITE_LOCAL,
  CAPABILITY.WRITE_DOM,
  CAPABILITY.WRITE_NETWORK,
  CAPABILITY.DESTRUCTIVE,
]);

const CAPABILITY_RANK = Object.fromEntries(
  CAPABILITY_ORDER.map((cap, idx) => [cap, idx])
);

/**
 * Returns true if `actual` is at least as restrictive as `required`.
 * Used for capability envelope checking during delegation.
 */
export function meetsCapability(actual, required) {
  if (!(actual in CAPABILITY_RANK)) throw new Error(`Unknown capability: ${actual}`);
  if (!(required in CAPABILITY_RANK)) throw new Error(`Unknown capability: ${required}`);
  return CAPABILITY_RANK[actual] >= CAPABILITY_RANK[required];
}

/**
 * Returns the more restrictive (higher-rank) of two capabilities.
 * Used to intersect capability envelopes — delegation never widens.
 */
export function maxCapability(a, b) {
  return CAPABILITY_RANK[a] >= CAPABILITY_RANK[b] ? a : b;
}

/**
 * Validate that an annotation is a known capability.
 * Throws if not. Use at module-load time to fail fast.
 */
export function assertCapability(value) {
  if (!CAPABILITY_ORDER.includes(value)) {
    throw new Error(
      `Invalid capability "${value}". Must be one of: ${CAPABILITY_ORDER.join(", ")}`
    );
  }
  return value;
}
