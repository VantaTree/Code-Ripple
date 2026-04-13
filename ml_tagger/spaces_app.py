import gradio as gr
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# ---------------- MODEL ----------------
MODEL_ID = "VantaTree/MLCodeTagger"

tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_ID)

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)
model.eval()

# ---------------- LABELS ----------------
from labels import LABELS
THRESHOLDS = [0.5] * len(LABELS)

# ---------------- CORE FUNCTION ----------------
def _predict_probs(text):
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=256
    )

    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        logits = model(**inputs).logits

    probs = torch.sigmoid(logits)[0].cpu().tolist()
    return probs


# ---------------- 1. TAGS ONLY ----------------
def predict_tags(code_snippet):
    probs = _predict_probs(code_snippet)

    return [
        LABELS[i]
        for i, p in enumerate(probs)
        if p >= THRESHOLDS[i]
    ]


# ---------------- 2. SCORES ----------------
def predict_with_scores(code_snippet):
    probs = _predict_probs(code_snippet)

    results = [
        {"label": LABELS[i], "score": round(probs[i], 4)}
        for i in range(len(probs))
        if probs[i] >= THRESHOLDS[i]
    ]

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ---------------- 3. BATCH ----------------
def predict_batch(text):
    snippets = [s.strip() for s in text.split("\n\n") if s.strip()]

    inputs = tokenizer(
        snippets,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256
    )

    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.sigmoid(outputs.logits).cpu().tolist()

    results = []
    for prob in probs:
        tags = [
            LABELS[i]
            for i, p in enumerate(prob)
            if p >= THRESHOLDS[i]
        ]
        results.append(tags)

    return results


# ---------------- UI + API ----------------
with gr.Blocks() as demo:

    gr.Markdown("# 🔥 Code Tagger API")

    with gr.Tab("Predict Tags"):
        inp1 = gr.Textbox(lines=6, label="Code Snippet")
        out1 = gr.JSON()
        gr.Button("Run").click(predict_tags, inp1, out1)

    with gr.Tab("Predict With Scores"):
        inp2 = gr.Textbox(lines=6, label="Code Snippet")
        out2 = gr.JSON()
        gr.Button("Run").click(predict_with_scores, inp2, out2)

    with gr.Tab("Batch Predict"):
        inp3 = gr.Textbox(lines=8, label="Snippets (separate with blank line)")
        out3 = gr.JSON()

        gr.Button("Run").click(predict_batch, inp3, out3)

# IMPORTANT: enables API endpoints
demo.queue()
demo.launch()
