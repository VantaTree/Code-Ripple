# ml_tagger/train.py
import os
from dotenv import load_dotenv

import torch
from datasets import load_dataset, Features, Sequence, Value
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer
)
from labels import LABELS

load_dotenv()

os.environ["HUGGINGFACE_HUB_TOKEN"] = os.getenv("HF_TOKEN")
os.environ["TOKENIZERS_PARALLELISM"] = "false"

MODEL_NAME = "microsoft/codebert-base"
NUM_LABELS = len(LABELS)

# ---------------- LOAD DATA ----------------
features = Features({
    "code": Value("string"),
    "labels": Sequence(Value("float32"))
})

dataset = load_dataset(
    "json",
    data_files="ml_tagger/data/dataset.json",
    features=features
)["train"]

# Split (important for stability)
dataset = dataset.shuffle(seed=42).train_test_split(test_size=0.1)

# ---------------- TOKENIZER ----------------
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

def preprocess(example):
    tokens = tokenizer(
        example["code"],
        truncation=True,
        padding="max_length",
        max_length=256
    )

    # IMPORTANT: keep labels as plain list (NOT torch tensor)
    tokens["labels"] = [float(x) for x in example["labels"]]

    return tokens

dataset = dataset.map(preprocess, batched=False)

dataset.set_format(
    type="torch",
    columns=["input_ids", "attention_mask", "labels"]
)

# ---------------- MODEL ----------------
model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=NUM_LABELS,
    problem_type="multi_label_classification"
)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

# ---------------- TRAINING ----------------
training_args = TrainingArguments(
    output_dir="./model",

    # 🚀 GPU OPTIMIZATION
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    fp16=True,  # HUGE speed boost on RTX

    # Training
    num_train_epochs=3,
    learning_rate=2e-5,

    # Logging / saving
    logging_steps=50,
    save_steps=500,
    evaluation_strategy="steps",
    eval_steps=500,

    # Stability
    load_best_model_at_end=True,
    metric_for_best_model="loss",

    # Performance
    dataloader_num_workers=0,
)

# ---------------- TRAINER ----------------
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    eval_dataset=dataset["test"],
    tokenizer=tokenizer
)

# ---------------- RUN ----------------
if __name__ == "__main__":
    print("Using device:", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
    
    trainer.train()
    trainer.save_model("./model")
    