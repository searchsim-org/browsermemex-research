import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "everything",
  displayName: "Everything (reference server)",
  vendor: "Model Context Protocol",
  description:
    "Reference MCP server demonstrating every protocol feature (tools / prompts / " +
    "resources / sampling). Useful for testing your client integration.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/everything",
  tags: ["reference", "testing", "official"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true, prompts: true, resources: true, sampling: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    requiredEnv: [],
  },
  official: true,
});
