/**
 * Skill system tests.
 * Runnable with: node packages/core/test/skills.test.mjs
 *
 * Covers:
 *   - templateFingerprint: explicit template > routing.template > shape-based
 *   - proposeSkills: threshold filtering, success-only counting, sorted by lastSeenAt
 *   - canonicalize: stable key order, recursive, excludeKey
 *   - signSkill / verifySkill: round-trip, tampering rejection
 *   - exportSkill / importSkillEnvelope: round-trip, format/HMAC validation
 *   - SkillStore lifecycle: create, getByName, update bumps version + hmac,
 *     duplicate-name rejection, archive/unarchive, delete, recordRun updates
 *     provenance, runs query, export/import across stores
 */

import assert from "node:assert/strict";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import {
  SkillSqliteStore,
  SkillStore,
  SKILL_STATUS,
  proposeSkills,
  templateFingerprint,
  canonicalize,
  signSkill,
  verifySkill,
  exportSkill,
  importSkillEnvelope,
  fnv1a64,
} from "../src/skills/index.js";

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

const NOW = Date.UTC(2026, 4, 17, 12, 0, 0);

async function makeStore() {
  const storage = new SkillSqliteStore({ initModule: sqlite3InitModule });
  const store = new SkillStore({ storage });
  await store.open();
  return store;
}

// ===== templateFingerprint =====

test("templateFingerprint: prefers explicit payload.template", () => {
  const t = { payload: { template: "github-review", url: "https://x" } };
  assert.equal(templateFingerprint(t), "github-review");
});

test("templateFingerprint: falls back to routing.template", () => {
  const t = { payload: { x: 1 }, routing: { template: "weather-check" } };
  assert.equal(templateFingerprint(t), "weather-check");
});

test("templateFingerprint: shape-based synthesizes consistent fp for same shape", () => {
  const a = { payload: { url: "https://a", action: "click" } };
  const b = { payload: { url: "https://b", action: "submit" } };
  assert.equal(templateFingerprint(a), templateFingerprint(b));
});

test("templateFingerprint: different shapes produce different fp", () => {
  const a = { payload: { url: "https://a" } };
  const b = { payload: { count: 5 } };
  assert.notEqual(templateFingerprint(a), templateFingerprint(b));
});

// ===== proposeSkills =====

function makeTaskWithRuns(id, payload, runStatuses, baseTime) {
  const task = { id, title: `Task ${id}`, payload };
  const runs = runStatuses.map((status, i) => ({
    id: i,
    taskId: id,
    status,
    startedAt: baseTime + i * 1000,
    endedAt: baseTime + i * 1000 + 500,
  }));
  return { task, runs };
}

test("proposeSkills: groups tasks by template + filters by threshold", () => {
  const { task: t1, runs: r1 } = makeTaskWithRuns("t1", { template: "x" }, ["success", "success"], NOW);
  const { task: t2, runs: r2 } = makeTaskWithRuns("t2", { template: "x" }, ["success"], NOW + 10_000);
  const { task: t3, runs: r3 } = makeTaskWithRuns("t3", { template: "y" }, ["success"], NOW + 20_000);

  const candidates = proposeSkills(
    [t1, t2, t3],
    { t1: r1, t2: r2, t3: r3 },
    { threshold: 3 }
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].successCount, 3);
  assert.deepEqual(candidates[0].sourceTaskIds.sort(), ["t1", "t2"]);
});

test("proposeSkills: ignores failed runs in count", () => {
  const { task, runs } = makeTaskWithRuns("solo", { template: "z" }, ["success", "failure", "success"], NOW);
  const candidates = proposeSkills([task], { solo: runs }, { threshold: 3 });
  // Only 2 successes < 3 → no candidate
  assert.equal(candidates.length, 0);
});

test("proposeSkills: newest-first ordering by lastSeenAt", () => {
  const old = makeTaskWithRuns("old", { template: "a" }, ["success", "success", "success"], NOW - 1_000_000);
  const fresh = makeTaskWithRuns("fresh", { template: "b" }, ["success", "success", "success"], NOW);
  const candidates = proposeSkills(
    [old.task, fresh.task],
    { old: old.runs, fresh: fresh.runs },
    { threshold: 3 }
  );
  assert.equal(candidates[0].sourceTaskIds[0], "fresh");
});

