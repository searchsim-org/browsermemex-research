/**
 * Browser actions registry.
 *
 * Adding a new action = adding a descriptor under `actions/` and including
 * it here. Nothing else.
 */

import navigate from "./actions/navigate.js";
import click from "./actions/click.js";
import fillForm from "./actions/fill-form.js";
import submit from "./actions/submit.js";
import readPage from "./actions/read-page.js";
import extractTable from "./actions/extract-table.js";
import download from "./actions/download.js";
import screenshot from "./actions/screenshot.js";

export const ALL_ACTIONS = Object.freeze([
  navigate,
  click,
  fillForm,
  submit,
  readPage,
  extractTable,
  download,
  screenshot,
]);

/** Look up an action by id. Returns undefined if not registered. */
export function getAction(id) {
  return ALL_ACTIONS.find((a) => a.id === id);
}

/** Group actions by category. */
export function actionsByCategory() {
  const out = new Map();
  for (const a of ALL_ACTIONS) {
    if (!out.has(a.category)) out.set(a.category, []);
    out.get(a.category).push(a);
  }
  return out;
}

/** Filter actions by maximum allowed capability level. */
export function actionsAtMost(maxCapability) {
  const order = [
    "read_only",
    "read_with_network",
    "write_local",
    "write_dom",
    "write_network",
    "destructive",
  ];
  const maxIdx = order.indexOf(maxCapability);
  if (maxIdx < 0) return [];
  return ALL_ACTIONS.filter((a) => order.indexOf(a.capability) <= maxIdx);
}
