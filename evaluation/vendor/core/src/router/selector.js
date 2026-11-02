/**
 * Final agent selection — given a candidate list, pick one agent.
 *
 * Ranking signals (applied in order):
 *   1. The first agent in the policy's preferred list (rule order)
 *   2. Recent success rate (higher wins) — only used as a tiebreaker among
 *      agents already at the same preferred-rank
 *   3. Recent cost (lower wins) — secondary tiebreaker
 *
 * Pure function. No history side effects.
 */

/**
 * @typedef {Object} RankedCandidate
 * @property {string} agentId
 * @property {number} rank                   — 0 = highest priority (first in preferred)
 * @property {number} score                  — combined score; higher is better
 */

/**
 * Rank candidates and return the winning agent id (or null if none).
 *
 * @param {string[]} candidates              — ordered by policy preference
 * @param {object} availability
 * @param {object} [opts]
 * @param {number} [opts.successWeight=1]
 * @param {number} [opts.costWeight=0.5]     — negative because lower cost is better
 * @returns {{ chosen: string|null, ranked: RankedCandidate[] }}
 */
export function selectAgent(candidates, availability, opts = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { chosen: null, ranked: [] };
  }

  const successWeight = opts.successWeight ?? 1;
  const costWeight = opts.costWeight ?? 0.5;

  const recentSuccess = availability?.recentSuccessRate ?? {};
  const recentCost = availability?.recentCostUsd ?? {};

  const ranked = candidates.map((agentId, rank) => {
    // Preferred-rank bonus dominates: -rank (negated so lower rank → higher score)
    const rankScore = -rank * 10;
    const successScore = (recentSuccess[agentId] ?? 0) * successWeight;
    // Lower cost is better. Use -cost so it adds positively to score.
    const costScore = -(recentCost[agentId] ?? 0) * costWeight;
    const score = rankScore + successScore + costScore;
    return { agentId, rank, score };
  });

  // Sort by score descending (highest score wins)
  ranked.sort((a, b) => b.score - a.score);

  return { chosen: ranked[0].agentId, ranked };
}
