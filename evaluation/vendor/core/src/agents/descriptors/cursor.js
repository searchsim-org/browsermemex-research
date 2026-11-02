/**
 * Cursor — AI-first IDE.
 * Docs: https://docs.cursor.com/context/model-context-protocol
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "cursor",
  displayName: "Cursor",
  vendor: "Anysphere",
  website: "https://cursor.com",
  docsUrl: "https://docs.cursor.com/context/model-context-protocol",
  detection: {
    paths: {
      macos: ["/Applications/Cursor.app", "~/.cursor"],
      linux: ["~/.cursor", "~/.config/Cursor"],
      windows: ["%LOCALAPPDATA%/Programs/cursor", "%USERPROFILE%/.cursor"],
    },
    binaries: ["cursor"],
  },
  mcpConfig: {
    paths: {
      macos: ["~/.cursor/mcp.json"],
      linux: ["~/.cursor/mcp.json"],
      windows: ["%USERPROFILE%/.cursor/mcp.json"],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "mcpServers",
    helpUrl: "https://docs.cursor.com/context/model-context-protocol",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: true,
    supportsSse: true,
  },
});
