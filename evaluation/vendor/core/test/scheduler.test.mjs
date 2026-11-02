/**
 * Scheduler test suite.
 * Runnable with: node packages/core/test/scheduler.test.mjs
 *
 * Coverage:
 *   - schedule.js: ONCE / INTERVAL / DAILY_AT arithmetic + edge cases
 *   - predicates.js: every PREDICATE_KIND including numeric parsing with $/¥/€
 *   - retry.js: backoff growth + clamping, circuit-breaker state transitions,
 *               permanent-failure cutoff
 *   - TaskStore: full lifecycle on real SQLite — create, claim, succeed, fail,
 *                cancel, pause, resume, tracker samples, recurring rescheduling
 *   - Scheduler orchestrator: ONE_SHOT happy path, WATCHER predicate firing
 *                & notification dispatch, TRACKER sample recording, retry
 *                on transient failure, permanent failure after max retries
 */

import assert from "node:assert/strict";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import {
  TASK_KIND,
  TASK_STATUS,
  SCHEDULE_KIND,
  PREDICATE_KIND,
  RUN_STATUS,
  TaskSqliteStore,
  TaskStore,
  Scheduler,
  nextRun,
  nextRunOnce,
  nextRunInterval,
  nextRunDailyAt,
  evaluatePredicate,
  backoffMs,
  circuitState,
  isPermanentFailure,
  CIRCUIT_STATE,
} from "../src/scheduler/index.js";

