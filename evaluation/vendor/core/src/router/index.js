/**
 * @browser-memex/core/router — task routing & policy engine.
 *
 * Public surface:
 *   - types: MATCH_KIND, DECISION_SOURCE + JSDoc shapes
 *   - matchers: evaluateMatch, allMatch, compileGlob
 *   - policy: applyRules, agentSupportsTaskCapabilities
 *   - cost: averageCostUsd, pickCheaper
 *   - selector: selectAgent
 *   - llm-fallback: runLlmFallback, buildLlmPrompt
 *   - Router class
 */

export * from "./types.js";
export { evaluateMatch, allMatch, compileGlob } from "./matchers.js";
export { applyRules, agentSupportsTaskCapabilities } from "./policy.js";
export { averageCostUsd, pickCheaper } from "./cost.js";
export { selectAgent } from "./selector.js";
export { runLlmFallback, buildLlmPrompt } from "./llm-fallback.js";
export { Router } from "./router.js";
