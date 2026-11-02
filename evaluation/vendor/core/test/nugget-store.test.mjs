/**
 * Integration test: full NuggetStore pipeline against a real SQLite database.
 * Runnable with: node packages/core/test/nugget-store.test.mjs
 *
 * Loads @sqlite.org/sqlite-wasm's Node entry, opens an in-memory DB, exercises:
 *   - schema migration
 *   - inferValidity → Algorithm 1
 *   - insert with no prior key → Active
 *   - insert that triggers Algorithm 2 → DEPRECATED_EXISTING
 *   - insert that triggers Algorithm 2 → CONTESTED
 *   - dedup via Jaccard
 *   - succession on non-overlapping intervals
 *   - query with validity filter
 *   - query with VIEW.ACTIVE vs VIEW.ACTIVE_PLUS_CONTESTED
 */

import assert from "node:assert/strict";
import { SqliteStore } from "../src/memory/storage/sqlite.js";
import { NuggetStore } from "../src/memory/nugget-store.js";
import { inferValidity, UI_SIGNAL } from "../src/memory/algorithms/validity.js";
import { STATUS, VIEW } from "../src/memory/types.js";
import { CONFLICT_OUTCOME } from "../src/memory/algorithms/conflicts.js";

// The package's exports map resolves "node" condition to dist/node.mjs automatically.
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

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

function makeStore() {
  const storage = new SqliteStore({ initModule: sqlite3InitModule });
  return new NuggetStore({ storage });
}

const SCOPE = "agent:claude-code";
const NOW = Date.UTC(2026, 4, 16);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeCandidate({
  subject = "project-x",
  predicate = "status",
  object,
  validityStart = NOW,
  validityEnd = null,
  sources = 1,
  agentId = "claude-code",
}) {
  return {
    kind: "SemanticFact",
    fact: { subject, predicate, object },
    canonicalText: `${subject} ${predicate} ${object}`,
    validity: { start: validityStart, end: validityEnd, scope: SCOPE },
    epistemic: { status: STATUS.ACTIVE, rank: "Normal", confidence: 0.9 },
    provenance: Array.from({ length: sources }, (_, i) => ({
      sourceUrl: `https://src-${i}-${object}.example.com/p${i}`,
      extractedAt: validityStart,
      agentId,
    })),
    createdAt: NOW,
  };
}

// ====== schema + open ======

await test("opens in-memory SQLite and runs migration", async () => {
  const store = makeStore();
  await store.open();
  assert.equal(store.count(), 0);
  store.close();
});

// ====== Algorithm 1 integration ======

await test("inferValidity drives validity fields end-to-end", async () => {
  const store = makeStore();
  await store.open();

  const validity = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://acme.atlassian.net/browse/PROJ-1",
    uiSignals: [{ kind: UI_SIGNAL.LAST_UPDATED, secondsAgo: 3600 }],
  });
  validity.scope = SCOPE;

  const candidate = {
    kind: "SemanticFact",
    fact: { subject: "PROJ-1", predicate: "status", object: "Open" },
    canonicalText: "PROJ-1 status Open",
    validity,
    epistemic: { status: STATUS.ACTIVE, rank: "Normal", confidence: 0.9 },
    provenance: [{ sourceUrl: "https://acme.atlassian.net/browse/PROJ-1", extractedAt: NOW }],
    createdAt: NOW,
  };

  const result = store.insert(candidate);
  assert.equal(result.outcome, CONFLICT_OUTCOME.NEW_KEY);
  assert.equal(store.count(), 1);

  const fetched = store.get(result.nuggetId);
  assert.equal(fetched.validity.start, NOW - HOUR);
  assert.equal(fetched.validity.end, NOW - HOUR + 24 * HOUR); // atlassian → ticket → 24h
  assert.equal(fetched.validity.sourceType, "ticket");
  store.close();
});

// ====== Algorithm 2 integration ======

await test("new key insert → Active", async () => {
  const store = makeStore();
  await store.open();
  const result = store.insert(makeCandidate({ object: "On Track" }));
  assert.equal(result.outcome, CONFLICT_OUTCOME.NEW_KEY);
  assert.equal(result.candidateStatus, STATUS.ACTIVE);
  store.close();
});

await test("dedup by Jaccard ≥ 0.85 → MERGED, count unchanged", async () => {
  const store = makeStore();
  await store.open();
  store.insert(makeCandidate({ object: "On Track", validityStart: NOW }));
  const result = store.insert(makeCandidate({ object: "on track", validityStart: NOW + 60_000 }));
  assert.equal(result.outcome, CONFLICT_OUTCOME.MERGED);
  assert.equal(store.count(), 1);
  store.close();
});

await test("non-overlapping intervals → SUCCESSION, both Active", async () => {
  const store = makeStore();
  await store.open();
  store.insert(makeCandidate({ object: "On Track", validityStart: NOW, validityEnd: NOW + DAY }));
  const result = store.insert(makeCandidate({ object: "At Risk", validityStart: NOW + DAY }));
  assert.equal(result.outcome, CONFLICT_OUTCOME.SUCCESSION);
  assert.equal(result.candidateStatus, STATUS.ACTIVE);
  assert.equal(store.count(), 2);
  store.close();
});

