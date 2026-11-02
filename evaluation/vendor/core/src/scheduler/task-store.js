/**
 * TaskStore — durable lifecycle API on top of TaskSqliteStore.
 *
 * Methods:
 *   create(spec)            → Task                    persist a new task
 *   get(id)                 → Task | null
 *   list(filter)            → Task[]
 *   readyTasks(now, limit)  → Task[]                  status=pending and next_run_at <= now
 *   claim(id, now)          → Task | null             atomic pending → running
 *   succeed(id, run, now)   → Task                    record success; reschedule if recurring
 *   fail(id, runError, now) → Task                    record failure; backoff next run if retryable
 *   cancel(id, now)         → Task
 *   pause(id, now)          → Task
 *   resume(id, now)         → Task
 *   recordTrackerSample(id, sample, now)              append to time series
 *   trackerSamples(id, limit)                          → samples (newest first)
 *
 * All mutations run inside a transaction with timestamp + updated_at bookkeeping.
 */

import { TASK_KIND, TASK_STATUS, RUN_STATUS, SCHEDULE_KIND } from "./types.js";
import { nextRun } from "./schedule.js";
import { backoffMs, isPermanentFailure } from "./retry.js";
import { LEGACY_PROFILE_ID } from "./storage/sqlite-tasks.js";

const DEFAULT_TOP_K = 50;

