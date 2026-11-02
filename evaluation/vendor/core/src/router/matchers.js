/**
 * Match-predicate evaluators.
 *
 * Pure functions; the policy engine calls these once per rule per task to
 * decide if the rule applies.
 */

import { MATCH_KIND } from "./types.js";
import { CAPABILITY, meetsCapability } from "../security/capability.js";

/**
 * Compile a glob pattern (with `*` matching one path segment and `**`
 * matching across segments) into a RegExp. Used for url_pattern.
 *
 * Algorithm: substitute `**` with a sentinel placeholder, escape regex
 * specials, convert single `*` to a no-slash class, then expand the
 * sentinel to "any character". Avoids the ambiguity of regex specials
 * inside `*` / `**` literal substrings.
 */
export function compileGlob(pattern) {
  const SENTINEL = "__GLOB_DBL_STAR__";
  const escaped = String(pattern)
    .replace(/\*\*/g, SENTINEL)
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .split(SENTINEL)
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

/**
 * Evaluate a single Match clause against a task in the given context.
 *
 * @param {object} match
 * @param {object} task
 * @param {object} ctx
 * @param {number} ctx.now                — Unix ms (for time-of-day)
 * @param {object} ctx.agentDescriptor    — descriptor of the agent currently
 *                                          being considered (for capability checks)
 */
export function evaluateMatch(match, task, ctx) {
  switch (match.kind) {
    case MATCH_KIND.URL_PATTERN:
      return matchUrlPattern(match, task);
    case MATCH_KIND.TASK_KIND:
      return matchTaskKind(match, task);
    case MATCH_KIND.KEYWORDS:
      return matchKeywords(match, task);
    case MATCH_KIND.TIME_OF_DAY:
      return matchTimeOfDay(match, ctx.now);
    case MATCH_KIND.CAPABILITY_REQUIRED:
      return matchCapabilityRequired(match, ctx.agentDescriptor);
    case MATCH_KIND.CAPABILITY_LEVEL:
      return matchCapabilityLevel(match, task);
    default:
      throw new Error(`evaluateMatch: unknown match.kind '${match.kind}'`);
  }
}

/**
 * Conjunction of multiple match clauses (all must hold).
 */
export function allMatch(matches, task, ctx) {
  if (!Array.isArray(matches) || matches.length === 0) return true;
  for (const m of matches) {
    if (!evaluateMatch(m, task, ctx)) return false;
  }
  return true;
}

// ===== individual matchers =====

function matchUrlPattern(match, task) {
  if (typeof match.pattern !== "string") return false;
  const url = extractUrlFromTask(task);
  if (!url) return false;
  return compileGlob(match.pattern).test(url);
}

function matchTaskKind(match, task) {
  if (!Array.isArray(match.kinds) || match.kinds.length === 0) return false;
  return match.kinds.includes(task.kind);
}

function matchKeywords(match, task) {
  if (!Array.isArray(match.terms) || match.terms.length === 0) return false;
  const haystack = collectSearchableText(task).toLowerCase();
  for (const term of match.terms) {
    if (haystack.includes(String(term).toLowerCase())) return true;
  }
  return false;
}

function matchTimeOfDay(match, now) {
  const w = match.window;
  if (!w || !Number.isInteger(w.fromHour) || !Number.isInteger(w.toHour)) return false;
  const hour = new Date(now).getUTCHours();
  if (w.fromHour <= w.toHour) {
    return hour >= w.fromHour && hour < w.toHour;
  }
  return hour >= w.fromHour || hour < w.toHour;
}

function matchCapabilityRequired(match, agentDescriptor) {
  if (!agentDescriptor || !agentDescriptor.capabilities) return false;
  const cap = match.capability;
  if (!cap) return false;
  return Boolean(agentDescriptor.capabilities[cap]);
}

function matchCapabilityLevel(match, task) {
  if (typeof match.maxCapability !== "string") return false;
  if (typeof task.capability !== "string") return false;
  if (!isValidCapability(match.maxCapability) || !isValidCapability(task.capability)) return false;
  return meetsCapability(match.maxCapability, task.capability);
}

function isValidCapability(value) {
  return Object.values(CAPABILITY).includes(value);
}

function extractUrlFromTask(task) {
  if (!task) return null;
  if (typeof task.payload?.url === "string") return task.payload.url;
  if (typeof task.payload?.target?.url === "string") return task.payload.target.url;
  if (typeof task.routing?.url === "string") return task.routing.url;
  return null;
}

function collectSearchableText(task) {
  const parts = [task.title ?? "", task.description ?? ""];
  if (task.payload) parts.push(safeStringify(task.payload));
  return parts.filter(Boolean).join(" ");
}

function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}
