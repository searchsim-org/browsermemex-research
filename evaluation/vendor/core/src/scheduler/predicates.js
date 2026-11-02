/**
 * Watcher predicate evaluation.
 *
 * Pure function: given the predicate spec and a sample (and optionally the
 * previous sample), decide whether the predicate fires now.
 *
 * The caller is responsible for producing the right sample shape — typically
 * a primitive (number, string) extracted from the page or task result.
 *
 * See PREDICATE_KIND in types.js.
 */

import { PREDICATE_KIND } from "./types.js";

/**
 * @param {object} predicate           — { kind, params? }
 * @param {*} sample                   — current observation
 * @param {*} [lastSample]             — previous observation (for VALUE_CHANGED)
 * @returns {boolean}
 */
export function evaluatePredicate(predicate, sample, lastSample) {
  if (!predicate || !predicate.kind) {
    throw new Error("evaluatePredicate: predicate.kind is required");
  }
  switch (predicate.kind) {
    case PREDICATE_KIND.VALUE_CHANGED:
      // Strict change vs prior sample. First sample never fires.
      if (lastSample === undefined) return false;
      return !sameSample(sample, lastSample);

    case PREDICATE_KIND.VALUE_BELOW_THRESHOLD: {
      const t = numericParam(predicate, "threshold");
      const n = toNumber(sample);
      return Number.isFinite(n) && n < t;
    }

    case PREDICATE_KIND.VALUE_ABOVE_THRESHOLD: {
      const t = numericParam(predicate, "threshold");
      const n = toNumber(sample);
      return Number.isFinite(n) && n > t;
    }

    case PREDICATE_KIND.VALUE_MATCHES: {
      const pattern = predicate.params?.regex;
      if (typeof pattern !== "string" || pattern.length === 0) {
        throw new Error("VALUE_MATCHES: params.regex required");
      }
      const flags = predicate.params?.flags ?? "";
      // Pre-compile would be nicer for hot paths; predicate evaluation runs
      // at most once per watcher run so we keep it inline.
      return new RegExp(pattern, flags).test(String(sample));
    }

    case PREDICATE_KIND.VALUE_CONTAINS: {
      const needle = predicate.params?.needle;
      if (typeof needle !== "string" || needle.length === 0) {
        throw new Error("VALUE_CONTAINS: params.needle required");
      }
      const haystack = predicate.params?.caseInsensitive
        ? String(sample).toLowerCase()
        : String(sample);
      const n = predicate.params?.caseInsensitive ? needle.toLowerCase() : needle;
      return haystack.includes(n);
    }

    default:
      throw new Error(`evaluatePredicate: unknown kind '${predicate.kind}'`);
  }
}

function sameSample(a, b) {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (typeof a === "string" && typeof b === "string") return a === b;
  // For objects, compare JSON serialization — good enough for watcher samples
  // which are typically primitives or small structured values.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function toNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    // Strip common currency / formatting chars so "$199.99" parses to 199.99
    const cleaned = v.replace(/[^\d.\-eE]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function numericParam(predicate, name) {
  const v = predicate.params?.[name];
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new Error(`${predicate.kind}: params.${name} required (number)`);
  }
  return v;
}
