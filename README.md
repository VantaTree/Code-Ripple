# Intelligent Change Impact Analyzer

## Project Overview

A graph-based system for analyzing the impact of code changes in software repositories.  
It extracts structural information from the code, builds a dependency graph, and identifies components affected by a given change.

The system integrates machine learning to classify and rank impacted components, helping developers focus testing efforts and reduce regression risks.

---

## Features

- Fetch commits from a GitHub repository
- Select and compare two commits
- Analyze code structure using AST
- Build dependency graph of functions/modules
- Predict impact severity using ML

---

## Setup

1. Clone the repository

2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```

3. Activate it:

   * Linux/macOS:

     ```bash
     source venv/bin/activate
     ```
   * Windows:

     ```bash
     venv\Scripts\activate
     ```

4. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

5. Create a `.env` file:

   ```env
   FLASK_DEBUG=1
   MONGO_URI=<MongoDB connection string>
   GITHUB_TOKEN=<GitHub personal access token>
   HF_TOKEN=<HuggingFace access token>
   GEMINI_API_KEY=<Gemini API key>
   GEMINI_MODEL=gemini-2.5-flash-lite
   ```

   Optional:

   ```env
   # Disable all ML tagging entirely.
   DISABLE_ML_TAGGER=1

   # Or disable only the local model path.
   # With USE_LOCAL_MODEL=0, the app can still use Hugging Face Spaces.
   # If the Space is unavailable, it will not fall back to the local model.
   DISABLE_ML_TAGGER=local_only

   # Defaults to local model inference.
   # Set to 0/false to use the Hugging Face Spaces Gradio client instead.
   USE_LOCAL_MODEL=1

   # Optional when USE_LOCAL_MODEL=0
   HF_SPACE_ID=VantaTree/MLCodeTagger
   ```

---

## ML Setup (Dataset + Training)

### 1. Build dataset (local only, not stored in repo)

```bash
python ml_tagger/build_raw_dataset.py
python ml_tagger/dataset_builder.py
```

### 2. Configure training (one-time)

```bash
accelerate config
```

### Recommended settings:

#### If you have an NVIDIA GPU (RTX / GTX)

```
This machine
No distributed training
Do you want to run on CPU only? → NO
torch dynamo → NO
DeepSpeed → NO
GPU ids → 0
NUMA efficiency → NO
Mixed precision → fp16
```

#### If you do NOT have a GPU

```
This machine
No distributed training
Run on CPU only → YES
```

---

### 3. Train model

```bash
python ml_tagger/train.py
```

> Model and dataset are stored locally and are ignored by git.

---

## Run Application

```bash
python app.py
```

Open: [http://127.0.0.1:5000](http://127.0.0.1:5000)

---

## Notes

* `ml_tagger/data/` and `model/` are excluded from git
* Dataset is generated locally for reproducibility
* Only the final trained model is required for inference

## AI Summary

The analysis page can now generate an optional AI summary on top of the deterministic graph analysis.

How it works:

* `services/analyzer.py` builds the normal impact result
* `services/ai_summary.py` converts that result into a compact LLM prompt
* If `GEMINI_API_KEY` is configured, the app requests a structured summary from the Gemini API
* The summary is rendered in the `AI Summary` section of the analysis page

If AI config is missing or the API call fails, the rest of the analysis still works normally.
