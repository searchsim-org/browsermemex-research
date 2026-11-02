/**
 * Tests for Algorithm 2 — conflict detection.
 * Runnable with: node packages/core/test/conflicts.test.mjs
 *
 * Exercises every branch of the paper's algorithm:
 *   - new key  (lines 1-4)
 *   - dedup via Jaccard >= 0.85  (lines 5-7)
 *   - non-overlapping intervals  (lines 9-11, succession)
 *   - multi-valued relation  (lines 9-11, multi)
 *   - functional + overlap + candidate has stronger evidence  (lines 13-14)
 *   - functional + overlap + existing has stronger evidence  (lines 15-16)
 *   - functional + overlap + ambiguous  (lines 17-18)
 */

import assert from "node:assert/strict";
import { detectConflict, CONFLICT_OUTCOME, jaccardValue, intervalsOverlap } from "../src/memory/algorithms/conflicts.js";
import { STATUS } from "../src/memory/types.js";

let testCount = 0;
function test(name, fn) {
  testCount++;
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  ${e.message}`);
    process.exit(1);
  }
}

// --- helper: build a minimal nugget shape for testing ---
function nugget({ id, value, start, end = null, sources = 1, predicate = "status" }) {
  return {
    id,
    fact: { subject: "project-x", predicate, object: value },
    validity: { start, end, scope: "agent:claude-code" },
    provenance: Array.from({ length: sources }, (_, i) => ({
      sourceUrl: `https://src-${i}.example.com/${id}`,
      extractedAt: start,
    })),
    epistemic: { status: STATUS.ACTIVE, rank: "Normal", confidence: 0.9 },
  };
}

// --- Jaccard sanity ---
test("jaccard: identical strings → 1", () => {
  assert.equal(jaccardValue("On Track", "On Track"), 1);
});
test("jaccard: very similar strings → high", () => {
  const j = jaccardValue("On Track", "on-track");
  assert.ok(j >= 0.5 && j <= 1, `expected high jaccard, got ${j}`);
});
test("jaccard: disjoint strings → low", () => {
  const j = jaccardValue("happy", "vegetable");
  assert.ok(j < 0.3, `expected low jaccard, got ${j}`);
});

// --- Interval overlap ---
test("interval overlap: clearly overlapping", () => {
  assert.equal(intervalsOverlap({ start: 100, end: 200 }, { start: 150, end: 250 }), true);
});
test("interval overlap: touching at boundary [a,b) / [b,c) → no overlap", () => {
  assert.equal(intervalsOverlap({ start: 100, end: 200 }, { start: 200, end: 300 }), false);
});
test("interval overlap: open-ended", () => {
  assert.equal(intervalsOverlap({ start: 100, end: null }, { start: 200, end: 300 }), true);
});

// --- Algorithm 2 branches ---

test("(1)-(4) new key → Active, no updates", () => {
  const candidate = nugget({ id: "c1", value: "On Track", start: 100 });
  const result = detectConflict(candidate, []);
  assert.equal(result.outcome, CONFLICT_OUTCOME.NEW_KEY);
  assert.equal(result.newStatus, STATUS.ACTIVE);
  assert.equal(result.mergeIntoId, null);
  assert.equal(result.updates.length, 0);
});

test("(5)-(7) dedup via Jaccard ≥ 0.85 → merged", () => {
  const existing = nugget({ id: "e1", value: "On Track", start: 100 });
  const candidate = nugget({ id: "c1", value: "on track", start: 200 });
  const result = detectConflict(candidate, [existing]);
  assert.equal(result.outcome, CONFLICT_OUTCOME.MERGED);
  assert.equal(result.mergeIntoId, "e1");
  assert.equal(result.newStatus, null);
});

test("(9)-(11) non-overlapping intervals → succession, both Active", () => {
  const existing = nugget({ id: "e1", value: "On Track", start: 100, end: 200 });
  const candidate = nugget({ id: "c1", value: "At Risk", start: 200 });
  const result = detectConflict(candidate, [existing]);
  assert.equal(result.outcome, CONFLICT_OUTCOME.SUCCESSION);
  assert.equal(result.newStatus, STATUS.ACTIVE);
  assert.equal(result.updates.length, 0);
});

test("(9)-(11) multi-valued relation → multi, both Active", () => {
  const existing = nugget({ id: "e1", value: "alice", start: 100, predicate: "assignee" });
  const candidate = nugget({ id: "c1", value: "bob", start: 150, predicate: "assignee" });
  const result = detectConflict(candidate, [existing]);
  assert.equal(result.outcome, CONFLICT_OUTCOME.MULTI_VALUED);
  assert.equal(result.newStatus, STATUS.ACTIVE);
  assert.equal(result.updates.length, 0);
});

test("(13)-(14) candidate has ≥2 evidence + newer start → existing Deprecated", () => {
  const existing = nugget({ id: "e1", value: "On Track", start: 100, sources: 1 });
  const candidate = nugget({ id: "c1", value: "At Risk", start: 150, sources: 2 });
  const result = detectConflict(candidate, [existing]);
  assert.equal(result.outcome, CONFLICT_OUTCOME.DEPRECATED_EXISTING);
  assert.equal(result.newStatus, STATUS.ACTIVE);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].id, "e1");
  assert.equal(result.updates[0].status, STATUS.DEPRECATED);
  assert.equal(result.updates[0].validityEnd, 150);
});

test("(15)-(16) existing has ≥2 evidence + newer start → candidate Deprecated", () => {
  const existing = nugget({ id: "e1", value: "On Track", start: 200, sources: 2 });
  const candidate = nugget({ id: "c1", value: "At Risk", start: 150, sources: 1 });
  const result = detectConflict(candidate, [existing]);
  assert.equal(result.outcome, CONFLICT_OUTCOME.DEPRECATED_NEW);
  assert.equal(result.newStatus, STATUS.DEPRECATED);
  // candidate's own validityEnd should have been tightened in place
  assert.equal(candidate.validity.end, 200);
});

test("(17)-(18) ambiguous evidence → both Contested", () => {
  const existing = nugget({ id: "e1", value: "On Track", start: 100, sources: 1 });
  const candidate = nugget({ id: "c1", value: "At Risk", start: 150, sources: 1 });
  const result = detectConflict(candidate, [existing]);
  assert.equal(result.outcome, CONFLICT_OUTCOME.CONTESTED);
  assert.equal(result.newStatus, STATUS.CONTESTED);
  assert.equal(result.updates.length, 1);
  assert.equal(result.updates[0].status, STATUS.CONTESTED);
});

test("multiple existing nuggets with mixed branches → conservative CONTESTED outcome", () => {
  // One existing where candidate would win, another where it would lose → mixed = Contested
  const e1 = nugget({ id: "e1", value: "On Track", start: 50, sources: 1 });
  const e2 = nugget({ id: "e2", value: "Blocked", start: 200, sources: 2 });
  const candidate = nugget({ id: "c1", value: "At Risk", start: 100, sources: 2 });
  const result = detectConflict(candidate, [e1, e2]);
  // candidate vs e1 → DEPRECATED_EXISTING; candidate vs e2 → DEPRECATED_NEW → overall CONTESTED
  assert.equal(result.outcome, CONFLICT_OUTCOME.CONTESTED);
});

console.log(`\nAll ${testCount} tests passed.`);
