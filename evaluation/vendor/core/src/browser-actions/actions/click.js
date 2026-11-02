import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "click",
  displayName: "Click element",
  category: "interaction",
  description:
    "Click on an element identified by accessibility ref, CSS selector, or DOM backendNodeId.",
  capability: CAPABILITY.WRITE_DOM,
  inputs: [
    {
      name: "selector",
      type: PARAM_TYPE.SELECTOR,
      required: true,
      description: "CSS selector, ARIA ref, or backendNodeId (numeric string)",
    },
    {
      name: "modifiers",
      type: PARAM_TYPE.ARRAY,
      required: false,
      defaultValue: [],
      description: "Optional modifier keys: ['shift', 'ctrl', 'alt', 'meta']",
    },
  ],
  outputs: [{ name: "clicked", type: PARAM_TYPE.BOOLEAN }],
  mcpTools: ["click", "computer.click", "browser_click"],
});
