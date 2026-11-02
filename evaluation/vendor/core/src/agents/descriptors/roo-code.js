/**
 * Roo Code — VS Code extension forked from Cline.
 * Publisher / id: RooVeterinaryInc.roo-cline
 * Docs: https://docs.roocode.com/features/mcp
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

const EXT_ID = "rooveterinaryinc.roo-cline";

export default Object.freeze({
  id: "roo-code",
  displayName: "Roo Code",
  vendor: "Roo Veterinary Inc.",
  website: "https://roocode.com",
  docsUrl: "https://docs.roocode.com/features/mcp",
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
      macos: [`~/Library/Application Support/Code/User/globalStorage/${EXT_ID}/settings/mcp_settings.json`],
      linux: [`~/.config/Code/User/globalStorage/${EXT_ID}/settings/mcp_settings.json`],
      windows: [`%APPDATA%/Code/User/globalStorage/${EXT_ID}/settings/mcp_settings.json`],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "mcpServers",
    helpUrl: "https://docs.roocode.com/features/mcp",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: false,
    supportsSse: true,
  },
});
