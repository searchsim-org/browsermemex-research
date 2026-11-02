/**
 * MCP server registry — types.
 *
 * Curated catalog of well-known MCP servers a user might want to install
 * into one of their connected agents (8.6 lives in /agents — those are
 * the IDE/CLI clients; THIS module is the servers those clients consume).
 *
 * Each McpServerDescriptor declares:
 *   - identity (id, displayName, vendor, homepage, repo)
 *   - capabilities (tools, prompts, resources, sampling)
 *   - transport (stdio / http / sse) + the install method
 *   - install kind:
 *       NPX            : runs via npx without a global install
 *       NPM_GLOBAL     : requires npm install -g
 *       DOCKER         : pulled + run via docker
 *       BINARY         : pre-built binary download
 *       PYTHON         : pip / pipx install
 *   - the install command template (e.g., `npx -y @modelcontextprotocol/server-filesystem`)
 *
 * Adding a new server = adding a descriptor file under `servers/` and
 * importing it here. Pure data, zero code wiring per entry.
 */

export const TRANSPORT = Object.freeze({
  STDIO: "stdio",
  HTTP: "http",
  SSE: "sse",
});

export const INSTALL_KIND = Object.freeze({
  NPX: "npx",
  NPM_GLOBAL: "npm_global",
  DOCKER: "docker",
  BINARY: "binary",
  PYTHON: "python",
  CUSTOM: "custom",
});

/**
 * @typedef {Object} McpServerCapabilities
 * @property {boolean} [tools]
 * @property {boolean} [prompts]
 * @property {boolean} [resources]
 * @property {boolean} [sampling]
 */

/**
 * @typedef {Object} McpServerInstall
 * @property {keyof INSTALL_KIND} kind
 * @property {string} command         — e.g., "npx"
 * @property {string[]} args          — e.g., ["-y", "@modelcontextprotocol/server-filesystem"]
 * @property {Record<string,string>} [env]
 *                                    — env vars the server needs (with placeholder values
 *                                       like "<YOUR_API_KEY>" for user-supplied secrets)
 * @property {string[]} [requiredEnv] — names of env vars the user must provide
 */

/**
 * @typedef {Object} McpServerDescriptor
 * @property {string} id              — kebab-case unique
 * @property {string} displayName
 * @property {string} vendor
 * @property {string} description
 * @property {string} [homepage]
 * @property {string} [repository]
 * @property {string[]} tags          — for filtering ("filesystem", "search", "database", ...)
 * @property {keyof TRANSPORT} transport
 * @property {McpServerCapabilities} capabilities
 * @property {McpServerInstall} install
 * @property {boolean} [official]     — true = published by the modelcontextprotocol org
 */

/**
 * Validate a descriptor at module-load time.
 */
export function validateDescriptor(d) {
  if (!d) throw new Error("descriptor required");
  if (typeof d.id !== "string" || !d.id.length) throw new Error(`${d.id}: id required`);
  if (typeof d.displayName !== "string") throw new Error(`${d.id}: displayName required`);
  if (typeof d.vendor !== "string") throw new Error(`${d.id}: vendor required`);
  if (!Object.values(TRANSPORT).includes(d.transport)) {
    throw new Error(`${d.id}: invalid transport`);
  }
  if (!d.install || typeof d.install !== "object") {
    throw new Error(`${d.id}: install required`);
  }
  if (!Object.values(INSTALL_KIND).includes(d.install.kind)) {
    throw new Error(`${d.id}: invalid install.kind`);
  }
  if (typeof d.install.command !== "string" || !d.install.command.length) {
    throw new Error(`${d.id}: install.command required`);
  }
  if (!Array.isArray(d.install.args)) {
    throw new Error(`${d.id}: install.args must be an array`);
  }
  return true;
}
