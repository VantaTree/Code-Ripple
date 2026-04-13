import json
import os
import time
from typing import Any

import requests


GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
MAX_CHUNKS_FOR_PROMPT = 8
MAX_PATHS_PER_CHUNK = 4
MAX_CODE_SNIPPET_CHARS = 500
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite"
AI_SUMMARY_RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}
AI_SUMMARY_MAX_RETRIES = 3


def ai_summary_enabled() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def build_ai_summary_payload(result: dict[str, Any]) -> dict[str, Any]:
    chunks = result.get("chunks", [])[:MAX_CHUNKS_FOR_PROMPT]

    compact_chunks = []
    for chunk in chunks:
        compact_impact = []

        for impact in chunk.get("impact", [])[:MAX_PATHS_PER_CHUNK]:
            compact_impact.append(
                {
                    "root": impact.get("root"),
                    "downstream": [
                        item.get("path", [])
                        for item in impact.get("impact", {}).get("downstream", [])[:MAX_PATHS_PER_CHUNK]
                    ],
                    "upstream": [
                        item.get("path", [])
                        for item in impact.get("impact", {}).get("upstream", [])[:MAX_PATHS_PER_CHUNK]
                    ],
                }
            )

        compact_chunks.append(
            {
                "file": chunk.get("file"),
                "header": chunk.get("header"),
                "severity": chunk.get("severity"),
                "direct_changes": chunk.get("direct_changes", {}),
                "impact": compact_impact,
                "code_context": {
                    key: value[:MAX_CODE_SNIPPET_CHARS]
                    for key, value in chunk.get("code_context", {}).items()
                },
            }
        )

    return {
        "meta": result.get("meta", {}),
        "summary": result.get("summary", [])[:10],
        "chunks": compact_chunks,
    }


def generate_ai_summary(result: dict[str, Any]) -> dict[str, Any]:
    if not ai_summary_enabled():
        return {
            "enabled": False,
            "status": "disabled",
            "error": "GEMINI_API_KEY is not configured.",
        }

    prompt_payload = build_ai_summary_payload(result)
    model = os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
    api_key = os.getenv("GEMINI_API_KEY")
    schema = {
        "type": "object",
        "properties": {
            "overview": {"type": "string"},
            "risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH"]},
            "testing_focus": {
                "type": "array",
                "items": {"type": "string"},
            },
            "notable_changes": {
                "type": "array",
                "items": {"type": "string"},
            },
            "cautions": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
        "required": [
            "overview",
            "risk_level",
            "testing_focus",
            "notable_changes",
            "cautions",
        ],
    }

    prompt = (
        "You are a senior software change-risk analyst.\n"
        "Use only the provided repository impact analysis.\n"
        "Do not invent files, functions, behavior, or risks that are not grounded in the data.\n"
        "Write a concise engineering summary focused on what changed, what may break, and where testing should focus.\n\n"
        f"Analysis data:\n{json.dumps(prompt_payload, ensure_ascii=True)}"
    )

    last_error = None

    for attempt in range(AI_SUMMARY_MAX_RETRIES):
        try:
            response = requests.post(
                GEMINI_API_URL.format(model=model),
                headers={
                    "x-goog-api-key": api_key,
                    "Content-Type": "application/json",
                },
                json={
                    "contents": [
                        {
                            "parts": [
                                {
                                    "text": prompt,
                                }
                            ]
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.2,
                        "responseMimeType": "application/json",
                        "responseJsonSchema": schema,
                    },
                },
                timeout=45,
            )
            response.raise_for_status()
            break
        except requests.HTTPError as exc:
            last_error = exc
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code not in AI_SUMMARY_RETRYABLE_STATUS_CODES or attempt == AI_SUMMARY_MAX_RETRIES - 1:
                if status_code in AI_SUMMARY_RETRYABLE_STATUS_CODES:
                    return {
                        "enabled": True,
                        "status": "unavailable",
                        "model": model,
                        "error": "AI summary is temporarily unavailable. Deterministic analysis is still available.",
                    }
                raise
        except requests.RequestException as exc:
            last_error = exc
            if attempt == AI_SUMMARY_MAX_RETRIES - 1:
                return {
                    "enabled": True,
                    "status": "unavailable",
                    "model": model,
                    "error": "AI summary is temporarily unavailable. Deterministic analysis is still available.",
                }

        time.sleep(1.5 * (attempt + 1))
    else:
        if last_error is not None:
            raise last_error

    data = response.json()
    content = data["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(content)

    return {
        "enabled": True,
        "status": "ready",
        "model": model,
        "overview": parsed.get("overview", ""),
        "risk_level": parsed.get("risk_level", "MEDIUM"),
        "testing_focus": parsed.get("testing_focus", []),
        "notable_changes": parsed.get("notable_changes", []),
        "cautions": parsed.get("cautions", []),
    }
