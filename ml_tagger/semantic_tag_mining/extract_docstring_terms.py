import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RAW_PATH = ROOT / "ml_tagger" / "data" / "raw.json"
OUTPUT_DIR = ROOT / "ml_tagger" / "semantic_tag_mining" / "outputs"

WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9_]{2,}")
CAMEL_RE = re.compile(r"([a-z0-9])([A-Z])")

DOCSTRING_STOPWORDS = {
    "a", "all", "also", "an", "and", "any", "are", "args", "argument",
    "arguments", "array", "be", "because", "bool", "boolean", "by", "can", "class",
    "classes", "com", "compliance", "complete", "compute", "default", "defaults",
    "describes", "developer", "dict", "docs",
    "dictionary", "does", "don", "each", "example", "false", "field", "fields",
    "file", "float", "for", "from", "function", "get", "given", "has",
    "have", "if", "in", "index", "indexes", "input", "instance", "int",
    "integer", "into", "invoked", "is", "it", "item", "items", "its", "key", "keys",
    "list", "lists", "made", "makes", "may", "method", "methods", "might",
    "model", "module", "most", "must", "name", "names", "new", "none", "not", "num",
    "number", "object", "objects",
    "of", "on", "one", "only", "operation", "optional", "or", "org", "output",
    "param", "params",
    "parameter", "parameters", "path", "paths", "raise", "raises", "request",
    "requests", "required", "result", "results", "return", "returns", "self",
    "set", "sets", "should", "specified", "str", "string", "strings", "such",
    "that", "the", "their", "them", "then", "there", "these", "this", "those",
    "to", "true", "tuple", "type", "types", "unable", "use", "used", "user",
    "using", "value", "values", "var", "when", "where", "which", "with",
    "without", "would", "www",
    "arg", "args", "assumed", "asynchronously", "define", "github3", "hydpy",
    "idd", "implemented", "networkapi", "osid", "recent", "traceback",
    "xmlerror",
}

NORMALIZATION_OVERRIDES = {
    "written": "write",
    "writes": "write",
    "writing": "write",
    "wrote": "write",
    "loaded": "load",
    "loads": "load",
    "loading": "load",
    "sent": "send",
    "sends": "send",
    "sending": "send",
    "received": "receive",
    "receives": "receive",
    "receiving": "receive",
    "calculated": "calculate",
    "calculates": "calculate",
    "calculating": "calculate",
    "computed": "compute",
    "computes": "compute",
    "computing": "compute",
    "authenticated": "authenticate",
    "authentication": "authenticate",
    "directories": "directory",
    "columns": "column",
    "rows": "row",
    "messages": "message",
    "vertices": "vertex",
    "edges": "edge",
}


def normalize_word(word):
    return NORMALIZATION_OVERRIDES.get(word, word)


def split_token(token):
    token = CAMEL_RE.sub(r"\1 \2", token)
    parts = []

    for part in token.replace("_", " ").split():
        word = part.lower()
        word = normalize_word(word)
        if len(word) < 3 or word.isdigit() or word in DOCSTRING_STOPWORDS:
            continue
        parts.append(word)

    return parts


def tokenize_docstring(docstring):
    tokens = []

    for raw_token in WORD_RE.findall(docstring or ""):
        tokens.extend(split_token(raw_token))

    return tokens


def main():
    raw = json.loads(RAW_PATH.read_text())
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    per_sample = []
    frequencies = Counter()

    for index, item in enumerate(raw):
        docstring = item.get("docstring", "")
        tokens = tokenize_docstring(docstring)
        unique_tokens = sorted(set(tokens))

        per_sample.append({
            "sample_index": index,
            "docstring": docstring,
            "terms": unique_tokens,
        })
        frequencies.update(unique_tokens)

    (OUTPUT_DIR / "docstring_terms.json").write_text(json.dumps(per_sample, indent=2))
    (OUTPUT_DIR / "term_frequencies.json").write_text(
        json.dumps(
            [
                {"term": term, "doc_frequency": count}
                for term, count in frequencies.most_common()
            ],
            indent=2,
        )
    )

    print(f"Saved {len(per_sample)} tokenized docstrings to {OUTPUT_DIR}")
    print(f"Tracked {len(frequencies)} unique normalized terms")


if __name__ == "__main__":
    main()
