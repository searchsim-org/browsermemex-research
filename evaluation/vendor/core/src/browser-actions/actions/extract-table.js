import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "extract_table",
  displayName: "Extract table",
  category: "extraction",
  description:
    "Extract a tabular structure from the page into rows + columns. Works on " +
    "<table> elements, ARIA grids, and structured div-based pseudo-tables.",
  capability: CAPABILITY.READ_ONLY,
  inputs: [
    { name: "selector", type: PARAM_TYPE.SELECTOR, required: true, description: "Selector for the table root" },
    {
      name: "columns",
      type: PARAM_TYPE.ARRAY,
      required: false,
      description: "Optional list of column header names to keep (others dropped)",
    },
    {
      name: "max_rows",
      type: PARAM_TYPE.NUMBER,
      required: false,
      defaultValue: 1000,
      description: "Truncate after N rows",
    },
  ],
  outputs: [
    { name: "headers", type: PARAM_TYPE.ARRAY },
    { name: "rows", type: PARAM_TYPE.ARRAY },
  ],
  mcpTools: ["extract_table", "read_page"],
});
