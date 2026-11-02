/**
 * Side panel adapter.
 *
 * Chrome exposes `chrome.sidePanel` (MV3). Firefox exposes `browser.sidebarAction`.
 * Neither polyfills the other. This module picks the right one at runtime so the
 * rest of the codebase can call `openPanel()` / `closePanel()` regardless.
 *
 * See: docs/adr/0004-cross-browser-polyfill.md
 */

/* global chrome */

/**
 * @returns {'chrome' | 'firefox' | 'unsupported'}
 */
function detect() {
  if (typeof chrome !== "undefined" && chrome.sidePanel) return "chrome";
  if (typeof browser !== "undefined" && browser.sidebarAction) return "firefox";
  return "unsupported";
}

export function isPanelSupported() {
  return detect() !== "unsupported";
}

/**
 * Open the side panel / sidebar for the current window.
 * @param {number} [windowId]
 */
export async function openPanel(windowId) {
  const flavor = detect();
  if (flavor === "chrome") {
    await chrome.sidePanel.open({ windowId });
    return;
  }
  if (flavor === "firefox") {
    // eslint-disable-next-line no-undef
    await browser.sidebarAction.open();
    return;
  }
  throw new Error("Side panel not supported in this browser");
}

/**
 * Close the side panel / sidebar.
 */
export async function closePanel() {
  const flavor = detect();
  if (flavor === "chrome") {
    // Chrome MV3 doesn't expose a programmatic close; setOptions to disabled
    // is the closest. We document this limitation.
    return;
  }
  if (flavor === "firefox") {
    // eslint-disable-next-line no-undef
    await browser.sidebarAction.close();
    return;
  }
  throw new Error("Side panel not supported in this browser");
}
