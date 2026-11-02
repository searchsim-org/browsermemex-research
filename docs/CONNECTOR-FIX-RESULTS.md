# Connector memory-write fix: candidate build and offline regression

Status: **source/build candidate verified offline; installed-extension writes remain failed and have not been rerun after reload.** No browser UI, reload, CDP, internal pages, credentials, installed profile queries or model calls were used for this diagnosis/fix.

The authoritative original connector attempt is retained in `evaluation/results/cross-client-sdk-results.json`. Its three failed writes must not be replaced with the three successful **offline synthetic** writes described here. No claim of successful installed cross-client memory handoff follows from this candidate.

## Cause supported by source and emitted code

The public built worker's `memory.write` branch dynamically imports `chunks/nugget-memory-CJE49jLy.js`. That chunk statically imports only `../service-worker.js`; it does **not** import the sidepanel UI entry. Thus the initially suspected sidepanel import was not supported by inspection.

The worker's Vite-generated `__vitePreload` wrapper catches a rejected import and calls `window.dispatchEvent(...)` to announce the error. `window` does not exist in an MV3 service worker, so this error handler masks the underlying rejection with `window is not defined`. The regression reproduces this masking directly from the original emitted helper in a DOM-free VM.

Chrome's [extension service-worker documentation](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics#import_scripts) states that dynamic `import()` is unsupported in extension service workers; static imports are supported for module workers. The emitted dynamic memory import violates this documented constraint. We have not captured the unmasked exception from the installed worker, so describe that underlying cause as the source/build diagnosis, rather than a captured installed stack trace.

## Minimal change

`evaluation/connector-fix/static-memory-capture.patch` adds a static `captureFact` import in `packages/extension/src/background/modules/mcp-bridge.js` and removes the `await import('./nugget-memory.js')` inside the write branch. The existing privacy-enforcing capture function remains the write path: the fix does not bypass disabled-memory, blocked-domain or URL-redaction policy.

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

The candidate is deliberately labeled separately and retains its original manifest version. It is not installed, reloaded or published. A later authorized installed test must load this candidate, rerun the connector protocol, and record fresh results before any installed write success is claimed. Frozen `evaluation/vendor` and existing replay measurements were not changed.
