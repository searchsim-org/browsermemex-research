# Coverage-matched replay reanalysis

Specified 1 November 2026 before this reanalysis is executed. This is a post-audit analysis of existing outputs, not an additional independently generated test collection.

Question: does the Active view's lower wrong-answer rate persist when a latest-valid comparator answers exactly as many queries? For each of eight metadata/corruption settings and five existing worlds, take the Active view's answered-query count as the budget. Uniformly subsample that many answered queries from latest-valid, without replacement. Selection uses a seeded random permutation and cannot inspect gold or correctness. All other latest-valid predictions become abstentions. Keep 100 permutations per world, using seeds 271000 + world_index*100 + repetition. The same permutation seed is reused across settings, not treated as independent evidence.

Compute wrong answers over all queries, accuracy including correct abstention, and correctness among answers. Report the analytic expected wrong-answer rate from uniform sampling as a check on the 100-permutation mean. Aggregate permutation means within each world before the five-world mean and Student-t 95% interval. Random permutations do not increase the number of independent worlds. Preserve metrics for every permutation and input-file hashes. Keep current/historical/unknown slices for unthinned Active and latest-valid.

This comparator isolates the effect of answering fewer queries. It does not match which queries are answered, does not provide a deployable confidence ranking, and cannot establish calibrated or optimal abstention. Budget matching uses the reference policy's answer count, not evaluation labels. Existing results and evaluation protocols remain unchanged.
