# Executed lifecycle and episode ablation

Executed 1 November 2026. Protocol: `evaluation/ABLATION-PROTOCOL.md`. Command: `node evaluation/scripts/mechanism-ablation.mjs`. This is a post-audit diagnostic on existing BMTR-1 inputs, with no model calls, user study or vendor-source edits.

## Design and checks

Twenty saved datasets cover five worlds, exact intervals or estimated expiry, and 0% or 10% corruption. There are 26,400 query instances and 132,000 method outcomes across five methods. Three reference conditions are re-executions of existing methods; this count is not 132,000 new independent tasks or an additional independent collection.

The script captures the SQL actually issued by `NuggetStore.query`. It verifies the captured query returns exactly the actual Active query's ordered record IDs. The companion all-states condition removes **only** `n.status = 'Active'` from that query. It retains the same mutated stored records, time predicate, scope, visible tiers, BM25 ordering and top-10 limit. A second all-states condition adds recency tie-breaks after BM25. The episode BM25 and latest-valid comparators use the original unmerged observation table from the shared adapter.

Every actual Active and episode latest-valid scored field matches the corresponding previously saved result. Source hashes are checked again after execution. Per-query outcomes, insertion outcomes and applied updates, lifecycle counts at each checkpoint, diagnostic rows, paired recoveries, environment and input hashes are saved. Intervals below are Student-t 95% half-widths over five worlds. The comparison is a query-time intervention, not a claim that the production extension already has an all-states view.

## Status filtering explains much of the clean historical failure

| Metadata | Corruption | Active historical accuracy | All stored states, same ranking | Episode latest-valid historical accuracy |
| --- | ---: | ---: | ---: | ---: |
| Exact intervals | 0% | 100.00 ± 0.00% | 100.00 ± 0.00% | 100.00 ± 0.00% |
| Exact intervals | 10% | 85.83 ± 2.63% | 85.83 ± 2.63% | 89.87 ± 2.04% |
| Estimated expiry | 0% | 19.20 ± 2.22% | 54.07 ± 1.19% | 66.57 ± 0.77% |
| Estimated expiry | 10% | 17.80 ± 1.48% | 47.13 ± 2.55% | 59.87 ± 2.24% |

For clean estimated expiry, removing the status predicate raises historical accuracy by **34.87 ± 2.54 percentage points**, using paired world differences. Each condition has 3,000 historical queries across the five worlds; 2,988 have a non-null gold value. Correct time-eligible stored evidence exists for 1,990 of these answerable queries, but 1,423 have no correct eligible Active row. Removing status filtering recovers correct top-10 evidence for all 1,423 affected queries. At the answer level it corrects 1,048 queries and regresses two, giving 1,046 net additional correct answers out of 3,000.

This directly identifies present lifecycle state as a major source of historical evidence suppression in this workload. The evidence already exists in the store with an interval containing the requested time. Query-time exclusion alone hides it.

With 10% corruption and estimated expiry, removing status filtering raises historical accuracy by **29.33 ± 2.26 points**. It recovers evidence for 1,206 historical queries, corrects 882 answers and regresses two. A further 62 historical queries have a correct eligible original observation but no correct time-eligible stored row, so status removal cannot recover them.

The all-states recency tie-break produces identical outcomes to all-states BM25 for these 26,400 queries. This does not establish that recency never matters: it breaks equal BM25 scores only, while different object terms can produce different lexical scores. The episode latest-valid comparator bypasses those lexical ordering differences with an exact-key lookup.

## Recovery increases wrong answers as well as coverage

| Metadata | Corruption | Method | Accuracy, all queries | Wrong answers, all queries | Coverage |
| --- | ---: | --- | ---: | ---: | ---: |
| Estimated expiry | 0% | Active | 35.35% | 0.88% | 25.29% |
| Estimated expiry | 0% | All stored states | 52.03% | 13.55% | 55.02% |
| Estimated expiry | 0% | Episode latest-valid | 64.15% | 1.42% | 55.02% |
| Estimated expiry | 10% | Active | 31.70% | 4.42% | 25.23% |
| Estimated expiry | 10% | All stored states | 46.06% | 18.15% | 53.65% |
| Estimated expiry | 10% | Episode latest-valid | 58.61% | 6.97% | 55.02% |

