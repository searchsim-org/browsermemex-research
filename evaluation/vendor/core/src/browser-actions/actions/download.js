import { CAPABILITY, PARAM_TYPE } from "../types.js";

export default Object.freeze({
  id: "download",
  displayName: "Download file",
  category: "io",
  description:
    "Download a file (typically by clicking a download trigger or fetching a URL " +
    "with the user's authenticated session).",
  capability: CAPABILITY.WRITE_LOCAL,
  inputs: [
    { name: "url", type: PARAM_TYPE.URL, required: true },
    { name: "filename", type: PARAM_TYPE.STRING, required: false },
  ],
  outputs: [
    { name: "savedPath", type: PARAM_TYPE.STRING },
    { name: "bytes", type: PARAM_TYPE.NUMBER },
  ],
  mcpTools: ["download", "file_download"],
});
