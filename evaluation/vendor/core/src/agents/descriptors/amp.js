/**
 * Amp (Sourcegraph) — AI coding agent.
 * Docs: https://ampcode.com/manual
 *
 * Config is JSON/JSONC at ~/.config/amp/settings.{json,jsonc}, with MCP
 * server entries under the `amp.mcpServers` key (note the dotted key).
 */
import { MCP_CONFIG_FORMAT } from "../types.js";

export default Object.freeze({
  id: "amp",
  displayName: "Amp",
  vendor: "Sourcegraph",
  website: "https://ampcode.com",
  docsUrl: "https://ampcode.com/manual",
  detection: {
    paths: {
      macos: ["~/.config/amp"],
      linux: ["~/.config/amp"],
      windows: ["%USERPROFILE%/.config/amp"],
    },
    binaries: ["amp"],
  },
  mcpConfig: {
    paths: {
      macos: ["~/.config/amp/settings.json"],
      linux: ["~/.config/amp/settings.json"],
      windows: ["%USERPROFILE%/.config/amp/settings.json"],
    },
    format: MCP_CONFIG_FORMAT.JSON,
    serversKey: "amp.mcpServers",
    helpUrl: "https://ampcode.com/manual#mcp",
  },
  capabilities: {
    supportsMcpServers: true,
    supportsStdio: true,
    supportsStreamableHttp: true,
    supportsSse: false,
  },
});
