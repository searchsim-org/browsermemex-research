# Executed episode repair and temporal/provenance stress extension

Executed 2 November 2026. Protocol: `evaluation/EPISODE-REPAIR-PROTOCOL.md`. Command: `node evaluation/scripts/episode-repair.mjs`. Original vendor source, generator and outputs remain unchanged. The repair is new MIT-licensed companion code in `evaluation/episode-policy.mjs`, not an assertion about existing installed-extension behavior.

## Implemented policy and information boundary

The companion stores immutable observations and never merges equal values across disjoint intervals. Retrieval filters by requested valid time instead of present lifecycle status. Within the newest asserted-start cohort for the requested subject/predicate, it selects a unique value with the most distinct supporting sources. Three configurations require one declared origin, two unique URLs, or two declared origins. Ties or insufficient support cause abstention; the policy does not fall back to an older cohort. Source-support counts are uncalibrated evidence counts, not probabilities of truth.

The two-origin configuration assumes that explicit syndication-origin metadata are available and truthful. Unlabeled provenance falls back to URL identity. A copied report with a dishonest origin label is not authenticated by this policy. Neither provenance grouping nor recurrence solves uncertain effective times or missing reports.

Every backend receives the same observable observations and timestamps. The actual core consumes provenance URLs but does not implement the companion's origin-group interpretation. Gold values, truth intervals and corruption annotations are stripped at the method boundary. Requested queries are projected to text, key and valid time. Knowledge time controls insertion before query execution. The scorer alone receives labels. No model calls, user study, private browsing history, remote service or author-selected test answers are involved.

## Complete unchanged-input replay

All 40 saved BMTR-1 datasets were executed: 52,800 query instances and 264,000 outcomes across five methods. This is a re-evaluation of the existing collection, including recomputed reference methods; it is not 264,000 additional independent tasks. Actual Active and episode latest-valid results reproduce the saved scored fields exactly. The episode-plurality configuration matches latest-valid on every scored field for all 52,800 queries. This is an important negative result: the repair addresses the diagnosed reference-store failure, but does not establish an improvement over the already strong simple episode-preserving baseline.

| Metadata; corruption | Active historical accuracy | Episode plurality / latest-valid | Two-origin historical accuracy |
| --- | ---: | ---: | ---: |
| Exact; 0% | 100.00% | 100.00% | 64.77% |
| Exact; 5% | 93.17% | 94.87% | 61.00% |
| Exact; 10% | 85.83% | 89.87% | 57.73% |
| Exact; 20% | 72.33% | 79.03% | 50.57% |
| Estimated; 0% | 19.20% | 66.57% | 43.03% |
| Estimated; 5% | 18.73% | 63.27% | 40.50% |
| Estimated; 10% | 17.80% | 59.87% | 38.37% |
| Estimated; 20% | 16.20% | 52.90% | 33.93% |

Paired five-world historical gains of episode plurality over Active are **47.37 ± 2.27 percentage points** for clean estimated expiry and **42.07 ± 1.71 points** with 10% corruption. The corresponding current-state gains are **16.00 ± 0.76** and **17.13 ± 0.45 points**. With exact intervals and 10% corruption, historical accuracy improves by **4.03 ± 0.75 points**. Intervals are Student-t 95% half-widths over five worlds.

The gains are not uniformly free of regression. Under clean estimated expiry, across 3,000 current queries, episode plurality corrects 503 answers and regresses 23. Across 3,000 historical queries it corrects 1,423 and regresses two. Under 10% corruption, the corresponding current counts are 534 corrected/20 regressed, and historical counts are 1,264 corrected/two regressed. Every paired count and per-query prediction is retained.

| Estimated expiry | Slice | Method | Accuracy | Wrong answers | Coverage |
| --- | --- | --- | ---: | ---: | ---: |
| Clean | Current | Active | 38.57% | 1.83% | 36.63% |
| Clean | Current | Episode plurality | 54.57% | 2.97% | 54.53% |
| Clean | Historical | Active | 19.20% | 0.10% | 19.00% |
| Clean | Historical | Episode plurality | 66.57% | 0.17% | 66.50% |
| 10% corruption | Current | Active | 31.93% | 7.13% | 35.40% |
| 10% corruption | Current | Episode plurality | 49.07% | 8.47% | 54.53% |
| 10% corruption | Historical | Active | 17.80% | 2.60% | 20.10% |
| 10% corruption | Historical | Episode plurality | 59.87% | 6.87% | 66.50% |

