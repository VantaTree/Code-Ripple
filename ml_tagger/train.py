# ml_tagger/train.py
import os
from pathlib import Path

from dotenv import load_dotenv

import torch
from datasets import Features, Sequence, Value, load_dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)

try:
    from .labels import LABELS
except ImportError:
    from labels import LABELS


ROOT = Path(__file__).resolve().parents[1]
DATASET_PATH = ROOT / "ml_tagger" / "data" / "dataset.json"
MODEL_OUTPUT_DIR = ROOT / "model"
LOCAL_CACHE_DIR = ROOT / "tmp" / "hf_cache"
MODEL_NAME = "microsoft/codebert-base"
NUM_LABELS = len(LABELS)
MAX_LENGTH = 256
TEST_SIZE = 0.1
SEED = 42


def configure_environment():
    load_dotenv()

    LOCAL_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    os.environ["HUGGINGFACE_HUB_TOKEN"] = os.getenv("HF_TOKEN", "")
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    os.environ["HF_HOME"] = str(LOCAL_CACHE_DIR)
    os.environ["HF_DATASETS_CACHE"] = str(LOCAL_CACHE_DIR / "datasets")
    os.environ["TRANSFORMERS_CACHE"] = str(LOCAL_CACHE_DIR / "transformers")


def get_device():
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def build_features():
    return Features(
        {
            "code": Value("string"),
            "labels": Sequence(Value("float32")),
        }
    )


def load_training_dataset():
    if not DATASET_PATH.exists():
        raise FileNotFoundError(
            f"Dataset not found at {DATASET_PATH}. "
            "Run ml_tagger/dataset_builder.py first."
        )

    dataset = load_dataset(
        "json",
        data_files=str(DATASET_PATH),
        features=build_features(),
    )["train"]

    if len(dataset) == 0:
        raise ValueError(f"Dataset at {DATASET_PATH} is empty.")

    first_labels = dataset[0]["labels"]
    if len(first_labels) != NUM_LABELS:
        raise ValueError(
            f"Label size mismatch: dataset has {len(first_labels)} values per sample, "
            f"but labels.py defines {NUM_LABELS} labels."
        )

    return dataset.shuffle(seed=SEED).train_test_split(test_size=TEST_SIZE)


def build_tokenizer():
    return AutoTokenizer.from_pretrained(MODEL_NAME)


def preprocess_dataset(dataset, tokenizer):
    def preprocess(example):
        tokens = tokenizer(
            example["code"],
            truncation=True,
            padding="max_length",
            max_length=MAX_LENGTH,
        )
        tokens["labels"] = [float(value) for value in example["labels"]]
        return tokens

    dataset = dataset.map(preprocess, batched=False)
    dataset.set_format(
        type="torch",
        columns=["input_ids", "attention_mask", "labels"],
    )
    return dataset


def build_model(device):
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=NUM_LABELS,
        problem_type="multi_label_classification",
    )
    model.to(device)
    return model


def build_training_arguments(device):
    use_cuda = device.type == "cuda"

    return TrainingArguments(
        output_dir=str(MODEL_OUTPUT_DIR),
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        fp16=use_cuda,
        bf16=False,
        num_train_epochs=3,
        learning_rate=2e-5,
        logging_steps=50,
        save_steps=500,
        evaluation_strategy="steps",
        eval_steps=500,
        load_best_model_at_end=True,
        metric_for_best_model="loss",
        dataloader_num_workers=0,
        report_to="none",
        save_total_limit=2,
        seed=SEED,
    )


def build_trainer():
    configure_environment()
    device = get_device()
    dataset = load_training_dataset()
    tokenizer = build_tokenizer()
    tokenized_dataset = preprocess_dataset(dataset, tokenizer)
    model = build_model(device)
    training_args = build_training_arguments(device)

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset["train"],
        eval_dataset=tokenized_dataset["test"],
        tokenizer=tokenizer,
    )

    return trainer, device, len(tokenized_dataset["train"]), len(tokenized_dataset["test"])


def main():
    trainer, device, train_size, eval_size = build_trainer()
    device_name = torch.cuda.get_device_name(0) if device.type == "cuda" else "CPU"

    print(f"Using device: {device_name}")
    print(f"Labels: {NUM_LABELS}")
    print(f"Train samples: {train_size}")
    print(f"Eval samples: {eval_size}")
    print(f"Dataset: {DATASET_PATH}")
    print(f"Model output dir: {MODEL_OUTPUT_DIR}")

    trainer.train()
    trainer.save_model(str(MODEL_OUTPUT_DIR))


if __name__ == "__main__":
    main()
