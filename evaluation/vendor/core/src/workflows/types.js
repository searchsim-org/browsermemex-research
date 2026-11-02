/**
 * Workflow types.
 *
 * A Workflow is a sequence of stages where each stage is one of:
 *   - RUN_TASK     — dispatch a sub-task via the Scheduler (typically pinning a
 *                    specific agent via routing.agentId)
 *   - RUN_ACTION   — invoke a browser action (8.6) by id with parameters
 *   - CONDITIONAL  — branch based on an expression over context state
 *
 * Stages produce outputs that subsequent stages can reference via `${...}`
 * template syntax. Variable resolution is delegated to variables.js.
 *
 * Workflows are stored as Skills (skill.steps[] is the workflow). The
 * WorkflowEngine reads a Skill and walks it. This means: every skill IS a
 * workflow; the trivial case is a single RUN_TASK step.
 */

export const STAGE_KIND = Object.freeze({
  RUN_TASK: "run_task",
  RUN_ACTION: "run_action",
  CONDITIONAL: "conditional",
});

export const STAGE_RESULT = Object.freeze({
  SUCCESS: "success",
  FAILURE: "failure",
  SKIPPED: "skipped",
});

/**
 * @typedef {Object} WorkflowStage
 * @property {string} id                       — stable identifier within the workflow
 * @property {keyof STAGE_KIND} kind
 * @property {string} [agentId]                — pin a specific agent (RUN_TASK only)
 * @property {object} params                   — kind-specific:
 *   RUN_TASK    → { template, payload?, capability?, schedule? }
 *   RUN_ACTION  → { actionId, params }
 *   CONDITIONAL → { expression, thenStageId, elseStageId? }
 * @property {string} [outputAs]               — variable name binding for the result
 * @property {boolean} [continueOnError=false] — if true, failures don't halt the workflow
 */

/**
 * @typedef {Object} WorkflowContext
 *   Threaded through every stage. Mutated as the workflow progresses.
 *
 * @property {object} inputs                   — caller-provided workflow inputs
 * @property {Record<string, *>} stageOutputs  — output of each stage, keyed by stage id
 * @property {Record<string, *>} variables     — flat bag for explicit outputAs bindings
 */

/**
 * @typedef {Object} WorkflowRunResult
 * @property {boolean} success                 — true if no stage failed (or all failures
 *                                                were marked continueOnError)
 * @property {Array<StageResult>} stages
 * @property {WorkflowContext} context         — final state (variables + stage outputs)
 * @property {string} [error]
 */

/**
 * @typedef {Object} StageResult
 * @property {string} stageId
 * @property {keyof STAGE_RESULT} status
 * @property {*} [output]
 * @property {string} [error]
 * @property {number} startedAt
 * @property {number} endedAt
 */
