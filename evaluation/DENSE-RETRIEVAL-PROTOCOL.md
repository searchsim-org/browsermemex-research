# Dense retrieval on matched LongMemEval-S context

Frozen before dataset model inference, 2 November 2026. This is a new independent dense-retrieval baseline, not a complete agent-memory system or a generated-answer evaluation. No user credentials, hosted inference, paid APIs, training or parameter selection are used.

## Model and implementation

Use the established Apache-2.0 model `sentence-transformers/all-MiniLM-L6-v2`, fixed public revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`. Official card: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 . The card specifies masked mean pooling and L2 normalization. Its `sentence_bert_config.json` prescribes 256 tokens maximum. It is a small established baseline, not a claim to current state-of-the-art retrieval.

Execute the actual unquantized ONNX model on CPU through ONNX Runtime1.12.1, Tokenizers0.11.6 and NumPy1.23.3. Use four intra-op threads, one inter-op thread and batches of16. The output is last-hidden-state [batch,sequence,384]; attention-mask mean pooling includes all unpadded tokens, followed by L2 normalization. Cosine similarity is the dot product of normalized float32 vectors. No query/document prompts are added. Official runtime documentation: https://onnxruntime.ai/docs/api/python/api_summary.html .

Frozen file SHA-256:
- `onnx/model.onnx` (90,405,214 bytes): `6fd5d72fe4589f189f8ebc006442dbb529bb7ce38f8082112682524616046452`
- `tokenizer.json`: `be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037`
- `vocab.txt`: `07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3`
- `config.json`: `953f9c0d463486b10a6871cc2fd59f223b2c70184f49815e7efbcab5d8908b41`
- `tokenizer_config.json`: `acb92769e8195aabd29b7b2137a9e6d6e25c476a4f15aa4355c233426c61576b`
- `special_tokens_map.json`: `303df45a03609e4ead04bc3dc1536d0ab19b5358db685b6f3da123d05ec200e3`
- `sentence_bert_config.json`: `fc1993fde0a95c24ec6c022539d41cf6e2f7c9721e5415d6fb6897472a9cd4b7`
- `1_Pooling/config.json`: `4be450dde3b0273bb9787637cfbd28fe04a7ba6ab9d36ac48e92b11e350ffc23`

Download directly from anonymous public revision URLs if absent; check every checksum before loading. Do not read Hugging Face credentials or use implicit authenticated APIs. Model weights are external downloaded dependencies, not vendored source.

## Matched information

Use the same full500-question cleaned LongMemEval-S file with SHA-256 `d6f21ea9d60a0d56f34a05b609c79c88a451d2ae03597821ea3d5a9678c3a442`. Include all23,867 provided session occurrences in question-specific candidate pools. Retain future-dated provided context, following the existing supplied-history protocol. Preserve original session IDs and use the existing answer-session-ID scorer. All500 question records are retained;30 abstention questions are excluded from recall, leaving470.

Session text is exactly role/content text joined by newline, without annotations, questions, expected answers or evidence IDs. Deduplicate only byte-identical session text for encoding efficiency; retain each question's complete session-ID pool. Encode each unique session once with the fixed model. This does not share retrieved context between question pools.

For each session and query tokenize the full original string without special tokens, then retain the first254 WordPiece tokens and add [CLS]/[SEP], giving at most256 model tokens. Record the full and visible token counts. The matched lexical control receives exactly the original string prefix ending at the last retained token's character offset, with the same treatment for queries. It never receives full-session text that the dense encoder cannot see. Record unique-text and occurrence truncation counts, query truncations and visible text hashes.

Use Python's native SQLite FTS5 BM25 as the matched-window lexical control. Within each question insert candidate IDs/text in chronological event order, retaining all provided sessions, and query with lowercase Unicode letter/digit OR terms, as in the previous actual-core lexical adapter. Rank BM25 ascending and use insertion row ID as tie break; dense ranks cosine descending and uses the same candidate order as tie break. Retain top10 IDs. Differences in internal subword/lexical tokenization are inherent to the two independent methods; their visible original character windows are matched. Preserve the previous full-session95.4% lexical result as a separate experiment, not a matched comparison.

## Scores and uncertainty

For each question compute Recall@5, Recall@10 and all-evidence-found@10 using its unchanged evidence-session IDs; no generative accuracy or abstention correctness claim. Macro average over470 eligible questions. Use2,000 paired question-bootstrap samples with fixed seed27301 to obtain percentile95% intervals for each method and for dense-minus-matched-lexical differences. Also retain scores by question type without selecting favorable subsets.

Retain per-question candidate counts, complete top10 IDs and cosine/BM25 scores, evidence IDs, all scores, model/dataset/source hashes, environment versions, total encoder inputs, batching/encoding/scoring wall times, embedding bytes, sampled/OS process peak RSS and download sizes. CPU costs are descriptive on one machine and exclude hosted inference/token spending. Save deterministic cached vectors for exact rescoring, keyed by original-text SHA and frozen model/protocol parameters. Record whether cache reuse occurred; the initial full run must execute every unique text's actual model inference. Independently rescore raw ranked IDs afterward. No results are inserted manually.

## Preflight duplicate-ID addendum (before corpus inference)

The first preparation pass detected13 duplicate session-ID occurrences across13 questions. Each duplicate has byte-identical role/content text, and the existing actual-core provided-history output stores one record per ID (23,854 distinct question/session candidates from23,867 supplied occurrences). Match that candidate pool exactly: process dates chronologically, retain the first occurrence of each session ID, assert repeated IDs have identical text, and preserve all original occurrence counts in metadata. This is ID deduplication, not evidence-based selection. If a repeated ID has different text, fail rather than silently choose content. The initial preflight assertion failed before encoding dataset sessions or calculating retrieval scores.
