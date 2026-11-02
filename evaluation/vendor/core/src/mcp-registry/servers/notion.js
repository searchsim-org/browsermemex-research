import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "notion",
  displayName: "Notion",
  vendor: "Notion",
  description: "Read, search, and update Notion pages and databases.",
  homepage: "https://github.com/makenotion/notion-mcp-server",
  repository: "https://github.com/makenotion/notion-mcp-server",
  tags: ["productivity", "wiki"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true, resources: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer <NOTION_INTEGRATION_SECRET>","Notion-Version":"2022-06-28"}',
    },
    requiredEnv: ["OPENAPI_MCP_HEADERS"],
  },
  official: false,
});
