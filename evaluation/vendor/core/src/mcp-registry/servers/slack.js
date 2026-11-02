import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "slack",
  displayName: "Slack",
  vendor: "Model Context Protocol",
  description: "Send messages, read channels, manage threads in Slack workspaces.",
  homepage: "https://github.com/modelcontextprotocol/servers",
  repository: "https://github.com/modelcontextprotocol/servers/tree/main/src/slack",
  tags: ["communication", "official"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true },
  install: {
    kind: INSTALL_KIND.NPX,
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    env: {
      SLACK_BOT_TOKEN: "<xoxb-...>",
      SLACK_TEAM_ID: "<TEAM_ID>",
    },
    requiredEnv: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
  },
  official: true,
});
