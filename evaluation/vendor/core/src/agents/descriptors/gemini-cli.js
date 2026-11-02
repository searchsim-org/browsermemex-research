/**
 * Gemini CLI (Google) — terminal-based AI coding agent.
 * Docs: https://github.com/google-gemini/gemini-cli
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "gemini-cli",
  displayName: "Gemini CLI",
  vendor: "Google",
  website: "https://ai.google.dev",
  docsUrl: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
  detection: {
    paths: {
      macos: ["~/.gemini"],
      linux: ["~/.gemini"],
      windows: ["%USERPROFILE%/.gemini"],
    },
    binaries: ["gemini"],
  },
  mcpConfig: {
    paths: {
      macos: ["~/.gemini/settings.json"],
      linux: ["~/.gemini/settings.json"],
      windows: ["%USERPROFILE%/.gemini/settings.json"],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "mcpServers",
    helpUrl: "https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: true,
    supportsSse: true,
  },
});
