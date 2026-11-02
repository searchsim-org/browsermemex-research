/**
 * WorkflowEngine — executes a workflow (sequence of stages) against an
 * injected dispatcher.
 *
 * The engine walks stages in order. Stage params are resolved against the
 * running context (inputs + stageOutputs + variables) via variables.js, so a
 * later stage can reference an earlier stage's output via `${steps.s1.url}`.
 *
 * RUN_TASK stages are dispatched through the same `TaskDispatcher` interface
 * as the Scheduler (8.4 module). RUN_ACTION stages dispatch by action id +
 * params, using the same dispatcher; the dispatcher is responsible for
 * resolving action descriptors and invoking the right underlying MCP tool.
 * CONDITIONAL stages branch via evaluateCondition.
 *
 * Failures: if a stage fails and `continueOnError` is false (default), the
 * engine halts and returns the partial result. continueOnError=true marks
 * the stage failed and proceeds.
 */

import { STAGE_KIND, STAGE_RESULT } from "./types.js";
import { resolveValue, evaluateCondition } from "./variables.js";

export class WorkflowEngine {
  /**
   * @param {object} opts
   * @param {object} opts.dispatcher
   *   Must implement:
   *     - dispatchTask(task, ctx)    → Promise<{ success, result, ... }>
   *     - dispatchAction(actionId, params, ctx) → Promise<{ success, result, ... }>
   *   The engine's caller wires this to AgentDispatcher (8.4) or a test double.
   * @param {(name: string, payload: object) => Promise<void>} [opts.notify]
   *   Optional callback for stage-level events; useful for UI live updates.
   */
  constructor({ dispatcher, notify }) {
    if (!dispatcher || typeof dispatcher.dispatchTask !== "function") {
      throw new Error("WorkflowEngine: dispatcher.dispatchTask required");
    }
    if (typeof dispatcher.dispatchAction !== "function") {
      throw new Error("WorkflowEngine: dispatcher.dispatchAction required");
    }
    this.dispatcher = dispatcher;
    this.notify = typeof notify === "function" ? notify : async () => {};
  }

  /**
   * Run the workflow.
   *
   * @param {object[]} stages — WorkflowStage[]
   * @param {object} [inputs] — caller-provided inputs
   * @param {number} [now]    — clock injection; defaults to Date.now()
   */
  async run(stages, inputs = {}, now = Date.now()) {
    if (!Array.isArray(stages) || stages.length === 0) {
      return {
        success: false,
        stages: [],
        context: { inputs, stageOutputs: {}, variables: {} },
        error: "workflow has no stages",
      };
    }

    const context = {
      inputs: { ...inputs },
      stageOutputs: {},
      variables: {},
    };

    const stageById = new Map(stages.map((s) => [s.id, s]));
    const results = [];

    let cursor = 0;
    let overallOk = true;
    let halted = false;

    while (cursor < stages.length && !halted) {
      const stage = stages[cursor];
      const startedAt = now + cursor;
      await this.notify("stage:start", { stageId: stage.id });

      const resolved = resolveValue(stage.params ?? {}, context);
      let stageResult;

      try {
        switch (stage.kind) {
          case STAGE_KIND.RUN_TASK:
            stageResult = await this.#runTask(stage, resolved);
            break;
          case STAGE_KIND.RUN_ACTION:
            stageResult = await this.#runAction(stage, resolved);
            break;
          case STAGE_KIND.CONDITIONAL: {
            const matched = evaluateCondition(resolved.expression, context);
            const nextId = matched ? resolved.thenStageId : resolved.elseStageId;
            stageResult = { success: true, result: { matched, jumpTo: nextId ?? null } };
            break;
          }
          default:
            throw new Error(`unknown stage.kind '${stage.kind}'`);
        }
      } catch (e) {
        stageResult = { success: false, error: e?.message ?? String(e) };
      }

      const endedAt = startedAt + 1;
      if (stageResult.success) {
        context.stageOutputs[stage.id] = stageResult.result;
        if (stage.outputAs) {
          context.variables[stage.outputAs] = stageResult.result;
        }
        results.push({
          stageId: stage.id,
          status: STAGE_RESULT.SUCCESS,
          output: stageResult.result,
          startedAt,
          endedAt,
        });
        await this.notify("stage:success", { stageId: stage.id });
      } else {
        results.push({
          stageId: stage.id,
          status: STAGE_RESULT.FAILURE,
          error: stageResult.error,
          startedAt,
          endedAt,
        });
        await this.notify("stage:failure", { stageId: stage.id, error: stageResult.error });
        if (!stage.continueOnError) {
          overallOk = false;
          halted = true;
          break;
        }
      }

      // CONDITIONAL branching
      if (stage.kind === STAGE_KIND.CONDITIONAL && stageResult.success) {
        const jumpTo = stageResult.result?.jumpTo;
        if (jumpTo && stageById.has(jumpTo)) {
          cursor = stages.findIndex((s) => s.id === jumpTo);
          continue;
        }
        if (jumpTo === null) {
          // explicit "skip the else"; advance normally
        }
      }

      cursor++;
    }

    return {
      success: overallOk,
      stages: results,
      context,
      error: overallOk ? undefined : `workflow halted at ${results[results.length - 1]?.stageId}`,
    };
  }

  async #runTask(stage, params) {
    const task = {
      kind: "one_shot",
      title: params.title ?? `Stage ${stage.id}`,
      payload: params.payload ?? {},
      capability: params.capability ?? "read_with_network",
      creator: params.creator ?? "workflow",
      routing: stage.agentId ? { agentId: stage.agentId } : null,
    };
    const r = await this.dispatcher.dispatchTask(task, {});
    return { success: Boolean(r?.success), result: r?.result, error: r?.error };
  }

  async #runAction(_stage, params) {
    const actionId = params.actionId;
    const actionParams = params.params ?? {};
    if (typeof actionId !== "string") {
      return { success: false, error: "RUN_ACTION: params.actionId required" };
    }
    const r = await this.dispatcher.dispatchAction(actionId, actionParams, {});
    return { success: Boolean(r?.success), result: r?.result, error: r?.error };
  }
}