/** Stable HMAC-like integrity tag (not cryptographic — tamper detection only). */
function computeHmac(task) {
  // FNV-1a 64-bit over the task's stable fields
  const seed = JSON.stringify([
    task.kind,
    task.title,
    task.payload,
    task.creator,
    task.createdAt,
  ]);
  let hash = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  for (let i = 0; i < seed.length; i++) {
    hash ^= BigInt(seed.charCodeAt(i));
    hash = (hash * PRIME) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function newTaskId(now, kind) {
  // Time-prefixed id keeps tasks sortable by creation; suffix is a small random.
  const r = Math.floor(Math.random() * 0xfffff).toString(16).padStart(5, "0");
  return `${kind}-${now.toString(36)}-${r}`;
}

export class TaskStore {
  /**
   * @param {object} options
   * @param {import("./storage/sqlite-tasks.js").TaskSqliteStore} options.storage
   */
  constructor({ storage }) {
    this.storage = storage;
  }

  async open() {
    if (!this.storage.db) await this.storage.open();
  }

  close() {
    this.storage.close();
  }

  /**
   * Create a new task.
   *
   * @param {object} spec
   * @param {keyof TASK_KIND} spec.kind
   * @param {string} spec.title
   * @param {string} [spec.description]
   * @param {object|null} [spec.schedule]
   * @param {object} spec.payload
   * @param {object|null} [spec.routing]
   * @param {string} spec.capability
   * @param {string} spec.creator
   * @param {object|null} [spec.watcher]   — only for WATCHER tasks
   * @param {number} now
   */
  create(spec, now, profileId = LEGACY_PROFILE_ID) {
    this.#requireFields(spec);
    const id = newTaskId(now, spec.kind);
    const computedNextRun = nextRun(spec.schedule ?? null, now, now);
    const task = {
      id,
      kind: spec.kind,
      status: TASK_STATUS.PENDING,
      title: spec.title,
      description: spec.description ?? null,
      schedule: spec.schedule ?? null,
      payload: spec.payload,
      routing: spec.routing ?? null,
      capability: spec.capability,
      creator: spec.creator,
      createdAt: now,
      updatedAt: now,
      // ONE_SHOT has no schedule and fires immediately
      nextRunAt: spec.kind === TASK_KIND.ONE_SHOT ? now : computedNextRun,
      lastRunAt: null,
      runCount: 0,
      failureCount: 0,
      hmac: "",
      watcher: spec.watcher ?? null,
      profileId: spec.profileId ?? profileId,
    };
    task.hmac = computeHmac(task);

    this.storage.transact(() => this.#insertRow(task));
    return task;
  }

  get(id) {
    const rows = this.storage.exec({
      sql: "SELECT * FROM tasks WHERE id = $id",
      bind: { $id: id },
      returnValue: "resultRows",
      rowMode: "object",
    });
    if (rows.length === 0) return null;
    return this.#rowToTask(rows[0]);
  }

  list({ status, creator, profileId = null, limit = DEFAULT_TOP_K } = {}) {
    const clauses = [];
    const bind = { $limit: limit };
    if (status) {
      clauses.push("status = $status");
      bind.$status = status;
    }
    if (creator) {
      clauses.push("creator = $creator");
      bind.$creator = creator;
    }
    if (profileId) {
      clauses.push("profile_id = $profile_id");
      bind.$profile_id = profileId;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.storage.exec({
      sql: `SELECT * FROM tasks ${where} ORDER BY created_at DESC LIMIT $limit`,
      bind,
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => this.#rowToTask(r));
  }

  /**
   * Tasks ready to run: status = PENDING and next_run_at <= now.
   * When `profileId` is omitted, returns ready tasks across all profiles
   * (the scheduler is process-wide, not profile-scoped).
   */
  readyTasks(now, limit = DEFAULT_TOP_K, profileId = null) {
    const profileClause = profileId ? " AND profile_id = $profile_id" : "";
    const bind = { $now: now, $limit: limit };
    if (profileId) bind.$profile_id = profileId;
    const rows = this.storage.exec({
      sql: `
        SELECT * FROM tasks
        WHERE status = 'pending'
          AND next_run_at IS NOT NULL
          AND next_run_at <= $now${profileClause}
        ORDER BY next_run_at ASC
        LIMIT $limit
      `,
      bind,
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => this.#rowToTask(r));
  }

  /** Atomic pending → running. Returns the claimed task or null if it wasn't pending. */
  claim(id, now) {
    return this.storage.transact(() => {
      const before = this.get(id);
      if (!before || before.status !== TASK_STATUS.PENDING) return null;
      this.storage.exec({
        sql: `UPDATE tasks SET status='running', updated_at=$now, last_run_at=$now WHERE id=$id`,
        bind: { $id: id, $now: now },
      });
      this.storage.exec({
        sql: `INSERT INTO task_runs (task_id, started_at, status) VALUES ($id, $now, 'running')`,
        bind: { $id: id, $now: now },
      });
      return this.get(id);
    });
  }

  /**
   * Mark a run successful and advance the task.
   * For non-repeating kinds (ONE_SHOT, SCHEDULED with ONCE schedule), the task
   * transitions to COMPLETED. For RECURRING / WATCHER / TRACKER, it returns
   * to PENDING with next_run_at recomputed.
   *
   * @param {string} id
   * @param {object} runOutcome
   * @param {*} [runOutcome.result]
   * @param {number} [runOutcome.extractedValue]
   * @param {string} [runOutcome.extractedText]
   * @param {boolean} [runOutcome.notificationSent]
   * @param {*} [runOutcome.lastSample]            — for WATCHER, updates watcher.lastSample
   * @param {boolean} [runOutcome.predicateMatched] — for WATCHER, sets watcher.lastMatchAt
   * @param {number} now
   */
  succeed(id, runOutcome, now) {
    return this.storage.transact(() => {
      const task = this.get(id);
      if (!task) throw new Error(`succeed: task '${id}' not found`);

      const recurring = isRecurring(task);
      const nextStatus = recurring ? TASK_STATUS.PENDING : TASK_STATUS.COMPLETED;
      const newNextRun = recurring ? nextRun(task.schedule, now + 1, task.createdAt) : null;

      // Update watcher state if applicable
      let nextWatcher = task.watcher;
      if (task.watcher && runOutcome) {
        nextWatcher = {
          ...task.watcher,
          lastSample: runOutcome.lastSample ?? task.watcher.lastSample,
          lastMatchAt: runOutcome.predicateMatched ? now : task.watcher.lastMatchAt ?? null,
        };
      }

      this.storage.exec({
        sql: `
          UPDATE tasks
          SET status      = $status,
              updated_at  = $now,
              next_run_at = $nextRun,
              run_count   = run_count + 1,
              failure_count = 0,
              watcher     = $watcher
          WHERE id = $id
        `,
        bind: {
          $id: id,
          $now: now,
          $status: nextStatus,
          $nextRun: newNextRun,
          $watcher: nextWatcher ? JSON.stringify(nextWatcher) : null,
        },
      });

      // Close out the most recent open run
      this.#closeRun(id, runOutcome, RUN_STATUS.SUCCESS, now);

      // Append a tracker sample if applicable
      if (task.kind === TASK_KIND.TRACKER && runOutcome) {
        this.storage.exec({
          sql: `INSERT INTO tracker_samples (task_id, recorded_at, value, text)
                VALUES ($id, $now, $val, $txt)`,
          bind: {
            $id: id,
            $now: now,
            $val: Number.isFinite(runOutcome.extractedValue) ? runOutcome.extractedValue : null,
            $txt: typeof runOutcome.extractedText === "string" ? runOutcome.extractedText : null,
          },
        });
      }

      return this.get(id);
    });
  }

  /**
   * Mark a run failed. Increments failure count. If retryable (under
   * max-retries), the task returns to PENDING with backoff. Otherwise it
   * transitions to FAILED permanently.
   */
  fail(id, errorMessage, now, opts = {}) {
    return this.storage.transact(() => {
      const task = this.get(id);
      if (!task) throw new Error(`fail: task '${id}' not found`);

      const nextFailureCount = task.failureCount + 1;
      const permanent = isPermanentFailure(nextFailureCount, opts);
      const recurring = isRecurring(task);

      let nextStatus;
      let newNextRun;
      if (permanent) {
        nextStatus = TASK_STATUS.FAILED;
        newNextRun = null;
      } else if (recurring) {
        nextStatus = TASK_STATUS.PENDING;
        // Recurring: take the larger of (scheduled next, now + backoff)
        const sched = nextRun(task.schedule, now + 1, task.createdAt) ?? now;
        const backoffAt = now + backoffMs(nextFailureCount, opts);
        newNextRun = Math.max(sched, backoffAt);
      } else {
        nextStatus = TASK_STATUS.PENDING;
        newNextRun = now + backoffMs(nextFailureCount, opts);
      }

      this.storage.exec({
        sql: `
          UPDATE tasks
          SET status        = $status,
              updated_at    = $now,
              next_run_at   = $nextRun,
              failure_count = $failureCount
          WHERE id = $id
        `,
        bind: {
          $id: id,
          $now: now,
          $status: nextStatus,
          $nextRun: newNextRun,
          $failureCount: nextFailureCount,
        },
      });

      this.#closeRun(id, { error: errorMessage }, RUN_STATUS.FAILURE, now);
      return this.get(id);
    });
  }

  cancel(id, now) {
    this.storage.exec({
      sql: `UPDATE tasks SET status='cancelled', updated_at=$now, next_run_at=NULL WHERE id=$id`,
      bind: { $id: id, $now: now },
    });
    return this.get(id);
  }

  pause(id, now) {
    this.storage.exec({
      sql: `UPDATE tasks SET status='paused', updated_at=$now WHERE id=$id AND status='pending'`,
      bind: { $id: id, $now: now },
    });
    return this.get(id);
  }

  resume(id, now) {
    return this.storage.transact(() => {
      const task = this.get(id);
      if (!task) return null;
      if (task.status !== TASK_STATUS.PAUSED) return task;
      const newNextRun = nextRun(task.schedule, now + 1, task.createdAt) ?? now;
      this.storage.exec({
        sql: `UPDATE tasks SET status='pending', updated_at=$now, next_run_at=$nextRun WHERE id=$id`,
        bind: { $id: id, $now: now, $nextRun: newNextRun },
      });
      return this.get(id);
    });
  }

  trackerSamples(id, limit = 100) {
    const rows = this.storage.exec({
      sql: `SELECT id, recorded_at, value, text FROM tracker_samples
            WHERE task_id = $id ORDER BY recorded_at DESC LIMIT $limit`,
      bind: { $id: id, $limit: limit },
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => ({
      id: r.id,
      recordedAt: r.recorded_at,
      value: r.value,
      text: r.text,
    }));
  }

  runs(id, limit = 50) {
    const rows = this.storage.exec({
      sql: `SELECT * FROM task_runs WHERE task_id = $id ORDER BY started_at DESC LIMIT $limit`,
      bind: { $id: id, $limit: limit },
      returnValue: "resultRows",
      rowMode: "object",
    });
    return rows.map((r) => ({
      id: r.id,
      taskId: r.task_id,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      status: r.status,
      result: r.result ? safeParse(r.result) : null,
      error: r.error,
      extractedValue: r.extracted_value,
      extractedText: r.extracted_text,
      notificationSent: Boolean(r.notification_sent),
      cost:
        r.cost_usd !== null && r.cost_usd !== undefined
          ? {
              usd: r.cost_usd,
              tokensInput: r.tokens_input ?? undefined,
              tokensOutput: r.tokens_output ?? undefined,
              provider: r.provider ?? undefined,
              model: r.model ?? undefined,
            }
          : null,
      routing:
        r.routed_agent
          ? {
              chosenAgentId: r.routed_agent,
              source: r.routing_source ?? null,
              ruleId: r.routing_rule_id ?? null,
              explanation: r.routing_explanation ?? null,
            }
          : null,
    }));
  }

  // ===== private helpers =====

  #requireFields(spec) {
    if (!spec.kind || !Object.values(TASK_KIND).includes(spec.kind)) {
      throw new Error(`create: invalid kind '${spec.kind}'`);
    }
    if (!spec.title) throw new Error("create: title required");
    if (!spec.payload || typeof spec.payload !== "object") {
      throw new Error("create: payload (object) required");
    }
    if (!spec.capability) throw new Error("create: capability required");
    if (!spec.creator) throw new Error("create: creator required");
    if (spec.kind === TASK_KIND.WATCHER && !spec.watcher) {
      throw new Error("create: watcher tasks require watcher spec");
    }
    if (
      [TASK_KIND.RECURRING, TASK_KIND.WATCHER, TASK_KIND.TRACKER].includes(spec.kind) &&
      !spec.schedule
    ) {
      throw new Error(`create: ${spec.kind} requires a schedule`);
    }
  }

  #insertRow(t) {
    this.storage.exec({
      sql: `
        INSERT INTO tasks (
          id, kind, status, title, description, schedule, payload, routing,
          capability, creator, created_at, updated_at, next_run_at, last_run_at,
          run_count, failure_count, hmac, watcher, profile_id
        ) VALUES (
          $id, $kind, $status, $title, $description, $schedule, $payload, $routing,
          $capability, $creator, $createdAt, $updatedAt, $nextRunAt, $lastRunAt,
          $runCount, $failureCount, $hmac, $watcher, $profileId
        )
      `,
      bind: {
        $id: t.id,
        $kind: t.kind,
        $status: t.status,
        $title: t.title,
        $description: t.description,
        $schedule: t.schedule ? JSON.stringify(t.schedule) : null,
        $payload: JSON.stringify(t.payload),
        $routing: t.routing ? JSON.stringify(t.routing) : null,
        $capability: t.capability,
        $creator: t.creator,
        $createdAt: t.createdAt,
        $updatedAt: t.updatedAt,
        $nextRunAt: t.nextRunAt,
        $lastRunAt: t.lastRunAt,
        $runCount: t.runCount,
        $failureCount: t.failureCount,
        $hmac: t.hmac,
        $watcher: t.watcher ? JSON.stringify(t.watcher) : null,
        $profileId: t.profileId ?? LEGACY_PROFILE_ID,
      },
    });
  }

  #closeRun(taskId, outcome, status, now) {
    const cost = outcome?.cost ?? null;
    const routing = outcome?.routing ?? null;
    this.storage.exec({
      sql: `
        UPDATE task_runs
        SET ended_at        = $now,
            status          = $status,
            result          = $result,
            error           = $error,
            extracted_value = $val,
            extracted_text  = $txt,
            notification_sent = $notif,
            cost_usd        = $costUsd,
            tokens_input    = $tIn,
            tokens_output   = $tOut,
            provider        = $provider,
            model           = $model,
            routed_agent    = $routedAgent,
            routing_source  = $routingSource,
            routing_rule_id = $routingRuleId,
            routing_explanation = $routingExplanation
        WHERE task_id = $id AND ended_at IS NULL
      `,
      bind: {
        $id: taskId,
        $now: now,
        $status: status,
        $result: outcome?.result !== undefined ? JSON.stringify(outcome.result) : null,
        $error: typeof outcome?.error === "string" ? outcome.error : null,
        $val:
          outcome && Number.isFinite(outcome.extractedValue) ? outcome.extractedValue : null,
        $txt: outcome && typeof outcome.extractedText === "string" ? outcome.extractedText : null,
        $notif: outcome?.notificationSent ? 1 : 0,
        $costUsd: cost && Number.isFinite(cost.usd) ? cost.usd : null,
        $tIn: cost && Number.isFinite(cost.tokensInput) ? cost.tokensInput : null,
        $tOut: cost && Number.isFinite(cost.tokensOutput) ? cost.tokensOutput : null,
        $provider: cost && typeof cost.provider === "string" ? cost.provider : null,
        $model: cost && typeof cost.model === "string" ? cost.model : null,
        $routedAgent: routing && typeof routing.chosenAgentId === "string" ? routing.chosenAgentId : null,
        $routingSource: routing && typeof routing.source === "string" ? routing.source : null,
        $routingRuleId: routing && typeof routing.ruleId === "string" ? routing.ruleId : null,
        $routingExplanation: routing && typeof routing.explanation === "string" ? routing.explanation : null,
      },
    });
  }

  #rowToTask(row) {
    return {
      id: row.id,
      kind: row.kind,
      status: row.status,
      title: row.title,
      description: row.description,
      schedule: row.schedule ? safeParse(row.schedule) : null,
      payload: safeParse(row.payload) ?? {},
      routing: row.routing ? safeParse(row.routing) : null,
      capability: row.capability,
      creator: row.creator,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nextRunAt: row.next_run_at,
      lastRunAt: row.last_run_at,
      runCount: row.run_count,
      failureCount: row.failure_count,
      hmac: row.hmac,
      watcher: row.watcher ? safeParse(row.watcher) : null,
      profileId: row.profile_id ?? LEGACY_PROFILE_ID,
    };
  }
}

function isRecurring(task) {
  return (
    task.kind === TASK_KIND.RECURRING ||
    task.kind === TASK_KIND.WATCHER ||
    task.kind === TASK_KIND.TRACKER
  );
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
