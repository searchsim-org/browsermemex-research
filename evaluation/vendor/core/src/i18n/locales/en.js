/**
 * English locale (Phase 7.5).
 *
 * Keys are dotted paths. Placeholders use `{name}` syntax. Keep this file
 * the source of truth for English strings — other locales mirror its shape.
 */

export default Object.freeze({
  app: {
    title: "BrowserMemex",
    tagline: "Persistent agent memory + skills + scheduling, in your browser.",
  },
  tabs: {
    chat: "Chat",
    tasks: "Tasks",
    memory: "Memory",
    skills: "Skills",
    agents: "Agents",
    registry: "Registry",
    settings: "Settings",
  },
  tasks: {
    newTask: "+ New task",
    empty: "No tasks yet. Use “+ New task” above to schedule one.",
    detail: {
      back: "← Back",
      kind: "Kind",
      status: "Status",
      runs: "Runs",
      created: "Created",
      nextRun: "Next run",
      runHistory: "Run history",
      trackerSamples: "Tracker samples",
    },
    form: {
      title: "Title",
      description: "Description / instruction",
      url: "URL",
      kind: "Kind",
      intervalHours: "Every N hours",
      capability: "Capability",
      includeOpenTabs: "Include my open tabs as context",
      includeOpenTabsHint:
        "Sends a sanitized list of currently-open tabs (incognito and blocked-host tabs excluded; URL credentials stripped)",
      cancel: "Cancel",
      create: "Create",
      creating: "Creating…",
    },
  },
  memory: {
    title: "Memory",
    searchPlaceholder: "Search facts…",
    viewActive: "Active only",
    viewActivePlusContested: "Include contested",
    search: "Search",
    emptyDefault: "Type a query and press Search.",
    emptyNoMatch: "No matching nuggets.",
    score: "score",
  },
  skills: {
    newSkill: "+ New skill",
    empty: "No skills yet.",
    importHeader: "Import from clipboard",
    importPlaceholder: 'Paste a "browser-memex.skill.v1" envelope here',
    import: "Import",
    export: "Export",
    archive: "Archive",
    unarchive: "Unarchive",
    delete: "Delete",
    deleteConfirm: 'Delete skill "{name}"?',
  },
  agents: {
    title: "Agents",
    refresh: "Refresh",
    hint: "Detection runs via the MCP server. Install BrowserMemex with `llm-browser agents install <id>`.",
    installed: "installed",
    configured: "configured",
    notDetected: "not detected",
  },
  registry: {
    title: "MCP Server Registry",
    hint:
      "Curated catalog of MCP servers your connected agents can use. Click “Copy config” and paste the snippet into your agent's mcpServers map.",
    filterPlaceholder: "Filter servers…",
    allTags: "All tags",
    copyConfig: "Copy config",
    copied: "Copied ✓",
    showJson: "Show JSON",
    hideJson: "Hide",
    docs: "Docs",
    requires: "⚠ Requires env vars:",
    official: "official",
  },
  settings: {
    title: "Settings",
    routingPolicy: "Routing policy",
    routingPolicyHint:
      "Edit the Router policy as JSON. Format: { rules, fallback, overrides?, llmFallbackEnabled? }",
    reset: "Reset",
    savePolicy: "Save policy",
    privacy: "Privacy",
    captureMemory: "Capture memory while agents browse",
    disabledDomains:
      "Disabled domains (one per line) — memory is never captured on these hosts",
    savePrivacy: "Save privacy",
    diagnostics: "Diagnostics",
    diagnosticsHint:
      "See docs/dev/ for storage layer details. To export a diagnostic bundle, use `llm-browser logs <session_id>` from the MCP server CLI.",
    saved: "Saved. Will apply on next service-worker reload.",
    privacySaved: "Privacy settings saved.",
    appearance: "Appearance",
    theme: "Theme",
    themeAuto: "Match system",
    themeLight: "Light",
    themeDark: "Dark",
  },
  profile: {
    switch: "Switch profile",
    newProfile: "+ New profile",
    manage: "Manage profiles…",
    promptName: "New profile name",
    loading: "Loading profiles…",
  },
  onboarding: {
    welcome: "Welcome to BrowserMemex",
    intro:
      "BrowserMemex gives your AI coding agents a persistent home in the browser — memory that survives sessions, skills they can reuse, and tasks that run when you're not looking.",
    step1: "Pick the agents you have installed",
    step2: "Tell BrowserMemex which sites it can act on",
    step3: "Optionally turn on memory capture",
    skip: "Skip",
    finish: "Finish setup",
    back: "Back",
    next: "Next",
  },
  popup: {
    quickTask: "Quick task",
    openPanel: "Open side panel",
    placeholder: "What should the agent do?",
    send: "Send",
  },
  common: {
    loading: "Loading…",
    error: "Error",
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
  },
});
