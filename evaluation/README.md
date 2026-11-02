# BrowserMemex research companion 1.1

This bundle contains actual executed experiments for the revised ECIR manuscript. It does not contain a user study. Generated data are synthetic; archived model outputs and public LongMemEval data are explicitly identified separately.

## What was evaluated

- An immutable copy of the BrowserMemex core from the author's development checkout. `results/source-manifest.json` records the base commit and SHA-256 of every evaluated source file, including local changes. The public prebuilt-extension repository is a separate artifact and version.
- BMTR-1: five seeds, 200 entities/world, five episodes/entity, current/historical/missing-answer queries, oracle intervals or estimated expiry with exact start times, four corruption rates. There are 40 saved inputs, 52,800 query instances and 369,600 method-level outcomes across seven methods. Five original methods were run first; two stronger controls were specified after audit and run on the same saved inputs. `PROTOCOL.md` and `STRONG-CONTROLS.md` preserve that distinction.
- Actual-core browser-worker replay, OPFS readout after reload and an exported database read by an unrelated SQLite client. These are not installed-extension or autonomous-agent tests.
- Full public LongMemEval-S session retrieval: 500 questions, 470 with evidence-recall scores, four retention policies. `EXTERNAL-PROTOCOL.md` distinguishes supplied-history and causal-date runs.
- Source contract tests, skill admission, version-2 signature fixtures, rollback and profile checks, and a 100k-record scale sweep before/after an optional composite index.
- Post-audit coverage matching: 100 label-blind latest-valid subsamples per world and setting, averaged within five worlds. The metadata-regime reversal is reported separately from the primary replay.
- Source-backed routing and skill sweeps: 15,000 synthetic tasks, 45,000 Router decisions, 4,408 numeric task attempts, four thresholds and separate future-reuse labels. Fallback is deterministic; zero model calls were made.
- Lifecycle/episode ablation: 26,400 saved query instances, 132,000 secondary method outcomes, captured-query parity and a three-episode recurrence probe. These reuse the original worlds and do not enlarge the independent sample.

## Reproduce

Run the commands below from `evaluation/`, or use the root Makefile wrappers. Archived model outputs now live at `../cikm26/experiments/`; the audit resolves that path automatically.

Node 24+ and Python 3 with NumPy and Matplotlib are required for the complete report. The recorded execution environment is in `results/environment.json`. Install the pinned JavaScript dependency:

```sh
npm ci
npm run test:core
npm run contracts
npm run evaluate
npm run controls
python3 scripts/coverage-matched.py
npm run orchestration
npm run ablation
python3 scripts/report.py
```

The first replay takes roughly two minutes on the recorded machine. The source tests print 245 passing checks. The contract script also deliberately demonstrates two legacy weaknesses: operationally successful but wrong skill promotion and an unkeyed checksum that can be recomputed after tampering. A passing finding test does not mean the legacy behavior is secure.

All BMTR inputs are also supplied, so the controls can run without regeneration. Results are written to JSON/JSONL, never inserted manually into tables. Report generation computes means and Student-t intervals over five worlds. External-data intervals use 2,000 question bootstraps. Timings are descriptive single-machine measurements; repeated queries are not independent semantic samples.

```sh
npm run audit           # strict rescoring of archived model answers
npm run scale           # original schema; 100k insertion took ~11.5 minutes
npm run scale:indexed   # optional composite index; same workload ~15 seconds
```

The optional index is in `lookup-index.mjs`; original vendored code is unchanged. `results/scale-indexed.json` contains query plans before and after configuration. The contract suite compares 330 held-out replay queries before and after indexing.

## Browser reproduction

```sh
npm run serve
```

Open `http://127.0.0.1:8770/` in a browser supporting workers and OPFS. Run temporal replay, write the persistent fixture, reload the page, then verify persistence. The server binds only to loopback. It receives synthetic test outcomes and writes only `results/browser-results.json` and `results/browser-export.sqlite3` through its two fixed result endpoints. The page does not upload anything to an external service.