All-states querying is therefore a diagnostic intervention, not a demonstrated production remedy. It restores useful historical evidence, but also exposes overlapping or disputed records that the unchanged lexical resolver can select incorrectly. The unmerged episode BM25 comparator is also weak under estimated expiry: historical accuracy is 30.43% clean and 28.70% with 10% corruption. Preserving episodes alone does not solve version selection. Accurate query-time evidence, appropriate ranking and lifecycle interpretation need separate evaluation.

## Merging can erase a later episode even with exact intervals

Under exact intervals with 10% corruption, removing status filtering changes no Active outcomes. Historical accuracy stays at 85.83%, while the episode-preserving latest-valid baseline reaches 89.87%. The paired difference is **4.03 ± 0.75 percentage points**.

Across the 3,000 historical queries in that condition, 121 have a correct time-eligible original observation but no correct eligible stored record. In every one of these 121 cases, all correct eligible source episodes were merged during insertion. A record with the correct value remains in the store, but its interval does not contain the requested time. Across all query types there are 331 such merged-episode eligibility losses. The condition's 5,000 observations produce 461 merge decisions, alongside 1,000 new-key and 3,539 succession decisions.

The actual conflict implementation checks value similarity before interval overlap. A merge appends provenance to the earlier record without creating a new episode or extending the earlier record's interval. The trace result is consistent with that mechanism, and a constructed probe isolates it:

1. Insert `planning`, valid on days 0–2.
2. Insert `released`, valid on days 2–4.
3. Insert `planning`, valid on days 4–6.
4. Query day 5 after all three observations.

All interval metadata are exact. The actual insertion outcomes are `new_key`, `succession`, `merged`. The store retains only the first two intervals. The day-4 observation merges into the day-0 `planning` record without retaining the later interval. Actual Active retrieval abstains; all-states has no time-eligible record to return. The episode latest-valid baseline returns `planning` correctly. This single hand-constructed probe illustrates the failure and does not estimate its prevalence outside the replay.

With estimated expiry and 10% corruption, 62 historical queries lose correct stored eligibility. Of those, 38 have all correct eligible source episodes merged; 24 include at least one nonmerged correct episode whose stored eligibility is absent. The latter group should not all be attributed to merging. Conflict-time interval updates and interactions with earlier records remain separate causes requiring finer intervention to distinguish.

## Scientific implication

The experiment separates two failure mechanisms. Current lifecycle filtering can hide evidence that remains valid for a historical query, while insertion-time value merging can discard the interval of a later recurrence. Querying every lifecycle state addresses the first mechanism and cannot recover information already lost by the second. An episode-aware policy needs to preserve nonoverlapping recurrences and interpret lifecycle state at the requested time. The present experiment diagnoses these requirements; it does not claim to have implemented or evaluated the full repair.

The combination of coverage matching and this ablation provides a useful research result: governance's benefit depends on metadata quality, and its failures can be localized to query-time filtering and storage-time episode handling. This is stronger evidence of the resource's scientific utility than a large raw outcome count alone.

## Files

- `evaluation/results/mechanism-ablation.json`: five-world summaries, confidence intervals, paired counts, every query's storage/evidence diagnostics, hashes, lifecycle checkpoints and the recurrence probe.
- `evaluation/results/mechanism-ablation-outcomes.json`: 132,000 scored method outcomes and all 20,000 insertion traces.
- `evaluation/scripts/mechanism-ablation.mjs`: executable source-backed intervention and assertions.
- `evaluation/ABLATION-PROTOCOL.md`: pre-execution protocol and explicitly post-run trace-refinement/probe addendum.

This experiment does not supply missing public artifact hosting, installed-extension interoperability, a neural/graph backend comparison, realistic semantic ingestion, or multi-device durability evidence. Those remain distinct review concerns.
