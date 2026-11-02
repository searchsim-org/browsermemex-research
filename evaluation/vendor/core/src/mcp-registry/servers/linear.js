import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "linear",
  displayName: "Linear",
  vendor: "Linear",
  description: "Create, query, and update Linear issues from an agent.",
  homepage: "https://linear.app/changelog/mcp",
  tags: ["issue-tracker", "productivity"],
  transport: TRANSPORT.SSE,
  capabilities: { tools: true },
  install: {
    kind: INSTALL_KIND.CUSTOM,
    command: "https://mcp.linear.app/sse",
    args: [],
    env: { LINEAR_API_KEY: "<YOUR_LINEAR_API_KEY>" },
    requiredEnv: ["LINEAR_API_KEY"],
  },
  official: false,
});
