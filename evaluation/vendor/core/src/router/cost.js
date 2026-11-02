/**
 * Cost accounting helpers.
 *
 * Per-run cost is supplied by the dispatcher (the agent knows what it
 * charged) and persisted via TaskStore. The router queries historical cost
 * to break ties when multiple agents are equally suitable.
 */

/**
 * @typedef {Object} RunCost
 * @property {number} usd                    — total cost in USD
 * @property {number} [tokensInput]
 * @property {number} [tokensOutput]
 * @property {string} [provider]             — 'anthropic' | 'openai' | ...
 * @property {string} [model]                — 'claude-opus-4-7' | 'gpt-5' | ...
 */

/**
 * Average cost per task across an array of run records. Used to populate
 * Availability.recentCostUsd from TaskStore.runs(id) output.
 */
export function averageCostUsd(runs) {
  let total = 0;
  let count = 0;
  for (const r of runs ?? []) {
    if (r.status !== "success") continue;
    const cost = parseCost(r);
    if (cost && Number.isFinite(cost.usd)) {
      total += cost.usd;
      count++;
    }
  }
  return count > 0 ? total / count : 0;
}

/**
 * Pick the cheaper agent from two ids based on recent cost.
 */
export function pickCheaper(idA, idB, recentCostUsd) {
  const a = recentCostUsd?.[idA];
  const b = recentCostUsd?.[idB];
  if (typeof a !== "number" && typeof b !== "number") return null;
  if (typeof a !== "number") return idB;
  if (typeof b !== "number") return idA;
  return a <= b ? idA : idB;
}

function parseCost(run) {
  if (!run) return null;
  // task_runs.result can carry { cost: {...} }; or top-level cost fields
  // populated by future schema additions
  if (run.cost && typeof run.cost === "object") return run.cost;
  if (run.result && typeof run.result === "object" && run.result.cost) return run.result.cost;
  return null;
}
