/**
 * @browser-memex/core/tab-context — cross-tab context collection.
 *
 * The pure filter logic lives here. The browser-side collector that calls
 * `browser.tabs.query()` lives in the extension package.
 */

export {
  filterTabs,
  redactCredentials,
  isHostBlocked,
  isInternalUrl,
} from "./types.js";
