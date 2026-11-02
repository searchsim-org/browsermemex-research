/**
 * Detection runner — pure logic. Caller injects an `fsProbe` that answers
 * filesystem questions ("does this path exist?", "is this binary on PATH?",
 * "does this glob match?"). The same logic runs in Node (real filesystem)
 * and in tests (synthetic probes).
 *
 * Returns DetectionResult[] (one per descriptor).
 */

import { ALL_AGENTS } from "./descriptors/index.js";
import { PLATFORM } from "./types.js";

/**
 * @typedef {Object} FsProbe
 * @property {(path: string) => boolean | Promise<boolean>} exists
 * @property {(glob: string) => boolean | Promise<boolean>} matches
 * @property {(binary: string) => boolean | Promise<boolean>} hasBinary
 * @property {(path: string) => string | null | Promise<string | null>} readText
 *   — used to check whether an existing MCP config already lists our server
 */

const HOME_RE = /^~(?=$|\/|\\)/;
const ENV_VAR_RE = /%([A-Z_][A-Z0-9_]*)%/g;

/**
 * Expand `~` (home) and `%ENV_VAR%` (Windows-style) in a path. Pure — caller
 * supplies the environment map (typically process.env + home dir).
 */
export function expandPath(path, env, home) {
  if (!path) return path;
  let p = String(path).replace(HOME_RE, home);
  p = p.replace(ENV_VAR_RE, (_match, name) => env[name] ?? "");
  return p;
}

/**
 * Detect a single agent given a probe + platform context.
 *
 * @param {object} agent — descriptor
 * @param {FsProbe} probe
 * @param {object} ctx
 * @param {keyof PLATFORM} ctx.platform
 * @param {object} ctx.env
 * @param {string} ctx.home
 * @param {string} ctx.serverIdentifier — entry name to look for in MCP config
 *                                         (e.g., 'browser-memex')
 */
export async function detectOne(agent, probe, ctx) {
  const platformPaths = agent.detection.paths?.[ctx.platform] ?? [];
  const binaries = agent.detection.binaries ?? [];

  let installed = false;
  let matchedPath = null;

  for (const raw of platformPaths) {
    const path = expandPath(raw, ctx.env, ctx.home);
    const isGlob = path.includes("*");
    const matched = isGlob ? await probe.matches(path) : await probe.exists(path);
    if (matched) {
      installed = true;
      matchedPath = path;
      break;
    }
  }

  if (!installed) {
    for (const bin of binaries) {
      if (await probe.hasBinary(bin)) {
        installed = true;
        matchedPath = `(PATH: ${bin})`;
        break;
      }
    }
  }

  let mcpConfigPath = null;
  let configured = false;
  if (installed && agent.mcpConfig) {
    const candidates = agent.mcpConfig.paths?.[ctx.platform] ?? [];
    for (const raw of candidates) {
      const path = expandPath(raw, ctx.env, ctx.home);
      if (await probe.exists(path)) {
        mcpConfigPath = path;
        const text = await probe.readText(path);
        if (typeof text === "string" && text.includes(ctx.serverIdentifier)) {
          configured = true;
        }
        break;
      }
    }
    if (!mcpConfigPath) {
      // Resolve the path we'd write to if config doesn't exist yet
      const first = candidates[0];
      if (first) mcpConfigPath = expandPath(first, ctx.env, ctx.home);
    }
  }

  return {
    id: agent.id,
    installed,
    configured,
    matchedPath,
    mcpConfigPath,
    version: null,
  };
}

/** Detect all registered agents. Returns a DetectionResult per descriptor. */
export async function detectAll(probe, ctx) {
  return Promise.all(ALL_AGENTS.map((a) => detectOne(a, probe, ctx)));
}
