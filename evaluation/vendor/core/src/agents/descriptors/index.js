/**
 * Agent descriptor registry.
 *
 * Adding a new agent = adding a descriptor file in this directory and adding
 * it to the array below. Nothing else.
 */

import claudeCode from "./claude-code.js";
import cursor from "./cursor.js";
import codex from "./codex.js";
import geminiCli from "./gemini-cli.js";
import vscode from "./vscode.js";
import windsurf from "./windsurf.js";
import cline from "./cline.js";
import rooCode from "./roo-code.js";
import amp from "./amp.js";

export const ALL_AGENTS = Object.freeze([
  claudeCode,
  cursor,
  codex,
  geminiCli,
  vscode,
  windsurf,
  cline,
  rooCode,
  amp,
]);

/** Look up a descriptor by id. Returns undefined if not registered. */
export function getAgent(id) {
  return ALL_AGENTS.find((a) => a.id === id);
}
