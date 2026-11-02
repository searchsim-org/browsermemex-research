import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "memory",
  displayName: "Persistent Memory (knowledge graph)",
  vendor: "Model Context Protocol",
  description: "Store and recall facts across sessions as a typed knowledge graph.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/memory",
  tags: ["memory", "official"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    requiredEnv: [],
  },
  official: true,
});
