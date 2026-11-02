/**
 * Claude Code (Anthropic) — CLI / IDE-integrated coding agent.
 * Docs: https://docs.claude.com/en/docs/claude-code/mcp
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "claude-code",
  displayName: "Claude Code",
  vendor: "Anthropic",
  website: "https://claude.com/product/claude-code",
  docsUrl: "https://docs.claude.com/en/docs/claude-code/mcp",
  detection: {
    paths: {
      macos: ["~/.claude", "~/.claude.json"],
      linux: ["~/.claude", "~/.claude.json"],
      windows: ["%USERPROFILE%/.claude", "%USERPROFILE%/.claude.json"],
    },
    binaries: ["claude"],
  },
  mcpConfig: {
    paths: {
      macos: ["~/.claude.json"],
      linux: ["~/.claude.json"],
      windows: ["%USERPROFILE%/.claude.json"],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "mcpServers",
    helpUrl: "https://docs.claude.com/en/docs/claude-code/mcp",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: true,
    supportsSse: false,
  },
});
