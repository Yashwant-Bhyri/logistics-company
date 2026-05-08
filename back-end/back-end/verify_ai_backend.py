#!/usr/bin/env python3
"""
Offline checks for `/api/ai/*` wiring (Flask test client — no HTTP server, no OpenRouter).

Run from back-end/back-end:
    pip install -r requirements.txt
    python verify_ai_backend.py

Exit 0 on success; nonzero on assertion failure or import errors.
"""
from __future__ import annotations


def main() -> int:
    try:
        from app import app
    except ImportError as e:
        print("Import failed (install deps: pip install -r requirements.txt):", e)
        return 3

    c = app.test_client()

    assertions = []

    # Health
    r = c.get("/api/ai/health")
    assertions.append(("GET /api/ai/health", r.status_code == 200))
    payload = r.get_json(silent=True) or {}
    assertions.append(("health has status ok", payload.get("status") == "ok"))
    assertions.append(("health has openrouter_configured flag", isinstance(payload.get("openrouter_configured"), bool)))

    # Secured endpoints → 401 without JWT
    for path, api_json in (
        ("/api/ai/tracking-assistant", {"order_id": 1, "message": "Where is it?"}),
        ("/api/ai/admin-copilot", {"message": "List orders"}),
        ("/api/ai/notification-draft", {"order_id": 1, "channel": "sms"}),
    ):
        r = c.post(path, json=api_json, content_type="application/json")
        assertions.append((f"POST {path} unauth→401", r.status_code == 401))

    # Broken JWT still 401 (not openrouter-dependent)
    r = c.post(
        "/api/ai/tracking-assistant",
        json={"order_id": 1, "message": "Hi"},
        headers={"Authorization": "Bearer invalid.invalid.invalid"},
        content_type="application/json",
    )
    assertions.append(("POST tracking bad JWT→401", r.status_code == 401))

    failed = [(name, ok) for name, ok in assertions if not ok]
    if failed:
        print("FAILED:")
        for name, ok in assertions:
            if not ok:
                print(f"  - {name}")
        print("Full snapshot (health):", app.test_client().get("/api/ai/health").get_json())
        return 1

    print("PASS — ai routes reachable, auth gated, health OK:")
    print(" ", app.test_client().get("/api/ai/health").get_json())
    print("(OpenRouter connectivity: run smoke_ai.py on a machine with internet.)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
