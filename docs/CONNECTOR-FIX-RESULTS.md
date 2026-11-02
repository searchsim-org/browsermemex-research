# Connector memory-write fix: candidate build and offline regression

Status: **candidate verified offline and in a fresh-profile headless Chromium extension test; the user-installed extension retains its original recorded write failures and was not reloaded.** No user browser UI, manual CDP, internal-page inspection, credentials, private profile queries or model calls were used.

The authoritative original connector attempt is retained in `evaluation/results/cross-client-sdk-results.json`. Its three failed writes remain unchanged. Separate offline and fresh-browser successes below must not be substituted for those original installed-extension results.

## Cause supported by source and emitted code

The public built worker's `memory.write` branch dynamically imports `chunks/nugget-memory-CJE49jLy.js`. That chunk statically imports only `../service-worker.js`; it does **not** import the sidepanel UI entry. Thus the initially suspected sidepanel import was not supported by inspection.

The worker's Vite-generated `__vitePreload` wrapper catches a rejected import and calls `window.dispatchEvent(...)` to announce the error. `window` does not exist in an MV3 service worker, so this error handler masks the underlying rejection with `window is not defined`. The regression reproduces this masking directly from the original emitted helper in a DOM-free VM.

Chrome's [extension service-worker documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics#import_scripts) states that dynamic `import()` is unsupported in extension service workers; static imports are supported for module workers. The emitted dynamic memory import violates this documented constraint. We have not captured the unmasked exception from the installed worker, so describe that underlying cause as the source/build diagnosis, rather than a captured installed stack trace.

## Minimal change

`evaluation/connector-fix/static-memory-capture.patch` adds a static `captureFact` import in `packages/extension/src/background/modules/mcp-bridge.js` and removes the `await import('./nugget-memory.js')` inside the write branch. The existing privacy-enforcing capture function remains the write path: the fix does not bypass disabled-memory, blocked-domain or URL-redaction policy.

A second change hydrates each returned query hit with `NuggetStore.provenance(id)` only after the actual query has applied profile filtering. The first fresh-browser candidate wrote and retrieved the right values but omitted the provenance array, failing the original strict reader assertion. The assertion was retained and the transport response was corrected.

The source checkout `/Users/dndesign/Downloads/browser-memex` was already extensively modified before this task. To avoid overwriting those changes or the installed artifact, the exact working files were copied to `/private/tmp/browsermemex-connector-fix-stage`, the narrow patch was applied there, and the normal Chrome build ran in that isolated copy. **Downloads source and existing built outputs were not modified.** The patch is against the current working file, not an assertion that upstream HEAD matches the installed binary.

Vite now includes the capture module in the worker entry. The emitted `memory.write` branch directly invokes `captureFact`; it has no dynamic import or preload wrapper. The worker source map contains no `sidepanel-preact` sources. No separate `nugget-memory-*` dynamic chunk is emitted.

Other optional dynamic imports remain elsewhere (including workflow-related operations). This narrow fix does not certify all worker features or eliminate every DOM-dependent Vite error path. Those paths need separate work if claimed as tested.

## Checks executed

1. The normal `node tools/build/build-extension.mjs chrome` build completed in the isolated copy, producing an unpacked Chrome extension and zip.
2. Static assertions inspect the original and candidate emitted workers: original memory dynamic chunk exists; candidate write dispatch directly calls capture; no candidate memory dynamic chunk; no sidepanel source in worker map.
3. A DOM-free VM evaluates the original emitted preload helper with a deliberately rejected loader and verifies that it incorrectly produces `window is not defined`.
4. A Node worker thread, with both `window` and `document` absent, executes the candidate source's actual `dispatchMemexOp` and actual `captureFact` with an injected **synthetic services/profile boundary**, plus the actual core NuggetStore and SQLite WASM in memory. Three unique synthetic writes return `new_key`; three corresponding queries find the exact expected facts; the store count is three.
5. The same harness confirms that disabled memory and a blocked subdomain are still rejected. No real profile store or relay is consulted.

This worker harness is not execution of the entire emitted service-worker entry and is not browser-installed integration evidence. Its purpose is to exercise the changed dispatch/capture path without a DOM, while separately checking the production emitted route and graph.

