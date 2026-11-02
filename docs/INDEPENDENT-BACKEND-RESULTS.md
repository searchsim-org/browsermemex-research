# Independent lexical backend: executed results

Executed 2 November 2026. The actual third-party `rank-bm25==0.2.2` package (Apache-2.0) ran `BM25Okapi` with upstream defaults against every saved BMTR input. The official implementation documents caller-supplied tokenization: https://github.com/dorianbrown/rank_bm25 . NumPy was 1.23.3 and Python 3.9.6. Install `evaluation/requirements-independent-backend.txt`, then run `python3 evaluation/scripts/independent-backend.py`.

## Completed comparison

-40 input worlds: 5 seeds × 2 interval settings × 4 corruption rates.
-52,800 query instances and 158,400 additional method outcomes across independent lexical, interval-filtered and interval-plus-recency methods.
-No model calls, labels, gold answers or true-expiry annotations entered the independent index. Index reconstruction uses observable canonical subject/predicate/value strings at each knowledge-time checkpoint.
-Protocol, script, all input and installed package-source hashes are recorded in `results/independent-backend-summary.json`.
-Primary execution took 35.34 seconds on the recorded environment; this is execution provenance, not a cross-language efficiency comparison.

Percentages below are world means ± Student-t95% half-width over five worlds. Accuracy includes correct abstention; wrong and coverage use all queries; recall is correct-value presence among target-key top10 evidence on answerable queries.

| Setting | Independent backend | Accuracy (%) | Wrong (%) | Coverage (%) | Recall (%) |
|---|---|---:|---:|---:|---:|
| oracle-noise0 | rank-bm25 | 20.48 ± 0.97 | 79.52 ± 0.97 | 90.91 ± 0.00 | 98.73 ± 0.39 |
| oracle-noise0 | rank-bm25-time | 98.88 ± 0.34 | 0.00 ± 0.00 | 87.41 ± 0.41 | 98.73 ± 0.39 |
| oracle-noise0 | rank-bm25-time-recency | 98.88 ± 0.34 | 0.00 ± 0.00 | 87.41 ± 0.41 | 98.73 ± 0.39 |
| ttl-noise0 | rank-bm25 | 20.48 ± 0.97 | 79.52 ± 0.97 | 90.91 ± 0.00 | 98.73 ± 0.39 |
| ttl-noise0 | rank-bm25-time | 29.56 ± 0.65 | 36.02 ± 0.67 | 55.02 ± 0.29 | 60.53 ± 0.44 |
| ttl-noise0 | rank-bm25-time-recency | 64.15 ± 0.40 | 1.42 ± 0.20 | 55.02 ± 0.29 | 60.53 ± 0.44 |
| ttl-noise0.1 | rank-bm25 | 21.32 ± 1.68 | 78.68 ± 1.68 | 90.91 ± 0.00 | 89.60 ± 1.44 |
| ttl-noise0.1 | rank-bm25-time | 28.48 ± 1.20 | 37.09 ± 1.15 | 55.02 ± 0.29 | 54.60 ± 1.18 |
| ttl-noise0.1 | rank-bm25-time-recency | 58.61 ± 0.97 | 6.97 ± 0.74 | 55.02 ± 0.29 | 54.60 ± 1.18 |
| ttl-noise0.2 | rank-bm25 | 21.42 ± 1.73 | 78.58 ± 1.73 | 90.91 ± 0.00 | 81.02 ± 2.60 |
| ttl-noise0.2 | rank-bm25-time | 26.91 ± 1.27 | 38.67 ± 1.25 | 55.02 ± 0.29 | 49.17 ± 1.67 |
| ttl-noise0.2 | rank-bm25-time-recency | 53.15 ± 1.45 | 12.42 ± 1.27 | 55.02 ± 0.29 | 49.17 ± 1.67 |

All 158,400 per-query scored outcomes match the corresponding saved SQLite FTS5 controls exactly on gold, prediction, correct-value presence, returned count, target-key returned count and target-key correct count. The independent Python recount is saved in `results/independent-backend-check.json`. Ranking scores and evidence order are not claimed identical: the implementations have different BM25/IDF conventions. The result shows that the version-ordering failure and its recency correction persist under an independent established lexical backend on this controlled corpus.

## Information and comparison boundaries

The independent backend receives the same canonical observed text, time cutoffs, supplied intervals and top10 budget. Gold remains in scoring only. Lowercase Unicode letter/digit tokenization is explicit because the package does not perform preprocessing. Corpus statistics use all observations available at a knowledge-time checkpoint; temporal filtering is applied before truncating to top10. Rebuilding at each checkpoint is a transparent adapter choice and supplies no learned advantage.

This closes the narrow absence of any independent third-party lexical implementation. It does **not** supply a full competing agent-memory system, graph-memory backend, neural retriever, embedding-based semantic retrieval, LLM fact extraction, or end-to-end answer generation. The structured synthetic corpus can produce identical outputs despite implementation differences. A reviewer requiring Graphiti/Zep/Letta effectiveness remains unanswered by this experiment alone.

## Suggested manuscript paragraph

> An independent adapter executes the established rank-bm25 0.2.2 implementation on all 40 saved worlds, adding158,400 method outcomes. Its lexical, interval-filtered and recency-ordered variants match the corresponding FTS5 controls on every scored query. With clean estimated expiry, interval filtering reaches 29.6% answer-or-abstention accuracy, while recency ordering reaches 64.2%. Thus the version-selection result persists beyond the SQLite ranking implementation. This comparison isolates lexical retrieval and temporal policy under shared inputs; it does not evaluate a complete neural or graph-memory system.
