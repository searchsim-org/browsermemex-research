import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "postgres",
  displayName: "PostgreSQL",
  vendor: "Model Context Protocol",
  description: "Read-only access to a PostgreSQL database; great for analytics agents.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/postgres",
  tags: ["database", "official"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true, resources: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres", "<DATABASE_URL>"],
    requiredEnv: [],
  },
  official: true,
});