The first smoke attempt imported SQLite's browser entry in Node and failed to load local WASM through browser fetching. Selecting the package's documented Node entry resolved this test-harness mismatch. The recorded passing result uses `dist/node.mjs`; it does not imply browser VFS validation.

## Reproduction and outputs

From the paper repository:

```sh
node evaluation/connector-fix/regression.mjs /Users/dndesign/Downloads/browser-memex /private/tmp/browsermemex-connector-fix-stage
```

The regression uses the source checkout's existing `esbuild` and SQLite dependencies, injects only synthetic services and an extra test export, and writes `evaluation/connector-fix/offline-regression-results.json`. It performs no package installation or network operations.

- Narrow source patch: `evaluation/connector-fix/static-memory-capture.patch`
- Candidate changed source copy: `evaluation/connector-fix/mcp-bridge.fixed.js`
- Before/after source, worker and candidate archive hashes: `evaluation/connector-fix/source-manifest.json`
- Candidate source/config hashes: `evaluation/connector-fix/candidate-source-files.sha256`
- Offline regression script/results: `evaluation/connector-fix/regression.mjs`, `evaluation/connector-fix/offline-regression-results.json`
- Installable candidate directory: `/Users/dndesign/Desktop/ecir27-resources/browsermemex-artifact/chrome-connector-candidate`
- Candidate zip: `/Users/dndesign/Desktop/ecir27-resources/browsermemex-artifact/browser-memex-chrome-connector-candidate-1.0.0.zip`

The production candidate is deliberately labeled separately and retains manifest version 1.0.0. It was loaded only as the isolated test configuration described below, not into the user's existing Chrome profile. Frozen `evaluation/vendor` and existing replay measurements were not changed.

## Version and evidence boundaries

The v1.2.0 research companion contained the static-import candidate and its offline-only evidence. The v1.3.0 revision adds query-provenance hydration and the fresh-browser connector validation described here. These are research-companion versions; the candidate extension manifest remains 1.0.0. A public companion release does not update the user's installed extension.

## Actual fresh-browser connector result

The final fixed test build passed on 2 November 2026 (10:48:02–10:50:09 UTC). Official Playwright 1.60.0 launched matching bundled Chromium 148.0.7778.96/revision 1223 in a newly created profile. The actual MV3 extension registered through its ordinary two-minute alarm with the separate loopback relay on port 7863. No worker evaluation or fixture services were injected. The test used actual profile boot, actual SQLite store, ordinary MCP request dispatch and the privacy-enforcing capture path.

Writer SDK process 62847 deposited three synthetic facts and exited. Reader SDK process 62849 then retrieved all three expected subject/value pairs, each with the writer's `research-client-a` identity in the provenance array. Both client processes exited zero. `browser-regression/fixed-provenance-success.json` retains all raw requests/responses, source/worker hashes, engine version and process identities. This is a process handoff through a real candidate extension, not a claim about autonomous named agent runtimes.

The test configuration changes only the default relay port (7862→7863) and removes the `nativeMessaging` permission, preventing any machine-level native-host inbox access. Those differences are preserved in `test-relay-port.patch` and `test-native-messaging-disabled.patch`. The production candidate still uses port 7862 and its original permissions. It was neither installed nor reloaded into the user's existing browser.

Earlier observations remain distinct:

- `browser-regression/initial-relay-permission-failure.json` and `.log`: sandbox loopback bind failure before browser launch.
- `browser-regression/pre-provenance-fix.json`: first actual fresh-browser attempt, three successful writes and three correct-value reads, failing because query results omitted provenance.
- `browser-regression/fixed-provenance-success.json`: three writes and three value-plus-provenance reads pass after hydration, with no relaxation of the reader assertion.
- `evaluation/results/cross-client-sdk-results.json`: unchanged original user-installed extension, three `window is not defined` write failures and empty subsequent reads.

The dynamic-import causal control completed on the same Chromium 148.0.7778.96 engine (10:51:15–10:53:21 UTC), with identical safety manifest, relay port and query hydration. Restoring the dynamic capture import reproduces `window is not defined` on all three writes; subsequent reads are empty. Raw harness `pass:false` is retained as an expected failing control rather than relabeled as successful writes. `browser-regression/dynamic-import-control-results.json`, its fixture and relay log preserve this result. The source diff and build log identify the controlled change. The protocol and reproduction boundary are in `browser-regression/PROTOCOL-ADDENDUM.md`.
