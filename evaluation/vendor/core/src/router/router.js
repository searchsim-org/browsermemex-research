/**
 * Router — the main orchestrator.
 *
 * `route(task)` returns a Decision:
 *   - chosenAgentId (or null if nothing is available)
 *   - the rule that fired
 *   - the ranked candidate list
 *   - human-readable explanation
 *
 * Resolution order (highest priority first):
 *   1. User override   — explicit per-match pin
 *   2. Policy rules    — first matching rule wins; preferred list is ordered
 *   3. LLM fallback    — only if enabled in policy AND >1 installed agent
 *   4. Default fallback — policy.fallback agent
 *
 * Pure function. The router takes a Policy + Availability snapshot; the
 * caller owns where those come from.
 */

import { DECISION_SOURCE } from "./types.js";
import { allMatch } from "./matchers.js";
import { applyRules, agentSupportsTaskCapabilities } from "./policy.js";
import { selectAgent } from "./selector.js";
import { runLlmFallback } from "./llm-fallback.js";
import { getAgent } from "../agents/descriptors/index.js";

export class Router {
  /**
   * @param {object} options
   * @param {object} options.policy                — see types.js Policy
   * @param {object} [options.llmClient]           — LlmRouter; required iff policy.llmFallbackEnabled
   */
  constructor({ policy, llmClient }) {
    if (!policy || !Array.isArray(policy.rules)) {
      throw new Error("Router: policy with rules required");
    }
    this.policy = policy;
    this.llmClient = llmClient ?? null;
  }

  /**
   * Route a task. Pure async — no storage, no side effects.
   *
   * @param {object} task
   * @param {object} availability              — { installed, configured, recentSuccessRate, recentCostUsd }
   * @param {object} [ctx]                     — { now? }
   * @returns {Promise<object>}                — Decision
   */
  async route(task, availability, ctx = {}) {
    const now = Number.isFinite(ctx.now) ? ctx.now : Date.now();
    const installed = new Set(availability?.installed ?? []);

    // (1) Override
    const overrideHit = this.#applyOverrides(task, { now });
    if (overrideHit) {
      const ok = installed.has(overrideHit.agentId);
      return {
        chosenAgentId: ok ? overrideHit.agentId : null,
        source: ok ? DECISION_SOURCE.OVERRIDE : DECISION_SOURCE.NO_AGENT_AVAILABLE,
        ruleId: null,
        candidates: [overrideHit.agentId],
        forbidden: [],
        unavailable: ok ? [] : [overrideHit.agentId],
        explanation: ok
          ? `User override: pinned to ${prettyAgent(overrideHit.agentId)} (${overrideHit.reason ?? "no reason given"})`
          : `Override pins ${prettyAgent(overrideHit.agentId)} but it's not installed.`,
      };
    }

    // (2) Policy rules
    const ruleApplication = applyRules(task, this.policy, availability, { now });
    if (ruleApplication.matchedRule) {
      const { chosen, ranked } = selectAgent(ruleApplication.candidates, availability);
      if (chosen) {
        return {
          chosenAgentId: chosen,
          source: DECISION_SOURCE.RULE,
          ruleId: ruleApplication.matchedRule.id,
          candidates: ranked.map((r) => r.agentId),
          forbidden: ruleApplication.forbiddenIds,
          unavailable: ruleApplication.unavailableIds,
          explanation: explainRule(ruleApplication.matchedRule, chosen, ranked),
        };
      }
      // Rule matched but no usable candidate — record the attempt
      // and continue to fallback paths.
    }

    // (3) LLM fallback
    const allInstalledSupporting = [...installed].filter((id) =>
      agentSupportsTaskCapabilities(id, task)
    );
    if (
      this.policy.llmFallbackEnabled &&
      this.llmClient &&
      allInstalledSupporting.length > 1
    ) {
      const llmPick = await runLlmFallback(this.llmClient, task, allInstalledSupporting);
      if (llmPick) {
        return {
          chosenAgentId: llmPick.agentId,
          source: DECISION_SOURCE.LLM_FALLBACK,
          ruleId: null,
          candidates: allInstalledSupporting,
          forbidden: [],
          unavailable: [],
          explanation: `LLM fallback chose ${prettyAgent(llmPick.agentId)}: ${llmPick.reason}`,
        };
      }
    }

    // (4) Default fallback
    if (this.policy.fallback && installed.has(this.policy.fallback)) {
      return {
        chosenAgentId: this.policy.fallback,
        source: DECISION_SOURCE.DEFAULT_FALLBACK,
        ruleId: null,
        candidates: [this.policy.fallback],
        forbidden: [],
        unavailable: [],
        explanation: `No rule matched; routed to default fallback ${prettyAgent(this.policy.fallback)}.`,
      };
    }

    return {
      chosenAgentId: null,
      source: DECISION_SOURCE.NO_AGENT_AVAILABLE,
      ruleId: null,
      candidates: [],
      forbidden: [],
      unavailable: [...installed].length === 0 ? [] : [this.policy.fallback].filter(Boolean),
      explanation:
        "No matching rule and the default fallback agent is not installed.",
    };
  }

  #applyOverrides(task, ctx) {
    const overrides = this.policy.overrides ?? [];
    for (const ov of overrides) {
      if (allMatch(ov.match, task, { now: ctx.now, agentDescriptor: null })) {
        return { agentId: ov.agentId, reason: ov.reason };
      }
    }
    return null;
  }
}

function prettyAgent(id) {
  return getAgent(id)?.displayName ?? id;
}

function explainRule(rule, chosen, ranked) {
  const reason = rule.reason ?? `rule '${rule.id}' matched`;
  const fmtRanked = ranked.length > 1
    ? ` (alternatives: ${ranked.slice(1, 3).map((r) => prettyAgent(r.agentId)).join(", ")})`
    : "";
  return `${prettyAgent(chosen)} — ${reason}${fmtRanked}.`;
}
