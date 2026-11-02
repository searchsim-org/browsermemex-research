/**
 * Codex CLI (OpenAI) — terminal-based AI coding agent.
 * Docs: https://github.com/openai/codex
 *
 * Codex uses TOML for its config, with [mcp_servers.<name>] tables.
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "codex",
  displayName: "Codex CLI",
  vendor: "OpenAI",
  website: "https://openai.com",
  docsUrl: "https://github.com/openai/codex#mcp-support",
  detection: {
    paths: {
      macos: ["~/.codex"],
      linux: ["~/.codex"],
      windows: ["%USERPROFILE%/.codex"],
    },
    binaries: ["codex"],
  },
  mcpConfig: {
    paths: {
      macos: ["~/.codex/config.toml"],
      linux: ["~/.codex/config.toml"],
      windows: ["%USERPROFILE%/.codex/config.toml"],
    },
    format: MCP_CONFIG_FORMAT.TOML,
    tomlTablePrefix: "mcp_servers",
    helpUrl: "https://github.com/openai/codex#mcp-support",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: false,
    supportsSse: false,
  },
});
