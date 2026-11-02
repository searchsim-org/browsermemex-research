/**
 * Policy evaluation — rules → ordered candidate agent list.
 *
 * Given a task + policy + availability snapshot, returns the rule that fired
 * (if any) and the candidate list with forbidden/unavailable agents removed.
 */

import { allMatch } from "./matchers.js";
import { getAgent } from "../agents/descriptors/index.js";

/**
 * @typedef {Object} PolicyApplication
 * @property {object|null} matchedRule
 * @property {string[]} candidates           — preferred order, after filters
 * @property {string[]} forbiddenIds         — removed by the rule's forbidden list
 * @property {string[]} unavailableIds       — removed because not installed/configured
 */

/**
 * Apply policy rules to a task. Returns the FIRST matching rule's candidate
 * list (with forbidden + unavailable filters applied), or null if no rule
 * matches.
 *
 * @param {object} task
 * @param {object} policy
 * @param {object} availability
 * @param {object} ctx                       — { now }
 */
export function applyRules(task, policy, availability, ctx) {
  if (!policy || !Array.isArray(policy.rules)) {
    return { matchedRule: null, candidates: [], forbiddenIds: [], unavailableIds: [] };
  }

  const installed = new Set(availability?.installed ?? []);

  for (const rule of policy.rules) {
    // Each rule's match is evaluated WITHOUT an agent descriptor — CAPABILITY_REQUIRED
    // matchers in a rule's match clause would fail. Capability filters are
    // per-candidate; rule-level match is task-level only.
    const ruleMatches = allMatch(
      rule.match,
      task,
      { now: ctx.now, agentDescriptor: null }
    );
    if (!ruleMatches) continue;

    const preferred = Array.isArray(rule.preferred) ? rule.preferred : [];
    const forbidden = new Set(Array.isArray(rule.forbidden) ? rule.forbidden : []);

    const unavailableIds = [];
    const forbiddenIds = [];
    const candidates = [];

    for (const agentId of preferred) {
      if (forbidden.has(agentId)) {
        forbiddenIds.push(agentId);
        continue;
      }
      if (!installed.has(agentId)) {
        unavailableIds.push(agentId);
        continue;
      }
      // Per-agent capability filter via descriptor
      if (!agentSupportsTaskCapabilities(agentId, task)) {
        forbiddenIds.push(agentId);
        continue;
      }
      candidates.push(agentId);
    }

    return { matchedRule: rule, candidates, forbiddenIds, unavailableIds };
  }

  return { matchedRule: null, candidates: [], forbiddenIds: [], unavailableIds: [] };
}

/**
 * Check whether an agent supports the task's required capabilities.
 * For v1.0 this is structural — destructive tasks need an agent that
 * supports MCP servers + stdio. Future versions may add finer-grained
 * required-capability matching.
 */
export function agentSupportsTaskCapabilities(agentId, _task) {
  const desc = getAgent(agentId);
  if (!desc) return false;
  return Boolean(desc.capabilities?.supportsMcpServers);
}
