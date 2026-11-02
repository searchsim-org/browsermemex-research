# BMTR-1 dataset card

**Purpose.** Controlled diagnosis of temporal memory, lifecycle and retention policies in a local-first agent resource. Not a population model of web users, an LLM hallucination benchmark, or a natural-language reasoning benchmark.

**Construction.** `benchmark.mjs` is the complete generator. Five independent seeds (27001–27005), 200 entities each and five episodes per entity. The five domain labels each use a fixed five-value vocabulary. Clean values follow a deterministic rotation by entity and episode; timing, observation delay and historical-query sampling vary by seed. Corruption substitutes the value two positions later modulo five, rather than sampling general language-model errors. Source counts are sampled independently of the correctness decision but are not real independent corroborators.

**Factors.** Oracle intervals or exact effective starts with TTL-based expiry; corruption probabilities 0/.05/.10/.20. TTLs are 6h, 1d, 7d, 30d and 90d. Transition timing is sampled independently of those TTLs. The oracle setting is explicitly an upper-bound diagnostic. No method infers an effective start time in this experiment.

**Instances.** Each saved world/condition has 1,000 observations and 1,320 queries: 600 current, 600 historical, 120 unseen-entity. Forty files reuse five underlying world seeds under different factors. Total 52,800 query instances, evaluated by seven methods for 369,600 outputs. Counts are not claims of independent real-world samples. Independent browser seed 27006 has 50 entities, 250 observations and 330 queries. The index-equivalence fixture uses seed 27008.

**Truth.** The separate state ledger defines gold values and gaps at requested valid time. Query knowledge time controls which observations the adapters may see. Gold state, corruption flags and true interval ends are not passed through `toCandidate` to storage or used to choose predictions. In the oracle diagnostic, true validity intervals are deliberately supplied equally to all methods and clearly marked.

**Scoring.** The common resolver takes the first retrieved exact subject/predicate match, or null. This design isolates memory/version behavior and removes entity-linking ambiguity. Report coverage, incorrect answers, abstention and evidence recall jointly. See `PROTOCOL.md` for precise denominators and confidence intervals. Methods using exact-key lookup and recency are included as strong simple controls.

**Limitations and bias.** English attribute labels, single functional status predicate, exactly five state values and episodes, no synonym/entity linking challenge, no multimodal content, fixed timeline and observation-delay distribution, synthetic provenance, one device for timing. The five domain labels do not represent five independently sampled real web domains. Synthetic corruption is not an estimate of real hallucination incidence. Absence of a user study is not evidence of usability or adoption. The public-data session adapter supplies a separate external retrieval check and retains upstream limitations.

**Rights and privacy.** Fictitious entities and `.example.invalid` URLs; no collected human subjects, authentication, private browsing history or identifiable participants. The generated BMTR fixtures carry the accompanying data license. LongMemEval is external, separately licensed material and not included under the BMTR terms.

**Maintenance.** Preserve BMTR-1 inputs, seed semantics and scoring when publishing new generators. Changes to state semantics, labels or query eligibility require a new dataset version, separate baselines and changelog; do not silently overwrite results. See `MAINTENANCE.md`.
