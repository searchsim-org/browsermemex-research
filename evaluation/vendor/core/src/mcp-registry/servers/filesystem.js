import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "filesystem",
  displayName: "Filesystem",
  vendor: "Model Context Protocol",
  description: "Read and write files in user-allowed directories.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem",
  tags: ["filesystem", "official"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true, resources: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "<ALLOWED_DIRECTORY>"],
    requiredEnv: [],
  },
  official: true,
});
