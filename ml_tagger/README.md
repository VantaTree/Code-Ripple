# ML Tagger (Code Classification Model)

## Overview

The ML Tagger is a multi-label classification model that analyzes code snippets and assigns semantic tags such as `CONDITIONAL`, `FUNCTION_CALL`, `STATE_MUTATION`, etc.

It is built on top of a pretrained transformer model and fine-tuned on a custom dataset of labeled code snippets to provide lightweight semantic understanding for downstream analysis.

---

## Model Architecture

- Base model: `microsoft/codebert-base`
- Framework: Hugging Face Transformers + PyTorch
- Task type: Multi-label classification
- Output: Independent probability score for each label (via sigmoid)

---

## Dataset

The dataset is a JSON file with code snippets and multi-label targets:

```json
{
  "code": "if x > 0: print(x)",
  "labels": [0, 1, 0, ...]
}
````

* `code`: Source code snippet
* `labels`: Multi-hot encoded vector based on a fixed label list (`labels.py`)

---

## Data Processing

* Tokenizer: CodeBERT tokenizer (`AutoTokenizer`)
* Max length: 256 tokens
* Truncation: Enabled
* Padding: Fixed (`max_length`)
* Labels: Converted to `float` for compatibility with loss function

---

## Training

* Loss: Binary Cross Entropy with Logits
* Learning rate: `2e-5`
* Batch size: `8`
* Epochs: `3`
* Mixed precision: `fp16`

Training is handled using the Hugging Face `Trainer` API with evaluation and checkpointing.

---

## Model Output

The model outputs probability scores for each label:

```json
[
  { "label": "CONDITIONAL", "score": 0.9979 },
  { "label": "FUNCTION_CALL", "score": 0.8907 }
]
```

A threshold (default `0.5`) is applied to select final tags.

---

## Inference

Steps:

1. Tokenize input code
2. Run model forward pass
3. Apply sigmoid to logits
4. Filter labels using threshold

Supports single and batch predictions.

---

## Model Artifacts

```bash
/model
├── model.safetensors
├── config.json
├── tokenizer.json
├── vocab.json
├── merges.txt
├── tokenizer_config.json
└── special_tokens_map.json
```

This directory is sufficient for loading and running the model.

```
