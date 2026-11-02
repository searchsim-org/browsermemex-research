/**
 * Task system — type definitions.
 *
 * Five task kinds capture the real workflows users want:
 *
 *   ONE_SHOT   — run once, now; the imperative "do this for me"
 *   SCHEDULED  — run once at a future point in time
 *   RECURRING  — run on a repeating schedule (interval or daily_at)
 *   WATCHER    — run on a schedule; trigger a notification when a predicate
 *                first matches (e.g., "tickets available", "price below $200")
 *   TRACKER    — run on a schedule; record the observed value in a time
 *                series (e.g., flight prices, dashboard metrics over days)
 *
 * Tasks pass through this lifecycle:
 *
 *   PENDING ──claim──> RUNNING ──succeed──> COMPLETED (one-shot/scheduled)
 *      │                  │                       │
 *      │                  │                       └── back to PENDING (recurring/watcher/tracker)
 *      │                  │
 *      │                  └──fail──> FAILED (transient) ──retry──> PENDING
 *      │                  └──fail──> FAILED (permanent)
 *      │
 *      ├──pause──> PAUSED
 *      └──cancel──> CANCELLED
 *
 * See ADR 0003 — every task carries a capability annotation; destructive
 * tasks require confirmation at schedule time (not just at run time).
 */

export const TASK_KIND = Object.freeze({
  ONE_SHOT: "one_shot",
  SCHEDULED: "scheduled",
  RECURRING: "recurring",
  WATCHER: "watcher",
  TRACKER: "tracker",
});

export const TASK_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  PAUSED: "paused",
});

export const RUN_STATUS = Object.freeze({
  RUNNING: "running",
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
});

export const SCHEDULE_KIND = Object.freeze({
  /** Fires after delay ms from anchor, once. Used by SCHEDULED tasks. */
  ONCE: "once",
  /** Fires every `everyMs` starting from anchor. RECURRING / WATCHER / TRACKER. */
  INTERVAL: "interval",
  /** Daily at HH:MM (UTC). RECURRING / WATCHER / TRACKER. */
  DAILY_AT: "daily_at",
});

export const PREDICATE_KIND = Object.freeze({
  /** Trigger on any change in the observed value vs prior sample. */
  VALUE_CHANGED: "value_changed",
  /** Trigger when numeric value drops below threshold. */
  VALUE_BELOW_THRESHOLD: "value_below_threshold",
  /** Trigger when numeric value rises above threshold. */
  VALUE_ABOVE_THRESHOLD: "value_above_threshold",
  /** Trigger when string matches the regex. */
  VALUE_MATCHES: "value_matches",
  /** Trigger when a substring is present (cheaper than regex). */
  VALUE_CONTAINS: "value_contains",
});

/** Single-fire boundary for "permanent" failures vs retryable failures. */
export const DEFAULT_MAX_RETRIES = 5;

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {keyof TASK_KIND} kind
 * @property {keyof TASK_STATUS} status
 * @property {string} title
 * @property {string} [description]
 * @property {Schedule|null} schedule
 * @property {object} payload                 — what to execute (task spec for agent)
 * @property {object|null} routing            — routing hints (preferred agent, etc.)
 * @property {string} capability              — capability annotation (ADR 0003)
 * @property {string} creator                 — 'user' or 'agent:<id>'
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {number|null} nextRunAt
 * @property {number|null} lastRunAt
 * @property {number} runCount
 * @property {number} failureCount
 * @property {string} hmac                    — creation-time integrity check
 * @property {WatcherSpec|null} [watcher]     — only on WATCHER tasks
 */

/**
 * @typedef {Object} Schedule
 * @property {keyof SCHEDULE_KIND} kind
 * @property {number} [anchor]                — Unix ms; defaults to creation time
 * @property {number} [everyMs]               — for INTERVAL
 * @property {number} [hour]                  — for DAILY_AT (0-23, UTC)
 * @property {number} [minute]                — for DAILY_AT (0-59)
 */

/**
 * @typedef {Object} WatcherSpec
 * @property {keyof PREDICATE_KIND} predicate
 * @property {object} [params]                — predicate-specific params
 * @property {*} [lastSample]                 — most-recent observed value
 * @property {number|null} [lastMatchAt]      — Unix ms when predicate last matched
 */

/**
 * @typedef {Object} TaskRun
 * @property {number} id
 * @property {string} taskId
 * @property {number} startedAt
 * @property {number|null} endedAt
 * @property {keyof RUN_STATUS} status
 * @property {*} [result]
 * @property {string|null} [error]
 * @property {number|null} [extractedValue]   — for TRACKER tasks
 * @property {string|null} [extractedText]    — for TRACKER tasks
 * @property {boolean} notificationSent
 */
