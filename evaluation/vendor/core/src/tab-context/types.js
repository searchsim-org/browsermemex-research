/**
 * Cross-tab context awareness.
 *
 * When the user creates a task with "include my open tabs as context", the
 * extension collects the currently-open tabs (across all windows except
 * incognito by default) and attaches them to `task.payload.openTabs`.
 *
 * Privacy is layered:
 *   1. Incognito tabs are never included unless explicitly opted in
 *   2. Blocked hosts (from the user's settings) are filtered out
 *   3. URLs with credentials in them (basic-auth `user:pw@host`) are
 *      stripped of those credentials
 *   4. Internal browser URLs (chrome://, about:, edge://) are filtered out
 *
 * The pure filter logic lives here; the actual `chrome.tabs.query()` call
 * lives in the extension package (which has access to the WebExtension API).
 */

/**
 * @typedef {Object} TabSummary
 * @property {number} tabId
 * @property {number} windowId
 * @property {string} url
 * @property {string} title
 * @property {boolean} active
 * @property {boolean} pinned
 * @property {boolean} incognito
 */

/**
 * @typedef {Object} TabContextFilterOpts
 * @property {boolean} [includeIncognito=false]
 * @property {string[]} [blockedHosts=[]]       — exact host match (lowercased)
 *                                                 also matches subdomains:
 *                                                 'bank.example.com' blocks
 *                                                 'login.bank.example.com'
 * @property {number} [maxTabs=50]              — hard cap to avoid blowing the prompt
 */

/**
 * Strip user:password@ from a URL. Returns the original string if parsing fails.
 */
export function redactCredentials(url) {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/**
 * Check if a URL's host matches (or is a subdomain of) any blocked host.
 */
export function isHostBlocked(url, blockedHosts) {
  if (!Array.isArray(blockedHosts) || blockedHosts.length === 0) return false;
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return blockedHosts.some((h) => {
    const blocked = String(h).toLowerCase().trim();
    if (!blocked) return false;
    return host === blocked || host.endsWith(`.${blocked}`);
  });
}

/** Internal browser URLs we never include in context. */
const INTERNAL_PROTOCOLS = new Set(["chrome:", "edge:", "about:", "view-source:", "moz-extension:", "chrome-extension:"]);

export function isInternalUrl(url) {
  try {
    const proto = new URL(url).protocol;
    return INTERNAL_PROTOCOLS.has(proto);
  } catch {
    return true; // unparseable → not safe to include
  }
}

/**
 * Pure filter: given a raw list of tabs (matching browser.tabs.query()
 * output) and options, returns a sanitized TabSummary[] in deterministic
 * order (windowId asc, then index asc within window).
 */
export function filterTabs(rawTabs, opts = {}) {
  const includeIncognito = Boolean(opts.includeIncognito);
  const blockedHosts = Array.isArray(opts.blockedHosts) ? opts.blockedHosts : [];
  const maxTabs = Number.isFinite(opts.maxTabs) && opts.maxTabs > 0 ? opts.maxTabs : 50;

  const filtered = [];
  for (const t of rawTabs ?? []) {
    if (!t || typeof t.url !== "string") continue;
    if (!includeIncognito && t.incognito) continue;
    if (isInternalUrl(t.url)) continue;
    if (isHostBlocked(t.url, blockedHosts)) continue;
    filtered.push({
      tabId: t.id ?? t.tabId,
      windowId: t.windowId ?? 0,
      url: redactCredentials(t.url),
      title: typeof t.title === "string" ? t.title : "",
      active: Boolean(t.active),
      pinned: Boolean(t.pinned),
      incognito: Boolean(t.incognito),
    });
  }

  // Stable, deterministic order: by windowId then by tabId
  filtered.sort((a, b) => {
    if (a.windowId !== b.windowId) return a.windowId - b.windowId;
    return a.tabId - b.tabId;
  });

  return filtered.slice(0, maxTabs);
}
