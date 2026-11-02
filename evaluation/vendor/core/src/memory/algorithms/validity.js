/**
 * Algorithm 1 — Validity Inference, adapted for web-extracted facts.
 *
 * The paper's Algorithm 1 derives the validity interval [t_s, t_e) from three
 * signal sources:
 *   1. Temporal expressions in the source text (e.g., "since 2019")
 *   2. Revision history (Wikipedia-style)
 *   3. Conflict-based tightening (newer functional-relation fact tightens
 *      older fact's t_e)
 *
 * Web UIs rarely contain explicit temporal phrases. We adapt by using:
 *   1. UI-level signals emitted by the extractor (dashboard time ranges,
 *      "updated 2 hours ago" timestamps, sprint deadlines, version banners)
 *   2. Domain-specific defaults by hostname (see domain-policies.js)
 *   3. Conflict-based tightening — unchanged from the paper, applied by the
 *      conflict-detection step (algorithms/conflicts.js)
 *
 * This module covers (1) and (2). Conflict-based tightening lives in
 * algorithms/conflicts.js where it belongs.
 *
 * See ADR 0005 and:
 *   "NuggetIndex: Governed Atomic Retrieval for Maintainable RAG"
 *   https://arxiv.org/html/2604.27306v1
 */

import { presetForUrl, VALIDITY_PRESET } from "../domain-policies.js";

/** Signal types the extractor can emit. */
export const UI_SIGNAL = Object.freeze({
  /** "Updated 2 hours ago" — observed at extractedAt. Fact was true as of extractedAt - secondsAgo. */
  LAST_UPDATED: "last_updated",
  /** Dashboard time-range selector ("Last 7 days"). Provides explicit start, optionally end. */
  TIME_RANGE: "time_range",
  /** A discrete event with a known date (sprint deadline, release date). */
  EVENT_DATE: "event_date",
  /** Version banner ("v2.3.1 — March 15, 2026"). */
  VERSION_BANNER: "version_banner",
  /** Explicit start without end ("since 2019", "active from Jan 1"). */
  SINCE: "since",
  /** Explicit end ("until 2024", "expires Dec 31"). */
  UNTIL: "until",
});

/**
 * @typedef {Object} UiSignal
 * @property {keyof UI_SIGNAL} kind
 * @property {number} [secondsAgo]   for LAST_UPDATED
 * @property {number} [startMs]      for TIME_RANGE / SINCE / VERSION_BANNER
 * @property {number} [endMs]        for TIME_RANGE / UNTIL
 * @property {number} [dateMs]       for EVENT_DATE
 * @property {string} [label]        free-text label (e.g., the version string)
 */

/**
 * @typedef {Object} ValidityInput
 * @property {number} extractedAt           — Unix ms when the agent observed the fact
 * @property {string} sourceUrl             — full URL used for domain policy
 * @property {UiSignal[]} [uiSignals]       — parsed UI signals from the page
 * @property {Object} [override]            — explicit overrides from caller
 * @property {number} [override.start]
 * @property {number|null} [override.end]
 */

const HOUR = 60 * 60 * 1000;

/**
 * Pure function: produce a Validity { start, end } object from the raw inputs.
 *
 * Resolution order (highest precedence first):
 *   1. Caller-provided `override` (e.g., from a user-defined per-domain rule)
 *   2. SINCE / UNTIL signals (explicit start / end)
 *   3. TIME_RANGE signal (start + end together)
 *   4. VERSION_BANNER / EVENT_DATE (treat date as start; end via domain default)
 *   5. LAST_UPDATED (extractedAt - secondsAgo as start; end via domain default)
 *   6. Default: extractedAt as start, end via domain preset
 *
 * `scope`, `location`, `sourceType` are stamped onto the returned object so
 * downstream consumers know where this validity decision came from.
 */
export function inferValidity({
  extractedAt,
  sourceUrl,
  uiSignals = [],
  override,
}) {
  if (!Number.isFinite(extractedAt)) {
    throw new Error("inferValidity: extractedAt must be a finite number (Unix ms)");
  }

  const preset = presetForUrl(sourceUrl);
  const location = safeHost(sourceUrl);

  // (1) explicit caller override wins
  if (override && Number.isFinite(override.start)) {
    return {
      start: override.start,
      end: override.end === undefined ? defaultEnd(override.start, preset) : override.end,
      sourceType: preset.name,
      location,
    };
  }

  // (2) explicit SINCE / UNTIL
  const since = uiSignals.find((s) => s.kind === UI_SIGNAL.SINCE);
  const until = uiSignals.find((s) => s.kind === UI_SIGNAL.UNTIL);
  if (since || until) {
    const start = since ? Number(since.startMs) : extractedAt;
    const end = until ? Number(until.endMs) : defaultEnd(start, preset);
    return { start, end, sourceType: preset.name, location };
  }

  // (3) TIME_RANGE
  const range = uiSignals.find((s) => s.kind === UI_SIGNAL.TIME_RANGE);
  if (range && Number.isFinite(range.startMs)) {
    const end = Number.isFinite(range.endMs) ? range.endMs : defaultEnd(range.startMs, preset);
    return { start: range.startMs, end, sourceType: preset.name, location };
  }

  // (4) VERSION_BANNER or EVENT_DATE
  const version = uiSignals.find((s) => s.kind === UI_SIGNAL.VERSION_BANNER);
  if (version && Number.isFinite(version.startMs)) {
    return {
      start: version.startMs,
      end: defaultEnd(version.startMs, preset),
      sourceType: preset.name,
      location,
    };
  }
  const eventDate = uiSignals.find((s) => s.kind === UI_SIGNAL.EVENT_DATE);
  if (eventDate && Number.isFinite(eventDate.dateMs)) {
    return {
      start: eventDate.dateMs,
      end: defaultEnd(eventDate.dateMs, preset),
      sourceType: preset.name,
      location,
    };
  }

  // (5) LAST_UPDATED — "updated 2 hours ago" anchors start to (extractedAt - 2h)
  const lastUpdated = uiSignals.find((s) => s.kind === UI_SIGNAL.LAST_UPDATED);
  if (lastUpdated && Number.isFinite(lastUpdated.secondsAgo)) {
    const start = extractedAt - lastUpdated.secondsAgo * 1000;
    return { start, end: defaultEnd(start, preset), sourceType: preset.name, location };
  }

  // (6) default — extractedAt as start, end via domain preset
  return {
    start: extractedAt,
    end: defaultEnd(extractedAt, preset),
    sourceType: preset.name,
    location,
  };
}

function defaultEnd(start, preset) {
  if (preset === VALIDITY_PRESET.UNKNOWN) {
    // Unknown sources get the UNKNOWN preset's duration
    return start + VALIDITY_PRESET.UNKNOWN.durationMs;
  }
  return start + preset.durationMs;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
