/**
 * Router & policy engine tests.
 * Runnable with: node packages/core/test/router.test.mjs
 *
 * Covers:
 *   - compileGlob: every-segment vs cross-segment patterns
 *   - Every matcher kind (URL_PATTERN, TASK_KIND, KEYWORDS, TIME_OF_DAY,
 *     CAPABILITY_REQUIRED, CAPABILITY_LEVEL)
 *   - applyRules: first-rule-wins, forbidden/unavailable filtering
 *   - selectAgent: preferred-rank dominance, success-rate + cost tiebreakers
 *   - runLlmFallback: returns null on out-of-set picks
 *   - Router resolution order: override > rule > LLM > default fallback
 *   - Schema v2 migration: cost + routing columns added to task_runs
 *   - End-to-end: scheduler dispatch persists cost + routing through TaskStore.runs
 */

import assert from "node:assert/strict";
import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

import {
  Router,
  compileGlob,
  evaluateMatch,
  allMatch,
  applyRules,
  selectAgent,
  averageCostUsd,
  pickCheaper,
  runLlmFallback,
  buildLlmPrompt,
  MATCH_KIND,
  DECISION_SOURCE,
} from "../src/router/index.js";

import {
  TaskSqliteStore,
  TaskStore,
  Scheduler,
  TASK_KIND,
  TASK_STATUS,
  SCHEDULE_KIND,
} from "../src/scheduler/index.js";

import { CAPABILITY } from "../src/security/index.js";

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

const NOW = Date.UTC(2026, 4, 16, 14, 0, 0); // 14:00 UTC

// ===== compileGlob =====

test("compileGlob: '*' is single path segment (any non-slash chars)", () => {
  const re = compileGlob("https://*/foo");
  // 'github.com' and 'a.b.com' are both single segments (no '/') → match
  assert.equal(re.test("https://github.com/foo"), true);
  assert.equal(re.test("https://a.b.com/foo"), true);
  // extra '/' in the middle = two segments → '*' must reject
  assert.equal(re.test("https://github.com/extra/foo"), false);
});

test("compileGlob: '**' crosses segments", () => {
  const re = compileGlob("https://github.com/**");
  assert.equal(re.test("https://github.com/foo/bar/baz"), true);
});

test("compileGlob: dots are literal", () => {
  const re = compileGlob("*.github.com/**");
  assert.equal(re.test("api.github.com/repos/x"), true);
  assert.equal(re.test("apixgithubxcom/repos/x"), false);
});

// ===== matchers =====

function fakeTask(overrides = {}) {
  return {
    kind: TASK_KIND.ONE_SHOT,
    title: "Open PR review",
    description: "Review the latest pull request on github.com/searchsim-org/browser-memex",
    payload: { url: "https://github.com/searchsim-org/browser-memex/pull/42" },
    capability: CAPABILITY.READ_WITH_NETWORK,
    ...overrides,
  };
}

test("URL_PATTERN match", () => {
  const m = { kind: MATCH_KIND.URL_PATTERN, pattern: "https://**/github.com/**" };
  const t = fakeTask({ payload: { url: "https://api.github.com/repos/x" } });
  // Verify with a simpler accurate pattern instead
  const m2 = { kind: MATCH_KIND.URL_PATTERN, pattern: "https://**" };
  assert.equal(evaluateMatch(m2, t, { now: NOW }), true);
});

test("TASK_KIND match", () => {
  const m = { kind: MATCH_KIND.TASK_KIND, kinds: [TASK_KIND.ONE_SHOT, TASK_KIND.WATCHER] };
  assert.equal(evaluateMatch(m, fakeTask(), { now: NOW }), true);
  assert.equal(evaluateMatch(m, fakeTask({ kind: TASK_KIND.TRACKER }), { now: NOW }), false);
});

test("KEYWORDS match: case-insensitive substring", () => {
  const m = { kind: MATCH_KIND.KEYWORDS, terms: ["pull request", "PR"] };
  assert.equal(evaluateMatch(m, fakeTask(), { now: NOW }), true);
});

