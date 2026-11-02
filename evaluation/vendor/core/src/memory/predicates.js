/**
 * Predicate catalog — classifies relations as functional (single-valued) or
 * multi-valued.
 *
 * From the NuggetIndex paper §3.3.2:
 *   "Multi-valued relations (e.g., board members) accept concurrent values
 *    regardless of overlap. For functional relations: if the newer candidate
 *    has ≥ 2 independent sources, the existing nugget is marked Deprecated;
 *    if the existing nugget has superior evidence, the candidate is deprecated;
 *    ambiguous cases mark both Contested."
 *
 * The catalog determines which branch of Algorithm 2 applies. Unknown
 * predicates default to FUNCTIONAL — conservatively assuming single-valued
 * means more conflicts surface, which is the safer error direction for a
 * trust-sensitive system.
 *
 * See ADR 0005 and:
 *   "NuggetIndex: Governed Atomic Retrieval for Maintainable RAG"
 *   https://arxiv.org/html/2604.27306v1
 */

export const RELATION_KIND = Object.freeze({
  FUNCTIONAL: "functional",
  MULTI_VALUED: "multi_valued",
});

/**
 * Predicates whose subject can have multiple concurrent objects at the same
 * point in time. Conflict detection accepts concurrent values for these.
 */
const MULTI_VALUED_PREDICATES = new Set([
  // tagging / labeling
  "tag",
  "label",
  "labeled-with",
  "category",
  "topic",
  // membership / participation
  "member",
  "members",
  "participant",
  "subscriber",
  "watcher",
  "watches",
  "follower",
  "assignee", // a ticket can have multiple assignees on many systems
  // dependency relationships
  "depends-on",
  "blocks",
  "blocked-by",
  "related-to",
  "references",
  // language-like / attribute-bag relations
  "has-skill",
  "has-attribute",
  "has-feature",
]);

/**
 * Classify a predicate. Returns RELATION_KIND.MULTI_VALUED if the predicate
 * is in the multi-valued set, RELATION_KIND.FUNCTIONAL otherwise.
 *
 * Comparison is case-insensitive on the predicate name.
 */
export function getRelationKind(predicate) {
  const normalized = String(predicate ?? "").toLowerCase().trim();
  return MULTI_VALUED_PREDICATES.has(normalized)
    ? RELATION_KIND.MULTI_VALUED
    : RELATION_KIND.FUNCTIONAL;
}

/**
 * Register a predicate as multi-valued at runtime. Used by users who want to
 * customize behavior for their own predicates without modifying the catalog.
 */
export function registerMultiValuedPredicate(predicate) {
  MULTI_VALUED_PREDICATES.add(String(predicate).toLowerCase().trim());
}