// ===== canonicalize / signing =====

test("canonicalize: stable across key order", () => {
  const a = { c: 1, a: 2, b: 3 };
  const b = { b: 3, a: 2, c: 1 };
  assert.equal(canonicalize(a), canonicalize(b));
});

test("canonicalize: nested objects + arrays", () => {
  const v = { outer: { z: [1, 2, 3], a: { y: "foo", x: null } } };
  const expected = '{"outer":{"a":{"x":null,"y":"foo"},"z":[1,2,3]}}';
  assert.equal(canonicalize(v), expected);
});

test("canonicalize: excludeKey skips a top-level field", () => {
  const v = { name: "x", hmac: "should-be-skipped" };
  assert.equal(canonicalize(v, { excludeKey: "hmac" }), '{"name":"x"}');
});

test("fnv1a64: deterministic", () => {
  assert.equal(fnv1a64("hello"), fnv1a64("hello"));
  assert.notEqual(fnv1a64("hello"), fnv1a64("world"));
});

test("signSkill: signature is stable", () => {
  const s = { name: "x", steps: [{ id: "s1", kind: "run_task" }], hmac: "" };
  const sig1 = signSkill(s);
  const sig2 = signSkill({ ...s, hmac: "different" }); // hmac excluded
  assert.equal(sig1, sig2);
});

test("verifySkill: passes on correct hmac", () => {
  const s = { name: "x", steps: [], capability: "read_only" };
  const signed = { ...s, hmac: signSkill(s) };
  assert.equal(verifySkill(signed), true);
});

test("verifySkill: rejects tampered skill", () => {
  const s = { name: "x", steps: [], capability: "read_only" };
  const signed = { ...s, hmac: signSkill(s), description: "added by attacker" };
  assert.equal(verifySkill(signed), false);
});

test("exportSkill / importSkillEnvelope: round trip preserves content", () => {
  const skill = {
    id: "skill-1",
    name: "book-flight",
    steps: [{ id: "s1", kind: "run_task", params: { template: "flight" } }],
    capability: "write_network",
    domains: ["united.com"],
  };
  const env = exportSkill(skill);
  const restored = importSkillEnvelope(env);
  assert.deepEqual(restored.steps, skill.steps);
  assert.equal(restored.capability, skill.capability);
});

test("importSkillEnvelope: rejects unsupported format", () => {
  assert.throws(() => importSkillEnvelope({ format: "foreign.v3", skill: {} }), /unsupported/);
});

test("importSkillEnvelope: rejects tampered payload", () => {
  const skill = { name: "x", steps: [{ id: "a", kind: "run_task" }], capability: "read_only" };
  const env = exportSkill(skill);
  // tamper:
  env.skill.steps[0].params = { evil: true };
  assert.throws(() => importSkillEnvelope(env), /HMAC verification failed/);
});

// ===== SkillStore lifecycle =====

await test("create: round-trips and signs", async () => {
  const store = await makeStore();
  const s = store.create(
    {
      name: "book-united-flight",
      description: "Book a flight on United",
      steps: [{ id: "s1", kind: "run_task", params: {} }],
      capability: "write_network",
      domains: ["united.com"],
    },
    NOW
  );
  assert.equal(s.status, SKILL_STATUS.ACTIVE);
  assert.equal(s.version, 1);
  assert.equal(verifySkill(s), true);

  // round-trip
  const re = store.get(s.id);
  assert.equal(re.name, "book-united-flight");
  assert.deepEqual(re.steps, s.steps);
  store.close();
});

await test("create: rejects duplicate name", async () => {
  const store = await makeStore();
  store.create({ name: "dup", steps: [{ id: "s1", kind: "run_task" }], capability: "read_only" }, NOW);
  assert.throws(
    () => store.create({ name: "dup", steps: [{ id: "s2", kind: "run_task" }], capability: "read_only" }, NOW + 1),
    /already taken/
  );
  store.close();
});