The application-level network-denial check rejects `fetch` only after loading code and WASM. It is not an OS-level network disconnect. The positive retrieval fixture must return one record. OPFS persistence here means a fresh worker after page reload, not power-loss recovery or survival of profile deletion.

Independent export verification:

```sh
python3 -c 'import sqlite3; d=sqlite3.connect("results/browser-export.sqlite3"); print(d.execute("select subject,predicate,object from nuggets").fetchall()); print(d.execute("pragma integrity_check").fetchall())'
```

`node scripts/browser-parity.mjs` checks the saved browser run against a fresh Node execution: all 1,650 scored outcomes match exactly, excluding timing. The first exploratory network check returned no evidence; its result is retained and marked superseded in `results/browser-node-parity.json`. Later network checks use a known-positive record and must retrieve it.

## External public data

The dataset is available from the [official cleaned LongMemEval release](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned), identified as MIT-licensed by its dataset card. The download is approximately 265 MiB. Its SHA-256 is `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`.

```sh
mkdir -p data/external
curl -L --fail https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json -o data/external/longmemeval_s_cleaned.json
npm run external
node scripts/longmemeval.mjs  # separate causal-date variant
```

The adapter indexes session role/content text and strips annotation fields. It does not index expected answers or evidence IDs. The no-expiry result is checked for exact identity with a matched FTS5 adapter. The score is session recall, not official generative QA accuracy. Thirty abstention questions are excluded from evidence recall following the upstream retrieval convention; their outputs are retained.

The date audit found 44 questions with labeled evidence dated after the question. The supplied-history run treats every supplied session as available context and preserves event dates in provenance; the causal run excludes later-dated sessions. Both raw outputs are retained. Do not mix scores between those evidence-availability protocols.

## Integrity and versioning

`vendor/LICENSE` covers the BrowserMemex source snapshot. Companion code is MIT. Synthetic fixtures have the data terms in `DATA-LICENSE.txt`. Upstream LongMemEval data retain their license and are excluded from the compact artifact archive; the download recipe and exact hash are included. The browser SQLite assets originate from `@sqlite.org/sqlite-wasm` 3.53.0-build1; see `browser/sqlite/NOTICE.txt` and its Apache license.

The signature module `secure-envelope.mjs` is new companion code, not a claim that the inspected extension's legacy checksum format was cryptographically secure. Callers must supply an independently trusted public key. Semantic correctness and action authorization are separate concerns.

The compact artifact can be regenerated from the project root with `make package` or `python3 scripts/package.py`. It excludes `node_modules`, external benchmark raw data, caches, and build intermediates. No credentials or model configuration files are required. The exact evaluated companion is published at https://github.com/searchsim-org/browsermemex-research. Fresh Ubuntu reproduction passed at commit19e0d56558c056c3d586496b46697894f3625782; record the pinned release and SHA when reproducing.

The research companion ZIP now preserves the project root, including `evaluation/`, `cikm26/`, manuscript modules and dependencies. Plot generation writes figures into the parent paper's `figures/` directory; derived tables remain in `evaluation/results/`. The source ZIP already contains all figure/table inputs needed to compile the delivered paper independently.

## Executed repair and robustness extensions

`node scripts/episode-repair.mjs` executes immutable-episode policies on the original inputs and the separately versioned20-world temporal/provenance stress collection. `python3 scripts/independent-backend.py` uses the pinned requirements in `requirements-independent-backend.txt`; `node scripts/repeated-scale.mjs` runs the40process-isolated insertion/update cases. Protocols and result reports distinguish known origin labels from inferred independence, lexical backend parity from full graph-memory evaluation, and repeated10k measurements from the earlier single100k run.

The connector's installed-write failures, static-import patch and separate candidate regressions are in `connector-fix/` and `../docs/CONNECTOR-FIX-RESULTS.md`. Do not relabel offline worker or isolated-candidate results as a successful reload of the user's installed extension.
