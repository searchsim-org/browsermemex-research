# BrowserMemex evaluated research companion

BrowserMemex's main extension repository is [searchsim-org/browser-memex](https://github.com/searchsim-org/browser-memex), with installation information at [browsermemex.com](https://browsermemex.com). This repository publishes the evaluated research companion: frozen core source, protocols, generated inputs, raw outputs, method reports and reproduction tools. It contains no paper draft, reviewer reports, credentials, or installed dependencies.

The companion evaluates shared-memory mechanisms, temporal replay, governance policies, routing and workflow-admission components. Browser-worker replay, OPFS reload and independent SQLite readout are bounded tests of the actual core. They do **not** establish installed-extension validation, autonomous-agent success, all model backends, or a user study. Companion policies and the pinned core are distinguished; neither is silently substituted for the separately distributed extension binary.

## Obtain and verify the exact artifact

```sh
git clone https://github.com/searchsim-org/browsermemex-research.git
cd browsermemex-research
python3 scripts/unpack.py --verify-only
python3 scripts/unpack.py
```

Files larger than 128 KiB are stored with deterministic gzip compression. `ARTIFACT-MANIFEST.json` lists both compressed-file and logical-file SHA-256 hashes and byte lengths. Unpacking reconstructs exact evaluated bytes, not a converted representation. `RELEASE-FILES.txt` lists public files. The two historical aggregate files under `cikm26/experiments/results/` are dependencies of archive rescoring and orchestration reporting; these are archived measurements, not new model executions.

Compressed payloads larger than 4 MiB are published as ordered `.part0000`, `.part0001`, etc. files, each at most 4 MiB. Clone or download **all** parts together with the manifest. The same unpack command verifies every part, reconstructs and verifies the whole compressed stream, then verifies the exact logical bytes. The manifest retains the overall compressed hash and logical hash; no manual concatenation or model download is needed to read the published vector array. Older single-file payloads remain supported.

## Fresh reproduction

Use Node 24 and Python 3.9. The JavaScript lockfile pins SQLite WASM 3.53.0-build1 and other dependencies; Python requirements pin rank-bm25 0.2.2 and NumPy 1.23.3. Registry network access is required for fresh installation. No Downloads folder or pre-existing node_modules is used.

```sh
bash scripts/reproduce.sh
```

This runs source contract tests, semantic/integrity fixtures, exact browser-capture versus Node parity, archived answer rescoring, the complete primary replay, stronger temporal controls, orchestration, episode repair/stress, the independent lexical backend and mechanism ablation. The GitHub Actions workflow runs the same commands in a fresh Ubuntu environment.

`EXPECTED-SCIENTIFIC-FINGERPRINTS.json` is computed from the frozen evaluated outputs **before execution**. Reproduction verifies exact canonical non-timing values and scored rows against those expectations. Timings and environment metadata are deliberately excluded; a pass is not a timing replication or proof of external validity. Browser parity compares recorded browser outcomes with a new Node run; it does not launch an installed extension or re-execute the captured browser session.

## Optional experiments

After unpacking and installing dependencies, run from `evaluation/`:

```sh
npm run scale
npm run scale:indexed
node scripts/repeated-scale.mjs
python3 scripts/coverage-matched.py
npm run serve
```

The browser harness and manual reload/export checks are documented in `evaluation/README.md`. Timing sweeps can be slow and are machine dependent. For the external LongMemEval benchmark, obtain the raw file from its upstream location (not redistributed here), preserving its terms:

```sh
mkdir -p data/external
curl -L https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json -o data/external/longmemeval_s_cleaned.json
npm run external
```

Read `evaluation/EXTERNAL-PROTOCOL.md` before interpreting its ingestion settings. This is evidence-session retrieval, not answer-generation or browser-agent success. See the dataset card, synthetic-data license, upstream vendor license, and maintenance policy under `evaluation/`. Scientific reports under `docs/` describe both positive and negative findings.

## Optional dense retrieval reproduction

The new MiniLM dense baseline is separate from the core CI workflow above. Read `evaluation/DENSE-RETRIEVAL-PROTOCOL.md` and `docs/DENSE-RETRIEVAL-RESULTS.md` for the frozen model revision, all model-file SHA-256 hashes, matched visible-prefix lexical control, and recorded environment. From `evaluation/`, after downloading the upstream LongMemEval file with the command above:

```sh
python3 -m pip install -r requirements-dense.txt
python3 scripts/dense-retrieval.py
```

The script downloads external model files anonymously at the pinned revision and verifies their hashes before inference. Model weights stay under the excluded `data/external/` directory and are not part of the public artifact. Published embeddings are derived from the upstream LongMemEval material using the Apache-2.0 MiniLM model; they retain applicable upstream data/model terms and are **not** assigned the synthetic BMTR data's CC0 license. A successful core CI run does not assert that dense inference or optional dense fingerprints were reproduced.

The manually dispatched **Fresh dense retrieval reproduction** workflow downloads the pinned public benchmark and model weights, executes the real CPU encoder without cached-vector reuse, and checks all500question/metric records against frozen outputs. Raw floating-point similarities and tie ordering can vary across CPU platforms; the validator reports ranking differences separately while requiring exact evidence-recall metrics. This is separate from the core13-fingerprint reproduction workflow.