await test("candidate has stronger evidence → existing DEPRECATED", async () => {
  const store = makeStore();
  await store.open();
  const r1 = store.insert(makeCandidate({ object: "On Track", validityStart: NOW, sources: 1 }));
  const r2 = store.insert(makeCandidate({ object: "At Risk", validityStart: NOW + HOUR, sources: 2 }));
  assert.equal(r2.outcome, CONFLICT_OUTCOME.DEPRECATED_EXISTING);
  assert.equal(r2.candidateStatus, STATUS.ACTIVE);

  const old = store.get(r1.nuggetId);
  assert.equal(old.epistemic.status, STATUS.DEPRECATED);
  assert.equal(old.validity.end, NOW + HOUR);
  store.close();
});

await test("ambiguous evidence → both CONTESTED", async () => {
  const store = makeStore();
  await store.open();
  const r1 = store.insert(makeCandidate({ object: "On Track", validityStart: NOW, sources: 1 }));
  const r2 = store.insert(makeCandidate({ object: "At Risk", validityStart: NOW + HOUR, sources: 1 }));
  assert.equal(r2.outcome, CONFLICT_OUTCOME.CONTESTED);
  assert.equal(r2.candidateStatus, STATUS.CONTESTED);

  const old = store.get(r1.nuggetId);
  assert.equal(old.epistemic.status, STATUS.CONTESTED);
  store.close();
});

// ====== Query / view filtering ======

await test("query returns only Active nuggets by default", async () => {
  const store = makeStore();
  await store.open();
  store.insert(makeCandidate({ subject: "alpha", object: "On Track", validityStart: NOW, sources: 1 }));
  store.insert(makeCandidate({ subject: "alpha", object: "At Risk", validityStart: NOW + HOUR, sources: 1 }));
  // Now both should be CONTESTED. Default view = ACTIVE, so query should return nothing.
  const results = store.query("alpha", { time: NOW + 30 * 60 * 1000 });
  assert.equal(results.length, 0);

  const allResults = store.query("alpha", {
    time: NOW + 30 * 60 * 1000,
    view: VIEW.ACTIVE_PLUS_CONTESTED,
  });
  assert.ok(allResults.length >= 1, `expected results with contested view, got ${allResults.length}`);
  store.close();
});

await test("query honors validity time filter", async () => {
  const store = makeStore();
  await store.open();
  // A fact valid only in 2024
  store.insert(makeCandidate({
    subject: "PROJ-99",
    object: "Closed",
    validityStart: Date.UTC(2024, 0, 1),
    validityEnd: Date.UTC(2024, 11, 31),
  }));
  const inWindow = store.query("PROJ-99", { time: Date.UTC(2024, 5, 1) });
  const outOfWindow = store.query("PROJ-99", { time: Date.UTC(2026, 0, 1) });
  assert.ok(inWindow.length >= 1);
  assert.equal(outOfWindow.length, 0);
  store.close();
});

await test("query scope filter excludes other agents", async () => {
  const store = makeStore();
  await store.open();
  store.insert(makeCandidate({ subject: "PROJ-7", object: "Open", agentId: "claude-code" }));

  // Insert with a different scope
  const other = makeCandidate({ subject: "PROJ-7", object: "Open", agentId: "cursor" });
  other.validity.scope = "agent:cursor";
  store.insert(other);

  const onlyClaude = store.query("PROJ-7", { time: NOW + 60_000, scope: SCOPE });
  const onlyCursor = store.query("PROJ-7", { time: NOW + 60_000, scope: "agent:cursor" });

  assert.equal(onlyClaude.length, 1);
  assert.equal(onlyCursor.length, 1);
  assert.equal(onlyClaude[0].nugget.validity.scope, SCOPE);
  assert.equal(onlyCursor[0].nugget.validity.scope, "agent:cursor");
  store.close();
});

await test("query returns nuggets ranked by BM25", async () => {
  const store = makeStore();
  await store.open();
  // Use distinct subjects so they don't conflict via Algorithm 2.
  // Only one nugget contains the rare token; it should rank first.
  store.insert(makeCandidate({ subject: "team-a", object: "alpha quokka special" }));
  store.insert(makeCandidate({ subject: "team-b", object: "alpha beta gamma" }));
  store.insert(makeCandidate({ subject: "team-c", object: "alpha generic stuff" }));

  const r = store.query("quokka", { time: NOW + 60_000 });
  assert.ok(r.length >= 1, `expected at least 1 result for 'quokka', got ${r.length}`);
  assert.ok(r[0].nugget.fact.object.includes("quokka"), `top hit should contain 'quokka', got: ${r[0].nugget.fact.object}`);
  store.close();
});

console.log(`\nAll ${testCount} tests passed.`);
