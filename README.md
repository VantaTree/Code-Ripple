# Intelligent Change Impact Analyzer

## Project Overview

A graph-based system for analyzing the impact of code changes in software repositories.
It extracts structural information from the code, builds a dependency graph, and identifies components affected by a given change.

The system integrates basic machine learning to classify and rank impacted components based on dependency features, helping developers focus testing efforts and reduce regression risks.

---

## Features

* Fetch commits from a GitHub repository
* Select and compare two commits
* Analyze code structure using AST
* Build dependency graph of functions/modules
* Predict impact severity using ML

---

## Setup

1. Clone the repository

2. Create a virtual environment:

   ```
   python -m venv venv
   ```

3. Activate it:

   * Linux/macOS:

     ```
     source venv/bin/activate
     ```
   * Windows:

     ```
     venv\Scripts\activate
     ```

4. Install dependencies:

   ```
   pip install -r requirements.txt
   ```

5. Create a `.env` file:

   ```
   FLASK_DEBUG=1
   ```

---

## Run

```
python app.py
```

Open: http://127.0.0.1:5000
