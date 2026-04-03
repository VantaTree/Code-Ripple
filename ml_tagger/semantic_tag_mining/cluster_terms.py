import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.neighbors import NearestNeighbors

from extract_docstring_terms import tokenize_docstring


ROOT = Path(__file__).resolve().parents[2]
RAW_PATH = ROOT / "ml_tagger" / "data" / "raw.json"
OUTPUT_DIR = ROOT / "ml_tagger" / "semantic_tag_mining" / "outputs"

CONCEPT_MAP = {
    "authenticate": "AUTH",
    "username": "AUTH",
    "password": "AUTH",
    "secret": "AUTH",
    "credentials": "AUTH",
    "token": "AUTH",
    "connect": "NETWORK",
    "server": "NETWORK",
    "port": "NETWORK",
    "host": "NETWORK",
    "socket": "NETWORK",
    "connection": "NETWORK",
    "asynchronous": "ASYNC",
    "synchronous": "ASYNC",
    "callback": "ASYNC",
    "thread": "ASYNC",
    "files": "FILE_IO",
    "directory": "FILE_IO",
    "folder": "FILE_IO",
    "filename": "FILE_IO",
    "download": "FILE_IO",
    "logger": "LOGGING",
    "logging": "LOGGING",
    "log": "LOGGING",
    "debug": "LOGGING",
    "date": "DATETIME",
    "day": "DATETIME",
    "month": "DATETIME",
    "year": "DATETIME",
    "utc": "DATETIME",
    "datetime": "DATETIME",
    "matrix": "NUMERICS",
    "shape": "NUMERICS",
    "numpy": "NUMERICS",
    "ndarray": "NUMERICS",
    "vector": "NUMERICS",
    "distribution": "STATS",
    "random": "STATS",
    "sample": "STATS",
    "samples": "STATS",
    "match": "MATCHING",
    "matched": "MATCHING",
    "matches": "MATCHING",
    "matching": "MATCHING",
    "regex": "MATCHING",
    "image": "IMAGE",
    "pixel": "IMAGE",
    "pixels": "IMAGE",
    "height": "IMAGE",
    "width": "IMAGE",
    "angle": "GEOMETRY",
    "degrees": "GEOMETRY",
    "coordinates": "GEOMETRY",
    "center": "GEOMETRY",
    "specification": "VALIDATION",
    "checked": "VALIDATION",
    "valid": "VALIDATION",
    "missing": "VALIDATION",
}

CONCEPT_PRIORITY = [
    "AUTH",
    "NETWORK",
    "ASYNC",
    "FILE_IO",
    "LOGGING",
    "DATETIME",
    "MATCHING",
    "IMAGE",
    "GEOMETRY",
    "NUMERICS",
    "STATS",
    "VALIDATION",
]


def load_samples():
    return json.loads(RAW_PATH.read_text())


def build_term_docs(samples):
    doc_terms = []
    doc_frequency = Counter()

    for item in samples:
        terms = sorted(set(tokenize_docstring(item.get("docstring", ""))))
        doc_terms.append(terms)
        doc_frequency.update(terms)

    return doc_terms, doc_frequency


def select_vocabulary(doc_frequency, total_docs, min_doc_freq, max_doc_ratio, max_vocab):
    vocab = [
        term
        for term, count in doc_frequency.items()
        if count >= min_doc_freq and (count / total_docs) <= max_doc_ratio
    ]
    vocab.sort(key=lambda term: (-doc_frequency[term], term))
    return vocab[:max_vocab]


def build_term_embeddings(doc_terms, vocabulary, embedding_dim):
    docs_as_text = [" ".join(terms) for terms in doc_terms]

    vectorizer = CountVectorizer(
        tokenizer=str.split,
        preprocessor=None,
        lowercase=False,
        binary=True,
        vocabulary=vocabulary,
        token_pattern=None,
    )
    term_document = vectorizer.fit_transform(docs_as_text).transpose()

    tfidf = TfidfTransformer(norm="l2", use_idf=True, smooth_idf=True)
    weighted = tfidf.fit_transform(term_document)

    max_components = min(weighted.shape[0] - 1, weighted.shape[1] - 1, embedding_dim)
    if max_components < 2:
        return weighted.toarray()

    reducer = TruncatedSVD(n_components=max_components, random_state=42)
    return reducer.fit_transform(weighted)


