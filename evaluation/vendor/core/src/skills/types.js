/**
 * Skill system — type definitions.
 *
 * A Skill is a reusable, parameterized workflow distilled from successful
 * task runs. Once a Skill exists, the user can invoke it by name with
 * different inputs and the Scheduler dispatches it like any other task.
 *
 * Distillation: after N successful runs of the same task template (same
 * `payload.template` field or sufficiently similar fingerprint), the system
 * proposes a Skill. The user confirms, optionally edits the steps, and the
 * Skill enters the library.
 *
 * Skills are export/importable with HMAC signing so users can share them
 * between machines without round-tripping through a server.
 */

export const SKILL_STATUS = Object.freeze({
  ACTIVE: "active",
  DRAFT: "draft",
  ARCHIVED: "archived",
});

export const SKILL_STEP_KIND = Object.freeze({
  /** Run a sub-task via the scheduler (recursive composition allowed). */
  RUN_TASK: "run_task",
  /** Read from the WebNugget memory layer. */
  READ_MEMORY: "read_memory",
  /** Persist a fact to memory after a step. */
  WRITE_MEMORY: "write_memory",
  /** Make an HTTP/MCP call directly. */
  CALL_MCP_TOOL: "call_mcp_tool",
  /** Branch on a JSONPath/expression against accumulated state. */
  CONDITIONAL: "conditional",
});

/** The proposal threshold — fewer runs of a template won't get auto-suggested. */
export const DEFAULT_DISTILLATION_THRESHOLD = 3;

/**
 * @typedef {Object} SkillStep
 * @property {string} id
 * @property {keyof SKILL_STEP_KIND} kind
 * @property {object} params               — step-kind-specific
 * @property {string} [output]             — variable name that holds the result
 */

/**
 * @typedef {Object} SkillTrigger
 *   How the user invokes this skill — by URL pattern, phrase, or both.
 *
 * @property {string} [urlPattern]
 * @property {string[]} [phrases]
 * @property {string[]} [keywords]
 */

/**
 * @typedef {Object} SkillInput
 * @property {string} name
 * @property {'string' | 'number' | 'boolean' | 'url'} type
 * @property {string} [description]
 * @property {*} [defaultValue]
 * @property {boolean} [required=true]
 */

/**
 * @typedef {Object} SkillOutput
 * @property {string} name
 * @property {'string' | 'number' | 'object' | 'list'} type
 * @property {string} [description]
 */

/**
 * @typedef {Object} SkillProvenance
 * @property {string[]} distilledFromTaskIds  — original tasks that led to this skill
 * @property {number} confirmedRuns           — how many times the skill itself has run
 * @property {number|null} lastSuccessAt      — Unix ms of last success
 * @property {number} successRate             — 0..1
 */

/**
 * @typedef {Object} Skill
 * @property {string} id
 * @property {string} name                    — unique within the user's library
 * @property {string} [description]
 * @property {keyof SKILL_STATUS} status
 * @property {SkillTrigger|null} trigger
 * @property {string[]} domains               — authorized domains (security gate)
 * @property {SkillStep[]} steps
 * @property {SkillInput[]} inputs
 * @property {SkillOutput[]} outputs
 * @property {string} capability              — capability annotation (ADR 0003)
 * @property {SkillProvenance} provenance
 * @property {boolean} shareable              — user-toggled; default false
 * @property {number} version                 — bumped on edit
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {string} hmac                    — integrity tag; valid for export
 */

/**
 * @typedef {Object} SkillCandidate
 *   A proposed skill from the distillation engine. Not yet stored as a Skill;
 *   the user must confirm.
 *
 * @property {string} suggestedName
 * @property {string} explanation
 * @property {string[]} sourceTaskIds
 * @property {object} template                — payload template used by the source tasks
 * @property {number} successCount
 * @property {number} firstSeenAt
 * @property {number} lastSeenAt
 */