The fixed minimum-two-source condition sacrifices substantial coverage. Under clean estimated expiry its all-query accuracy is 45.70%, wrong-answer rate 0.88% and coverage 35.64%, compared with 64.15%, 1.42% and 55.02% for episode plurality. BMTR-1's source count is independent of correctness, so two-source filtering should not be interpreted as a semantic validator. After 50 label-blind latest-valid subsamples per world, the two-origin repair's wrong-answer difference at matched coverage is **+0.20 ± 0.46 points** for estimated expiry with 10% corruption. The interval includes zero. All eight original settings lack a demonstrated matched-coverage advantage for this source-count threshold. More URLs alone do not supply trustworthy corroboration.

## Explicit recurrence repair

The exact-interval `planning [0,2) → released [2,4) → planning [4,6)` counterexample now retains all three observations in the companion. At day 5 the unchanged core abstains, while the two-origin companion correctly returns `planning`. This is an exact constructed regression probe, not an estimate of prevalence. The final manifest records both outputs and the three retained companion episodes.

## BMTR-STRESS-2: independent temporal, missingness and copying factors

Twenty new seeds, 28101–28120, generate 40 fictitious entities per world with six irregular episodes, potentially recurring values, and one of three functional predicates. Eight factor cells cross start-time error (zero or uniform ±1 day), independently missing reports (zero or 25%), and copied false claims (zero or 25% of episodes receiving three mirrors of one false source). Each true episode has two independent correct reports. Mirrors explicitly identify their common origin. All reports use an eight-day supplied expiry, observation delays vary, and querying remains current/historical/unknown.

The 160 configurations produce **42,240 query instances and 211,200 method outcomes**. They reuse 20 underlying worlds across factors; the independent-world count is 20. Each factor has its own seeded stream and changes only its specified observation property. These construction choices represent realistic types of failure but are controlled synthetic stress levels, not measured deployment frequencies, natural-language extraction or an unbiased population benchmark. Known copy-origin labels are a consequential assumption. Saved inputs carry CC0-1.0 terms and include separate scorer-only truth ledgers.

All-query metrics below are percentages. A cell's first three binary digits indicate start error, missing reports and copied claims. Complete five-method results, current/historical slices, paired regressions, confidence intervals and within-world factor effects are in the output.

| Factors | Latest-valid accuracy | Latest-valid wrong | Latest-valid coverage | Two-origin accuracy | Two-origin wrong | Two-origin coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 000 | 82.99 | 1.82 | 75.72 | 81.21 | 1.82 | 73.94 |
| 001 | 68.11 | 16.76 | 75.78 | 81.21 | 1.61 | 73.73 |
| 010 | 77.31 | 5.74 | 73.96 | 49.55 | 3.88 | 44.34 |
| 011 | 64.79 | 18.88 | 74.58 | 49.55 | 3.16 | 43.62 |
| 100 | 76.93 | 7.23 | 75.08 | 75.59 | 7.22 | 73.71 |
| 101 | 63.48 | 20.74 | 75.13 | 75.59 | 7.05 | 73.54 |
| 110 | 72.10 | 10.27 | 73.28 | 46.40 | 6.59 | 43.90 |
| 111 | 60.72 | 22.23 | 73.86 | 46.38 | 5.91 | 43.20 |

### Copy-origin grouping helps under its stated metadata assumption

With copied claims but no start error or missingness, two-origin accuracy is **81.21 ± 0.62%**, compared with **68.11 ± 1.38%** for latest-valid. Wrong-answer rates are **1.61 ± 0.26%** versus **16.76 ± 1.28%**, at 73.73% versus 75.78% coverage. Counting URLs instead of origins gives **19.56% wrong answers**, because three mirrors outvote two independent reports in the constructed copying condition. The source-origin plurality configuration, with minimum support one, gives 82.77% accuracy, 1.88% wrong answers and 75.55% coverage. A stricter threshold trades some coverage for a small further reduction in wrong answers.

