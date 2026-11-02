/**
 * @browser-memex/core/mcp-registry — curated catalog of installable MCP servers.
 */

export * from "./types.js";
export {
  ALL_MCP_SERVERS,
  getServer,
  serversByTag,
  searchServers,
  buildConfigEntry,
} from "./registry.js";
