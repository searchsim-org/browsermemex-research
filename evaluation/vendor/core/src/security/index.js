/**
 * Security primitives for BrowserMemex.
 *
 * Exposes:
 * - CAPABILITY constants and helpers (capability.js)
 * - POLICY constants and resolver (policy.js)
 *
 * Future additions (Phase 0.5 / Phase 5 / Phase 6):
 * - network-policy.js — per-agent allowlist enforcement
 * - confirmation.js — confirmation flow orchestration
 * - redaction.js — credential redaction for logging
 */

export { CAPABILITY, CAPABILITY_ORDER, meetsCapability, maxCapability, assertCapability } from "./capability.js";
export { POLICY, DEFAULT_POLICY, resolvePolicy } from "./policy.js";
