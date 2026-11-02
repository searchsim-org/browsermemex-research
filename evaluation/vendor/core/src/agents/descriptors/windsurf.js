/**
 * Windsurf (Codeium) — AI-first IDE forked from VS Code.
 * Docs: https://docs.windsurf.com/windsurf/cascade/mcp
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "windsurf",
  displayName: "Windsurf",
  vendor: "Codeium",
  website: "https://windsurf.com",
  docsUrl: "https://docs.windsurf.com/windsurf/cascade/mcp",
  detection: {
    paths: {
      macos: ["/Applications/Windsurf.app", "~/.codeium/windsurf"],
      linux: ["~/.codeium/windsurf"],
      windows: ["%LOCALAPPDATA%/Programs/Windsurf", "%USERPROFILE%/.codeium/windsurf"],
    },
    binaries: ["windsurf"],
  },
  mcpConfig: {
    paths: {
      macos: ["~/.codeium/windsurf/mcp_config.json"],
      linux: ["~/.codeium/windsurf/mcp_config.json"],
      windows: ["%USERPROFILE%/.codeium/windsurf/mcp_config.json"],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "mcpServers",
    helpUrl: "https://docs.windsurf.com/windsurf/cascade/mcp",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: true,
    supportsSse: true,
  },
});