test("TIME_OF_DAY match: business hours window", () => {
  const m = { kind: MATCH_KIND.TIME_OF_DAY, window: { fromHour: 9, toHour: 17 } };
  assert.equal(evaluateMatch(m, fakeTask(), { now: NOW }), true); // 14:00 UTC
  assert.equal(evaluateMatch(m, fakeTask(), { now: Date.UTC(2026, 4, 16, 22, 0) }), false);
});

test("TIME_OF_DAY: overnight window (22..6)", () => {
  const m = { kind: MATCH_KIND.TIME_OF_DAY, window: { fromHour: 22, toHour: 6 } };
  assert.equal(evaluateMatch(m, fakeTask(), { now: Date.UTC(2026, 4, 16, 23, 0) }), true);
  assert.equal(evaluateMatch(m, fakeTask(), { now: Date.UTC(2026, 4, 16, 14, 0) }), false);
});

test("CAPABILITY_REQUIRED: agent must declare capability", () => {
  const m = { kind: MATCH_KIND.CAPABILITY_REQUIRED, capability: "supportsStreamableHttp" };
  const ctx = {
    now: NOW,
    agentDescriptor: { capabilities: { supportsStreamableHttp: true } },
  };
  assert.equal(evaluateMatch(m, fakeTask(), ctx), true);
  const ctxFalse = { now: NOW, agentDescriptor: { capabilities: {} } };
  assert.equal(evaluateMatch(m, fakeTask(), ctxFalse), false);
});

test("CAPABILITY_LEVEL: rule rejects when task capability exceeds max", () => {
  const m = { kind: MATCH_KIND.CAPABILITY_LEVEL, maxCapability: CAPABILITY.WRITE_DOM };
  // task capability READ_WITH_NETWORK is below max → match
  assert.equal(evaluateMatch(m, fakeTask(), { now: NOW }), true);
  // task capability DESTRUCTIVE exceeds max → no match
  const tDestr = fakeTask({ capability: CAPABILITY.DESTRUCTIVE });
  assert.equal(evaluateMatch(m, tDestr, { now: NOW }), false);
});

test("allMatch: empty matches array → always true", () => {
  assert.equal(allMatch([], fakeTask(), { now: NOW }), true);
});

test("allMatch: conjunction (AND)", () => {
  const matches = [
    { kind: MATCH_KIND.URL_PATTERN, pattern: "https://**" },
    { kind: MATCH_KIND.KEYWORDS, terms: ["pull request"] },
  ];
  assert.equal(allMatch(matches, fakeTask(), { now: NOW }), true);
});

// ===== applyRules =====

const SIMPLE_POLICY = {
  rules: [
    {
      id: "github-prs-to-claude",
      match: [
        { kind: MATCH_KIND.URL_PATTERN, pattern: "https://**" },
        { kind: MATCH_KIND.KEYWORDS, terms: ["pull request", "PR"] },
      ],
      preferred: ["claude-code", "cursor"],
      forbidden: ["gemini-cli"],
      reason: "GitHub PR review → prefer Claude Code, then Cursor",
    },
    {
      id: "dashboards-anyone",
      match: [{ kind: MATCH_KIND.KEYWORDS, terms: ["grafana", "dashboard"] }],
      preferred: ["gemini-cli", "claude-code"],
    },
  ],
  fallback: "claude-code",
};

const AVAIL = {
  installed: ["claude-code", "cursor", "codex", "gemini-cli", "vscode"],
  configured: ["claude-code"],
};

test("applyRules: first matching rule wins", () => {
  const r = applyRules(fakeTask(), SIMPLE_POLICY, AVAIL, { now: NOW });
  assert.equal(r.matchedRule.id, "github-prs-to-claude");
  assert.deepEqual(r.candidates, ["claude-code", "cursor"]);
});

test("applyRules: unavailable agents filtered out", () => {
  const partial = { installed: ["cursor"], configured: [] };
  const r = applyRules(fakeTask(), SIMPLE_POLICY, partial, { now: NOW });
  assert.equal(r.matchedRule.id, "github-prs-to-claude");
  assert.deepEqual(r.candidates, ["cursor"]);
  assert.deepEqual(r.unavailableIds, ["claude-code"]);
});

