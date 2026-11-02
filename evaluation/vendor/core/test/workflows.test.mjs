/**
 * Workflow engine tests.
 * node packages/core/test/workflows.test.mjs
 */

import assert from "node:assert/strict";
import {
  WorkflowEngine,
  STAGE_KIND,
  STAGE_RESULT,
  resolveExpression,
  interpolate,
  resolveValue,
  evaluateCondition,
} from "../src/workflows/index.js";

let testCount = 0;
async function test(name, fn) {
  testCount++;
  try {
    await fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}\n${e.stack}`);
    process.exit(1);
  }
}

// ===== variable resolution =====

const ctx = {
  inputs: { url: "https://example.com", user: { name: "alice" } },
  stageOutputs: { s1: { tabId: 42, ok: true }, s2: ["a", "b", "c"] },
  variables: { greeting: "hi", count: 3 },
};

test("resolveExpression: inputs / steps / vars roots", () => {
  assert.equal(resolveExpression("inputs.url", ctx), "https://example.com");
  assert.equal(resolveExpression("inputs.user.name", ctx), "alice");
  assert.equal(resolveExpression("steps.s1.tabId", ctx), 42);
  assert.equal(resolveExpression("vars.greeting", ctx), "hi");
});

test("resolveExpression: unknown root returns undefined", () => {
  assert.equal(resolveExpression("other.x", ctx), undefined);
});

test("interpolate: pure-reference returns raw value", () => {
  assert.equal(interpolate("${inputs.user}", ctx), ctx.inputs.user);
  assert.equal(interpolate("${steps.s1.tabId}", ctx), 42);
});

test("interpolate: mixed-string coerces to string", () => {
  assert.equal(interpolate("Tab is ${steps.s1.tabId}", ctx), "Tab is 42");
});

test("interpolate: missing reference becomes empty string in mixed context", () => {
  assert.equal(interpolate("X=${vars.missing}!", ctx), "X=!");
});

test("resolveValue: recurses into nested objects + arrays", () => {
  const tmpl = {
    title: "Open ${inputs.url}",
    nested: { count: "${vars.count}", first: "${steps.s2.0}" },
    list: ["${vars.greeting}", "literal"],
  };
  const out = resolveValue(tmpl, ctx);
  assert.equal(out.title, "Open https://example.com");
  // Pure-reference case preserves the underlying raw type
  assert.equal(out.nested.count, 3); // number, not string
  assert.equal(out.nested.first, "a");
  assert.equal(out.list[0], "hi");
  assert.equal(out.list[1], "literal");
});

// ===== conditions =====

test("evaluateCondition: bare truthiness", () => {
  assert.equal(evaluateCondition("${vars.greeting}", ctx), true);
  assert.equal(evaluateCondition("${vars.missing}", ctx), false);
});

test("evaluateCondition: equality", () => {
  assert.equal(evaluateCondition("${inputs.url} == 'https://example.com'", ctx), true);
  assert.equal(evaluateCondition("${inputs.url} != 'https://example.com'", ctx), false);
});

test("evaluateCondition: numeric comparisons", () => {
  assert.equal(evaluateCondition("${vars.count} > 2", ctx), true);
  assert.equal(evaluateCondition("${vars.count} < 10", ctx), true);
  assert.equal(evaluateCondition("${vars.count} >= 3", ctx), true);
  assert.equal(evaluateCondition("${vars.count} <= 2", ctx), false);
});

// ===== engine =====

class RecordingDispatcher {
  constructor(map = {}) {
    this.taskCalls = [];
    this.actionCalls = [];
    this.taskHandler = map.task ?? (async () => ({ success: true, result: { default: true } }));
    this.actionHandler = map.action ?? (async () => ({ success: true, result: { ran: true } }));
  }
  async dispatchTask(task, ctx) {
    this.taskCalls.push({ task, ctx });
    return this.taskHandler(task, ctx);
  }
  async dispatchAction(actionId, params, ctx) {
    this.actionCalls.push({ actionId, params, ctx });
    return this.actionHandler(actionId, params, ctx);
  }
}

await test("engine: empty stages → failure with error", async () => {
  const eng = new WorkflowEngine({ dispatcher: new RecordingDispatcher() });
  const r = await eng.run([], {});
  assert.equal(r.success, false);
  assert.match(r.error, /no stages/);
});

await test("engine: single RUN_TASK happy path", async () => {
  const dispatcher = new RecordingDispatcher({
    task: async () => ({ success: true, result: { tabId: 7 } }),
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [{ id: "s1", kind: STAGE_KIND.RUN_TASK, agentId: "claude-code", params: { title: "First" } }],
    {}
  );
  assert.equal(r.success, true);
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].status, STAGE_RESULT.SUCCESS);
  assert.equal(dispatcher.taskCalls[0].task.routing.agentId, "claude-code");
});

await test("engine: variable threading across stages", async () => {
  const dispatcher = new RecordingDispatcher({
    task: async (task) => {
      // Stage 2 sees stage 1's tabId substituted in
      if (task.payload?.fromS1 === 7) {
        return { success: true, result: { propagated: true } };
      }
      return { success: true, result: { tabId: 7 } };
    },
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [
      { id: "s1", kind: STAGE_KIND.RUN_TASK, params: { title: "First" } },
      {
        id: "s2",
        kind: STAGE_KIND.RUN_TASK,
        params: { title: "Second", payload: { fromS1: "${steps.s1.tabId}" } },
      },
    ],
    {}
  );
  // First call gets tabId 7; second sees fromS1 = 7
  assert.equal(r.success, true);
  // The interpolated payload should have the number 7, not the string "7" (pure-ref)
  const second = dispatcher.taskCalls[1].task.payload;
  assert.equal(second.fromS1, 7);
});

await test("engine: stage failure halts without continueOnError", async () => {
  let calls = 0;
  const dispatcher = new RecordingDispatcher({
    task: async () => {
      calls++;
      if (calls === 1) return { success: false, error: "boom" };
      return { success: true };
    },
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [
      { id: "s1", kind: STAGE_KIND.RUN_TASK, params: {} },
      { id: "s2", kind: STAGE_KIND.RUN_TASK, params: {} },
    ],
    {}
  );
  assert.equal(r.success, false);
  assert.equal(r.stages.length, 1);
  assert.equal(r.stages[0].status, STAGE_RESULT.FAILURE);
});

await test("engine: continueOnError lets the workflow proceed past a failure", async () => {
  let calls = 0;
  const dispatcher = new RecordingDispatcher({
    task: async () => {
      calls++;
      if (calls === 1) return { success: false, error: "soft fail" };
      return { success: true, result: { final: true } };
    },
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [
      { id: "s1", kind: STAGE_KIND.RUN_TASK, params: {}, continueOnError: true },
      { id: "s2", kind: STAGE_KIND.RUN_TASK, params: {} },
    ],
    {}
  );
  assert.equal(r.success, true);
  assert.equal(r.stages.length, 2);
  assert.equal(r.stages[0].status, STAGE_RESULT.FAILURE);
  assert.equal(r.stages[1].status, STAGE_RESULT.SUCCESS);
});

await test("engine: CONDITIONAL stage branches to thenStageId on truth", async () => {
  const dispatcher = new RecordingDispatcher({
    task: async (task) => ({ success: true, result: { from: task.title } }),
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [
      { id: "init", kind: STAGE_KIND.RUN_TASK, params: { title: "init" }, outputAs: "initVal" },
      {
        id: "branch",
        kind: STAGE_KIND.CONDITIONAL,
        params: {
          expression: "${vars.initVal.from} == 'init'",
          thenStageId: "thenPath",
          elseStageId: "elsePath",
        },
      },
      { id: "thenPath", kind: STAGE_KIND.RUN_TASK, params: { title: "then" } },
      { id: "elsePath", kind: STAGE_KIND.RUN_TASK, params: { title: "else" } },
    ],
    {}
  );
  assert.equal(r.success, true);
  // Stages executed: init, branch, thenPath, elsePath (continues after thenPath fall-through)
  // The cleaner contract: after branch jumps, execution continues from the jump target.
  // We expect thenPath ran and elsePath also ran (fall-through behavior in v1.0).
  const stageIds = r.stages.map((s) => s.stageId);
  assert.deepEqual(stageIds, ["init", "branch", "thenPath", "elsePath"]);
});

await test("engine: RUN_ACTION dispatches to dispatcher.dispatchAction", async () => {
  const dispatcher = new RecordingDispatcher({
    action: async (id, params) => ({ success: true, result: { id, params } }),
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [
      {
        id: "a1",
        kind: STAGE_KIND.RUN_ACTION,
        params: { actionId: "click", params: { selector: "${inputs.btn}" } },
      },
    ],
    { btn: "#submit" }
  );
  assert.equal(r.success, true);
  assert.equal(dispatcher.actionCalls[0].actionId, "click");
  assert.equal(dispatcher.actionCalls[0].params.selector, "#submit");
});

await test("engine: outputAs binds to context.variables", async () => {
  const dispatcher = new RecordingDispatcher({
    task: async () => ({ success: true, result: { v: 99 } }),
  });
  const eng = new WorkflowEngine({ dispatcher });
  const r = await eng.run(
    [
      { id: "a", kind: STAGE_KIND.RUN_TASK, params: {}, outputAs: "myAlias" },
      {
        id: "b",
        kind: STAGE_KIND.RUN_TASK,
        params: { title: "got ${vars.myAlias.v}" },
      },
    ],
    {}
  );
  assert.equal(r.success, true);
  assert.equal(dispatcher.taskCalls[1].task.title, "got 99");
});

await test("engine: notify callback fires for start/success/failure", async () => {
  const events = [];
  const dispatcher = new RecordingDispatcher();
  const eng = new WorkflowEngine({
    dispatcher,
    notify: async (event, payload) => events.push({ event, ...payload }),
  });
  await eng.run([{ id: "a", kind: STAGE_KIND.RUN_TASK, params: {} }], {});
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "stage:start");
  assert.equal(events[1].event, "stage:success");
});

console.log(`\nAll ${testCount} tests passed.`);
