# Executed routing and skill-admission stress tests

Executed 1 November 2026 with the unchanged evaluated core. Protocol: `evaluation/ORCHESTRATION-PROTOCOL.md`; command: `node evaluation/scripts/orchestration.mjs`. These are new synthetic component experiments, without a user study, autonomous client execution, or model calls.

## What was missing

The active ECIR paper omitted the earlier RQ2 routing and RQ3 threshold curves. The old real-model routing output has aggregate values only, so its per-task allocation accuracy cannot be independently re-scored from that file. It records three trials of 100 tasks, model alias `qwen3-next-80b-a3b-instruct`, 100% agreement for both policies, and 20 versus 100 calls per 100 tasks. Dollar costs in that archive combine synthetic per-agent cost assumptions and a stated model-call cost; they are not new measured spending.

The old threshold generator rounds weekly frequencies. Its 0.25 and 0.3 tasks/week families always generate zero occurrences, and its 0.4 family generates very few. Consequently the intended rare-recurring population is not reliably instantiated. The new sweep generates positive integer attempt counts for every template before evaluating thresholds.

## Routing: 15,000 tasks, 45,000 decisions

Five seeds each contain 1,000 tasks in each URL environment. Three actual `Router.route` policies see identical inputs. The reference labels express the workload designer's configured allocation across six operations and three named agent descriptors. They do not establish actual agent competence. Fallback is an injected deterministic description-keyword resolver, with unsupported paraphrases in 15% of tasks; no gold labels are passed into it. The production API calls its decision source `llm_fallback`, but **zero model calls were made**.

Percentages below are mean ± Student-t 95% half-width over five generated workloads.

| URL environment | Policy | Allocation agreement (%) | Fallback requests (%) |
|---|---|---:|---:|
| canonical | substring | 100.00 ± 0.00 | 16.92 ± 0.67 |
| canonical | host-anchored | 100.00 ± 0.00 | 16.92 ± 0.67 |
| canonical | fallback-only | 92.26 ± 0.74 | 100.00 ± 0.00 |
| migrated | substring | 92.26 ± 0.74 | 100.00 ± 0.00 |
| migrated | host-anchored | 92.26 ± 0.74 | 100.00 ± 0.00 |
| migrated | fallback-only | 92.26 ± 0.74 | 100.00 ± 0.00 |
| host-confusion | substring | 47.58 ± 1.68 | 17.04 ± 1.64 |
| host-confusion | host-anchored | 92.26 ± 0.74 | 100.00 ± 0.00 |
| host-confusion | fallback-only | 92.26 ± 0.74 | 100.00 ± 0.00 |

Canonical URL rules bypass 83.08% of fallback requests under their matching conditions. That advantage disappears after host migration. With an unrelated actual hostname and a known service hostname in a URL query parameter, broad substring rules silently select the wrong configured destination: allocation agreement falls to 47.58%. Host-anchored patterns avoid these rule matches and defer to the same lexical fallback, recovering 92.26% agreement at the price of 100% fallback requests. This is a reproducible rule-configuration sensitivity, not a security guarantee or evidence that a real LLM would achieve these accuracies.

## Skills: 4,408 attempts, 40 threshold/trace settings

Per seed: 20 frequent correct, 10 rare correct, 10 recurring incorrect and 10 transient templates. Ten independently specified future numeric cases assess each implementation; only the 30 correct recurring templates are future-reusable positives. A separate future-use schedule gives transient templates no future uses. All training and future examples, values, statuses and proposal source IDs are saved. Precision is the fraction of proposals that are correct and recurring; recall uses 30 correct recurring families per seed.

The value-checked condition checks numeric training outputs before marking an otherwise completed run successful. Quantity-blind implementations can pass training examples with unit quantities and still fail future cases with larger quantities. This is a task-specific arithmetic validator and a known-input generalization test, not a general semantic validator.

