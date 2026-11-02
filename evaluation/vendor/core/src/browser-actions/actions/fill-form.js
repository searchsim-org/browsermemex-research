import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "fill_form",
  displayName: "Fill form",
  category: "form",
  description:
    "Fill multiple form fields in one call. Handles native inputs, React Select, MUI, " +
    "and other complex widgets via the underlying form_input MCP tool.",
  capability: CAPABILITY.WRITE_DOM,
  inputs: [
    {
      name: "fields",
      type: PARAM_TYPE.OBJECT,
      required: true,
      description:
        "Map of { selector: value } pairs. Selector resolves via the same rules as `click`.",
    },
    {
      name: "submitAfter",
      type: PARAM_TYPE.BOOLEAN,
      required: false,
      defaultValue: false,
      description: "Submit the form after filling",
    },
  ],
  outputs: [
    { name: "filled", type: PARAM_TYPE.ARRAY, description: "Selectors that were successfully filled" },
    { name: "failed", type: PARAM_TYPE.ARRAY, description: "Selectors that did not match anything" },
  ],
  mcpTools: ["form_input", "fill_form"],
});
