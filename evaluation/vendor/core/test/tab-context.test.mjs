/**
 * Cross-tab context filter tests.
 * node packages/core/test/tab-context.test.mjs
 */

import assert from "node:assert/strict";
import {
  filterTabs,
  redactCredentials,
  isHostBlocked,
  isInternalUrl,
} from "../src/tab-context/index.js";

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

// ===== redactCredentials =====

test("redactCredentials: strips basic-auth", () => {
  assert.equal(
    redactCredentials("https://alice:secret@example.com/path"),
    "https://example.com/path"
  );
});

test("redactCredentials: leaves clean URLs untouched", () => {
  assert.equal(redactCredentials("https://example.com/"), "https://example.com/");
});

test("redactCredentials: unparseable returns input", () => {
  assert.equal(redactCredentials("not a url"), "not a url");
});

// ===== isHostBlocked =====

test("isHostBlocked: exact host match", () => {
  assert.equal(isHostBlocked("https://bank.com/x", ["bank.com"]), true);
});

test("isHostBlocked: subdomain match", () => {
  assert.equal(isHostBlocked("https://login.bank.com/x", ["bank.com"]), true);
});

test("isHostBlocked: unrelated host does not match", () => {
  assert.equal(isHostBlocked("https://example.com/", ["bank.com"]), false);
});

test("isHostBlocked: empty list never matches", () => {
  assert.equal(isHostBlocked("https://x.com/", []), false);
  assert.equal(isHostBlocked("https://x.com/", undefined), false);
});

test("isHostBlocked: substring without subdomain boundary does NOT match", () => {
  assert.equal(isHostBlocked("https://notbank.com/", ["bank.com"]), false);
});

// ===== isInternalUrl =====

test("isInternalUrl: chrome:// is internal", () => {
  assert.equal(isInternalUrl("chrome://settings"), true);
});

test("isInternalUrl: chrome-extension:// is internal", () => {
  assert.equal(isInternalUrl("chrome-extension://abc123/foo.html"), true);
});

test("isInternalUrl: https is not internal", () => {
  assert.equal(isInternalUrl("https://example.com/"), false);
});

test("isInternalUrl: unparseable counts as internal (defensive)", () => {
  assert.equal(isInternalUrl("not a url"), true);
});

// ===== filterTabs =====

function tab(overrides) {
  return {
    id: 1,
    windowId: 100,
    url: "https://example.com/",
    title: "Example",
    active: false,
    pinned: false,
    incognito: false,
    ...overrides,
  };
}

test("filterTabs: empty input → []", () => {
  assert.deepEqual(filterTabs([]), []);
});

test("filterTabs: filters out incognito by default", () => {
  const r = filterTabs([tab({ id: 1 }), tab({ id: 2, incognito: true })]);
  assert.equal(r.length, 1);
  assert.equal(r[0].tabId, 1);
});

test("filterTabs: includeIncognito=true keeps them", () => {
  const r = filterTabs(
    [tab({ id: 1 }), tab({ id: 2, incognito: true })],
    { includeIncognito: true }
  );
  assert.equal(r.length, 2);
});

test("filterTabs: drops internal URLs", () => {
  const r = filterTabs([
    tab({ id: 1 }),
    tab({ id: 2, url: "chrome://newtab/" }),
    tab({ id: 3, url: "about:blank" }),
  ]);
  assert.equal(r.length, 1);
});

test("filterTabs: drops blocked hosts (incl. subdomains)", () => {
  const r = filterTabs(
    [
      tab({ id: 1, url: "https://bank.com/x" }),
      tab({ id: 2, url: "https://login.bank.com/y" }),
      tab({ id: 3, url: "https://example.com/" }),
    ],
    { blockedHosts: ["bank.com"] }
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].tabId, 3);
});

test("filterTabs: redacts credentials in URLs", () => {
  const r = filterTabs([tab({ id: 1, url: "https://u:p@example.com/" })]);
  assert.equal(r[0].url, "https://example.com/");
});

test("filterTabs: caps at maxTabs", () => {
  const many = Array.from({ length: 100 }, (_, i) => tab({ id: i + 1, windowId: 1 }));
  const r = filterTabs(many, { maxTabs: 7 });
  assert.equal(r.length, 7);
});

test("filterTabs: deterministic order by (windowId, tabId)", () => {
  const r = filterTabs([
    tab({ id: 5, windowId: 2 }),
    tab({ id: 3, windowId: 1 }),
    tab({ id: 9, windowId: 1 }),
    tab({ id: 2, windowId: 2 }),
  ]);
  assert.deepEqual(
    r.map((t) => `${t.windowId}:${t.tabId}`),
    ["1:3", "1:9", "2:2", "2:5"]
  );
});

test("filterTabs: tabs without a url are dropped", () => {
  const r = filterTabs([tab({ id: 1 }), { id: 2 }]);
  assert.equal(r.length, 1);
});

console.log(`\nAll ${testCount} tests passed.`);
