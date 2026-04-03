# ML Tagger (Code Classification Model)

## Overview

The ML Tagger is a multi-label classification model that analyzes code snippets and assigns semantic tags such as `AUTHENTICATION`, `HTTP_API`, `DATABASE`, `FILE_IO`, and `LOGGING`.

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
```

* `code`: Source code snippet
* `labels`: Multi-hot encoded vector based on a fixed semantic label list in `ml_tagger/labels.py`

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
* Mixed precision: `fp16` on CUDA, disabled on CPU

Training is handled using the Hugging Face `Trainer` API with evaluation and checkpointing.

## Run Order

```bash
/home/syedm/Documents/Code-Ripple/.venv/bin/python ml_tagger/dataset_builder.py
/home/syedm/Documents/Code-Ripple/.venv/bin/python ml_tagger/train.py
```

Notes:

* `train.py` now validates that `ml_tagger/data/dataset.json` exists before training.
* The training script uses a local cache under `tmp/hf_cache` to avoid machine-specific Hugging Face cache issues.
* The number of values in each dataset label vector must match the number of labels in `ml_tagger/labels.py`.

---

## Model Output

The model outputs probability scores for each label:

```json
[
  { "label": "AUTHENTICATION", "score": 0.9979 },
  { "label": "HTTP_API", "score": 0.8907 }
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
