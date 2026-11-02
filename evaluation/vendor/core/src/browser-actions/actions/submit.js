import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "submit",
  displayName: "Submit form",
  category: "form",
  description:
    "Submit a form. Marked write_network because submissions typically POST. " +
    "Capability annotation requires user confirmation per ADR 0003 default policy.",
  capability: CAPABILITY.WRITE_NETWORK,
  inputs: [
    { name: "selector", type: PARAM_TYPE.SELECTOR, required: false, description: "Optional form selector" },
  ],
  outputs: [{ name: "submitted", type: PARAM_TYPE.BOOLEAN }],
  mcpTools: ["submit", "form_submit"],
});
