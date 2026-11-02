/**
 * Browser actions library tests.
 * node packages/core/test/browser-actions.test.mjs
 */

import assert from "node:assert/strict";
import {
  ALL_ACTIONS,
  getAction,
  actionsByCategory,
  actionsAtMost,
  validateInvocation,
  applyDefaults,
  PARAM_TYPE,
  CAPABILITY,
} from "../src/browser-actions/index.js";

let testCount = 0;
function test(name, fn) {
  testCount++;
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    process.exit(1);
  }
}

// ===== catalog =====

test("ALL_ACTIONS lists the expected 8 actions", () => {
  const ids = ALL_ACTIONS.map((a) => a.id).sort();
  assert.deepEqual(ids, [
    "click",
    "download",
    "extract_table",
    "fill_form",
    "navigate",
    "read_page",
    "screenshot",
    "submit",
  ]);
});

test("every action has required descriptor fields", () => {
  for (const a of ALL_ACTIONS) {
    assert.ok(a.id, "id");
    assert.ok(a.displayName, `${a.id}: displayName`);
    assert.ok(a.category, `${a.id}: category`);
    assert.ok(a.capability, `${a.id}: capability`);
    assert.ok(Array.isArray(a.inputs), `${a.id}: inputs is array`);
    assert.ok(Array.isArray(a.mcpTools) && a.mcpTools.length > 0, `${a.id}: mcpTools`);
    assert.ok(Object.values(CAPABILITY).includes(a.capability), `${a.id}: valid capability`);
  }
});

test("getAction returns the right descriptor", () => {
  assert.equal(getAction("click").displayName, "Click element");
  assert.equal(getAction("nope"), undefined);
});

test("actionsByCategory groups correctly", () => {
  const by = actionsByCategory();
  assert.ok(by.has("navigation"));
  assert.ok(by.has("form"));
  assert.ok(by.has("extraction"));
  assert.ok(by.has("interaction"));
  assert.ok(by.has("io"));
});

test("actionsAtMost filters by capability ceiling", () => {
  const readOnly = actionsAtMost(CAPABILITY.READ_ONLY).map((a) => a.id);
  assert.ok(readOnly.includes("read_page"));
  assert.ok(readOnly.includes("screenshot"));
  assert.ok(!readOnly.includes("click")); // write_dom > read_only
  assert.ok(!readOnly.includes("submit"));

  const writeDom = actionsAtMost(CAPABILITY.WRITE_DOM).map((a) => a.id);
  assert.ok(writeDom.includes("click"));
  assert.ok(writeDom.includes("fill_form"));
  assert.ok(!writeDom.includes("submit")); // write_network > write_dom
});

// ===== validateInvocation =====

test("validateInvocation: missing required param throws", () => {
  assert.throws(() => validateInvocation(getAction("navigate"), {}), /url/);
});

test("validateInvocation: optional params can be omitted", () => {
  validateInvocation(getAction("click"), { selector: "#x" });
});

test("validateInvocation: type mismatch throws", () => {
  assert.throws(
    () => validateInvocation(getAction("navigate"), { url: 123 }),
    /expected url/
  );
});

test("validateInvocation: enum constraint enforced", () => {
  // No action currently has an enum; verify the code path with a synthetic descriptor
  const desc = {
    id: "test",
    inputs: [{ name: "mode", type: PARAM_TYPE.STRING, enum: ["a", "b"] }],
  };
  validateInvocation(desc, { mode: "a" });
  assert.throws(() => validateInvocation(desc, { mode: "c" }), /one of/);
});

test("validateInvocation: object type accepts plain object, rejects array", () => {
  validateInvocation(getAction("fill_form"), { fields: { "#a": "x" } });
  assert.throws(
    () => validateInvocation(getAction("fill_form"), { fields: ["#a", "x"] }),
    /expected object/
  );
});

// ===== applyDefaults =====

test("applyDefaults fills in defaultValue for missing params", () => {
  const merged = applyDefaults(getAction("navigate"), { url: "https://x" });
  assert.equal(merged.newTab, false);
});

test("applyDefaults does not overwrite supplied values", () => {
  const merged = applyDefaults(getAction("navigate"), { url: "https://x", newTab: true });
  assert.equal(merged.newTab, true);
});

console.log(`\nAll ${testCount} tests passed.`);
