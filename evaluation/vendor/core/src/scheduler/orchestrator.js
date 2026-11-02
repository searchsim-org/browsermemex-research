/**
 * Scheduler orchestrator — tick-driven loop that runs ready tasks.
 *
 * Given:
 *   - a TaskStore
 *   - a TaskDispatcher (anything implementing { dispatch(task) → Promise<RunResult> })
 *   - optionally a NotificationSink
 *
 * Each call to `tick(now)`:
 *   1. Pulls ready tasks from the store
 *   2. For each: claims it (atomic pending → running), dispatches, awaits result
 *   3. For WATCHER tasks: evaluates the predicate; sets notificationSent if it
 *      fires and dispatches via the notification sink
 *   4. Records success/failure in the store; the store handles rescheduling
 *      and retry/backoff
 *
 * Designed for two execution modes:
 *   - "drain": process every ready task synchronously in sequence
 *   - "burst": process up to N tasks; useful when wired to `chrome.alarms`
 *              which wakes the service worker periodically
 *
 * Time is always injected — no implicit Date.now in any decision branch.
 */

import { TASK_KIND } from "./types.js";
import { evaluatePredicate } from "./predicates.js";

/**
 * @typedef {Object} TaskDispatcher
 * @property {(task: object, ctx: object) => Promise<RunResult>} dispatch
 */

/**
 * @typedef {Object} RunResult
 * @property {boolean} success
 * @property {*} [result]                 — payload from the agent
 * @property {string} [error]             — error message on failure
 * @property {*} [sample]                 — for WATCHER/TRACKER: observed value
 * @property {number} [extractedValue]    — for TRACKER: numeric value
 * @property {string} [extractedText]     — for TRACKER: text representation
 */

/**
 * @typedef {Object} NotificationSink
 * @property {(notif: object) => Promise<void>} notify
 */

export class Scheduler {
  /**
   * @param {object} opts
   * @param {import("./task-store.js").TaskStore} opts.taskStore
   * @param {TaskDispatcher} opts.dispatcher
   * @param {NotificationSink} [opts.notifications]
   * @param {object} [opts.retry]    — passed to TaskStore.fail
   */
  constructor({ taskStore, dispatcher, notifications, retry }) {
    if (!taskStore) throw new Error("Scheduler: taskStore required");
    if (!dispatcher || typeof dispatcher.dispatch !== "function") {
      throw new Error("Scheduler: dispatcher with dispatch(task) required");
    }
    this.taskStore = taskStore;
    this.dispatcher = dispatcher;
    this.notifications = notifications ?? null;
    this.retryOpts = retry ?? {};
  }

  /**
   * Run one tick. Pulls up to `limit` ready tasks, processes each in
   * sequence. Returns a summary of what happened.
   */
  async tick(now, { limit = 25 } = {}) {
    const ready = this.taskStore.readyTasks(now, limit);
    const outcomes = [];
    for (const task of ready) {
      const outcome = await this.#runOne(task, now);
      outcomes.push(outcome);
    }
    return { processed: outcomes.length, outcomes };
  }

  /**
   * Run one task end-to-end. Public for callers that want fine-grained
   * control (e.g., running a single task on user demand).
   */
  async runOnce(taskId, now) {
    const task = this.taskStore.get(taskId);
    if (!task) throw new Error(`runOnce: task '${taskId}' not found`);
    return this.#runOne(task, now);
  }

  async #runOne(task, now) {
    const claimed = this.taskStore.claim(task.id, now);
    if (!claimed) {
      return { taskId: task.id, skipped: true, reason: "could not claim (status changed)" };
    }

    let result;
    try {
      result = await this.dispatcher.dispatch(claimed, { now });
    } catch (e) {
      const errMsg = (e && (e.message || e.toString())) || "dispatcher threw";
      this.taskStore.fail(claimed.id, errMsg, now, this.retryOpts);
      return { taskId: claimed.id, success: false, error: errMsg };
    }

    if (!result || !result.success) {
      const errMsg = result?.error ?? "dispatcher returned failure";
      this.taskStore.fail(claimed.id, errMsg, now, this.retryOpts);
      return { taskId: claimed.id, success: false, error: errMsg };
    }

    // Build the run outcome the store will persist
    const runOutcome = {
      result: result.result,
      extractedValue: result.extractedValue,
      extractedText: result.extractedText,
      notificationSent: false,
      // Phase 5: cost + routing flow through to task_runs for "why this agent?"
      cost: result.cost ?? null,
      routing: result.routing ?? null,
    };

    // WATCHER: evaluate predicate and notify on match
    if (claimed.kind === TASK_KIND.WATCHER && claimed.watcher) {
      const matched = evaluatePredicate(
        claimed.watcher,
        result.sample,
        claimed.watcher.lastSample
      );
      runOutcome.lastSample = result.sample;
      runOutcome.predicateMatched = matched;
      if (matched && this.notifications) {
        try {
          await this.notifications.notify({
            taskId: claimed.id,
            title: claimed.title,
            description: claimed.description,
            sample: result.sample,
            firedAt: now,
          });
          runOutcome.notificationSent = true;
        } catch (e) {
          // Notification failures don't fail the run — the watcher's job is
          // to observe; the notification path is best-effort.
          runOutcome.notificationError = (e && e.message) || String(e);
        }
      }
    }

    this.taskStore.succeed(claimed.id, runOutcome, now);
    return { taskId: claimed.id, success: true, ...runOutcome };
  }
}
