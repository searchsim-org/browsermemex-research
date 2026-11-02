/**
 * Types for the agent connector framework.
 *
 * BrowserMemex provides MCP tools that AI coding agents use. The "connector
 * framework" is therefore the CLIENT-SIDE configuration story: for each
 * supported agent, we know where its MCP config lives, what format it uses,
 * and how to add ourselves to it.
 *
 * Each agent has a descriptor with:
 *   - identity + display metadata
 *   - detection rules (paths / binaries to look for)
 *   - MCP-config rules (where the user's config file lives per platform, the
 *     file format, and the key under which servers are listed)
 *   - capabilities (which MCP features the agent's client supports)
 *
 * The framework consumes the descriptors. Adding a new agent = adding a new
 * descriptor file. No code changes needed elsewhere.
 *
 * See:
 *   - docs/adr/0002-agent-isolation.md — what isolation we enforce
 *   - The Implementation Plan §Phase 2 — Agent Connector Framework
 */

export const PLATFORM = Object.freeze({
  MACOS: "macos",
  LINUX: "linux",
  WINDOWS: "windows",
});

export const MCP_CONFIG_FORMAT = Object.freeze({
  /** JSON with `mcpServers` (or configurable) top-level key. Used by most. */
  JSON: "json",
  /** TOML with `[mcp_servers.<name>]` tables. Used by Codex CLI. */
  TOML: "toml",
});

/**
 * @typedef {Object} PlatformPaths
 * @property {string[]} [macos]
 * @property {string[]} [linux]
 * @property {string[]} [windows]
 */

/**
 * @typedef {Object} DetectionRules
 * @property {PlatformPaths} [paths]      — directory / file paths to check;
 *                                          first existing path wins.
 *                                          May contain `~` (expands to home)
 *                                          and `*` (glob — any one match counts).
 * @property {string[]} [binaries]        — executable names to look for on PATH
 */

/**
 * @typedef {Object} McpConfigRules
 * @property {PlatformPaths} paths        — where the MCP config file lives.
 *                                          First existing path is used; if none
 *                                          exist, the first path is created.
 * @property {keyof MCP_CONFIG_FORMAT} format
 * @property {string} [serversKey='mcpServers']
 *                                          — top-level key under which to put
 *                                            server entries (JSON only).
 * @property {string} [tomlTablePrefix='mcp_servers']
 *                                          — TOML table prefix (TOML only).
 * @property {string} [helpUrl]           — link to the agent's MCP setup docs
 */

/**
 * @typedef {Object} AgentCapabilities
 * @property {boolean} supportsMcpServers   — does the agent consume MCP servers?
 * @property {boolean} [supportsStdio=true]
 * @property {boolean} [supportsStreamableHttp]
 * @property {boolean} [supportsSse]
 */

/**
 * @typedef {Object} AgentDescriptor
 * @property {string} id                  — kebab-case unique id (e.g., 'claude-code')
 * @property {string} displayName         — human-readable
 * @property {string} vendor              — Anthropic, OpenAI, Google, etc.
 * @property {string} [website]
 * @property {string} [docsUrl]
 * @property {DetectionRules} detection
 * @property {McpConfigRules} [mcpConfig] — omitted means the agent doesn't accept
 *                                          MCP servers as a client (informational)
 * @property {AgentCapabilities} capabilities
 */

/**
 * @typedef {Object} DetectionResult
 * @property {string} id                  — agent id
 * @property {boolean} installed
 * @property {boolean} configured         — true if MCP config file exists AND
 *                                          contains a browser-memex entry
 * @property {string|null} matchedPath    — which detection path triggered
 * @property {string|null} mcpConfigPath  — resolved config file path
 * @property {string|null} version        — if discoverable; otherwise null
 */
