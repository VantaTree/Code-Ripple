import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from .labels import LABELS

MODEL_PATH = "./model"

# 🔥 Device handling (GPU if available)
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# 🔥 Per-label thresholds (better than single threshold)
# You can tune these later
THRESHOLDS = [0.5] * len(LABELS)

# ---------------- LOAD MODEL ----------------
tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)

model.to(DEVICE)
model.eval()


# ---------------- CORE PREDICT ----------------
def predict_proba(code_snippet: str):
    """
    Returns probability scores for each label
    """
    inputs = tokenizer(
        code_snippet,
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=256
    )

    # Move to GPU if available
    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    logits = outputs.logits
    probs = torch.sigmoid(logits)[0]

    return probs.cpu().tolist()


def predict_tags(code_snippet: str):
    """
    Returns predicted tags only
    """
    probs = predict_proba(code_snippet)

    tags = [
        LABELS[i]
        for i, p in enumerate(probs)
        if p >= THRESHOLDS[i]
    ]

    return tags


def predict_with_scores(code_snippet: str):
    """
    Returns tags + confidence scores (BEST for debugging + UI)
    """
    probs = predict_proba(code_snippet)

    results = [
        {
            "label": LABELS[i],
            "score": round(p, 4)
        }
        for i, p in enumerate(probs)
        if p >= THRESHOLDS[i]
    ]

    # Sort by confidence
    results.sort(key=lambda x: x["score"], reverse=True)

    return results


# ---------------- BATCH SUPPORT ----------------
def predict_batch(snippets):
    """
    Efficient batch prediction
    """
    inputs = tokenizer(
        snippets,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256
    )

    inputs = {k: v.to(DEVICE) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.sigmoid(outputs.logits)

    results = []
    for prob in probs:
        prob = prob.cpu().tolist()

        tags = [
            LABELS[i]
            for i, p in enumerate(prob)
            if p >= THRESHOLDS[i]
        ]

        results.append(tags)

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
    