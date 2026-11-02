/**
 * MCP config installer.
 *
 * Generates the server-entry snippet for a given descriptor and merges it
 * into the agent's existing MCP config file. The IO is injected — pure
 * logic here, Node-side wrapper handles actual disk writes.
 *
 * Supports two formats:
 *   - JSON / JSONC: read existing file, parse, merge under serversKey, write back
 *   - TOML (Codex CLI): append/replace the [mcp_servers.<name>] table
 *
 * Atomic write: caller writes to a temp file and renames. This module only
 * produces the new file contents.
 */

import { MCP_CONFIG_FORMAT } from "./types.js";

/**
 * Build the MCP server entry for BrowserMemex.
 *
 * @param {object} options
 * @param {string} options.command — typically 'node' or 'npx'
 * @param {string[]} options.args  — args to pass
 * @param {Record<string,string>} [options.env]
 * @returns {object}
 */
export function buildServerEntry({ command, args, env }) {
  const entry = { command, args: [...args] };
  if (env && Object.keys(env).length > 0) entry.env = { ...env };
  return entry;
}

/**
 * Merge a server entry into an existing JSON-config string. Handles JSONC
 * (JSON with comments) tolerantly: comments and trailing commas are stripped
 * for parsing but the rewrite emits clean JSON.
 *
 * @param {string|null} existingText — current file contents, or null if absent
 * @param {object} descriptor
 * @param {string} serverName — entry name, e.g., 'browser-memex'
 * @param {object} serverEntry
 * @returns {string} new file contents
 */
export function mergeJsonConfig(existingText, descriptor, serverName, serverEntry) {
  const serversKey = descriptor.mcpConfig.serversKey ?? "mcpServers";

  let parsed = {};
  if (existingText && existingText.trim().length > 0) {
    try {
      parsed = JSON.parse(stripJsonc(existingText));
    } catch (e) {
      throw new Error(
        `Cannot install MCP config for ${descriptor.id}: existing file is not valid JSON/JSONC (${e.message}).`
      );
    }
  }

  // Dotted serversKey is treated as a literal flat key (VS Code convention,
  // used by Amp's `amp.mcpServers`). Most agents use a plain key like
  // `mcpServers` so this is a no-op for them.
  const existing = parsed[serversKey];
  parsed[serversKey] = {
    ...(existing && typeof existing === "object" ? existing : {}),
    [serverName]: serverEntry,
  };

  return JSON.stringify(parsed, null, 2) + "\n";
}

/**
 * Merge a server entry into a TOML config file (for Codex CLI).
 *
 * We preserve existing content by:
 *   - Reading the file as text
 *   - If a [mcp_servers.<name>] table already exists, replacing it
 *   - Otherwise appending a new table at the end
 *
 * We do NOT do a full TOML round-trip parse (which would lose comments) —
 * we operate on the text surface for predictable, comment-preserving edits.
 */
export function mergeTomlConfig(existingText, descriptor, serverName, serverEntry) {
  const prefix = descriptor.mcpConfig.tomlTablePrefix ?? "mcp_servers";
  const tableHeader = `[${prefix}.${serverName}]`;

  const tomlBody = serializeTomlTable(serverEntry);
  const newTable = `${tableHeader}\n${tomlBody}\n`;

  if (!existingText || existingText.trim().length === 0) {
    return newTable;
  }

  const lines = existingText.split("\n");
  let startIdx = -1;
  let endIdx = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === tableHeader) {
      startIdx = i;
      // find end of this table — until next [...] header or EOF
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*\[[^\]]+\]\s*$/.test(lines[j])) {
          endIdx = j;
          break;
        }
      }
      break;
    }
  }

  let out;
  if (startIdx === -1) {
    // Append, with a blank line separator
    const trailingNewline = existingText.endsWith("\n") ? "" : "\n";
    out = existingText + trailingNewline + "\n" + newTable;
  } else {
    out = [
      ...lines.slice(0, startIdx),
      tableHeader,
      tomlBody,
      ...lines.slice(endIdx),
    ].join("\n");
  }
  return out.endsWith("\n") ? out : out + "\n";
}

/**
 * Top-level entry point — dispatches to the right format.
 */
export function mergeConfig(existingText, descriptor, serverName, serverEntry) {
  switch (descriptor.mcpConfig.format) {
    case MCP_CONFIG_FORMAT.JSON:
      return mergeJsonConfig(existingText, descriptor, serverName, serverEntry);
    case MCP_CONFIG_FORMAT.TOML:
      return mergeTomlConfig(existingText, descriptor, serverName, serverEntry);
    default:
      throw new Error(`Unsupported MCP config format: ${descriptor.mcpConfig.format}`);
  }
}

// ===== helpers =====

function stripJsonc(text) {
  // Strip // line comments and /* ... */ block comments. Conservative — leaves
  // strings alone by tracking double-quote state.
  let out = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      i++;
      continue;
    }
    if (c === '"') {
      out += c;
      inString = true;
      i++;
      continue;
    }
    if (c === "/" && next === "/") {
      // skip to EOL
      while (i < text.length && text[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < text.length - 1 && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  // Strip trailing commas before } or ]
  return out.replace(/,(\s*[}\]])/g, "$1");
}

function tomlQuote(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function serializeTomlTable(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      lines.push(`${k} = ${tomlQuote(v)}`);
    } else if (Array.isArray(v)) {
      const arr = v.map((x) => (typeof x === "string" ? tomlQuote(x) : JSON.stringify(x))).join(", ");
      lines.push(`${k} = [${arr}]`);
    } else if (v && typeof v === "object") {
      // Inline tables for env-like nested object
      const inline = Object.entries(v)
        .map(([ik, iv]) => `${ik} = ${typeof iv === "string" ? tomlQuote(iv) : JSON.stringify(iv)}`)
        .join(", ");
      lines.push(`${k} = { ${inline} }`);
    } else {
      lines.push(`${k} = ${JSON.stringify(v)}`);
    }
  }
  return lines.join("\n");
}
