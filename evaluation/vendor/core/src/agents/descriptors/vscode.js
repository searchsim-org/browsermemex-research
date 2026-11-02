/**
 * Visual Studio Code — native MCP support added in v1.99 (Apr 2025).
 * Docs: https://code.visualstudio.com/docs/copilot/chat/mcp-servers
 *
 * VS Code's user-level MCP config lives in the user settings JSON file
 * under the `mcp.servers` key. There is also a workspace-level
 * `.vscode/mcp.json`; we configure user-level only.
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "vscode",
  displayName: "Visual Studio Code",
  vendor: "Microsoft",
  website: "https://code.visualstudio.com",
  docsUrl: "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
  detection: {
    paths: {
      macos: [
        "/Applications/Visual Studio Code.app",
        "~/Library/Application Support/Code",
      ],
      linux: ["~/.config/Code", "~/.vscode"],
      windows: [
        "%LOCALAPPDATA%/Programs/Microsoft VS Code",
        "%APPDATA%/Code",
      ],
    },
    binaries: ["code"],
  },
  mcpConfig: {
    // VS Code's user-level mcp config — separate file in User dir as of v1.99+
    paths: {
      macos: ["~/Library/Application Support/Code/User/mcp.json"],
      linux: ["~/.config/Code/User/mcp.json"],
      windows: ["%APPDATA%/Code/User/mcp.json"],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "servers",
    helpUrl: "https://code.visualstudio.com/docs/copilot/chat/mcp-servers",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: true,
    supportsSse: true,
  },
});
