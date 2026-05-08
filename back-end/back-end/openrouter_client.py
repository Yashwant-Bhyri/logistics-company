"""
OpenRouter (OpenAI-compatible) chat completions with timeouts and predictable errors.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

import requests

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterError(Exception):
    pass


def _normalize_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise OpenRouterError("OPENROUTER_API_KEY is not set")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "http://localhost:3000"),
        "X-Title": os.environ.get("OPENROUTER_APP_TITLE", "Logistics Company"),
    }
    if extra:
        headers.update(extra)
    return headers


def chat_completion(
    messages: List[Dict[str, Any]],
    *,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 2048,
    timeout_seconds: float = 60.0,
    response_format_json: bool = False,
) -> Dict[str, Any]:
    """
    POST /chat/completions. Returns the full JSON body from OpenRouter.
    """
    primary_model = (model or os.environ.get("OPENROUTER_MODEL", "deepseek/deepseek-v4-flash")).strip()
    fallback_model = os.environ.get("OPENROUTER_FALLBACK_MODEL", "deepseek/deepseek-chat-v3-0324").strip()
    fallback_model_2 = os.environ.get("OPENROUTER_FALLBACK_MODEL_2", "").strip()

    payload: Dict[str, Any] = {
        "model": primary_model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format_json:
        payload["response_format"] = {"type": "json_object"}

    # Some local environments inject global HTTP(S)_PROXY values that can
    # break OpenRouter (e.g., tunnel 403). Default to bypassing env proxies.
    use_env_proxy = os.environ.get("OPENROUTER_USE_ENV_PROXY", "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    request_kwargs: Dict[str, Any] = {}
    if not use_env_proxy:
        request_kwargs["proxies"] = {"http": None, "https": None}

    candidate_models: List[str] = [primary_model]
    if fallback_model and fallback_model != primary_model:
        candidate_models.append(fallback_model)
    if fallback_model_2 and fallback_model_2 not in candidate_models:
        candidate_models.append(fallback_model_2)

    failures: List[str] = []
    for idx, candidate in enumerate(candidate_models):
        payload["model"] = candidate
        try:
            resp = requests.post(
                OPENROUTER_URL,
                headers=_normalize_headers(),
                data=json.dumps(payload),
                timeout=timeout_seconds,
                **request_kwargs,
            )
        except requests.RequestException as e:
            failures.append(f"{candidate}: network error ({e})")
            continue

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text[:2000]
            failures.append(f"{candidate}: HTTP {resp.status_code} ({detail})")
            continue

        try:
            body = resp.json()
        except Exception as e:
            failures.append(f"{candidate}: invalid JSON ({e})")
            continue

        # Treat malformed 200 responses as candidate failure and try next fallback.
        try:
            content = body["choices"][0]["message"]["content"]
        except Exception as e:
            failures.append(f"{candidate}: unexpected response shape ({e})")
            continue
        if content is None or not str(content).strip():
            failures.append(f"{candidate}: empty content")
            continue

        # Keep response traceable for debugging / observability.
        body["_model_used"] = candidate
        body["_fallback_used"] = idx > 0
        return body

    raise OpenRouterError("All model attempts failed: " + " | ".join(failures))


def extract_message_text(api_response: Dict[str, Any]) -> str:
    try:
        return (api_response["choices"][0]["message"]["content"] or "").strip()
    except (KeyError, IndexError, TypeError) as e:
        raise OpenRouterError(f"Unexpected API response shape: {e}") from e


_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*([\s\S]*?)```")


def extract_json_object(text: str) -> Dict[str, Any]:
    """
    Parses a JSON object from model output, tolerating fenced ```json blocks.
    """
    raw = text.strip()
    m = _JSON_FENCE_RE.search(raw)
    if m:
        raw = m.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Last resort: substring between first { and last }
    start = raw.find("{")
    end = raw.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError as e:
            raise OpenRouterError(f"Could not parse JSON from model output: {e}") from e
    raise OpenRouterError("Could not parse JSON from model output")
