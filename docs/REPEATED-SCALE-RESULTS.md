# Repeated insertion, conflict-update and query measurements

Executed 2 November 2026 with unchanged vendored NuggetStore/SqliteStore and SQLite WASM 3.53.0. Protocol: `evaluation/REPEATED-SCALE-PROTOCOL.md`; command: `node evaluation/scripts/repeated-scale.mjs`. Existing scale outputs are unchanged.

## Design and verification

Forty fresh-process cases cover5 randomized-order trials × 2 sizes (1,000/10,000 keys) × 2 canonical-text lengths (29/2,319UTF-8 bytes for the sampled record) × 2 index settings. Each case inserts the keys in seeded random order, then makes overlapping conflicting updates to10% of keys. Long text changes only canonical retrieval text; fact object values remain short and distinct so text length does not silently change the value-deduplication test.

All 220,000 initial insertions and 22,000 conflicting updates complete. Every update reports `deprecated_existing`, modifies one old record and inserts one new record. Every one of32,000 before/after-update first/repeated-order query predictions matches its expected value. An independent Python recount verifies raw operation counts, state-transition counts, prediction correctness and all reported medians; see `results/repeated-scale-check.json`.

## Repeated measurements

Values are medians across 5 separate Node processes. Brackets show the full observed minimum–maximum. Insertion and update times are seconds. Sampled peak RSS includes Node and WASM and is not DB-only memory. DB size follows updates. Query p95 is the median per-run p95 after updates in first-query order.

| Initial keys | Canonical text | Schema | Insert s [min,max] | Update s [min,max] | Sampled peak RSS MiB | DB MiB | Query p95 ms |
|---:|---|---|---:|---:|---:|---:|---:|
| 1,000 | 29 bytes | Original | 0.245 [0.245, 0.251] | 0.041 [0.040, 0.041] | 141.0 | 0.75 | 0.162 |
| 1,000 | 29 bytes | Composite index | 0.185 [0.183, 0.195] | 0.028 [0.027, 0.029] | 140.5 | 0.82 | 0.173 |
| 1,000 | 2,319 bytes | Original | 0.330 [0.327, 0.340] | 0.057 [0.056, 0.076] | 158.6 | 4.14 | 0.175 |
| 1,000 | 2,319 bytes | Composite index | 0.261 [0.259, 0.266] | 0.043 [0.042, 0.044] | 162.1 | 4.20 | 0.180 |
| 10,000 | 29 bytes | Original | 7.221 [7.198, 7.456] | 1.570 [1.554, 1.606] | 182.4 | 6.35 | 0.160 |
| 10,000 | 29 bytes | Composite index | 1.468 [1.444, 1.517] | 0.237 [0.229, 0.247] | 186.2 | 6.92 | 0.163 |
| 10,000 | 2,319 bytes | Original | 9.239 [9.200, 10.005] | 2.087 [2.020, 2.108] | 282.8 | 37.92 | 0.211 |
| 10,000 | 2,319 bytes | Composite index | 2.315 [2.309, 2.362] | 0.326 [0.318, 0.335] | 281.2 | 38.49 | 0.201 |

At 10,000 keys, paired original/indexed insertion-time ratios have median4.97× (range4.76–5.06×) for short text and3.99× (3.93–4.33×) for long text. Corresponding conflict-update speedups are6.55× (6.34–6.87×) and6.38× (6.19–6.56×). These are ratios within the same seed, text condition and hardware, with separate fresh processes. They should not be substituted for the previous single-run100,000-key46.8× ratio. The scaling effect is workload- and size dependent.

The planner changes from `idx_nuggets_profile (profile_id=? AND scope=?)` to `idx_nuggets_key_scope_profile (nugget_key=? AND scope=? AND profile_id=?)`; provenance continues using its nugget-ID index. Per-case exact plans are retained. Longer canonical text increases the10,000-key exported DB from 6.35/6.92MiB (original/indexed) to 37.92/38.49MiB and sampled peak RSS from 182.4/186.2MiB to 282.8/281.2MiB. This separates lookup optimization from storage and indexing overhead.

## Query tails and variation

The full JSON reports all per-run p50/p95/p99 query latencies before and after updates, in first and repeated order; every operation latency, RSS snapshot, DB byte count, conflict outcome and case order is retained. The table below shows median [observed minimum,maximum] after-update first-order p95/p99 in milliseconds.

| Keys | Text | Schema | p95 ms [min,max] | p99 ms [min,max] | Insert CV (%) | Update CV (%) |
|---:|---|---|---:|---:|---:|---:|
| 1,000 | Short | Original | 0.162 [0.156, 0.199] | 0.234 [0.226, 0.268] | 1.12 | 1.51 |
| 1,000 | Short | Indexed | 0.173 [0.156, 0.193] | 0.259 [0.219, 0.272] | 2.77 | 2.71 |
| 1,000 | Long | Original | 0.175 [0.173, 0.296] | 0.258 [0.251, 1.177] | 1.61 | 13.87 |
| 1,000 | Long | Indexed | 0.180 [0.178, 0.196] | 0.273 [0.267, 0.332] | 1.05 | 2.09 |
| 10,000 | Short | Original | 0.160 [0.151, 0.173] | 0.238 [0.173, 0.262] | 1.47 | 1.26 |
| 10,000 | Short | Indexed | 0.163 [0.145, 0.167] | 0.209 [0.160, 0.237] | 1.97 | 3.05 |
| 10,000 | Long | Original | 0.211 [0.184, 0.217] | 0.295 [0.208, 0.327] | 3.63 | 1.74 |
| 10,000 | Long | Indexed | 0.201 [0.190, 0.214] | 0.288 [0.264, 0.296] | 0.99 | 1.92 |

## Limitations

These are fresh-process repeats on one Apple M1 Pro machine, not independent hardware samples. RSS is sampled rather than a continuous native peak-memory measurement. First-order queries run against an initialized in-memory database and therefore are not cold-disk or browser-start latency. The update workload changes 10% of keys once with two-source, later observations; it does not span every conflict rule, concurrency, persistence or update-to-data ratio. Long canonical text uses synthetic repeated filler rather than natural documents. No new 100,000-key repetitions were performed; the previous 11.5-minute original insertion remains a single descriptive run.

## Suggested manuscript paragraph

> We repeat the operating-envelope experiment in 40 fresh Node processes: five randomized-order trials per original/indexed schema,1,000/10,000-key size and short/long text condition. Across220,000 inserts and 22,000 overlapping updates, all 32,000 query checks return the expected values. At 10,000 short-text keys, median insertion time falls from 7.22s to 1.47s and update time from 1.57s to 0.24s. For 2.3KiB canonical text, corresponding insertion times are 9.24s and 2.32s; the indexed DB reaches 38.49MiB. These repetitions confirm the lookup bottleneck and its correction at these sizes, while showing that the earlier 100,000-key speedup should not be interpreted as size-independent.
