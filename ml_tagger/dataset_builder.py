import json
import re

try:
    from .labels import LABELS, TAG_KEYWORDS
except ImportError:
    from labels import LABELS, TAG_KEYWORDS


TOKEN_RE = re.compile(r"[a-z0-9_]+")


def normalize_text(text):
    return " ".join(TOKEN_RE.findall((text or "").lower()))


def extract_semantic_tags(code, doc):
    normalized_code = normalize_text(code)
    normalized_doc = normalize_text(doc)
    combined = f"{normalized_code} {normalized_doc}".strip()

    tags = set()

    for label, keywords in TAG_KEYWORDS.items():
        for keyword in keywords:
            normalized_keyword = normalize_text(keyword)
            if not normalized_keyword:
                continue

            if f" {normalized_keyword} " in f" {combined} ":
                tags.add(label)
                break

    return tags


def build_dataset(input_file, output_file):
    dataset = []

    with open(input_file, "r") as handle:
        raw = json.load(handle)

    for item in raw:
        code = item.get("code", "")
        doc = item.get("docstring", "")
        tags = extract_semantic_tags(code, doc)

        if not tags:
            continue

        dataset.append(
            {
                "code": code,
                "labels": [1 if label in tags else 0 for label in LABELS],
            }
        )

    with open(output_file, "w") as handle:
        json.dump(dataset, handle, indent=2)

    print(f"Saved {len(dataset)} samples -> {output_file}")


if __name__ == "__main__":
    build_dataset("ml_tagger/data/raw.json", "ml_tagger/data/dataset.json")