| Admission trace | Threshold | Precision (%) | Recall (%) | F1 (%) | Incorrect recurring admitted (of 10) | Transient admitted (of 10) |
|---|---:|---:|---:|---:|---:|---:|
| operational | 2 | 63.17 ± 2.39 | 99.33 ± 1.85 | 77.22 ± 2.08 | 10.0 | 7.4 |
| operational | 3 | 62.08 ± 1.47 | 90.67 ± 6.14 | 73.67 ± 2.95 | 10.0 | 6.6 |
| operational | 5 | 65.11 ± 4.30 | 82.67 ± 11.85 | 72.78 ± 7.24 | 10.0 | 3.2 |
| operational | 8 | 67.30 ± 1.16 | 68.67 ± 3.70 | 67.96 ± 2.39 | 10.0 | 0.0 |
| value-checked | 2 | 70.67 ± 2.92 | 99.33 ± 1.85 | 82.57 ± 2.32 | 5.0 | 7.4 |
| value-checked | 3 | 70.09 ± 1.42 | 90.67 ± 6.14 | 79.03 ± 3.01 | 5.0 | 6.6 |
| value-checked | 5 | 75.00 ± 4.19 | 82.67 ± 11.85 | 78.55 ± 7.54 | 5.0 | 3.2 |
| value-checked | 8 | 83.10 ± 1.18 | 68.67 ± 3.70 | 75.16 ± 1.87 | 4.2 | 0.0 |

Raising the operational threshold from 3 to 8 removes the transient proposals in this generator but retains all ten recurring incorrect implementations. Recall simultaneously falls from 90.67% to 68.67%. A repetition threshold is therefore a recurrence filter and cannot be interpreted as a semantic-correctness test. Checking training values removes the five systematic off-by-one candidates, but all five quantity-blind candidates remain admitted at threshold three. At threshold eight, 4.2 of those five remain admitted on average. Independently varied future inputs are necessary to expose this training/example mismatch.

A separate exact counterexample supplies 50 unrelated one-off task payloads with identical key/type structure. At threshold three the actual `templateFingerprint` groups them into one candidate with 50 successful source tasks. Explicit unique template IDs produce zero proposals. This diagnoses a collision mechanism; it does not estimate its prevalence in deployment.

## Artifact and independent checks

- `evaluation/scripts/orchestration.mjs`: actual core imports, task generation, execution and scoring.
- `evaluation/results/orchestration-summary.json`: protocol/script/source hashes, per-seed counts, intervals, all proposed candidates and archived routing provenance.
- `evaluation/results/orchestration-routing-inputs.jsonl`: 15,000 labeled task inputs.
- `evaluation/results/orchestration-routing-outcomes.jsonl`: 45,000 scored decisions.
- `evaluation/results/orchestration-skill-traces.json`: all 4,408 attempts and future numeric cases.
- Assertions recount fallback calls from decision sources, successful attempts from proposal IDs, candidate uniqueness, 30 positive templates per seed, all 1,000 tasks per routing cell and the 50-to-one shape collision.

## Suggested manuscript content

Suggested subsection: **Routing and workflow admission**. A compact paragraph and small table would add the currently missing source-backed orchestration results:

> We evaluate the actual router on 15,000 synthetic tasks across five seeds, canonical hosts, migrated hosts and host-confusion URLs. Configured-allocation agreement is 100% on canonical hosts with 16.9% fallback requests. Broad URL patterns fall to 47.6% agreement under host-confusion inputs, whereas host-anchored patterns defer to the deterministic fallback and reach 92.3%. No model inference is used in this component test. A separate 4,408-attempt skill sweep shows that raising the operational-success threshold from three to eight increases admission precision from 62.1% to 67.3% while reducing recall from 90.7% to 68.7%; all ten recurring incorrect templates remain admitted. Checking training values raises precision at threshold three to 70.1%, but five incorrect implementations still pass because the training examples do not expose their error. These experiments make rule scope, repetition and semantic validation independently testable.

The complete curves belong in the companion even if page constraints limit the body to the threshold-three and threshold-eight comparison. These results do not replace the missing installed-extension end-to-end test, real-client interoperability experiment, public persistent artifact release or external neural/graph-memory comparison.
