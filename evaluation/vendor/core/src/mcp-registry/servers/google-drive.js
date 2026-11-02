import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "google-drive",
  displayName: "Google Drive",
  vendor: "Model Context Protocol",
  description: "Read and search files in Google Drive (OAuth required).",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive",
  tags: ["productivity", "official", "google"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true, resources: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gdrive"],
    requiredEnv: [],
  },
  official: true,
});
