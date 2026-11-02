/**
 * MCP server registry tests.
 * node packages/core/test/mcp-registry.test.mjs
 */

import assert from "node:assert/strict";
import {
  ALL_MCP_SERVERS,
  getServer,
  serversByTag,
  searchServers,
  buildConfigEntry,
  validateDescriptor,
  TRANSPORT,
  INSTALL_KIND,
} from "../src/mcp-registry/index.js";

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

test("ALL_MCP_SERVERS lists at least 12 curated servers", () => {
  assert.ok(ALL_MCP_SERVERS.length >= 12, `got ${ALL_MCP_SERVERS.length}`);
});

test("every descriptor passes validateDescriptor", () => {
  for (const s of ALL_MCP_SERVERS) validateDescriptor(s);
});

test("every descriptor has unique id", () => {
  const ids = ALL_MCP_SERVERS.map((s) => s.id);
  const unique = new Set(ids);
  assert.equal(unique.size, ids.length);
});

test("validateDescriptor rejects missing fields", () => {
  assert.throws(() => validateDescriptor({ id: "" }), /id required/);
  assert.throws(
    () =>
      validateDescriptor({
        id: "x",
        displayName: "X",
        vendor: "v",
        transport: "fake",
        install: { kind: INSTALL_KIND.NPX, command: "npx", args: [] },
      }),
    /invalid transport/
  );
  assert.throws(
    () =>
      validateDescriptor({
        id: "x",
        displayName: "X",
        vendor: "v",
        transport: TRANSPORT.STDIO,
        install: { kind: "bogus", command: "x", args: [] },
      }),
    /invalid install.kind/
  );
});

test("getServer returns the right descriptor", () => {
  assert.equal(getServer("github").displayName, "GitHub");
  assert.equal(getServer("not-real"), undefined);
});

test("serversByTag filters correctly", () => {
  const official = serversByTag("official");
  assert.ok(official.length >= 8); // most servers are tagged official
  for (const s of official) assert.ok(s.tags.includes("official"));
});

test("searchServers: case-insensitive substring across multiple fields", () => {
  const slackHits = searchServers("slack");
  assert.ok(slackHits.some((s) => s.id === "slack"));

  const dbHits = searchServers("database");
  const dbIds = dbHits.map((s) => s.id).sort();
  assert.ok(dbIds.includes("postgres"));
  assert.ok(dbIds.includes("sqlite"));
});

test("searchServers: empty query returns all", () => {
  assert.equal(searchServers("").length, ALL_MCP_SERVERS.length);
});

test("buildConfigEntry: minimal entry", () => {
  const entry = buildConfigEntry(getServer("filesystem"));
  assert.equal(entry.command, "npx");
  assert.deepEqual(entry.args, ["-y", "@modelcontextprotocol/server-filesystem", "<ALLOWED_DIRECTORY>"]);
  assert.equal(entry.env, undefined);
});

test("buildConfigEntry: includes env when present", () => {
  const entry = buildConfigEntry(getServer("slack"));
  assert.ok(entry.env);
  assert.ok("SLACK_BOT_TOKEN" in entry.env);
});

test("Linear uses SSE transport with custom command (URL)", () => {
  const linear = getServer("linear");
  assert.equal(linear.transport, TRANSPORT.SSE);
  assert.equal(linear.install.kind, INSTALL_KIND.CUSTOM);
  assert.match(linear.install.command, /^https:/);
});

test("Fetch uses Python (uvx) install kind", () => {
  const fetch = getServer("fetch");
  assert.equal(fetch.install.kind, INSTALL_KIND.PYTHON);
  assert.equal(fetch.install.command, "uvx");
});

console.log(`\nAll ${testCount} tests passed.`);