def estimate_eps(embeddings, min_samples, percentile):
    neighbors = NearestNeighbors(
        n_neighbors=min_samples,
        metric="cosine",
    )
    neighbors.fit(embeddings)
    distances, _ = neighbors.kneighbors(embeddings)
    kth_distances = distances[:, -1]
    return float(np.percentile(kth_distances, percentile))


def cluster_embeddings(embeddings, min_samples, percentile):
    eps = estimate_eps(embeddings, min_samples=min_samples, percentile=percentile)
    clusterer = DBSCAN(
        eps=eps,
        min_samples=min_samples,
        metric="cosine",
    )
    labels = clusterer.fit_predict(embeddings)
    similarity = cosine_similarity(embeddings)

    clusters = defaultdict(list)
    for index, label in enumerate(labels):
        if label == -1:
            continue
        clusters[int(label)].append(index)

    return list(clusters.values()), similarity, eps, labels


def generate_tag_name(top_terms):
    concept_counts = Counter(CONCEPT_MAP[term] for term in top_terms if term in CONCEPT_MAP)

    if concept_counts:
        concepts = sorted(
            concept_counts,
            key=lambda concept: (-concept_counts[concept], CONCEPT_PRIORITY.index(concept)),
        )
        chosen = concepts[:2]
        slug = "_".join(chosen)
        label_hint = " / ".join(chosen)
        return slug, label_hint

    fallback_terms = top_terms[:3]
    slug = "_".join(term.upper() for term in fallback_terms)
    label_hint = " / ".join(term.replace("_", " ") for term in fallback_terms)
    return slug, label_hint


def summarize_cluster(cluster_indices, vocab, doc_frequency, similarity):
    cluster_similarity = similarity[np.ix_(cluster_indices, cluster_indices)]
    centrality = cluster_similarity.sum(axis=1)

    ranked = sorted(
        (
            (
                vocab[index],
                float(centrality[position]),
                int(doc_frequency[vocab[index]]),
            )
            for position, index in enumerate(cluster_indices)
        ),
        key=lambda item: (-item[1], -item[2], item[0]),
    )

    top_terms = [term for term, _, _ in ranked[:8]]
    candidate_tag, label_hint = generate_tag_name(top_terms)
    return {
        "candidate_tag": candidate_tag,
        "label_hint": label_hint,
        "top_terms": top_terms,
    }


def representative_docstrings(samples, cluster_terms, limit):
    representatives = []

    for item in samples:
        docstring = (item.get("docstring") or "").strip()
        if not docstring:
            continue

        terms = set(tokenize_docstring(docstring))
        overlap = len(terms.intersection(cluster_terms))
        if overlap == 0:
            continue

        representatives.append(
            {
                "score": overlap,
                "docstring": " ".join(docstring.split()),
            }
        )

    representatives.sort(key=lambda item: (-item["score"], len(item["docstring"])))
    unique = []
    seen = set()

    for item in representatives:
        snippet = item["docstring"][:240]
        if snippet in seen:
            continue
        seen.add(snippet)
        unique.append(snippet)
        if len(unique) >= limit:
            break

    return unique


def collect_long_tail_terms(doc_terms, doc_frequency, cluster_payload, min_df, max_df, limit):
    cluster_term_sets = [set(cluster["all_terms"]) for cluster in cluster_payload]
    attachment_scores = [Counter() for _ in cluster_payload]

    for terms in doc_terms:
        term_set = set(terms)
        matched_clusters = []

        for index, cluster_terms in enumerate(cluster_term_sets):
            overlap = len(term_set.intersection(cluster_terms))
            if overlap > 0:
                matched_clusters.append((index, overlap))

        if not matched_clusters:
            continue

        for term in term_set:
            freq = doc_frequency[term]
            if freq < min_df or freq > max_df:
                continue
            for cluster_index, overlap in matched_clusters:
                attachment_scores[cluster_index][term] += overlap

    for cluster_index, cluster in enumerate(cluster_payload):
        selected = []
        for term, score in attachment_scores[cluster_index].most_common():
            if term in cluster_term_sets[cluster_index]:
                continue
            freq = doc_frequency[term]
            purity = score / max(1, freq)
            if purity < 0.6:
                continue
            selected.append(
                {
                    "term": term,
                    "doc_frequency": freq,
                    "association": round(score, 3),
                    "purity": round(purity, 3),
                }
            )
            if len(selected) >= limit:
                break
        cluster["long_tail_terms"] = selected


