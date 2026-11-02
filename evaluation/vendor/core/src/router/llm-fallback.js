/**
 * LLM-assisted routing fallback.
 *
 * When no rule matches and no override applies, optionally ask a small LLM
 * to pick from the available agents. The LLM client is INJECTED so tests
 * use a recording double rather than real network calls.
 *
 * The router's main path is rule-driven; this fallback is an explicit opt-in
 * configured on the Policy (`llmFallbackEnabled: true`).
 */

/**
 * @typedef {Object} LlmRouter
 * @property {(prompt: object) => Promise<{ agentId: string, reason: string } | null>} pickAgent
 */

/**
 * Build the prompt object the LLM client receives. Structured so the
 * client can use it directly (no string-template prompt building here —
 * that's the LLM client's job).
 *
 * @param {object} task
 * @param {string[]} availableAgentIds
 */
export function buildLlmPrompt(task, availableAgentIds) {
  return {
    task: {
      kind: task.kind,
      title: task.title,
      description: task.description ?? null,
      capability: task.capability,
      payload: task.payload,
    },
    candidates: availableAgentIds,
    instruction:
      "Pick the most suitable agent for the task above. Respond with the " +
      "agent id from the candidates list, plus a one-sentence reason.",
  };
}

/**
 * Run the LLM fallback. Returns null if the LLM doesn't pick a candidate
 * (or if the picked id isn't in the candidate set).
 *
 * @param {LlmRouter} llmClient
 * @param {object} task
 * @param {string[]} candidates              — available agent ids
 */
export async function runLlmFallback(llmClient, task, candidates) {
  if (!llmClient || typeof llmClient.pickAgent !== "function") {
    return null;
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return null;
  }
  const prompt = buildLlmPrompt(task, candidates);
  const result = await llmClient.pickAgent(prompt);
  if (!result || typeof result.agentId !== "string") return null;
  if (!candidates.includes(result.agentId)) return null;
  return { agentId: result.agentId, reason: result.reason ?? "LLM-selected" };
}
