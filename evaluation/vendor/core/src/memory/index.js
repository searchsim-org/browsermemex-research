/**
 * WebNugget memory layer — package entry point.
 *
 * NuggetIndex-based governed atomic retrieval for browser-extracted facts.
 * See ADR 0005 and docs/dev/memory-architecture.md.
 */

export * from "./types.js";
export * from "./keying.js";
export * from "./predicates.js";
export * from "./domain-policies.js";
export { detectConflict, CONFLICT_OUTCOME, jaccardValue, intervalsOverlap } from "./algorithms/conflicts.js";
export { inferValidity, UI_SIGNAL } from "./algorithms/validity.js";
export {
  SqliteStore,
  SCHEMA_VERSION,
  LEGACY_PROFILE_ID,
  MEMORY_TIER,
  DEFAULT_TIER,
} from "./storage/sqlite.js";
export { NuggetStore } from "./nugget-store.js";
