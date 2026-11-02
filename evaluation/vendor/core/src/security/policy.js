/**
 * Capability policy: how to handle each capability level per domain.
 *
 * Three outcomes: ALLOW, PROMPT (show confirmation UI), DENY.
 *
 * See: docs/adr/0003-capability-annotations.md
 */

import { CAPABILITY, assertCapability } from "./capability.js";

export const POLICY = Object.freeze({
  ALLOW: "allow",
  PROMPT: "prompt",
  DENY: "deny",
});

/** v1.0 default policy. Users can tighten but cannot loosen DESTRUCTIVE below PROMPT. */
export const DEFAULT_POLICY = Object.freeze({
  [CAPABILITY.READ_ONLY]: POLICY.ALLOW,
  [CAPABILITY.READ_WITH_NETWORK]: POLICY.ALLOW,
  [CAPABILITY.WRITE_LOCAL]: POLICY.ALLOW,
  [CAPABILITY.WRITE_DOM]: POLICY.ALLOW,
  [CAPABILITY.WRITE_NETWORK]: POLICY.PROMPT,
  [CAPABILITY.DESTRUCTIVE]: POLICY.PROMPT,
});

/** Capabilities that cannot be silently auto-approved. */
const HARD_PROMPT_FLOOR = new Set([CAPABILITY.DESTRUCTIVE]);

/**
 * Resolve the policy decision for a given capability and domain.
 *
 * @param {string} capability — one of the CAPABILITY constants
 * @param {string} domain — origin or "*" for global
 * @param {object} userPolicy — user overrides (capability -> POLICY)
 * @param {Set<string>} autoApproveDomains — domains where WRITE_NETWORK is auto-approved
 */
export function resolvePolicy(capability, domain, userPolicy = {}, autoApproveDomains = new Set()) {
  assertCapability(capability);

  // User cannot loosen the hard floor
  if (HARD_PROMPT_FLOOR.has(capability) && userPolicy[capability] === POLICY.ALLOW) {
    return POLICY.PROMPT;
  }

  // Domain-specific auto-approve for WRITE_NETWORK
  if (capability === CAPABILITY.WRITE_NETWORK && autoApproveDomains.has(domain)) {
    return POLICY.ALLOW;
  }

  return userPolicy[capability] ?? DEFAULT_POLICY[capability];
}
