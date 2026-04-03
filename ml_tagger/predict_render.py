import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from functools import lru_cache

try:
    from .labels import LABELS
except ImportError:
    from labels import LABELS

MODEL_PATH = "./model"

# Force CPU for Render (no GPU there)
DEVICE = torch.device("cpu")

THRESHOLDS = [0.5] * len(LABELS)

# Lazy globals
_tokenizer = None
_model = None


# ---------------- LOAD MODEL (LAZY) ----------------
def load_model():
    global _tokenizer, _model

    if _model is None:
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
        _model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)

        _model.to(DEVICE)
        _model.eval()

        # 🔥 Optional: reduce memory usage (important for Render)
        _model = torch.quantization.quantize_dynamic(
            _model, {torch.nn.Linear}, dtype=torch.qint8
        )


# ---------------- CORE ----------------
def predict_proba(code_snippet: str):
    load_model()

    inputs = _tokenizer(
        code_snippet,
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=256
    )

    with torch.no_grad():
        outputs = _model(**inputs)

    probs = torch.sigmoid(outputs.logits)[0].tolist()
    return probs

@lru_cache(maxsize=512)
def predict_tags(code_snippet: str):
    probs = predict_proba(code_snippet)

    return [
        LABELS[i]
        for i, p in enumerate(probs)
        if p >= THRESHOLDS[i]
    ]


def predict_with_scores(code_snippet: str):
    probs = predict_proba(code_snippet)

    results = [
        {
            "label": LABELS[i],
            "score": round(p, 4)
        }
        for i, p in enumerate(probs)
        if p >= THRESHOLDS[i]
    ]

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ---------------- TEST ----------------
if __name__ == "__main__":
    sample = """
def login(user, password):
    if not user:
        raise ValueError("Invalid")
    return True
    """

    print("\nTags:")
    print(predict_tags(sample))

    print("\nWith scores:")
    print(predict_with_scores(sample))
    