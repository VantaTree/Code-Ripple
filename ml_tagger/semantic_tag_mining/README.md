# Semantic Tag Mining

This folder is a lightweight experiment for discovering semantic tags from
docstrings.

The pipeline is:

1. Extract normalized words from `ml_tagger/data/raw.json` docstrings.
2. Remove boilerplate words that dominate Python docstrings but carry little
   semantic meaning.
3. Build a term-document matrix with `scikit-learn`.
4. Convert it into TF-IDF-weighted term vectors.
5. Reduce the term vectors with `TruncatedSVD`.
6. Cluster related terms with `DBSCAN`, using an automatically estimated
   `eps` value from nearest-neighbor distances.
7. Emit candidate tags, label hints, long-tail attached terms, and a
   human-readable report.

## Files

- `extract_docstring_terms.py`: tokenizes docstrings and writes frequency files.
- `cluster_terms.py`: clusters informative terms and produces candidate tags.

## Run

```bash
/home/syedm/Documents/Code-Ripple/.venv/bin/python ml_tagger/semantic_tag_mining/extract_docstring_terms.py
/home/syedm/Documents/Code-Ripple/.venv/bin/python ml_tagger/semantic_tag_mining/cluster_terms.py
```

## Outputs

All artifacts are written to `ml_tagger/semantic_tag_mining/outputs/`.

- `docstring_terms.json`: normalized terms for each sample
- `term_frequencies.json`: global document frequencies
- `term_clusters.json`: raw cluster data
- `candidate_tags.json`: compact tag suggestions with label hints and attached
  low-frequency terms
- `cluster_report.md`: readable summary with example docstrings

## Notes

- This is intentionally docstring-driven, because the goal is to infer code
  intent instead of syntax trivia.
- The clustering implementation uses `scikit-learn`, so it is easier to
  explain and tune than the earlier custom matrix pipeline.
- Very low-frequency words can still be useful. Instead of turning every
  singleton into a top-level tag, the clustering step can attach low-frequency
  terms to the nearest semantic cluster as long-tail aliases.
- The generated tag names are candidates, not ground truth. The report is meant
  to make manual review fast before we wire anything into training.
