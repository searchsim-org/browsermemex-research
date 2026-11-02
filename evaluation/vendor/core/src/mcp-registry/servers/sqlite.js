import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "sqlite",
  displayName: "SQLite",
  vendor: "Model Context Protocol",
  description: "Query a SQLite database; useful for app-local data exploration.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite",
  tags: ["database", "official"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true, resources: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sqlite", "--db-path", "<DB_PATH>"],
    requiredEnv: [],
  },
  official: true,
});
