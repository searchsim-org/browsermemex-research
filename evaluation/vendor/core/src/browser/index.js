/**
 * Cross-browser WebExtension API adapter.
 *
 * Re-exports the `browser` global from `webextension-polyfill`. All code in
 * `@browser-memex/*` packages should import from here, never call `chrome.*`
 * directly.
 *
 * See: docs/adr/0004-cross-browser-polyfill.md
 */

// Polyfill is shipped as the extension's runtime dep, not core's, to avoid
// pulling it into Node-only consumers (mcp-server). We accept the polyfill
// being undefined here when running outside a browser context.
let browser;

try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  browser = (await import("webextension-polyfill")).default;
} catch {
  // Outside a browser extension context (Node, tests). Provide a sentinel
  // that throws on access so misuse is loud, not silent.
  browser = new Proxy(
    {},
    {
      get(_t, prop) {
        throw new Error(
          `@browser-memex/core/browser: '${String(
            prop
          )}' accessed outside a browser-extension context. ` +
            `If you're testing, mock the browser module. If this is a Node-only consumer, do not import this module.`
        );
      },
    }
  );
}

export { browser };
export default browser;

export { openPanel, closePanel, isPanelSupported } from "./side-panel.js";
