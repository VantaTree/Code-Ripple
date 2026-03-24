import ast
import json
from labels import LABELS
import warnings
warnings.filterwarnings("ignore", category=SyntaxWarning)

def sanitize_code(code):
    # Fix common escape issues
    code = code.replace("\\", "\\\\")
    return code

# ---------------- AST TAGS ----------------
def extract_tags_from_ast(code):
    tags = set()

    try:
        code = sanitize_code(code)
        tree = ast.parse(code, type_comments=True)
    except Exception:
        return set()  # unavoidable for broken code

    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.While)):
            tags.add("LOOP")

        if isinstance(node, ast.If):
            tags.add("CONDITIONAL")

        if isinstance(node, ast.Try):
            tags.add("ERROR_HANDLING")

        if isinstance(node, ast.Assign):
            tags.add("STATE")

        if isinstance(node, ast.Call):
            tags.add("FUNCTION_CALL")

        if isinstance(node, ast.ClassDef):
            tags.add("CLASS_DEF")

        if isinstance(node, ast.AsyncFunctionDef):
            tags.add("ASYNC")

    return tags


# ---------------- DOCSTRING TAGS ----------------
DOC_TAG_RULES = {
    "AUTH": ["auth", "login", "password", "token"],
    "NETWORK": ["request", "http", "api", "fetch"],
    "FILE_IO": ["file", "read", "write", "open"],
    "DATABASE": ["db", "sql", "query"],
    "MATH": ["sum", "calculate", "compute"],
    "STRING": ["string", "format", "split"],
    "VALIDATION": ["validate", "check", "verify"],
}

def extract_tags_from_doc(doc):
    if not doc:
        return set()

    text = doc.lower()
    tags = set()

    for tag, keywords in DOC_TAG_RULES.items():
        if any(k in text for k in keywords):
            tags.add(tag)

    return tags


# ---------------- MAIN BUILDER ----------------
def build_dataset(input_file, output_file):
    dataset = []

    with open(input_file, "r") as f:
        raw = json.load(f)

    for item in raw:
        code = item.get("code", "")
        doc = item.get("docstring", "")

        ast_tags = extract_tags_from_ast(code)
        doc_tags = extract_tags_from_doc(doc)

        # 🔥 COMBINE BOTH
        tags = ast_tags.union(doc_tags)

        if not tags:
            continue

        dataset.append({
            "code": code,
            "labels": [1 if label in tags else 0 for label in LABELS]
        })

    with open(output_file, "w") as f:
        json.dump(dataset, f, indent=2)

    print(f"Saved {len(dataset)} samples → {output_file}")


if __name__ == "__main__":
    build_dataset("ml_tagger/data/raw.json", "ml_tagger/data/dataset.json")
    