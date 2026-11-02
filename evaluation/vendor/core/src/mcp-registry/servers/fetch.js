import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "fetch",
  displayName: "Fetch (HTTP)",
  vendor: "Model Context Protocol",
  description: "Fetch web pages and convert them to markdown for LLM consumption.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch",
  tags: ["web", "official", "extraction"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true },
  install: {
    kind: INSTALL_KIND.PYTHON,
    command: "uvx",
    args: ["mcp-server-fetch"],
    requiredEnv: [],
  },
  official: true,
});
