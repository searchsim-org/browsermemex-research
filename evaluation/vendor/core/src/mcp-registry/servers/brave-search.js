import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "brave-search",
  displayName: "Brave Search",
  vendor: "Model Context Protocol",
  description: "Web and local search via the Brave Search API.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search",
  tags: ["search", "official", "web"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "<YOUR_BRAVE_API_KEY>" },
    requiredEnv: ["BRAVE_API_KEY"],
  },
  official: true,
});