await test("create: rejects empty steps", async () => {
  const store = await makeStore();
  assert.throws(
    () => store.create({ name: "x", steps: [], capability: "read_only" }, NOW),
    /at least one step/
  );
  store.close();
});

await test("update: bumps version and re-signs", async () => {
  const store = await makeStore();
  const s = store.create({ name: "x", steps: [{ id: "s1", kind: "run_task" }], capability: "read_only" }, NOW);
  const before = s.hmac;
  const after = store.update(s.id, { description: "new" }, NOW + 1);
  assert.equal(after.version, 2);
  assert.notEqual(after.hmac, before);
  assert.equal(verifySkill(after), true);
  store.close();
});

await test("getByName lookup", async () => {
  const store = await makeStore();
  store.create({ name: "byname", steps: [{ id: "s1", kind: "run_task" }], capability: "read_only" }, NOW);
  const found = store.getByName("byname");
  assert.equal(found.name, "byname");
  store.close();
});

await test("archive / unarchive", async () => {
  const store = await makeStore();
  const s = store.create({ name: "arc", steps: [{ id: "s1", kind: "run_task" }], capability: "read_only" }, NOW);
  let after = store.archive(s.id, NOW + 1);
  assert.equal(after.status, SKILL_STATUS.ARCHIVED);
  after = store.unarchive(s.id, NOW + 2);
  assert.equal(after.status, SKILL_STATUS.ACTIVE);
  store.close();
});

await test("delete removes the row", async () => {
  const store = await makeStore();
  const s = store.create({ name: "del", steps: [{ id: "s1", kind: "run_task" }], capability: "read_only" }, NOW);
  store.delete(s.id);
  assert.equal(store.get(s.id), null);
  store.close();
});

await test("recordRun updates provenance + successRate", async () => {
  const store = await makeStore();
  const s = store.create({ name: "rec", steps: [{ id: "s1", kind: "run_task" }], capability: "read_only" }, NOW);

  let after = store.recordRun(s.id, { status: "success", startedAt: NOW + 1, endedAt: NOW + 100 }, NOW + 100);
  assert.equal(after.provenance.confirmedRuns, 1);
  assert.equal(after.provenance.successRate, 1);
  assert.equal(after.provenance.lastSuccessAt, NOW + 100);

  after = store.recordRun(s.id, { status: "failure", error: "boom" }, NOW + 200);
  assert.equal(after.provenance.confirmedRuns, 2);
  assert.equal(after.provenance.successRate, 0.5);

  const runs = store.runs(s.id);
  assert.equal(runs.length, 2);
  store.close();
});

await test("confirmFromProposal materializes a skill from a candidate", async () => {
  const store = await makeStore();
  const proposal = {
    suggestedName: "Recurring task",
    explanation: "Observed 3 successful runs",
    sourceTaskIds: ["t1", "t2"],
    template: { url: "https://example.com" },
    successCount: 3,
    firstSeenAt: NOW - 1_000_000,
    lastSeenAt: NOW,
  };
  const skill = store.confirmFromProposal(proposal, NOW);
  assert.equal(skill.name, "Recurring task");
  assert.deepEqual(skill.provenance.distilledFromTaskIds, ["t1", "t2"]);
  assert.equal(skill.steps[0].kind, "run_task");
  store.close();
});

await test("export/import across stores", async () => {
  const storeA = await makeStore();
  const created = storeA.create(
    {
      name: "portable",
      description: "share me",
      steps: [{ id: "s1", kind: "run_task", params: { url: "https://x" } }],
      capability: "read_with_network",
      domains: ["x.com"],
    },
    NOW
  );
  const envelope = storeA.exportSkill(created.id);

  const storeB = await makeStore();
  const imported = storeB.importEnvelope(envelope, NOW + 1);
  assert.equal(imported.name, "portable");
  assert.notEqual(imported.id, created.id); // fresh id in the target store
  assert.equal(verifySkill(imported), true);
  storeA.close();
  storeB.close();
});

console.log(`\nAll ${testCount} tests passed.`);