Budget-matching latest-valid to the two-origin repair still leaves a wrong-answer difference of **−14.69 ± 1.23 percentage points**, over 20 paired worlds and 50 within-world masks. The advantage in this condition therefore goes beyond simply answering fewer questions. It follows from a visible, trustworthy copy-origin grouping that the URL-only count ignores. The experiment does not establish that such grouping can be inferred or authenticated in open browsing.

### Temporal uncertainty and missing reports expose remaining failure boundaries

With no copying or missingness, start-time jitter decreases two-origin historical accuracy from **96.67% to 85.58%**. The paired decrease is **11.08 ± 1.16 points**. Wrong historical answers increase by **9.63 ± 1.01 points**. The policy preserves episodes but cannot reconstruct a true effective time from an incorrect asserted start.

With exact starts and no copying, independently removing 25% of reports decreases two-origin historical accuracy from **96.67% to 53.83%**, a paired decrease of **42.83 ± 3.84 points**. A requirement for two independent reports is costly when either source can be absent. This negative result is essential to interpreting the corroboration policy.

Under all three stress factors, latest-valid reaches **60.72 ± 1.42% accuracy**, **22.23 ± 1.27% wrong answers**, and 73.86% coverage. Two-origin repair reaches **46.38 ± 2.08% accuracy**, **5.91 ± 0.75% wrong answers**, and 43.20% coverage. Thus the conservative configuration reduces wrong reuse but loses overall answer-or-abstention accuracy. At matched coverage its wrong-answer difference remains **−7.04 ± 0.93 points**. The minimum-one-origin plurality configuration offers another observed point: **66.38 ± 1.54% accuracy**, 9.92% wrong answers and 67.22% coverage. No single setting dominates all quality and coverage objectives.

The unchanged core's coverage is only 4.30–6.53% across the stress cells, with 11.93–13.86% all-query accuracy. Most remaining accuracy comes from appropriate abstention on unseen entities. This is a targeted recurrence/conflict stress test designed after the earlier diagnosis, so that failure should not be represented as representative deployed-system performance.

## Scientific interpretation

The implemented repair turns the diagnosed lifecycle/episode failure into an executable alternative with exact regression checks. Its agreement with latest-valid on the unchanged original collection identifies a strong simple solution rather than a new algorithmic win. The new stress extension separates three assumptions that were entangled or absent previously: episode identity, correct effective times and independent corroboration. Correctly grouping copied reports can reduce harmful reuse beyond budget matching, but missing reports and uncertain starts materially weaken the same conservative policy. This provides actionable experimental boundaries and supports the resource contribution without claiming universal correctness.

## Reproducibility files

- `evaluation/episode-policy.mjs`: immutable-episode retrieval and configurable source-support policy.
- `evaluation/scripts/episode-repair.mjs`: common execution, source-backed baseline, generation, scoring, masks, regressions and assertions.
- `evaluation/EPISODE-REPAIR-PROTOCOL.md`: fixed construction and analysis choices.
- `evaluation/results/episode-repair-original.json`: all unchanged-input outputs, five-world aggregates, paired counts and masks.
- `evaluation/results/episode-repair-stress-inputs.json`: all 160 new inputs and scorer-only truth ledgers, with CC0-1.0 declaration.
- `evaluation/results/episode-repair-stress.json`: every stress output, 20-world intervals, paired counts and factor contrasts.
- `evaluation/results/episode-repair-manifest.json`: hashes, environment, counts, exact recurrence probe and source/parity assertions. Dependencies are identified by project-relative paths; no credentials or personal records are present.

## Suggested short manuscript paragraph

We implement an episode-preserving companion that resolves validity at the requested time and retains nonoverlapping recurrences. On all 40 original configurations, its one-origin plurality policy exactly matches latest-valid, including historical accuracy of 66.57% versus Active's 19.20% with clean estimated expiry. A versioned extension crosses uncertain starts, missing reports and copied false claims over 20 new worlds. When copy-origin metadata are available, requiring two declared origins reduces wrong answers from 16.76% to 1.61% in the copying-only condition; the matched-coverage difference is −14.69 ± 1.23 percentage points. The same requirement loses coverage when reports are missing, and start-time error reduces historical accuracy by 11.08 ± 1.16 points. The repair and new inputs make these assumptions independently testable rather than treating corroboration as a guarantee of truth.
