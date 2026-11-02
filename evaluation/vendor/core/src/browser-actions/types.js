/**
 * Browser actions library — types.
 *
 * An ActionDescriptor describes a reusable web action (click, fill_form,
 * extract_table, etc.) that can be invoked as a step in a Skill or directly
 * by an agent. The descriptor declares:
 *
 *   - Identity (id, displayName, vendor agnostic)
 *   - Input schema (parameter shape with validators)
 *   - Output schema (what the caller can expect back)
 *   - Capability annotation per ADR 0003
 *   - The MCP tool name(s) that fulfill this action when dispatched —
 *     so the registry stays one layer removed from agent implementations
 *
 * Actions are PURE METADATA. They don't execute. The dispatcher reads the
 * descriptor and translates an invocation into the right MCP tool call.
 * This means a skill that says "click the Submit button" works on any
 * agent that supports the underlying `click` MCP tool.
 */

import { CAPABILITY } from "../security/capability.js";

export const PARAM_TYPE = Object.freeze({
  STRING: "string",
  NUMBER: "number",
  BOOLEAN: "boolean",
  URL: "url",
  SELECTOR: "selector", // CSS / XPath / accessibility ref
  OBJECT: "object",
  ARRAY: "array",
});

/**
 * @typedef {Object} ActionParam
 * @property {string} name
 * @property {keyof PARAM_TYPE} type
 * @property {boolean} [required=true]
 * @property {string} [description]
 * @property {*} [defaultValue]
 * @property {string[]} [enum]                — allowed string values
 */

/**
 * @typedef {Object} ActionOutput
 * @property {string} name
 * @property {keyof PARAM_TYPE} type
 * @property {string} [description]
 */

/**
 * @typedef {Object} ActionDescriptor
 * @property {string} id                       — kebab-case unique id
 * @property {string} displayName
 * @property {string} category                 — e.g., "navigation", "form", "extraction"
 * @property {string} [description]
 * @property {string} capability               — capability level (see CAPABILITY)
 * @property {ActionParam[]} inputs
 * @property {ActionOutput[]} [outputs]
 * @property {string[]} mcpTools               — MCP tool names that fulfill this
 * @property {boolean} [destructive]           — convenience flag; true ⇒ capability === DESTRUCTIVE
 */

/** Validate an invocation's params against a descriptor. Throws on missing required / invalid type. */
export function validateInvocation(descriptor, params) {
  if (!descriptor) throw new Error("validateInvocation: descriptor required");
  const supplied = params ?? {};
  for (const input of descriptor.inputs ?? []) {
    const has = Object.prototype.hasOwnProperty.call(supplied, input.name);
    if (input.required !== false && !has && input.defaultValue === undefined) {
      throw new Error(`Action ${descriptor.id}: required param '${input.name}' missing`);
    }
    if (has) {
      const v = supplied[input.name];
      const t = input.type;
      if (!typeMatches(v, t)) {
        throw new Error(
          `Action ${descriptor.id}: param '${input.name}' expected ${t}, got ${typeof v}`
        );
      }
      if (Array.isArray(input.enum) && input.enum.length > 0 && !input.enum.includes(v)) {
        throw new Error(
          `Action ${descriptor.id}: param '${input.name}' must be one of ${input.enum.join(", ")}`
        );
      }
    }
  }
  return true;
}

function typeMatches(value, type) {
  switch (type) {
    case PARAM_TYPE.STRING:
    case PARAM_TYPE.URL:
    case PARAM_TYPE.SELECTOR:
      return typeof value === "string";
    case PARAM_TYPE.NUMBER:
      return typeof value === "number" && Number.isFinite(value);
    case PARAM_TYPE.BOOLEAN:
      return typeof value === "boolean";
    case PARAM_TYPE.OBJECT:
      return value && typeof value === "object" && !Array.isArray(value);
    case PARAM_TYPE.ARRAY:
      return Array.isArray(value);
    default:
      return false;
  }
}

/**
 * Apply defaults from descriptor to a partial params object.
 * Returns a new object with the merged values.
 */
export function applyDefaults(descriptor, params) {
  const out = { ...(params ?? {}) };
  for (const input of descriptor.inputs ?? []) {
    if (input.defaultValue !== undefined && out[input.name] === undefined) {
      out[input.name] = input.defaultValue;
    }
  }
  return out;
}

/** Re-export CAPABILITY for descriptor authoring convenience. */
export { CAPABILITY };
