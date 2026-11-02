# Routing and skill-admission stress protocol, 1 November 2026

This protocol is recorded before executing the new orchestration script. These are synthetic source-backed component evaluations without people, external autonomous clients, model inference, monetary cost estimates, or claims of general task success. Existing vendored code is unchanged. Seeds: 27101–27105.

## Routing

Run the actual `Router.route` on 1,000 tasks per seed in each of three environments: canonical hosts, migrated hosts, and adversarial host-confusion URLs. Six requested operations have independently specified destinations in the workload's allocation specification: dashboard monitoring and email handling to claude-code; ticket triage and search to cursor; form submission to codex; code review to claude-code. These are workload assignments, not empirically established agent capabilities. Titles describe the operation; 15% use an unsupported paraphrase. No gold destination is passed into the router or fallback.

Compare three policies on identical tasks: original-style substring URL rules plus fallback; host-anchored URL rules plus fallback; fallback only. Five URL rules cover all operations except code review. Canonical hosts identify the operation. Migrated hosts no longer match those rules. Host-confusion URLs use an unrelated actual host with another category's canonical hostname in a query parameter. The injected fallback is a deterministic keyword resolver that reads the task description only. Its invocations are recorded as fallback requests despite the production API's `llm_fallback` label; they are NOT LLM calls. Unsupported paraphrases select a fixed default, so fallback accuracy is not an assumed oracle success rate.

Report allocation agreement with the independently generated destination labels, wrong allocations, actual fallback-request fraction and decision sources. Preserve every task and decision. Compare no monetary or model latency numbers. Source execution checks router behavior; it does not establish any LLM router's effectiveness.

## Skill thresholds

Run actual `proposeSkills` at thresholds 2, 3, 5 and 8 over the same trace per seed. The trace has 50 template families: 20 frequent correct workflows (20–40 attempts), 10 rare correct workflows (2–9 attempts), 10 recurring incorrect workflows (12–25 attempts) and 10 transient workflows (1–7 attempts). A future-reuse schedule is generated separately and never supplied to `proposeSkills`. Only the 30 correct recurring templates qualify as future-reusable positives. Transient templates have zero future uses, regardless of their training repetition.

Execute a deterministic line-item total operation on generated numeric examples. Correct workflows sum price times quantity. Five incorrect workflows ignore quantities; they can produce correct training outputs when all quantities equal one. Five systematically incorrect workflows add one to the correct total. Future evaluation cases have quantities at least two and therefore expose both incorrect implementations. The experiment evaluates admission of known workflow candidates, not induction of new executable programs.

Compare (a) operational-success traces, in which completed runs are marked successful regardless of value, and (b) value-checked traces, in which an otherwise completed run is successful only when its observed value matches the independently computed fixture answer. Both use the same attempts and 90% transport-completion process. Value checking is a fixture-specific available validator; it is not a general semantic oracle, and training correctness can fail to predict future correctness for the quantity-blind workflows.

Report admission precision and recall over 30 correct recurring templates, F1, number of admitted semantically incorrect templates, transient false admissions and proposal counts. Preserve all executed training and future cases and source task IDs in every proposal. Thresholds are sensitivity settings, not optimized on a test set.

A separate counterexample supplies 50 semantically unrelated one-off task payloads with identical key/type structure. Compare implicit shape fingerprints with explicit distinct template identifiers at threshold three. Future reuse is zero for each task. This checks whether shape aggregation creates an apparently recurring candidate from nonrecurring tasks; it does not estimate the prevalence of such collisions in real usage.

## Reporting

Aggregate each seed first. Report means and Student-t 95% intervals across five seeds, with t=2.776445 and four degrees of freedom. These intervals describe the generator only. Recount routing decisions, fallback counters, skill groups and candidate source IDs independently in assertions. Archive results are labeled historical: the old routing file has aggregate values without per-task predictions, while the old skill generator's rounded weekly frequency suppresses its rare templates. Do not silently merge new measurements with archived ones.
