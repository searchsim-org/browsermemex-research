/**
 * @browser-memex/core/agents — agent connector framework.
 *
 * Exports:
 *   - types (PLATFORM, MCP_CONFIG_FORMAT, type definitions via JSDoc)
 *   - descriptor registry (ALL_AGENTS, getAgent)
 *   - detection (detectOne, detectAll, expandPath)
 *   - install (buildServerEntry, mergeConfig)
 */

export * from "./types.js";
export { ALL_AGENTS, getAgent } from "./descriptors/index.js";
export { detectOne, detectAll, expandPath } from "./detect.js";
export { buildServerEntry, mergeConfig, mergeJsonConfig, mergeTomlConfig } from "./install.js";
