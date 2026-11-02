/**
 * Contract tests for the agent connector framework.
 * Runnable with: node packages/core/test/agents.test.mjs
 *
 * Covers:
 *   - every descriptor has the required fields
 *   - detection logic against synthetic probes
 *   - JSON config merge (empty, existing, dotted-key, JSONC with comments)
 *   - TOML config merge (empty, existing, replacement)
 *   - path expansion (~ and %ENV_VAR%)
 */

import assert from "node:assert/strict";
import {
  ALL_AGENTS,
  getAgent,
  detectOne,
  detectAll,
  expandPath,
  buildServerEntry,
  mergeConfig,
  mergeJsonConfig,
  mergeTomlConfig,
  PLATFORM,
  MCP_CONFIG_FORMAT,
} from "../src/agents/index.js";

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

// ===== Descriptor catalog =====

test("registry contains the 9 supported agents", () => {
  const ids = ALL_AGENTS.map((a) => a.id).sort();
  assert.deepEqual(ids, [
    "amp",
    "claude-code",
    "cline",
    "codex",
    "cursor",
    "gemini-cli",
    "roo-code",
    "vscode",
    "windsurf",
  ]);
});

test("each descriptor has required identity fields", () => {
  for (const a of ALL_AGENTS) {
    assert.ok(a.id, `${a.displayName ?? "?"}: missing id`);
    assert.ok(a.displayName, `${a.id}: missing displayName`);
    assert.ok(a.vendor, `${a.id}: missing vendor`);
    assert.ok(a.detection, `${a.id}: missing detection`);
    assert.ok(a.capabilities, `${a.id}: missing capabilities`);
  }
});

test("each descriptor has detection paths for all three platforms", () => {
  for (const a of ALL_AGENTS) {
    for (const p of ["macos", "linux", "windows"]) {
      assert.ok(
        Array.isArray(a.detection.paths?.[p]) || (a.detection.binaries?.length ?? 0) > 0,
        `${a.id}: no detection path/binary for ${p}`
      );
    }
  }
});

test("each MCP-supporting descriptor has config paths for all three platforms", () => {
  for (const a of ALL_AGENTS) {
    if (!a.mcpConfig) continue;
    for (const p of ["macos", "linux", "windows"]) {
      assert.ok(
        Array.isArray(a.mcpConfig.paths?.[p]) && a.mcpConfig.paths[p].length > 0,
        `${a.id}: no MCP config path for ${p}`
      );
    }
    assert.ok(
      Object.values(MCP_CONFIG_FORMAT).includes(a.mcpConfig.format),
      `${a.id}: invalid mcp format ${a.mcpConfig.format}`
    );
  }
});

test("getAgent returns the right descriptor", () => {
  assert.equal(getAgent("cursor").displayName, "Cursor");
  assert.equal(getAgent("nonexistent"), undefined);
});

// ===== Path expansion =====

test("expandPath expands ~ to home", () => {
  assert.equal(expandPath("~/.claude", {}, "/Users/me"), "/Users/me/.claude");
});

test("expandPath expands %ENV%", () => {
  const env = { USERPROFILE: "C:\\Users\\me", APPDATA: "C:\\Users\\me\\AppData\\Roaming" };
  assert.equal(
    expandPath("%APPDATA%/Code/User/mcp.json", env, "C:/Users/me"),
    "C:\\Users\\me\\AppData\\Roaming/Code/User/mcp.json"
  );
});

test("expandPath leaves unrecognized vars empty", () => {
  assert.equal(expandPath("%NOPE%/x", {}, "/h"), "/x");
});

// ===== Detection =====

function makeProbe({ existsSet = new Set(), matchesSet = new Set(), binSet = new Set(), files = new Map() } = {}) {
  return {
    async exists(p) {
      return existsSet.has(p);
    },
    async matches(g) {
      return matchesSet.has(g);
    },
    async hasBinary(b) {
      return binSet.has(b);
    },
    async readText(p) {
      return files.has(p) ? files.get(p) : null;
    },
  };
}

const ctx = {
  platform: PLATFORM.MACOS,
  env: {},
  home: "/Users/test",
  serverIdentifier: "browser-memex",
};

test("detectOne: not installed when nothing matches", async () => {
  const probe = makeProbe();
  const r = await detectOne(getAgent("claude-code"), probe, ctx);
  assert.equal(r.installed, false);
  assert.equal(r.configured, false);
});

test("detectOne: installed by directory path match", async () => {
  const probe = makeProbe({ existsSet: new Set(["/Users/test/.claude"]) });
  const r = await detectOne(getAgent("claude-code"), probe, ctx);
  assert.equal(r.installed, true);
  assert.equal(r.matchedPath, "/Users/test/.claude");
});

test("detectOne: installed by binary on PATH", async () => {
  const probe = makeProbe({ binSet: new Set(["gemini"]) });
  const r = await detectOne(getAgent("gemini-cli"), probe, ctx);
  assert.equal(r.installed, true);
  assert.equal(r.matchedPath, "(PATH: gemini)");
});

test("detectOne: configured=true when MCP config contains the server identifier", async () => {
  const cfgPath = "/Users/test/.cursor/mcp.json";
  const probe = makeProbe({
    existsSet: new Set(["/Users/test/.cursor", cfgPath]),
    files: new Map([[cfgPath, '{"mcpServers":{"browser-memex":{"command":"node"}}}']]),
  });
  const r = await detectOne(getAgent("cursor"), probe, ctx);
  assert.equal(r.installed, true);
  assert.equal(r.configured, true);
  assert.equal(r.mcpConfigPath, cfgPath);
});

