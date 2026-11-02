/**
 * Domain validity policies — default validity windows for facts extracted
 * from common web application types.
 *
 * Patterned after the table in ADR 0005 and `docs/dev/memory-architecture.md`:
 *
 *   Real-time metric dashboard   → 1 hour
 *   Issue / ticket status        → 24 hours
 *   Project metadata             → 7 days
 *   Personnel / org data         → 30 days
 *   Static reference content     → 90 days
 *
 * The classifier picks a policy by hostname pattern. The user can override
 * per-domain in settings (Phase 7 work; default policy lookup is here).
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const VALIDITY_PRESET = Object.freeze({
  DASHBOARD: { name: "dashboard", durationMs: 1 * HOUR },
  TICKET: { name: "ticket", durationMs: 24 * HOUR },
  PROJECT_METADATA: { name: "project_metadata", durationMs: 7 * DAY },
  PERSONNEL: { name: "personnel", durationMs: 30 * DAY },
  STATIC_REFERENCE: { name: "static_reference", durationMs: 90 * DAY },
  UNKNOWN: { name: "unknown", durationMs: 7 * DAY }, // conservative middle ground
});

/**
 * Patterns are evaluated in order. The first match wins. Patterns are
 * exact-host or trailing-domain matches (suffix-based).
 *
 * `host.endsWith(pattern)` is the check, so `atlassian.net` matches
 * `acme.atlassian.net`, `foo.atlassian.net`, etc.
 */
const PATTERNS = [
  // Dashboards / metrics
  { match: "grafana.net", preset: VALIDITY_PRESET.DASHBOARD },
  { match: "datadoghq.com", preset: VALIDITY_PRESET.DASHBOARD },
  { match: "newrelic.com", preset: VALIDITY_PRESET.DASHBOARD },
  { match: ".grafana.", preset: VALIDITY_PRESET.DASHBOARD },

  // Issue trackers
  { match: ".atlassian.net", preset: VALIDITY_PRESET.TICKET },
  { match: "linear.app", preset: VALIDITY_PRESET.TICKET },
  { match: "asana.com", preset: VALIDITY_PRESET.TICKET },

  // Repos / project metadata
  { match: "github.com", preset: VALIDITY_PRESET.PROJECT_METADATA },
  { match: "gitlab.com", preset: VALIDITY_PRESET.PROJECT_METADATA },
  { match: "bitbucket.org", preset: VALIDITY_PRESET.PROJECT_METADATA },

  // Personnel / HR
  { match: ".workday.com", preset: VALIDITY_PRESET.PERSONNEL },
  { match: ".bamboohr.com", preset: VALIDITY_PRESET.PERSONNEL },
  { match: ".gusto.com", preset: VALIDITY_PRESET.PERSONNEL },

  // Wikis / docs (long-lived but not forever)
  { match: "wikipedia.org", preset: VALIDITY_PRESET.STATIC_REFERENCE },
  { match: "notion.so", preset: VALIDITY_PRESET.STATIC_REFERENCE },
  { match: ".confluence.", preset: VALIDITY_PRESET.STATIC_REFERENCE },
];

/**
 * Pick a default validity preset for a hostname. Falls back to UNKNOWN.
 *
 * @param {string} host  — e.g., "acme.atlassian.net"
 */
export function presetForHost(host) {
  if (!host) return VALIDITY_PRESET.UNKNOWN;
  const lower = String(host).toLowerCase();
  for (const { match, preset } of PATTERNS) {
    if (lower.endsWith(match) || lower.includes(match)) return preset;
  }
  return VALIDITY_PRESET.UNKNOWN;
}

/**
 * Pick a preset from a full URL by extracting the hostname.
 */
export function presetForUrl(url) {
  try {
    return presetForHost(new URL(url).hostname);
  } catch {
    return VALIDITY_PRESET.UNKNOWN;
  }
}