def write_outputs(clusters, candidate_tags):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "term_clusters.json").write_text(json.dumps(clusters, indent=2))
    (OUTPUT_DIR / "candidate_tags.json").write_text(json.dumps(candidate_tags, indent=2))

    lines = ["# Semantic Term Clusters", ""]
    for cluster in clusters:
        lines.append(f"## {cluster['candidate_tag']}")
        lines.append("")
        lines.append(f"- Cluster size: {cluster['cluster_size']}")
        lines.append(f"- Label hint: {cluster['label_hint']}")
        lines.append(f"- Top terms: {', '.join(cluster['top_terms'])}")
        if cluster["long_tail_terms"]:
            lines.append(
                "- Long-tail terms: "
                + ", ".join(item["term"] for item in cluster["long_tail_terms"])
            )
        lines.append("- Example docstrings:")
        for example in cluster["examples"]:
            lines.append(f"  - {example}")
        lines.append("")

    (OUTPUT_DIR / "cluster_report.md").write_text("\n".join(lines))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-doc-freq", type=int, default=35)
    parser.add_argument("--max-doc-ratio", type=float, default=0.08)
    parser.add_argument("--max-vocab", type=int, default=900)
    parser.add_argument("--embedding-dim", type=int, default=64)
    parser.add_argument("--dbscan-min-samples", type=int, default=3)
    parser.add_argument("--eps-percentile", type=float, default=78.0)
    parser.add_argument("--min-cluster-size", type=int, default=3)
    parser.add_argument("--examples-per-cluster", type=int, default=3)
    parser.add_argument("--long-tail-min-df", type=int, default=1)
    parser.add_argument("--long-tail-max-df", type=int, default=5)
    parser.add_argument("--long-tail-per-cluster", type=int, default=12)
    args = parser.parse_args()

    samples = load_samples()
    doc_terms, doc_frequency = build_term_docs(samples)
    vocab = select_vocabulary(
        doc_frequency=doc_frequency,
        total_docs=len(doc_terms),
        min_doc_freq=args.min_doc_freq,
        max_doc_ratio=args.max_doc_ratio,
        max_vocab=args.max_vocab,
    )

    embeddings = build_term_embeddings(
        doc_terms=doc_terms,
        vocabulary=vocab,
        embedding_dim=args.embedding_dim,
    )
    raw_clusters, similarity, eps, labels = cluster_embeddings(
        embeddings=embeddings,
        min_samples=args.dbscan_min_samples,
        percentile=args.eps_percentile,
    )

    cluster_payload = []
    candidate_tags = []

    for indices in raw_clusters:
        if len(indices) < args.min_cluster_size:
            continue

        summary = summarize_cluster(indices, vocab, doc_frequency, similarity)
        cluster_terms = set(summary["top_terms"])
        examples = representative_docstrings(samples, cluster_terms, args.examples_per_cluster)
        payload = {
            "candidate_tag": summary["candidate_tag"],
            "label_hint": summary["label_hint"],
            "cluster_size": len(indices),
            "top_terms": summary["top_terms"],
            "all_terms": [vocab[index] for index in indices],
            "examples": examples,
        }
        cluster_payload.append(payload)
        candidate_tags.append(
            {
                "tag": summary["candidate_tag"],
                "label_hint": summary["label_hint"],
                "core_terms": summary["top_terms"][:5],
            }
        )

    cluster_payload.sort(key=lambda item: (-item["cluster_size"], item["candidate_tag"]))
    collect_long_tail_terms(
        doc_terms=doc_terms,
        doc_frequency=doc_frequency,
        cluster_payload=cluster_payload,
        min_df=args.long_tail_min_df,
        max_df=args.long_tail_max_df,
        limit=args.long_tail_per_cluster,
    )

    long_tail_lookup = {
        cluster["candidate_tag"]: cluster["long_tail_terms"]
        for cluster in cluster_payload
    }
    enriched_candidate_tags = []
    for item in candidate_tags:
        enriched_candidate_tags.append(
            {
                **item,
                "long_tail_terms": long_tail_lookup.get(item["tag"], []),
            }
        )

    enriched_candidate_tags.sort(key=lambda item: item["tag"])
    write_outputs(cluster_payload, enriched_candidate_tags)

    noise_count = int(np.sum(labels == -1))
    print(f"Vocabulary size: {len(vocab)}")
    print(f"DBSCAN eps: {eps:.4f}")
    print(f"Noise terms: {noise_count}")
    print(f"Saved {len(cluster_payload)} clusters to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
