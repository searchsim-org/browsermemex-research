import { TRANSPORT, INSTALL_KIND } from "../types.js";

export default Object.freeze({
  id: "github",
  displayName: "GitHub",
  vendor: "GitHub",
  description: "Search issues + PRs, read repos, comment, create PRs.",
  homepage: "https://github.com/github/github-mcp-server",
  repository: "https://github.com/github/github-mcp-server",
  tags: ["development", "code", "issue-tracker"],
  transport: TRANSPORT.STDIO,
  capabilities: { tools: true },
  install: {
    kind: INSTALL_KIND.DOCKER,
    command: "docker",
    args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "<YOUR_GH_PAT>" },
    requiredEnv: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
  },
  official: false,
});
