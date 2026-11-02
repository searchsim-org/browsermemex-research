/**
 * @browser-memex/core/scheduler — task system entry point.
 *
 * Public surface:
 *   - types: TASK_KIND, TASK_STATUS, RUN_STATUS, SCHEDULE_KIND, PREDICATE_KIND
 *   - schedule: nextRun (+ per-kind helpers)
 *   - predicates: evaluatePredicate
 *   - retry: backoffMs, circuitState, isPermanentFailure, CIRCUIT_STATE
 *   - storage: TaskSqliteStore
 *   - lifecycle: TaskStore
 *   - orchestration: Scheduler
 */

export * from "./types.js";
export { nextRun, nextRunOnce, nextRunInterval, nextRunDailyAt } from "./schedule.js";
export { evaluatePredicate } from "./predicates.js";
export { backoffMs, circuitState, isPermanentFailure, CIRCUIT_STATE } from "./retry.js";
export { TaskSqliteStore, TASKS_SCHEMA_VERSION } from "./storage/sqlite-tasks.js";
export { TaskStore } from "./task-store.js";
export { Scheduler } from "./orchestrator.js";