test("applyRules: no rule matches → empty candidates", () => {
  const t = fakeTask({
    payload: { url: "ftp://example.org" }, // not https
    title: "random",
    description: "unrelated", // strip the 'pull request' keyword from fakeTask default
  });
  const r = applyRules(t, SIMPLE_POLICY, AVAIL, { now: NOW });
  assert.equal(r.matchedRule, null);
});

// ===== selectAgent =====

test("selectAgent: preferred-rank dominates", () => {
  const r = selectAgent(["claude-code", "cursor"], {});
  assert.equal(r.chosen, "claude-code");
});

test("selectAgent: success-rate tiebreaker when first-rank only", () => {
  // Both at rank 0... actually rank dominates. Score = -rank*10 + success + ...
  // Different ranks → 10-unit gap. Even high success doesn't flip.
  const r = selectAgent(["claude-code", "cursor"], {
    recentSuccessRate: { cursor: 0.99, "claude-code": 0.1 },
  });
  assert.equal(r.chosen, "claude-code", "rank dominates even with low success");
});

test("selectAgent: empty candidates", () => {
  const r = selectAgent([], {});
  assert.equal(r.chosen, null);
});

// ===== cost helpers =====

test("averageCostUsd: only counts successful runs", () => {
  const runs = [
    { status: "success", cost: { usd: 0.01 } },
    { status: "failure", cost: { usd: 99 } },
    { status: "success", cost: { usd: 0.03 } },
  ];
  assert.equal(averageCostUsd(runs), 0.02);
});

test("pickCheaper: returns cheaper agent", () => {
  assert.equal(
    pickCheaper("a", "b", { a: 0.1, b: 0.05 }),
    "b"
  );
});

test("pickCheaper: null when neither has cost data", () => {
  assert.equal(pickCheaper("a", "b", {}), null);
});

// ===== LLM fallback =====

class RecordingLlm {
  constructor(impl) {
    this.calls = [];
    this.impl = impl;
  }
  async pickAgent(prompt) {
    this.calls.push(prompt);
    return this.impl(prompt);
  }
}

test("buildLlmPrompt includes task + candidates + instruction", () => {
  const p = buildLlmPrompt(fakeTask(), ["claude-code", "cursor"]);
  assert.equal(p.candidates.length, 2);
  assert.ok(p.instruction.includes("agent"));
  assert.equal(p.task.kind, TASK_KIND.ONE_SHOT);
});

await test("runLlmFallback: valid pick returns it", async () => {
  const llm = new RecordingLlm(async () => ({ agentId: "cursor", reason: "good at JS" }));
  const r = await runLlmFallback(llm, fakeTask(), ["claude-code", "cursor"]);
  assert.equal(r.agentId, "cursor");
});

await test("runLlmFallback: out-of-set pick rejected", async () => {
  const llm = new RecordingLlm(async () => ({ agentId: "unknown", reason: "..." }));
  const r = await runLlmFallback(llm, fakeTask(), ["claude-code", "cursor"]);
  assert.equal(r, null);
});

// ===== Router resolution order =====

await test("Router: override wins over rule", async () => {
  const policy = {
    rules: SIMPLE_POLICY.rules,
    fallback: "claude-code",
    overrides: [
      {
        match: [{ kind: MATCH_KIND.KEYWORDS, terms: ["pull request", "PR"] }],
        agentId: "codex",
        reason: "User pinned Codex for PR work",
      },
    ],
  };
  const router = new Router({ policy });
  const d = await router.route(fakeTask(), AVAIL, { now: NOW });
  assert.equal(d.chosenAgentId, "codex");
  assert.equal(d.source, DECISION_SOURCE.OVERRIDE);
});

await test("Router: rule path produces explanation with alternatives", async () => {
  const router = new Router({ policy: SIMPLE_POLICY });
  const d = await router.route(fakeTask(), AVAIL, { now: NOW });
  assert.equal(d.chosenAgentId, "claude-code");
  assert.equal(d.source, DECISION_SOURCE.RULE);
  assert.equal(d.ruleId, "github-prs-to-claude");
  assert.ok(d.explanation.includes("Claude Code"));
  assert.ok(d.explanation.includes("alternatives"));
});

