/**
 * WebNugget memory layer — type definitions.
 *
 * Implements the nugget record model N = (k, f, σ, ε, Π) from the
 * NuggetIndex paper, adapted for web-extracted facts. See ADR 0005 and:
 *
 *   "NuggetIndex: Governed Atomic Retrieval for Maintainable RAG"
 *   https://arxiv.org/html/2604.27306v1
 *
 * Code-side concretization of the paper's §3.2 (Nugget Record Model).
 */

/** Nugget kinds — paper §3.2 */
export const NUGGET_KIND = Object.freeze({
  SEMANTIC_FACT: "SemanticFact",
  EPISODIC_EVENT: "EpisodicEvent",
  INSTRUCTION: "Instruction",
  USER_PREFERENCE: "UserPreference",
});

/** Lifecycle states — paper §3.2 */
export const STATUS = Object.freeze({
  ACTIVE: "Active",
  DEPRECATED: "Deprecated",
  CONTESTED: "Contested",
});

/** Rank within a key — paper §3.2 */
export const RANK = Object.freeze({
  PREFERRED: "Preferred",
  NORMAL: "Normal",
  DEPRECATED: "Deprecated",
});

/**
 * Scope dimension — extends paper's {global, user, group} per ADR 0002
 * to support multi-agent isolation.
 */
export const SCOPE = Object.freeze({
  GLOBAL: "global",
  USER: "user",
  AGENT: (id) => `agent:${id}`,
  SESSION: (id) => `session:${id}`,
});

/** Sentinel for open-ended validity end times (paper uses +∞). */
export const NEVER_EXPIRES = null;

/**
 * @typedef {Object} Triple
 * @property {string} subject
 * @property {string} predicate
 * @property {string} object
 */

/**
 * @typedef {Object} Validity
 * @property {number} start          - Unix ms (paper: t_s)
 * @property {number|null} end       - Unix ms or null (paper: t_e, null = +∞)
 * @property {string} scope          - paper's σ.scope, see SCOPE
 * @property {string} [location]     - paper's σ.location (e.g., URL host)
 * @property {string} [sourceType]   - paper's σ.sourceType (e.g., 'dashboard', 'issue-tracker')
 */

/**
 * @typedef {Object} Epistemic
 * @property {keyof STATUS} status   - paper: ε.status
 * @property {keyof RANK} rank       - paper: ε.rank
 * @property {number} confidence     - 0..1, paper: ε.confidence
 * @property {number} evidenceCount  - distinct provenance entries
 */

/**
 * Web-native provenance — extends paper §3.2 Π with browser-specific
 * fields (sourceUrl, DOM ref, screenshot hash). These are opaque to
 * Algorithm 1 and Algorithm 2 — they exist for auditability and the UI.
 *
 * @typedef {Object} Provenance
 * @property {string} sourceUrl
 * @property {number} [domElementRef]      - CDP backendNodeId
 * @property {string} [pageTitle]
 * @property {string[]} [navigationPath]
 * @property {string} [screenshotHash]
 * @property {number} extractedAt          - Unix ms
 * @property {string} extractionSessionId
 * @property {string} agentId
 */

/**
 * @typedef {Object} Nugget
 * @property {string} id                   - stable hash-based identifier
 * @property {keyof NUGGET_KIND} kind      - paper: k
 * @property {Triple} fact                 - paper: f
 * @property {Validity} validity           - paper: σ
 * @property {Epistemic} epistemic         - paper: ε
 * @property {Provenance[]} provenance     - paper: Π (extended for web)
 * @property {string} canonicalText        - paper: ℓ_n, BM25-indexed
 * @property {string} nuggetKey            - paper: κ = (s_norm, p, scope)
 * @property {string|null} parentId        - for version graph
 * @property {number} createdAt            - Unix ms
 */

/**
 * View on the index at query time — paper §3.4.
 * 'active' returns only Active nuggets valid at t.
 * 'active_plus_contested' includes Contested for explicit uncertainty.
 */
export const VIEW = Object.freeze({
  ACTIVE: "active",
  ACTIVE_PLUS_CONTESTED: "active_plus_contested",
});
