# Isolated candidate browser regression

This addendum extends the offline regression to the actual extension loaded in a fresh, disposable Chromium profile. It does not automate, reload or inspect the user's Chrome profile. The original installed-extension three-write failure remains a separate record.

## Environment and isolation

Use the existing official Playwright 1.60.0 installation and its matching bundled Chromium revision 1223, engine 148.0.7778.96. Playwright's official extension documentation specifies a persistent context and the `chromium` channel for headless extension testing: https://playwright.dev/docs/chrome-extensions . No page actions, worker evaluation, manual CDP commands, internal-page inspection or model calls are used. Test interaction occurs through the extension's ordinary MCP relay requests.

The test build differs from the production candidate in two configuration fields: its default relay port is 7863 instead of 7862, and its manifest omits `nativeMessaging`. The latter prevents startup inbox polling from accessing any machine-level native host. Both differences are preserved as patches. The user-installed extension and research relay on port 7862 remain untouched.

The extension boots its actual profile and SQLite services. The harness waits up to 180 seconds for the ordinary two-minute reconnect alarm to register it with the isolated loopback relay. No fixture services or profile data are injected into the browser. The profile is created with `mkdtemp`, never reused, and has no configured authentication.

## Requests and success criteria

Client A and client B are separate Node MCP SDK processes, each with a separate stdio server process. Client A writes three unique synthetic subject/value facts using `memory_write` and then exits. Only afterward does client B start and issue three `memory_query` requests. Success requires all writes to return a nugget ID without error, all three reads to return exact expected subjects and values, and each returned nugget's provenance array to name writer `research-client-a`.

The assertion is not weakened when values pass but provenance is missing. The first browser candidate exposed precisely this transport-contract gap. Its complete result is preserved as `pre-provenance-fix.json`. The repair hydrates provenance only after the core query has applied profile filtering, using the IDs of the returned records and the existing `NuggetStore.provenance(id)` method. The underlying core and frozen experimental vendor remain unchanged.

## Causal dynamic-import control

An optional isolated control restores the dynamic capture import while retaining the same Chromium engine, safety manifest, relay port, query provenance hydration and other working source. Its source difference from the fixed test build is recorded in `dynamic-import-control.patch`. Run it in another fresh profile, sequentially after the fixed run, and preserve its output separately. This isolates the static capture change from engine differences; it is not a pristine upstream release or a new autonomous-agent evaluation.

## Reproduction

```sh
node evaluation/connector-fix/browser-regression/run.mjs /private/tmp/browsermemex-connector-browser-stage
node evaluation/connector-fix/browser-regression/run.mjs /private/tmp/browsermemex-connector-browser-dynamic-baseline
```

Run the variants sequentially because each uses isolated relay port 7863. Preserve `results.json`, `fixture.json` and `relay.log` under variant-specific names after each run. The harness records engine, source/worker/manifest hashes, startup time, raw SDK responses and process exit codes. `initial-relay-permission-failure.json` and `.log` preserve the initial sandbox bind failure; that run never launched Chromium and is not an extension result.

Candidate-source building, browser execution and observed installed-extension behavior have separate provenance. Neither success in this fresh profile nor the SDK process handoff establishes named autonomous-runtime interoperability, long-term persistence or successful reload of the user's installed extension.