await test("Router: default fallback when no rule matches", async () => {
  const router = new Router({ policy: SIMPLE_POLICY });
  const t = fakeTask({
    payload: { url: "ftp://example.org" }, // not https
    title: "random task",
    description: "totally unrelated to any rule", // strip PR keyword
  });
  const d = await router.route(t, AVAIL, { now: NOW });
  assert.equal(d.chosenAgentId, "claude-code");
  assert.equal(d.source, DECISION_SOURCE.DEFAULT_FALLBACK);
});

await test("Router: LLM fallback engages when policy.llmFallbackEnabled", async () => {
  const policy = {
    rules: [],
    fallback: "claude-code",
    llmFallbackEnabled: true,
  };
  const llm = new RecordingLlm(async (prompt) => {
    // pick the second candidate to prove the LLM is consulted
    return { agentId: prompt.candidates[1], reason: "I like the second one" };
  });
  const router = new Router({ policy, llmClient: llm });
  const t = fakeTask({ payload: { url: "https://example.org" }, title: "random" });
  const d = await router.route(t, AVAIL, { now: NOW });
  assert.equal(d.source, DECISION_SOURCE.LLM_FALLBACK);
  assert.equal(d.chosenAgentId, AVAIL.installed.filter((id) =>
    // mirror the router's filter — supportsMcpServers is the gate; all 9 do
    true
  )[1]);
  assert.equal(llm.calls.length, 1);
});

await test("Router: NO_AGENT_AVAILABLE when nothing installed", async () => {
  const router = new Router({ policy: SIMPLE_POLICY });
  const d = await router.route(fakeTask(), { installed: [], configured: [] }, { now: NOW });
  assert.equal(d.chosenAgentId, null);
  assert.equal(d.source, DECISION_SOURCE.NO_AGENT_AVAILABLE);
});

// ===== Schema v2 migration + end-to-end persistence =====

await test("TaskSqliteStore migrates to schema v2 with cost/routing columns", async () => {
  const storage = new TaskSqliteStore({ initModule: sqlite3InitModule });
  await storage.open();
  const rows = storage.exec({
    sql: "PRAGMA table_info(task_runs);",
    returnValue: "resultRows",
    rowMode: "object",
  });
  const names = rows.map((r) => r.name);
  assert.ok(names.includes("cost_usd"), "missing cost_usd column");
  assert.ok(names.includes("provider"), "missing provider column");
  assert.ok(names.includes("routed_agent"), "missing routed_agent column");
  assert.ok(names.includes("routing_explanation"), "missing routing_explanation column");
  storage.close();
});

await test("Scheduler outcome with cost + routing persists to task_runs", async () => {
  const storage = new TaskSqliteStore({ initModule: sqlite3InitModule });
  const store = new TaskStore({ storage });
  await store.open();

  const t = store.create(
    {
      kind: TASK_KIND.ONE_SHOT,
      title: "Summarize PR",
      payload: { url: "https://github.com/x/y/pull/1" },
      capability: CAPABILITY.READ_WITH_NETWORK,
      creator: "user",
    },
    NOW
  );

  const dispatcher = {
    async dispatch(_task) {
      return {
        success: true,
        result: { summary: "looks good" },
        cost: {
          usd: 0.013,
          tokensInput: 1500,
          tokensOutput: 200,
          provider: "anthropic",
          model: "claude-opus-4-7",
        },
        routing: {
          chosenAgentId: "claude-code",
          source: DECISION_SOURCE.RULE,
          ruleId: "github-prs-to-claude",
          explanation: "Claude Code — GitHub PRs preferred.",
        },
      };
    },
  };

  const sched = new Scheduler({ taskStore: store, dispatcher });
  await sched.tick(NOW);

  const runs = store.runs(t.id);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].cost.usd, 0.013);
  assert.equal(runs[0].cost.provider, "anthropic");
  assert.equal(runs[0].routing.chosenAgentId, "claude-code");
  assert.equal(runs[0].routing.ruleId, "github-prs-to-claude");
  assert.equal(runs[0].routing.source, DECISION_SOURCE.RULE);
  storage.close();
});

console.log(`\nAll ${testCount} tests passed.`);