let testCount = 0;
async function test(name, fn) {
  testCount++;
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.stack || e.message}`);
    process.exit(1);
  }
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 4, 16, 12, 0, 0);

async function makeStore() {
  const storage = new TaskSqliteStore({ initModule: sqlite3InitModule });
  const store = new TaskStore({ storage });
  await store.open();
  return store;
}

// ===== schedule.js =====

test("nextRunOnce: future anchor returns anchor", () => {
  assert.equal(nextRunOnce({ kind: "once", anchor: NOW + DAY }, NOW, NOW), NOW + DAY);
});

test("nextRunOnce: past anchor returns null", () => {
  assert.equal(nextRunOnce({ kind: "once", anchor: NOW - 1 }, NOW, NOW), null);
});

test("nextRunInterval: now before anchor returns anchor", () => {
  const s = { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW + HOUR };
  assert.equal(nextRunInterval(s, NOW, NOW), NOW + HOUR);
});

test("nextRunInterval: fires at next boundary strictly in the future", () => {
  const s = { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW };
  // 30 min after anchor → next fire at +1h
  assert.equal(nextRunInterval(s, NOW + HOUR / 2, NOW), NOW + HOUR);
});

test("nextRunInterval: exactly on a boundary fires now", () => {
  const s = { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW };
  assert.equal(nextRunInterval(s, NOW + 3 * HOUR, NOW), NOW + 3 * HOUR);
});

test("nextRunInterval: invalid everyMs throws", () => {
  assert.throws(() => nextRunInterval({ kind: SCHEDULE_KIND.INTERVAL, everyMs: -1 }, NOW, NOW), /positive/);
});

test("nextRunDailyAt: today's slot in the future returns today", () => {
  // NOW is 2026-05-16 12:00; ask for 18:30 today
  const r = nextRunDailyAt({ hour: 18, minute: 30 }, NOW);
  assert.equal(r, Date.UTC(2026, 4, 16, 18, 30));
});

test("nextRunDailyAt: today's slot already past returns tomorrow", () => {
  // NOW is 12:00; ask for 09:00 → tomorrow 09:00
  const r = nextRunDailyAt({ hour: 9, minute: 0 }, NOW);
  assert.equal(r, Date.UTC(2026, 4, 17, 9, 0));
});

test("nextRunDailyAt: invalid hour rejected", () => {
  assert.throws(() => nextRunDailyAt({ hour: 24, minute: 0 }, NOW), /hour/);
});

test("nextRun dispatches on schedule.kind", () => {
  assert.equal(
    nextRun({ kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW }, NOW + HOUR / 2, NOW),
    NOW + HOUR
  );
});

// ===== predicates.js =====

test("VALUE_CHANGED: first sample never fires", () => {
  assert.equal(evaluatePredicate({ kind: PREDICATE_KIND.VALUE_CHANGED }, "On Track", undefined), false);
});

test("VALUE_CHANGED: same value does not fire", () => {
  assert.equal(evaluatePredicate({ kind: PREDICATE_KIND.VALUE_CHANGED }, "On Track", "On Track"), false);
});

test("VALUE_CHANGED: different value fires", () => {
  assert.equal(evaluatePredicate({ kind: PREDICATE_KIND.VALUE_CHANGED }, "On Track", "At Risk"), true);
});

test("VALUE_BELOW_THRESHOLD: $199 is below 200", () => {
  assert.equal(
    evaluatePredicate({ kind: PREDICATE_KIND.VALUE_BELOW_THRESHOLD, params: { threshold: 200 } }, "$199.00"),
    true
  );
});

test("VALUE_BELOW_THRESHOLD: $250 is not below 200", () => {
  assert.equal(
    evaluatePredicate({ kind: PREDICATE_KIND.VALUE_BELOW_THRESHOLD, params: { threshold: 200 } }, "$250"),
    false
  );
});

test("VALUE_ABOVE_THRESHOLD: 95.5°F above 90", () => {
  assert.equal(
    evaluatePredicate({ kind: PREDICATE_KIND.VALUE_ABOVE_THRESHOLD, params: { threshold: 90 } }, "95.5°F"),
    true
  );
});

test("VALUE_MATCHES: regex hit", () => {
  assert.equal(
    evaluatePredicate(
      { kind: PREDICATE_KIND.VALUE_MATCHES, params: { regex: "tickets? available", flags: "i" } },
      "TICKETS AVAILABLE NOW"
    ),
    true
  );
});

test("VALUE_CONTAINS: case-insensitive option", () => {
  assert.equal(
    evaluatePredicate(
      { kind: PREDICATE_KIND.VALUE_CONTAINS, params: { needle: "in stock", caseInsensitive: true } },
      "Item IN STOCK at warehouse"
    ),
    true
  );
});

test("predicate: unknown kind throws", () => {
  assert.throws(() => evaluatePredicate({ kind: "nonsense" }, ""), /unknown/);
});

// ===== retry.js =====

test("backoffMs: grows exponentially without jitter", () => {
  const opts = { baseMs: 1000, jitter: 0, rand: () => 0.5 };
  assert.equal(backoffMs(0, opts), 1000);
  assert.equal(backoffMs(1, opts), 2000);
  assert.equal(backoffMs(2, opts), 4000);
  assert.equal(backoffMs(3, opts), 8000);
});

test("backoffMs: clamped by maxMs", () => {
  const v = backoffMs(20, { baseMs: 1000, maxMs: 60_000, jitter: 0, rand: () => 0.5 });
  assert.equal(v, 60_000);
});

test("circuitState: CLOSED when under threshold", () => {
  assert.equal(circuitState({ failureCount: 2, lastFailureAt: NOW }, NOW + 1000, { threshold: 5 }), CIRCUIT_STATE.CLOSED);
});

test("circuitState: OPEN after threshold, within cooldown", () => {
  assert.equal(
    circuitState({ failureCount: 5, lastFailureAt: NOW }, NOW + 1000, { threshold: 5, cooldownMs: 60_000 }),
    CIRCUIT_STATE.OPEN
  );
});

test("circuitState: HALF_OPEN after cooldown elapses", () => {
  assert.equal(
    circuitState({ failureCount: 5, lastFailureAt: NOW }, NOW + 120_000, { threshold: 5, cooldownMs: 60_000 }),
    CIRCUIT_STATE.HALF_OPEN
  );
});

test("isPermanentFailure: respects maxRetries", () => {
  assert.equal(isPermanentFailure(5, { maxRetries: 5 }), true);
  assert.equal(isPermanentFailure(4, { maxRetries: 5 }), false);
});

// ===== TaskStore lifecycle =====

await test("creates ONE_SHOT task with nextRunAt=now", async () => {
  const store = await makeStore();
  const t = store.create(
    {
      kind: TASK_KIND.ONE_SHOT,
      title: "Summarize today's Jira",
      payload: { instruction: "summarize" },
      capability: "read_only",
      creator: "user",
    },
    NOW
  );
  assert.equal(t.status, TASK_STATUS.PENDING);
  assert.equal(t.nextRunAt, NOW);
  assert.ok(t.hmac.length > 0);
  store.close();
});

await test("rejects WATCHER without watcher spec", async () => {
  const store = await makeStore();
  assert.throws(
    () =>
      store.create(
        {
          kind: TASK_KIND.WATCHER,
          title: "x",
          payload: {},
          capability: "read_only",
          creator: "user",
          schedule: { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR },
        },
        NOW
      ),
    /watcher/
  );
  store.close();
});

await test("rejects RECURRING without schedule", async () => {
  const store = await makeStore();
  assert.throws(
    () =>
      store.create(
        { kind: TASK_KIND.RECURRING, title: "x", payload: {}, capability: "read_only", creator: "user" },
        NOW
      ),
    /schedule/
  );
  store.close();
});

await test("readyTasks returns only pending+due tasks", async () => {
  const store = await makeStore();
  const t1 = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "ready", payload: {}, capability: "read_only", creator: "user" },
    NOW - 1000
  );
  store.create(
    {
      kind: TASK_KIND.SCHEDULED,
      title: "future",
      payload: {},
      capability: "read_only",
      creator: "user",
      schedule: { kind: SCHEDULE_KIND.ONCE, anchor: NOW + HOUR },
    },
    NOW - 1000
  );
  const ready = store.readyTasks(NOW);
  assert.equal(ready.length, 1);
  assert.equal(ready[0].id, t1.id);
  store.close();
});

await test("claim moves pending → running atomically", async () => {
  const store = await makeStore();
  const t = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "x", payload: {}, capability: "read_only", creator: "user" },
    NOW
  );
  const claimed = store.claim(t.id, NOW);
  assert.equal(claimed.status, TASK_STATUS.RUNNING);
  assert.equal(claimed.lastRunAt, NOW);
  // Second claim returns null
  assert.equal(store.claim(t.id, NOW + 1), null);
  store.close();
});

await test("succeed: ONE_SHOT → COMPLETED, runCount=1, no next run", async () => {
  const store = await makeStore();
  const t = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "x", payload: {}, capability: "read_only", creator: "user" },
    NOW
  );
  store.claim(t.id, NOW);
  const after = store.succeed(t.id, { result: { ok: true } }, NOW + 100);
  assert.equal(after.status, TASK_STATUS.COMPLETED);
  assert.equal(after.runCount, 1);
  assert.equal(after.nextRunAt, null);
  store.close();
});

await test("succeed: RECURRING → PENDING with rescheduled next run", async () => {
  const store = await makeStore();
  const t = store.create(
    {
      kind: TASK_KIND.RECURRING,
      title: "x",
      payload: {},
      capability: "read_only",
      creator: "user",
      schedule: { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW },
    },
    NOW
  );
  store.claim(t.id, NOW);
  const after = store.succeed(t.id, {}, NOW + 100);
  assert.equal(after.status, TASK_STATUS.PENDING);
  assert.equal(after.runCount, 1);
  // Next run is at NOW + HOUR
  assert.equal(after.nextRunAt, NOW + HOUR);
  store.close();
});

await test("fail (transient): increments failure_count and schedules retry", async () => {
  const store = await makeStore();
  const t = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "x", payload: {}, capability: "read_only", creator: "user" },
    NOW
  );
  store.claim(t.id, NOW);
  const after = store.fail(t.id, "transient err", NOW + 100, { baseMs: 1000, jitter: 0, rand: () => 0.5, maxRetries: 5 });
  assert.equal(after.status, TASK_STATUS.PENDING);
  assert.equal(after.failureCount, 1);
  // next_run_at is in the future
  assert.ok(after.nextRunAt > NOW);
  store.close();
});

await test("fail (permanent): after maxRetries → FAILED, no next run", async () => {
  const store = await makeStore();
  const t = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "x", payload: {}, capability: "read_only", creator: "user" },
    NOW
  );
  // Fail 5 times to hit the maxRetries cutoff
  for (let i = 0; i < 5; i++) {
    store.claim(t.id, NOW + i * 1000);
    store.fail(t.id, `err ${i}`, NOW + i * 1000 + 50, { maxRetries: 5, jitter: 0, rand: () => 0.5 });
  }
  const after = store.get(t.id);
  assert.equal(after.status, TASK_STATUS.FAILED);
  assert.equal(after.failureCount, 5);
  assert.equal(after.nextRunAt, null);
  store.close();
});

await test("cancel, pause, resume transitions", async () => {
  const store = await makeStore();
  const t = store.create(
    {
      kind: TASK_KIND.RECURRING,
      title: "x",
      payload: {},
      capability: "read_only",
      creator: "user",
      schedule: { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR },
    },
    NOW
  );
  let after = store.pause(t.id, NOW + 1);
  assert.equal(after.status, TASK_STATUS.PAUSED);
  after = store.resume(t.id, NOW + 2);
  assert.equal(after.status, TASK_STATUS.PENDING);
  assert.ok(after.nextRunAt >= NOW + 2);
  after = store.cancel(t.id, NOW + 3);
  assert.equal(after.status, TASK_STATUS.CANCELLED);
  assert.equal(after.nextRunAt, null);
  store.close();
});

// ===== Scheduler orchestrator (integration) =====

class RecordingDispatcher {
  constructor(impl) {
    this.calls = [];
    this.impl = impl;
  }
  async dispatch(task, ctx) {
    this.calls.push({ taskId: task.id, ctx });
    return this.impl(task, ctx);
  }
}

class RecordingNotifications {
  constructor() {
    this.delivered = [];
  }
  async notify(payload) {
    this.delivered.push(payload);
  }
}

await test("Scheduler: ONE_SHOT happy path drains in one tick", async () => {
  const store = await makeStore();
  const t = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "do it", payload: {}, capability: "read_only", creator: "user" },
    NOW - 1000
  );
  const dispatcher = new RecordingDispatcher(async () => ({ success: true, result: { ok: true } }));
  const sched = new Scheduler({ taskStore: store, dispatcher });

  const summary = await sched.tick(NOW);
  assert.equal(summary.processed, 1);
  assert.equal(dispatcher.calls.length, 1);
  assert.equal(store.get(t.id).status, TASK_STATUS.COMPLETED);
  store.close();
});

await test("Scheduler: WATCHER fires notification on predicate match", async () => {
  const store = await makeStore();
  const t = store.create(
    {
      kind: TASK_KIND.WATCHER,
      title: "watch tickets",
      payload: { url: "https://example.com" },
      capability: "read_only",
      creator: "user",
      schedule: { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW },
      watcher: {
        kind: PREDICATE_KIND.VALUE_CONTAINS,
        params: { needle: "tickets available", caseInsensitive: true },
      },
    },
    NOW
  );

  // First run: sample doesn't contain phrase
  let mode = "sold-out";
  const dispatcher = new RecordingDispatcher(async () => ({
    success: true,
    sample: mode === "sold-out" ? "currently sold out" : "TICKETS AVAILABLE NOW",
  }));
  const notif = new RecordingNotifications();
  const sched = new Scheduler({ taskStore: store, dispatcher, notifications: notif });

  await sched.tick(NOW);
  assert.equal(notif.delivered.length, 0);

  // Second run after an hour: tickets available
  mode = "available";
  await sched.tick(NOW + HOUR);
  assert.equal(notif.delivered.length, 1);
  assert.equal(notif.delivered[0].taskId, t.id);

  const final = store.get(t.id);
  assert.equal(final.status, TASK_STATUS.PENDING); // still scheduled to recur
  assert.equal(final.runCount, 2);
  assert.ok(final.watcher.lastMatchAt > NOW);
  store.close();
});

await test("Scheduler: TRACKER records time-series samples", async () => {
  const store = await makeStore();
  const t = store.create(
    {
      kind: TASK_KIND.TRACKER,
      title: "track flight price",
      payload: { url: "https://example.com" },
      capability: "read_only",
      creator: "user",
      schedule: { kind: SCHEDULE_KIND.INTERVAL, everyMs: HOUR, anchor: NOW },
    },
    NOW
  );

  let nextPrice = 230;
  const dispatcher = new RecordingDispatcher(async () => ({
    success: true,
    extractedValue: nextPrice,
    extractedText: `$${nextPrice}`,
  }));
  const sched = new Scheduler({ taskStore: store, dispatcher });

  // 3 ticks at different times
  await sched.tick(NOW);
  nextPrice = 215;
  await sched.tick(NOW + HOUR);
  nextPrice = 199;
  await sched.tick(NOW + 2 * HOUR);

  const samples = store.trackerSamples(t.id);
  assert.equal(samples.length, 3);
  // newest first
  assert.equal(samples[0].value, 199);
  assert.equal(samples[1].value, 215);
  assert.equal(samples[2].value, 230);
  store.close();
});

await test("Scheduler: dispatcher throwing → fail() with error", async () => {
  const store = await makeStore();
  const t = store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "boom", payload: {}, capability: "read_only", creator: "user" },
    NOW - 1
  );
  const dispatcher = new RecordingDispatcher(async () => {
    throw new Error("network down");
  });
  const sched = new Scheduler({ taskStore: store, dispatcher, retry: { maxRetries: 2, baseMs: 1, jitter: 0, rand: () => 0.5 } });
  await sched.tick(NOW);
  const after = store.get(t.id);
  assert.equal(after.failureCount, 1);
  // Still has retries left → PENDING with backoff
  assert.equal(after.status, TASK_STATUS.PENDING);
  store.close();
});

await test("Scheduler: dispatcher returning {success:false} also fails", async () => {
  const store = await makeStore();
  store.create(
    { kind: TASK_KIND.ONE_SHOT, title: "soft fail", payload: {}, capability: "read_only", creator: "user" },
    NOW - 1
  );
  const dispatcher = new RecordingDispatcher(async () => ({ success: false, error: "agent unavailable" }));
  const sched = new Scheduler({ taskStore: store, dispatcher, retry: { maxRetries: 5, baseMs: 1, jitter: 0, rand: () => 0.5 } });
  const summary = await sched.tick(NOW);
  assert.equal(summary.processed, 1);
  assert.equal(summary.outcomes[0].success, false);
  assert.equal(summary.outcomes[0].error, "agent unavailable");
  store.close();
});

console.log(`\nAll ${testCount} tests passed.`);
