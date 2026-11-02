import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "navigate",
  displayName: "Navigate",
  category: "navigation",
  description: "Open a URL in the current or specified tab.",
  capability: CAPABILITY.READ_WITH_NETWORK,
  inputs: [
    { name: "url", type: PARAM_TYPE.URL, required: true, description: "Destination URL" },
    {
      name: "newTab",
      type: PARAM_TYPE.BOOLEAN,
      required: false,
      defaultValue: false,
      description: "Open in a new tab",
    },
  ],
  outputs: [
    { name: "tabId", type: PARAM_TYPE.NUMBER },
    { name: "url", type: PARAM_TYPE.URL },
  ],
  mcpTools: ["navigate", "browser_navigate"],
});
