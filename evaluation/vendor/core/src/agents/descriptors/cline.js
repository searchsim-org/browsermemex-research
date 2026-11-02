/**
 * Cline — VS Code extension (publisher: saoudrizwan, id: claude-dev).
 * Docs: https://docs.cline.bot/mcp-servers
 *
 * Detection looks for the VS Code extension folder; MCP config lives in
 * VS Code's globalStorage area for the extension.
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

const EXT_ID = "saoudrizwan.claude-dev";

export default Object.freeze({
  id: "cline",
  displayName: "Cline",
  vendor: "Cline (community)",
  website: "https://cline.bot",
  docsUrl: "https://docs.cline.bot/mcp-servers",
  detection: {
    paths: {
      macos: [`~/.vscode/extensions/${EXT_ID}-*`],
      linux: [`~/.vscode/extensions/${EXT_ID}-*`],
      windows: [`%USERPROFILE%/.vscode/extensions/${EXT_ID}-*`],
    },
    binaries: [],
  },
  mcpConfig: {
    paths: {
      macos: [`~/Library/Application Support/Code/User/globalStorage/${EXT_ID}/settings/cline_mcp_settings.json`],
      linux: [`~/.config/Code/User/globalStorage/${EXT_ID}/settings/cline_mcp_settings.json`],
      windows: [`%APPDATA%/Code/User/globalStorage/${EXT_ID}/settings/cline_mcp_settings.json`],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "mcpServers",
    helpUrl: "https://docs.cline.bot/mcp-servers",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: false,
    supportsSse: true,
  },
});