test("detectOne: configured=false when MCP config exists but doesn't list us", async () => {
  const cfgPath = "/Users/test/.cursor/mcp.json";
  const probe = makeProbe({
    existsSet: new Set(["/Users/test/.cursor", cfgPath]),
    files: new Map([[cfgPath, '{"mcpServers":{"other":{"command":"foo"}}}']]),
  });
  const r = await detectOne(getAgent("cursor"), probe, ctx);
  assert.equal(r.installed, true);
  assert.equal(r.configured, false);
});

test("detectOne: glob path detection for VS Code extensions (Cline)", async () => {
  const probe = makeProbe({
    matchesSet: new Set(["/Users/test/.vscode/extensions/saoudrizwan.claude-dev-*"]),
  });
  const r = await detectOne(getAgent("cline"), probe, ctx);
  assert.equal(r.installed, true);
});

test("detectAll: returns one result per descriptor", async () => {
  const probe = makeProbe();
  const all = await detectAll(probe, ctx);
  assert.equal(all.length, ALL_AGENTS.length);
});

// ===== Install: JSON merge =====

test("mergeJsonConfig: empty file → fresh JSON with one server", () => {
  const desc = getAgent("cursor");
  const entry = buildServerEntry({ command: "node", args: ["/path/to/dist/index.js"] });
  const out = mergeJsonConfig(null, desc, "browser-memex", entry);
  const parsed = JSON.parse(out);
  assert.deepEqual(parsed, {
    mcpServers: {
      "browser-memex": { command: "node", args: ["/path/to/dist/index.js"] },
    },
  });
});

test("mergeJsonConfig: preserves existing servers", () => {
  const desc = getAgent("cursor");
  const entry = buildServerEntry({ command: "node", args: ["/x"] });
  const existing = JSON.stringify({
    mcpServers: {
      other: { command: "foo", args: [] },
    },
  });
  const out = mergeJsonConfig(existing, desc, "browser-memex", entry);
  const parsed = JSON.parse(out);
  assert.deepEqual(Object.keys(parsed.mcpServers).sort(), ["browser-memex", "other"]);
});

test("mergeJsonConfig: dotted serversKey (Amp)", () => {
  const desc = getAgent("amp");
  const entry = buildServerEntry({ command: "npx", args: ["-y", "@browser-memex/mcp-server"] });
  const out = mergeJsonConfig(null, desc, "browser-memex", entry);
  const parsed = JSON.parse(out);
  assert.ok(parsed["amp.mcpServers"]);
  assert.ok(parsed["amp.mcpServers"]["browser-memex"]);
});

test("mergeJsonConfig: tolerates JSONC (line + block comments + trailing commas)", () => {
  const desc = getAgent("cursor");
  const entry = buildServerEntry({ command: "node", args: ["/x"] });
  const jsonc = `{
    // a comment
    "mcpServers": {
      "old": { "command": "x", "args": [] }, /* block */
    },
  }`;
  const out = mergeJsonConfig(jsonc, desc, "browser-memex", entry);
  const parsed = JSON.parse(out);
  assert.deepEqual(Object.keys(parsed.mcpServers).sort(), ["browser-memex", "old"]);
});

test("mergeJsonConfig: rejects malformed JSON", () => {
  const desc = getAgent("cursor");
  const entry = buildServerEntry({ command: "node", args: [] });
  assert.throws(
    () => mergeJsonConfig("not json {{", desc, "browser-memex", entry),
    /not valid JSON/
  );
});

// ===== Install: TOML merge =====

test("mergeTomlConfig: empty file → fresh TOML table", () => {
  const desc = getAgent("codex");
  const entry = buildServerEntry({ command: "node", args: ["/x"] });
  const out = mergeTomlConfig(null, desc, "browser-memex", entry);
  assert.ok(out.includes("[mcp_servers.browser-memex]"));
  assert.ok(out.includes('command = "node"'));
  assert.ok(out.includes('args = ["/x"]'));
});

test("mergeTomlConfig: preserves existing tables", () => {
  const desc = getAgent("codex");
  const entry = buildServerEntry({ command: "node", args: ["/x"] });
  const existing = `[mcp_servers.other]
command = "foo"
args = []
`;
  const out = mergeTomlConfig(existing, desc, "browser-memex", entry);
  assert.ok(out.includes("[mcp_servers.other]"));
  assert.ok(out.includes("[mcp_servers.browser-memex]"));
});

test("mergeTomlConfig: replaces existing table for same server name", () => {
  const desc = getAgent("codex");
  const entry = buildServerEntry({ command: "node", args: ["/new"] });
  const existing = `[mcp_servers.browser-memex]
command = "old"
args = ["/old"]
`;
  const out = mergeTomlConfig(existing, desc, "browser-memex", entry);
  assert.ok(out.includes('command = "node"'));
  assert.ok(!out.includes('"/old"'));
});

// ===== Install: dispatch =====

test("mergeConfig dispatches on descriptor format", () => {
  const json = mergeConfig(null, getAgent("cursor"), "browser-memex", buildServerEntry({ command: "node", args: [] }));
  const toml = mergeConfig(null, getAgent("codex"), "browser-memex", buildServerEntry({ command: "node", args: [] }));
  assert.ok(json.startsWith("{"));
  assert.ok(toml.startsWith("["));
});

console.log(`\nAll ${testCount} tests passed.`);
