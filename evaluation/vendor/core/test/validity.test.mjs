/**
 * Tests for Algorithm 1 — validity inference.
 * Runnable with: node packages/core/test/validity.test.mjs
 */

import assert from "node:assert/strict";
import { inferValidity, UI_SIGNAL } from "../src/memory/algorithms/validity.js";
import { presetForHost, presetForUrl, VALIDITY_PRESET } from "../src/memory/domain-policies.js";

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

const NOW = Date.UTC(2026, 4, 16, 12, 0, 0); // 2026-05-16 12:00 UTC
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// --- Domain policies ---

test("domain policy: acme.atlassian.net → TICKET (24h)", () => {
  const p = presetForHost("acme.atlassian.net");
  assert.equal(p.name, "ticket");
  assert.equal(p.durationMs, 24 * HOUR);
});

test("domain policy: github.com → PROJECT_METADATA (7d)", () => {
  assert.equal(presetForHost("github.com").name, "project_metadata");
});

test("domain policy: grafana → DASHBOARD (1h)", () => {
  assert.equal(presetForUrl("https://acme.grafana.net/d/board1").name, "dashboard");
});

test("domain policy: unknown host → UNKNOWN", () => {
  assert.equal(presetForHost("totally-random-host.test").name, "unknown");
});

// --- Algorithm 1 — fallback default ---

test("(6) no signals → start=extractedAt, end=extractedAt + domain default", () => {
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://acme.atlassian.net/browse/PROJ-42",
  });
  assert.equal(v.start, NOW);
  assert.equal(v.end, NOW + 24 * HOUR);
  assert.equal(v.sourceType, "ticket");
  assert.equal(v.location, "acme.atlassian.net");
});

// --- Algorithm 1 — UI signals, increasing priority ---

test("(5) LAST_UPDATED: anchors start to extractedAt - secondsAgo", () => {
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://github.com/foo/bar/issues/1",
    uiSignals: [{ kind: UI_SIGNAL.LAST_UPDATED, secondsAgo: 2 * 60 * 60 }],
  });
  assert.equal(v.start, NOW - 2 * HOUR);
  // GitHub → PROJECT_METADATA (7d)
  assert.equal(v.end, NOW - 2 * HOUR + 7 * DAY);
});

test("(4) VERSION_BANNER: start = banner date, end = start + preset", () => {
  const versionDate = Date.UTC(2026, 2, 15);
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://github.com/foo/bar/releases/tag/v2.3.1",
    uiSignals: [{ kind: UI_SIGNAL.VERSION_BANNER, startMs: versionDate, label: "v2.3.1" }],
  });
  assert.equal(v.start, versionDate);
  assert.equal(v.end, versionDate + 7 * DAY);
});

test("(4) EVENT_DATE: start = event date", () => {
  const sprintEnd = Date.UTC(2026, 5, 1);
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://acme.atlassian.net/sprint/42",
    uiSignals: [{ kind: UI_SIGNAL.EVENT_DATE, dateMs: sprintEnd }],
  });
  assert.equal(v.start, sprintEnd);
  assert.equal(v.end, sprintEnd + 24 * HOUR);
});

test("(3) TIME_RANGE: explicit start + end, both honored", () => {
  const rangeStart = NOW - 7 * DAY;
  const rangeEnd = NOW;
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://grafana.net/d/board1",
    uiSignals: [{ kind: UI_SIGNAL.TIME_RANGE, startMs: rangeStart, endMs: rangeEnd }],
  });
  assert.equal(v.start, rangeStart);
  assert.equal(v.end, rangeEnd);
});

test("(3) TIME_RANGE without endMs: end via domain default", () => {
  const rangeStart = NOW - 7 * DAY;
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://grafana.net/d/board1",
    uiSignals: [{ kind: UI_SIGNAL.TIME_RANGE, startMs: rangeStart }],
  });
  assert.equal(v.start, rangeStart);
  assert.equal(v.end, rangeStart + 1 * HOUR); // dashboard preset
});

test("(2) SINCE: explicit start; end defaulted", () => {
  const since = Date.UTC(2019, 0, 1);
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://github.com/foo/bar",
    uiSignals: [{ kind: UI_SIGNAL.SINCE, startMs: since }],
  });
  assert.equal(v.start, since);
  assert.equal(v.end, since + 7 * DAY);
});

test("(2) SINCE + UNTIL: both honored", () => {
  const since = Date.UTC(2019, 0, 1);
  const until = Date.UTC(2023, 11, 31);
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://github.com/foo/bar",
    uiSignals: [
      { kind: UI_SIGNAL.SINCE, startMs: since },
      { kind: UI_SIGNAL.UNTIL, endMs: until },
    ],
  });
  assert.equal(v.start, since);
  assert.equal(v.end, until);
});

test("(1) override wins over signals", () => {
  const overrideStart = Date.UTC(2025, 0, 1);
  const overrideEnd = Date.UTC(2025, 5, 30);
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://acme.atlassian.net/browse/PROJ-42",
    uiSignals: [{ kind: UI_SIGNAL.LAST_UPDATED, secondsAgo: 60 }],
    override: { start: overrideStart, end: overrideEnd },
  });
  assert.equal(v.start, overrideStart);
  assert.equal(v.end, overrideEnd);
});

test("(1) override with null end stays null", () => {
  const overrideStart = Date.UTC(2025, 0, 1);
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "https://github.com/foo/bar",
    override: { start: overrideStart, end: null },
  });
  assert.equal(v.start, overrideStart);
  assert.equal(v.end, null);
});

test("malformed URL still produces a result", () => {
  const v = inferValidity({
    extractedAt: NOW,
    sourceUrl: "not-a-url",
  });
  assert.ok(v.start === NOW);
  assert.equal(v.location, null);
  assert.equal(v.sourceType, "unknown");
});

console.log(`\nAll ${testCount} tests passed.`);
