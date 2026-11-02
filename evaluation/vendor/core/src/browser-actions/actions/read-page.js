import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "read_page",
  displayName: "Read page",
  category: "extraction",
  description:
    "Capture the current page's DOM + accessibility tree, returning each " +
    "interactive element annotated with a stable backendNodeId reference.",
  capability: CAPABILITY.READ_ONLY,
  inputs: [
    {
      name: "viewport_only",
      type: PARAM_TYPE.BOOLEAN,
      required: false,
      defaultValue: false,
      description: "If true, only include elements currently visible in the viewport",
    },
    {
      name: "include_hidden",
      type: PARAM_TYPE.BOOLEAN,
      required: false,
      defaultValue: false,
      description: "If true, include display:none / visibility:hidden elements",
    },
  ],
  outputs: [
    { name: "tree", type: PARAM_TYPE.STRING, description: "Indexed text representation of the page" },
    { name: "url", type: PARAM_TYPE.URL },
    { name: "title", type: PARAM_TYPE.STRING },
  ],
  mcpTools: ["read_page", "browser_read_page"],
});
