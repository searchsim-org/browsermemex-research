/**
 * MCP server registry catalog.
 *
 * Adding a new server = adding a descriptor under `servers/` and including
 * it here. Pure data; no special-case code paths anywhere else.
 */

import { validateDescriptor } from "./types.js";

import filesystem from "./servers/filesystem.js";
import github from "./servers/github.js";
import sqlite from "./servers/sqlite.js";
import postgres from "./servers/postgres.js";
import slack from "./servers/slack.js";
import fetch from "./servers/fetch.js";
import braveSearch from "./servers/brave-search.js";
import googleDrive from "./servers/google-drive.js";
import linear from "./servers/linear.js";
import memory from "./servers/memory.js";
import notion from "./servers/notion.js";
import everything from "./servers/everything.js";

const _all = [
  filesystem,
  github,
  sqlite,
  postgres,
  slack,
  fetch,
  braveSearch,
  googleDrive,
  linear,
  memory,
  notion,
  everything,
];

// Validate every descriptor at module load — surfaces typos early.
for (const d of _all) validateDescriptor(d);

export const ALL_MCP_SERVERS = Object.freeze(_all);

/** Look up a server descriptor by id. Returns undefined if not registered. */
export function getServer(id) {
  return ALL_MCP_SERVERS.find((s) => s.id === id);
}

/** Filter by tag (any-of). */
export function serversByTag(tag) {
  return ALL_MCP_SERVERS.filter((s) => (s.tags ?? []).includes(tag));
}

/** Search by free text — matches displayName, description, tags, vendor. */
export function searchServers(query) {
  const q = String(query ?? "").toLowerCase().trim();
  if (q.length === 0) return [...ALL_MCP_SERVERS];
  return ALL_MCP_SERVERS.filter((s) => {
    const haystack = [
      s.displayName,
      s.description,
      s.vendor,
      ...(s.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Build the MCP-config entry the user should paste into their agent's config.
 * Returns `{ command, args, env? }` ready for JSON serialization into the
 * agent's `mcpServers` map. The user is expected to replace `<...>`
 * placeholders with their own values.
 */
export function buildConfigEntry(server) {
  const entry = {
    command: server.install.command,
    args: [...server.install.args],
  };
  if (server.install.env && Object.keys(server.install.env).length > 0) {
    entry.env = { ...server.install.env };
  }
  return entry;
}
