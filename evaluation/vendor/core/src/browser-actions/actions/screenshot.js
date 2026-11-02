import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "screenshot",
  displayName: "Screenshot",
  category: "io",
  description: "Capture a screenshot of the current viewport or a specific element.",
  capability: CAPABILITY.READ_ONLY,
  inputs: [
    {
      name: "selector",
      type: PARAM_TYPE.SELECTOR,
      required: false,
      description: "If provided, screenshot just this element; otherwise full viewport",
    },
    {
      name: "full_page",
      type: PARAM_TYPE.BOOLEAN,
      required: false,
      defaultValue: false,
      description: "Capture the entire scrollable page (not just the viewport)",
    },
  ],
  outputs: [
    { name: "imageBase64", type: PARAM_TYPE.STRING },
    { name: "hash", type: PARAM_TYPE.STRING, description: "SHA-256 of the bytes for provenance" },
  ],
  mcpTools: ["screenshot", "browser_screenshot"],
});
