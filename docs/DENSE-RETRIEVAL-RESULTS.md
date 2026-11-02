# Matched-context dense retrieval: executed results

Executed 2 November 2026. This experiment runs the actual unquantized `sentence-transformers/all-MiniLM-L6-v2` encoder on CPU. It is an established small dense baseline, not a state-of-the-art model or a complete neural agent-memory system. The comparison is evidence-session retrieval, without generated answers or a user study.

## Frozen model and context

The model is fixed at public revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`, licensed Apache-2.0. Its official card prescribes attention-mask mean pooling and L2 normalization. The 384-dimensional vectors come from real FP32 ONNX inference through ONNX Runtime 1.12.1, Tokenizers 0.11.6 and NumPy 1.23.3. The upstream sentence configuration limits inputs to 256 tokens; this run uses 254 content WordPieces plus [CLS]/[SEP] and no prompts. The full model, tokenizer and configuration checksums are frozen in `evaluation/DENSE-RETRIEVAL-PROTOCOL.md` and recorded in the environment JSON.

Primary documentation: [official model card](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), [ONNX Runtime Python API](https://onnxruntime.ai/docs/api/python/api_summary.html).

All 500 LongMemEval-S question records are retained. Recall is evaluated on the same 470 non-abstention questions and unchanged evidence IDs as the existing supplied-history run. The raw file contains 23,867 session occurrences. Thirteen duplicate IDs contain identical text and merge in the actual core, leaving 23,854 distinct question/session candidates; this experiment matches those candidate pools exactly. Byte-identical session text is encoded once, producing 18,464 unique session vectors plus 500 question vectors. Sharing an encoding does not share candidate pools between questions.

The matched lexical control uses SQLite FTS5 BM25 on exactly the original text prefix visible to the encoder, defined by the last retained WordPiece character offset. Both methods receive the same query prefix and the same candidate IDs. Neither indexes questions, expected answers, `has_answer` annotations or evidence IDs as session content. The existing full-session 95.4% lexical result remains a separate context condition and is not an information-matched dense comparison.

## Results

Values are percentages with percentile 95% intervals from 2,000 paired question-bootstrap samples. These intervals are conditional on the fixed 470-question benchmark.

| Method / matched input | Recall@5 | Recall@10 | All evidence@10 |
|---|---:|---:|---:|
| dense-minilm | 85.91 [83.15, 88.52] | 92.80 [90.72, 94.61] | 88.30 [85.31, 91.06] |
| bm25-matched-prefix | 74.59 [71.12, 77.67] | 82.31 [79.20, 85.25] | 73.83 [69.99, 77.87] |

| Dense minus matched BM25 | Recall@5 gain (pp) | Recall@10 gain (pp) | All-evidence@10 gain (pp) |
|---|---:|---:|---:|
| Same questions and character windows | 11.32 [8.08, 14.65] | 10.49 [7.36, 13.47] | 14.47 [10.63, 18.30] |

At the matched input budget, MiniLM improves Recall@10 by 10.49 percentage points and all-evidence retrieval by 14.47 points. This measures the encoder/ranking choice within the shared session-prefix representation. It does not establish that dense retrieval wins with complete histories, optimal chunking, atomic fact extraction, a larger encoder, graph memory or generated-answer scoring.

## Truncation and costs

- 23,283 of 23,867 session occurrences are truncated (97.55%). 18,039 of 18,464 unique session texts are truncated. No question is truncated.
- The visible session windows contain 5,988,155 of 55,144,444 original WordPieces (10.86%). This is a severe, explicitly shared context restriction.
- 18,964 unique texts were actually encoded in 1,186 forward batches. The embedding cache was not reused on this run.
- Encoding took 389.36 s on CPU with four intra-op threads; preprocessing took 77.42 s, and total experimental execution took 470.02 s.
- Cached float32 vectors occupy 29,128,704 bytes (27.78 MiB). The downloaded model/config/tokenizer artifacts total 91,104,286 bytes (86.88 MiB).
- The OS-reported process peak RSS is 1.68 GiB, including the loaded raw JSON, reconstructed texts, tokenization and model runtime. It is not model-only memory.
- With vectors precomputed, total dense scoring over 500 candidate pools took 0.280 s. Matched lexical index construction took 0.490 s and lexical query execution took 0.084 s. Encoding is part of the dense cost and must not be omitted when interpreting these figures.
- Paid API calls: zero. Anonymous model artifacts were downloaded before the timed corpus run, so the recorded invocation downloaded zero additional bytes. Network/model-download time is excluded from the 470.02 s experimental execution.

## Question-type outputs

| Question type | Eligible questions | Dense Recall@10 (%) | Matched BM25 Recall@10 (%) |
|---|---:|---:|---:|
| knowledge-update | 72 | 93.75 | 79.17 |
| multi-session | 121 | 93.31 | 83.88 |
| single-session-assistant | 56 | 98.21 | 96.43 |
| single-session-preference | 30 | 96.67 | 73.33 |
| single-session-user | 64 | 89.06 | 67.19 |
| temporal-reasoning | 127 | 90.35 | 86.12 |

These are complete descriptive slices, without selecting a favorable subset or applying additional significance claims.

## Reproduction and validation

```sh
python3 -m pip install -r evaluation/requirements-dense.txt
python3 evaluation/scripts/dense-retrieval.py
```

The default model directory is under excluded `evaluation/data/external/models/`. Download URLs identify the exact public model revision and checksums are checked before loading. An existing external model cache can be supplied with `--model-dir`; `--reuse-embeddings` is explicit and records reuse. The initial run did not reuse embeddings. The script uses direct anonymous HTTP downloads and does not read model-hub credentials.

Artifacts:

- `evaluation/DENSE-RETRIEVAL-PROTOCOL.md`: pre-run model, pooling, context, bootstrap and information boundaries, plus the pre-inference duplicate-ID audit.
- `evaluation/scripts/dense-retrieval.py` and `evaluation/requirements-dense.txt`: executable implementation and pinned dependencies.
- `evaluation/results/dense-retrieval-environment.json`: versions, all hashes, counts, truncation and execution costs.
- `evaluation/results/dense-retrieval-text-manifest.json`: original/visible text hashes and candidate mappings. No original history text is copied into this manifest.
- `evaluation/results/dense-retrieval-embeddings.npy`: actual normalized float32 vectors for exact rescoring.
- `evaluation/results/dense-retrieval-outcomes.json`: all 500 per-question retrieved IDs, scores, evidence IDs and recall measures.
- `evaluation/results/dense-retrieval-summary.json`: paired bootstrap intervals and all question-type slices.
- `evaluation/results/dense-retrieval-check.json`: independent reconstruction of all candidate pools, visible-window hashes, all dense/lexical rankings, all scores and all paired intervals; a real-model forward repeat checks selected cached vectors.

The duplicate-ID preflight assertion failed before any dataset model inference. The addendum records how the candidate mapping was aligned with the already evaluated core; no retrieval result or evidence label guided that change.

## Suggested manuscript paragraph

> We add an independent dense retriever using the fixed all-MiniLM-L6-v2 encoder on all 500 LongMemEval-S questions. Both the encoder and an FTS5 control receive the same first 254 WordPieces of each session, with original character windows matched and all candidate IDs retained. On the 470 evidence-scored questions, dense retrieval reaches 92.8% Recall@10 against 82.3% for matched-window BM25, a paired gain of 10.5 percentage points [7.4, 13.5]. All-evidence retrieval rises from 73.8% to 88.3%. Because 97.6% of session occurrences are truncated, this comparison isolates retrieval under a fixed input budget; the separate full-session lexical score is not an equivalent-context comparator. All 18,964 unique session and question texts are encoded locally, requiring 389.4 s on the measured CPU.

The author should distinguish this completed neural retrieval comparison from any still-unexecuted full graph-memory system, installed-extension autonomy or multi-client handoff evaluation.
