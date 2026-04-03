import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

try:
    from .labels import LABELS
except ImportError:
    from labels import LABELS

MODEL_PATH = "./model"

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)

def predict(code):
    inputs = tokenizer(code, return_tensors="pt", truncation=True, padding=True)

    with torch.no_grad():
        logits = model(**inputs).logits

    probs = torch.sigmoid(logits)[0]

    tags = [
        LABELS[i]
        for i, p in enumerate(probs)
        if p > 0.5
    ]

    return tags


if __name__ == "__main__":
    code = """
    for i in range(10):
        print(i)
    """

    print(predict(code))
    
