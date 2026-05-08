#!/usr/bin/env python3
"""
Smoke-test OpenRouter connectivity (standalone; does not require MySQL).

Run from this directory::

    cd back-end/back-end
    pip install -r requirements.txt
    cp .env.example .env   # put OPENROUTER_API_KEY in .env
    python smoke_ai.py

Exit codes: 0 = success, 1 = missing dependency or OPENROUTER_API_KEY, 2 = OpenRouter/network error.
"""
from __future__ import annotations

import sys
from pathlib import Path


def _load_dotenv() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv(Path(__file__).resolve().parent / ".env")
    except ImportError:
        pass


def main() -> int:
    _load_dotenv()

    import os

    if not os.environ.get("OPENROUTER_API_KEY", "").strip():
        print(
            "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key.",
            file=sys.stderr,
        )
        return 1

    model_display = (
        os.environ.get("OPENROUTER_MODEL") or "deepseek/deepseek-v4-flash"
    ).strip()
    print(f"Using model (from env default): {model_display}")

    try:
        from openrouter_client import OpenRouterError, chat_completion, extract_message_text
    except ImportError as e:
        print(f"Cannot import openrouter_client: {e}", file=sys.stderr)
        return 1

    try:
        rsp = chat_completion(
            [{"role": "user", "content": 'Reply with exactly one word: "pong"'}],
            temperature=0,
            max_tokens=16,
            timeout_seconds=60.0,
        )
        text = extract_message_text(rsp)
    except OpenRouterError as e:
        print(f"OpenRouter error: {e}", file=sys.stderr)
        return 2

    print("Response:", repr(text[:500]))
    if not text.strip():
        print("Empty completion — unexpected.", file=sys.stderr)
        return 2

    print("OK — OpenRouter reachable and chat_completion succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
