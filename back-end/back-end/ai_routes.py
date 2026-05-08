"""
AI HTTP routes (tracking assistant, admin copilot, notification drafts).

Registered from app.py via register_ai_routes(...) to avoid import cycles.

Security principles:
    - OPENROUTER_API_KEY only on server; never forwarded to browsers.
    - Customer endpoints require JWT role=customer and order belongs to sender/receiver.
    - Admin endpoints require JWT role=admin.
    - Admin copilot executes only parameterized queries from a whitelist of intents—no raw SQL from the model.

Environment:
    OPENROUTER_API_KEY   (required for AI routes)
    OPENROUTER_MODEL     (optional, default deepseek/deepseek-v4-flash)
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional, Tuple

from flask import jsonify, request

from openrouter_client import OpenRouterError, chat_completion, extract_json_object, extract_message_text


Jsonish = Dict[str, Any]


def _safe_json_dump(obj: Any) -> Jsonish:
    return json.loads(json.dumps(obj, default=_json_default))


def _json_default(o):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, bytes):
        return o.decode("utf-8", errors="replace")
    raise TypeError(f"Unsupported type {type(o)}")


def _sanitize_order_row(order: Dict[str, Any]) -> Dict[str, Any]:
    if not order:
        return {}
    banned = {"password_hash", "password"}
    return {k: v for k, v in order.items() if k not in banned}


def fetch_shipment_context_for_ai(safe_cursor, order_id: int) -> Tuple[Optional[Jsonish], Optional[str]]:
    """
    Loads order, sender/receiver parties, payments, deliveries, assignment summary, updates.
    """
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT o.* FROM C_ORDER o WHERE o.order_id = %s", (order_id,))
        order = cursor.fetchone()
        if not order:
            return None, "Order not found"

        oid = order["order_id"]
        sid, rid = order["sender_id"], order["receiver_id"]

        cursor.execute(
            """SELECT customer_id AS id, name, phone, email, address
               FROM CUSTOMER WHERE customer_id IN (%s, %s)""",
            (sid, rid),
        )
        parties = cursor.fetchall()
        party_by_id = {p["id"]: p for p in parties}

        cursor.execute(
            """
            SELECT update_type, new_status, scan_type, notes, updated_at, driver_id, stop_id
            FROM ORDER_UPDATE WHERE order_id = %s
            ORDER BY updated_at DESC
            LIMIT 30
            """,
            (oid,),
        )
        updates = cursor.fetchall()

        cursor.execute(
            """
            SELECT payment_id, amount, method, status, timestamp
            FROM PAYMENT WHERE order_id = %s ORDER BY timestamp DESC LIMIT 10
            """,
            (oid,),
        )
        payments = cursor.fetchall()

        cursor.execute(
            """
            SELECT d.delivery_id, d.order_id, d.assignment_id, d.status AS delivery_status,
                   d.scheduled_time, d.completed_time,
                   dv.driver_id, dr.name AS driver_name,
                   dv.vehicle_id, v.license_plate, v.type AS vehicle_type,
                   dv.route_id, dv.status AS assignment_status,
                   dv.start_time, dv.end_time
            FROM DELIVERY d
            LEFT JOIN DRIVER_VEHICLE_ASSIGNMENT dv ON d.assignment_id = dv.assignment_id
            LEFT JOIN DRIVER dr ON dv.driver_id = dr.driver_id
            LEFT JOIN VEHICLE v ON dv.vehicle_id = v.vehicle_id
            WHERE d.order_id = %s
            ORDER BY d.delivery_id DESC
            LIMIT 5
            """,
            (oid,),
        )
        deliveries = cursor.fetchall()

        shipment = _sanitize_order_row(order)
        context = {
            "order_id": oid,
            "shipment_public": shipment,
            "party_sender": party_by_id.get(sid),
            "party_receiver": party_by_id.get(rid),
            "recent_updates": updates,
            "payments": payments,
            "deliveries": deliveries,
        }
        return _safe_json_dump(context), None
    finally:
        cursor.close()
        db.close()


MAX_ROWS = 80

INTENT_HELP = """You can ask about assignments, routes, drivers, vehicles, orders, deliveries, condition reports, overrides,
recent order updates, available drivers or vehicles, high-risk routes, or a specific order ID."""


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _to_int(v: Any, default: int = 0) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _truncate_rows(rows: List[Any], limit: int = MAX_ROWS) -> Tuple[List[Any], bool]:
    if len(rows) <= limit:
        return rows, False
    return rows[:limit], True


def dispatch_admin_intent(safe_cursor, intent: str, params: Dict[str, Any]) -> Jsonish:
    db, cursor = safe_cursor()
    try:
        intent = str(intent).strip()

        def q(sql, args=()):
            cursor.execute(sql, args)
            return cursor.fetchall()

        rows: Any
        truncated: bool

        if intent == "assignments_recent":
            rows = q(
                """
                SELECT a.assignment_id, a.driver_id, a.vehicle_id, a.route_id, a.status AS assignment_status,
                       a.start_time, a.end_time,
                       v.type AS vehicle_type, v.license_plate,
                       d.name AS driver_name,
                       COALESCE(del.order_count, 0) AS linked_orders_count
                FROM DRIVER_VEHICLE_ASSIGNMENT a
                LEFT JOIN DRIVER d ON a.driver_id = d.driver_id
                LEFT JOIN VEHICLE v ON a.vehicle_id = v.vehicle_id
                LEFT JOIN (
                   SELECT assignment_id, COUNT(*) AS order_count FROM DELIVERY GROUP BY assignment_id
                ) del ON del.assignment_id = a.assignment_id
                ORDER BY a.assignment_id DESC
                LIMIT %s
                """,
                (MAX_ROWS + 1,),
            )
            rows = list(rows)
            truncated = len(rows) > MAX_ROWS
            rows = rows[:MAX_ROWS]
            return {"intent": intent, "rows": rows, "truncated": truncated}

        if intent == "assignments_filtered":
            status = (params.get("status") or "").strip() or None
            sid = params.get("driver_name_substring")
            stmt = """
                SELECT a.assignment_id, a.driver_id, a.vehicle_id, a.route_id, a.status,
                       a.start_time, a.end_time, d.name AS driver_name,
                       v.type AS vehicle_type, v.license_plate
                FROM DRIVER_VEHICLE_ASSIGNMENT a
                LEFT JOIN DRIVER d ON a.driver_id = d.driver_id
                LEFT JOIN VEHICLE v ON a.vehicle_id = v.vehicle_id
                WHERE 1=1
            """
            args: List[Any] = []
            if status:
                stmt += " AND a.status = %s"
                args.append(status)
            if isinstance(sid, str) and sid.strip():
                stmt += " AND d.name LIKE %s"
                args.append("%" + sid.strip()[:100] + "%")
            stmt += " ORDER BY a.assignment_id DESC LIMIT %s"
            args.append(MAX_ROWS + 1)
            cursor.execute(stmt, tuple(args))
            rows = list(cursor.fetchall())
            truncated = len(rows) > MAX_ROWS
            rows = rows[:MAX_ROWS]
            return {"intent": intent, "rows": rows, "truncated": truncated}

        if intent == "routes_summary":
            rows = q(
                "SELECT route_id, total_distance, estimated_time FROM ROUTE ORDER BY route_id DESC LIMIT %s",
                (MAX_ROWS + 1,),
            )
            rows = list(rows)
            truncated = len(rows) > MAX_ROWS
            rows = rows[:MAX_ROWS]
            return {"intent": intent, "rows": rows, "truncated": truncated}

        if intent == "vehicles_summary":
            rows = q(
                """SELECT vehicle_id, type, license_plate, vmax_weight, vmax_volume, status, current_location
                   FROM VEHICLE ORDER BY vehicle_id DESC LIMIT %s""",
                (MAX_ROWS + 1,),
            )
            rows, truncated = _truncate_rows(list(rows))
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "drivers_summary":
            rows = q(
                """SELECT driver_id, name, phone, email, license_class, status, working_hours
                   FROM DRIVER ORDER BY driver_id DESC LIMIT %s""",
                (MAX_ROWS + 1,),
            )
            rows, truncated = _truncate_rows(list(rows))
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "drivers_available":
            rows = q(
                """
                SELECT driver_id, name, phone, email, status
                FROM DRIVER
                WHERE status = 'Active'
                AND driver_id NOT IN (
                    SELECT driver_id FROM DRIVER_VEHICLE_ASSIGNMENT
                    WHERE status NOT IN ('Completed', 'Cancelled')
                )
                ORDER BY name LIMIT %s
                """,
                (MAX_ROWS,),
            )
            truncated = False
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "vehicles_available":
            rows = q(
                """
                SELECT vehicle_id, type, license_plate, vmax_weight, vmax_volume, status
                FROM VEHICLE
                WHERE status = 'Available'
                ORDER BY type LIMIT %s
                """,
                (MAX_ROWS,),
            )
            truncated = False
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "order_updates_recent":
            rows = q(
                """
                SELECT ou.update_id, ou.order_id, ou.update_type, ou.scan_type, ou.notes, ou.new_status, ou.updated_at,
                       d.name AS driver_name, rs.name AS stop_name
                FROM ORDER_UPDATE ou
                LEFT JOIN DRIVER d ON ou.driver_id = d.driver_id
                LEFT JOIN ROUTE_STOP rs ON ou.stop_id = rs.stop_id
                ORDER BY ou.updated_at DESC
                LIMIT %s
                """,
                (MAX_ROWS,),
            )
            truncated = False
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "condition_reports_recent":
            min_r = params.get("min_risk")
            try:
                min_r_f = float(min_r) if min_r is not None else None
            except (TypeError, ValueError):
                min_r_f = None
            if min_r_f is not None:
                rows = q(
                    """
                    SELECT report_id, route_id, region, weather_status, road_status, risk_score, recorded_at
                    FROM CONDITION_REPORT
                    WHERE risk_score >= %s
                    ORDER BY recorded_at DESC
                    LIMIT %s
                    """,
                    (min_r_f, MAX_ROWS),
                )
            else:
                rows = q(
                    """
                    SELECT report_id, route_id, region, weather_status, road_status, risk_score, recorded_at
                    FROM CONDITION_REPORT
                    ORDER BY recorded_at DESC
                    LIMIT %s
                    """,
                    (MAX_ROWS,),
                )
            truncated = False
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "overrides_recent":
            rows = q(
                """
                SELECT override_id, delivery_id, admin_id, override_type, reason, old_value, new_value, created_at
                FROM ADMIN_OVERRIDE
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (MAX_ROWS,),
            )
            truncated = False
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "order_lookup":
            try:
                oid = int(params.get("order_id"))
            except (TypeError, ValueError):
                return {"error": "order_id must be an integer", "intent": intent}
            cursor.execute("SELECT * FROM C_ORDER WHERE order_id = %s", (oid,))
            o = cursor.fetchone()
            if not o:
                return {"intent": intent, "found": False}
            return {"intent": intent, "found": True, "order": _sanitize_order_row(o)}

        if intent == "deliveries_overview":
            rows = q(
                """
                SELECT d.delivery_id, d.order_id, d.assignment_id, d.status, d.scheduled_time, d.completed_time,
                       dv.driver_id, dr.name AS driver_name, dv.route_id
                FROM DELIVERY d
                LEFT JOIN DRIVER_VEHICLE_ASSIGNMENT dv ON d.assignment_id = dv.assignment_id
                LEFT JOIN DRIVER dr ON dv.driver_id = dr.driver_id
                ORDER BY d.delivery_id DESC
                LIMIT %s
                """,
                (MAX_ROWS + 1,),
            )
            rows, truncated = _truncate_rows(list(rows))
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "high_risk_condition_reports":
            try:
                thr = float(params.get("min_risk", 0.5))
            except (TypeError, ValueError):
                thr = 0.5
            rows = q(
                """
                SELECT report_id, route_id, region, weather_status, road_status, risk_score, recorded_at
                FROM CONDITION_REPORT
                WHERE risk_score >= %s
                ORDER BY risk_score DESC, recorded_at DESC
                LIMIT %s
                """,
                (thr, MAX_ROWS),
            )
            truncated = False
            return _safe_json_dump({"intent": intent, "rows": rows, "truncated": truncated})

        if intent == "help":
            return {"intent": "help", "message": INTENT_HELP}

        return {"error": f"Unknown intent: {intent}", "allowed": _allowed_intent_list()}

    finally:
        cursor.close()
        db.close()


def _allowed_intent_list() -> List[str]:
    return [
        "assignments_recent",
        "assignments_filtered",
        "routes_summary",
        "vehicles_summary",
        "drivers_summary",
        "drivers_available",
        "vehicles_available",
        "order_updates_recent",
        "condition_reports_recent",
        "overrides_recent",
        "order_lookup",
        "deliveries_overview",
        "high_risk_condition_reports",
        "help",
    ]


def classify_admin_intent(user_message: str) -> Jsonish:
    system = """You classify admin questions for a logistics operations database.
Respond with a single JSON object ONLY (no markdown), with exactly these keys:
  "intent": string (one of the allowed values),
  "params": object (optional filters).

Allowed intent values:
- assignments_recent — latest driver/vehicle assignments
- assignments_filtered — params: optional "status" (string), "driver_name_substring" (string)
- routes_summary — all routes (ids, distance, time)
- vehicles_summary — fleet vehicles
- drivers_summary — all drivers
- drivers_available — drivers not on active assignments
- vehicles_available — vehicles marked available
- order_updates_recent — scan / status updates on orders
- condition_reports_recent — params: optional "min_risk" (number) to filter
- overrides_recent — admin overrides
- order_lookup — params: "order_id" (integer) required
- deliveries_overview — deliveries with driver/route
- high_risk_condition_reports — params: optional "min_risk" (number, default 0.5)
- help — vague or greetings

Pick the single best intent. If the user mixes topics, prefer the most actionable (e.g. order_lookup if order id mentioned).

User language may not be English; still output JSON keys in English."""

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_message[:8000]},
    ]
    rsp = chat_completion(
        messages,
        temperature=0,
        max_tokens=500,
        response_format_json=True,
        timeout_seconds=45.0,
    )
    text = extract_message_text(rsp)
    parsed = extract_json_object(text)
    intent = parsed.get("intent")
    params = parsed.get("params") or {}
    if not isinstance(params, dict):
        params = {}
    return {"intent": str(intent), "params": params}


def summarize_with_model(system: str, user_content: str) -> str:
    rsp = chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user_content[:12000]}],
        temperature=0.3,
        max_tokens=1800,
        timeout_seconds=60.0,
    )
    return extract_message_text(rsp)


def classify_ops_chat_intent(message: str, history: Optional[List[Dict[str, Any]]] = None) -> Jsonish:
    """
    Classify chatbot messages into safe, audited operation intents.
    """
    msg = (message or "").strip()
    history = history or []

    # Fast-path rules for common asks.
    low = msg.lower()
    if any(x in low for x in ["how many deliveries", "accept today", "capacity today", "today capacity"]):
        return {"intent": "capacity_today", "params": {}}
    if any(x in low for x in ["auto route", "auto-router", "shipment router", "assign order", "recommend assignment"]):
        m = re.search(r"\b(\d{3,})\b", msg)
        return {"intent": "auto_route_order", "params": {"order_id": int(m.group(1)) if m else None}}
    if any(x in low for x in ["control tower", "incident", "risk overview", "health of operations", "ops overview"]):
        return {"intent": "control_tower", "params": {"days": 7}}

    system = """You are an intent router for a logistics AI chatbot.
Return JSON ONLY with keys:
  - intent: one of [capacity_today, auto_route_order, control_tower, admin_data_qna, help]
  - params: object

Guidelines:
- capacity_today: asks about how many deliveries/orders can be accepted today.
- auto_route_order: asks to auto route/assign an order. Include params.order_id if present.
- control_tower: asks for incidents, bottlenecks, operational risks.
- admin_data_qna: asks for normal reporting queries (drivers/vehicles/assignments/orders/reports).
- help: unclear request.
"""
    compact_history = history[-8:]
    payload = {"message": msg[:4000], "history": compact_history}
    rsp = chat_completion(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(payload, default=str)},
        ],
        temperature=0,
        max_tokens=220,
        response_format_json=True,
        timeout_seconds=35.0,
    )
    parsed = extract_json_object(extract_message_text(rsp))
    intent = str(parsed.get("intent") or "help").strip()
    params = parsed.get("params") if isinstance(parsed.get("params"), dict) else {}
    allowed = {"capacity_today", "auto_route_order", "control_tower", "admin_data_qna", "help"}
    if intent not in allowed:
        intent = "help"
    return {"intent": intent, "params": params}


def _parse_capacity_request(message: str) -> Jsonish:
    """
    Extract structured capacity intent fields from natural language.
    """
    text = (message or "").lower()
    result: Jsonish = {
        "parcel_count": None,
        "weight_kg_each": None,
        "address_count": None,
    }

    weight_match = re.search(r"(\d+(?:\.\d+)?)\s*kg", text)
    if weight_match:
        result["weight_kg_each"] = float(weight_match.group(1))

    # Prefer explicit quantity near parcel/article/order/delivery terms.
    qty_pattern = re.findall(r"(\d+)\s*(?:parcels?|articles?|orders?|deliveries?)", text)
    if qty_pattern:
        result["parcel_count"] = int(qty_pattern[0])
    else:
        nums = [int(x) for x in re.findall(r"\b\d+\b", text)]
        if nums:
            result["parcel_count"] = nums[0]

    addr_match = re.search(r"(\d+)\s*(?:different\s+)?addresses?|(\d+)\s*stops?", text)
    if addr_match:
        val = addr_match.group(1) or addr_match.group(2)
        if val:
            result["address_count"] = int(val)

    return result


def collect_admin_ops_snapshot(safe_cursor, days: int = 7) -> Jsonish:
    """
    Deterministic operational snapshot for AI insights.
    """
    db, cursor = safe_cursor()
    try:
        days = max(1, min(int(days or 7), 60))

        cursor.execute(
            """
            SELECT status, COUNT(*) AS cnt
            FROM C_ORDER
            GROUP BY status
            """
        )
        order_status = {str(r["status"] or "Unknown"): int(r["cnt"]) for r in cursor.fetchall()}
        total_orders = sum(order_status.values())

        cursor.execute(
            """
            SELECT status, COUNT(*) AS cnt
            FROM DRIVER_VEHICLE_ASSIGNMENT
            GROUP BY status
            """
        )
        assignment_status = {str(r["status"] or "Unknown"): int(r["cnt"]) for r in cursor.fetchall()}

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DRIVER
            WHERE status = 'Active'
            """
        )
        active_drivers = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DRIVER_VEHICLE_ASSIGNMENT
            WHERE status NOT IN ('Completed', 'Cancelled')
            """
        )
        active_assignments = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM VEHICLE
            WHERE status = 'Available'
            """
        )
        available_vehicles = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DELIVERY
            WHERE status NOT IN ('Delivered', 'Completed')
              AND scheduled_time IS NOT NULL
              AND scheduled_time < NOW() - INTERVAL 4 HOUR
            """
        )
        late_deliveries = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM CONDITION_REPORT
            WHERE risk_score >= 0.7
              AND recorded_at >= NOW() - INTERVAL %s DAY
            """,
            (days,),
        )
        high_risk_recent = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT route_id, COUNT(*) AS high_risk_points, MAX(risk_score) AS max_risk
            FROM CONDITION_REPORT
            WHERE risk_score >= 0.7
              AND recorded_at >= NOW() - INTERVAL %s DAY
            GROUP BY route_id
            ORDER BY high_risk_points DESC, max_risk DESC
            LIMIT 5
            """,
            (days,),
        )
        risk_hotspots = cursor.fetchall()

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM ADMIN_OVERRIDE
            WHERE created_at >= NOW() - INTERVAL %s DAY
            """,
            (days,),
        )
        overrides_recent = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM ORDER_UPDATE
            WHERE updated_at >= NOW() - INTERVAL %s DAY
            """,
            (days,),
        )
        updates_recent = int((cursor.fetchone() or {}).get("c", 0))

        assigned_count = assignment_status.get("Assigned", 0)
        pending_orders = order_status.get("Pending", 0)
        in_transit_orders = order_status.get("In Transit", 0)
        utilization_ratio = round((assigned_count / active_drivers), 2) if active_drivers else 0.0

        alerts: List[Jsonish] = []
        if late_deliveries > 0:
            alerts.append(
                {
                    "priority": "high",
                    "title": "Late deliveries",
                    "detail": f"{late_deliveries} deliveries are more than 4 hours past scheduled time and not completed.",
                }
            )
        if available_vehicles == 0:
            alerts.append(
                {
                    "priority": "high",
                    "title": "No available vehicles",
                    "detail": "Vehicle pool is exhausted for immediate assignment.",
                }
            )
        if utilization_ratio > 0.9:
            alerts.append(
                {
                    "priority": "medium",
                    "title": "Driver utilization pressure",
                    "detail": f"Assigned/active-driver ratio is {utilization_ratio}. Consider redistributing work.",
                }
            )
        if high_risk_recent >= 5:
            alerts.append(
                {
                    "priority": "medium",
                    "title": "Elevated route risk",
                    "detail": f"{high_risk_recent} high-risk condition reports in the last {days} days.",
                }
            )
        if overrides_recent >= 5:
            alerts.append(
                {
                    "priority": "medium",
                    "title": "Override spike",
                    "detail": f"{overrides_recent} admin overrides in the last {days} days.",
                }
            )
        if not alerts:
            alerts.append(
                {
                    "priority": "low",
                    "title": "No critical anomalies detected",
                    "detail": "Current operating signals are within expected range.",
                }
            )

        return _safe_json_dump(
            {
                "window_days": days,
                "metrics": {
                    "total_orders": total_orders,
                    "order_status_counts": order_status,
                    "assignment_status_counts": assignment_status,
                    "active_drivers": active_drivers,
                    "assigned_open_assignments": assigned_count,
                    "available_vehicles": available_vehicles,
                    "late_deliveries_4h": late_deliveries,
                    "high_risk_reports_recent": high_risk_recent,
                    "overrides_recent": overrides_recent,
                    "order_updates_recent": updates_recent,
                    "pending_orders": pending_orders,
                    "in_transit_orders": in_transit_orders,
                    "driver_utilization_ratio": utilization_ratio,
                },
                "risk_hotspots": risk_hotspots,
                "alerts": alerts,
            }
        )
    finally:
        cursor.close()
        db.close()


def recommend_assignment_for_order(safe_cursor, order_id: int) -> Jsonish:
    """
    Deterministic recommendation of a driver/vehicle/route candidate for an order.
    """
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT order_id, status, weight, length, width, height, type
            FROM C_ORDER
            WHERE order_id = %s
            """,
            (order_id,),
        )
        order = cursor.fetchone()
        if not order:
            return {"error": "Order not found", "order_id": order_id}

        if str(order.get("status") or "").lower() in {"delivered", "completed"}:
            return {"error": "Order already completed", "order_id": order_id, "order_status": order.get("status")}

        required_weight = _to_float(order.get("weight"), 0.0)
        required_volume = (
            _to_float(order.get("length"), 0.0)
            * _to_float(order.get("width"), 0.0)
            * _to_float(order.get("height"), 0.0)
        ) / 1_000_000.0

        cursor.execute(
            """
            SELECT d.driver_id, d.name, d.status, d.working_hours,
                   COALESCE(a.open_cnt, 0) AS open_assignments
            FROM DRIVER d
            LEFT JOIN (
                SELECT driver_id, COUNT(*) AS open_cnt
                FROM DRIVER_VEHICLE_ASSIGNMENT
                WHERE status NOT IN ('Completed', 'Cancelled')
                GROUP BY driver_id
            ) a ON a.driver_id = d.driver_id
            WHERE d.status = 'Active'
            ORDER BY a.open_cnt ASC, d.driver_id ASC
            LIMIT 40
            """
        )
        drivers = cursor.fetchall()

        cursor.execute(
            """
            SELECT vehicle_id, type, license_plate, vmax_weight, vmax_volume
            FROM VEHICLE
            WHERE status = 'Available'
            ORDER BY vehicle_id ASC
            LIMIT 80
            """
        )
        vehicles = cursor.fetchall()

        cursor.execute(
            """
            SELECT route_id, total_distance, estimated_time
            FROM ROUTE
            ORDER BY estimated_time ASC, total_distance ASC
            LIMIT 20
            """
        )
        routes = cursor.fetchall()

        eligible_vehicles = []
        for v in vehicles:
            w_ok = _to_float(v.get("vmax_weight"), 0.0) >= required_weight
            vol_cap = _to_float(v.get("vmax_volume"), 0.0)
            vol_ok = vol_cap >= required_volume if vol_cap > 0 else True
            if w_ok and vol_ok:
                eligible_vehicles.append(v)

        if not drivers:
            return {
                "error": "No active drivers available",
                "order": order,
                "required_weight": required_weight,
                "required_volume": round(required_volume, 4),
            }
        if not eligible_vehicles:
            return {
                "error": "No available vehicles satisfy order capacity",
                "order": order,
                "required_weight": required_weight,
                "required_volume": round(required_volume, 4),
            }

        top_route = routes[0] if routes else None
        candidates: List[Jsonish] = []
        for d in drivers[:8]:
            for v in eligible_vehicles[:8]:
                load = _to_int(d.get("open_assignments"), 0)
                weight_slack = max(_to_float(v.get("vmax_weight"), 0.0) - required_weight, 0.0)
                volume_slack = max(_to_float(v.get("vmax_volume"), 0.0) - required_volume, 0.0)
                route_time = _to_float((top_route or {}).get("estimated_time"), 90.0)

                # Lower score is better.
                score = round((load * 30.0) + route_time + (weight_slack * 0.3) + (volume_slack * 8.0), 2)
                candidates.append(
                    {
                        "score": score,
                        "driver": {
                            "driver_id": d.get("driver_id"),
                            "name": d.get("name"),
                            "open_assignments": load,
                        },
                        "vehicle": {
                            "vehicle_id": v.get("vehicle_id"),
                            "type": v.get("type"),
                            "license_plate": v.get("license_plate"),
                            "vmax_weight": v.get("vmax_weight"),
                            "vmax_volume": v.get("vmax_volume"),
                        },
                        "route": top_route,
                    }
                )

        candidates.sort(key=lambda x: x["score"])
        return _safe_json_dump(
            {
                "order": _sanitize_order_row(order),
                "required_weight": required_weight,
                "required_volume": round(required_volume, 4),
                "candidate_count": len(candidates),
                "top_recommendation": candidates[0] if candidates else None,
                "alternatives": candidates[1:5],
            }
        )
    finally:
        cursor.close()
        db.close()


def estimate_acceptance_capacity_today(safe_cursor) -> Jsonish:
    """
    Estimate additional deliveries that can be accepted today using live availability and
    recent throughput as baseline.
    """
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DRIVER
            WHERE status = 'Active'
            """
        )
        active_drivers = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DRIVER
            WHERE status = 'Active'
              AND driver_id NOT IN (
                SELECT driver_id
                FROM DRIVER_VEHICLE_ASSIGNMENT
                WHERE status NOT IN ('Completed', 'Cancelled')
              )
            """
        )
        available_drivers = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM VEHICLE
            WHERE status = 'Available'
            """
        )
        available_vehicles = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DELIVERY
            WHERE status NOT IN ('Delivered', 'Completed')
            """
        )
        open_deliveries = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM DELIVERY
            WHERE DATE(scheduled_time) = CURDATE()
              AND status NOT IN ('Delivered', 'Completed')
            """
        )
        scheduled_today_open = int((cursor.fetchone() or {}).get("c", 0))

        cursor.execute(
            """
            SELECT DATE(completed_time) AS d, COUNT(*) AS c
            FROM DELIVERY
            WHERE completed_time >= NOW() - INTERVAL 14 DAY
              AND status IN ('Delivered', 'Completed')
            GROUP BY DATE(completed_time)
            ORDER BY d DESC
            """
        )
        rows = cursor.fetchall()
        total_completed_14d = sum(int(r.get("c") or 0) for r in rows)
        days_with_data = max(len(rows), 1)
        avg_completed_per_day = total_completed_14d / days_with_data

        per_driver_daily_capacity = (
            round(max(min(avg_completed_per_day / max(active_drivers, 1), 6.0), 0.8), 2)
            if active_drivers
            else 0.0
        )

        base_additional_capacity = int(round(min(available_drivers, available_vehicles) * per_driver_daily_capacity))
        congestion_penalty = int(round(max(scheduled_today_open - 20, 0) * 0.1))
        open_backlog_penalty = int(round(max(open_deliveries - 80, 0) * 0.05))
        recommended_acceptance = max(base_additional_capacity - congestion_penalty - open_backlog_penalty, 0)

        return _safe_json_dump(
            {
                "metrics": {
                    "active_drivers": active_drivers,
                    "available_drivers": available_drivers,
                    "available_vehicles": available_vehicles,
                    "open_deliveries": open_deliveries,
                    "scheduled_today_open": scheduled_today_open,
                    "avg_completed_per_day_last_14d": round(avg_completed_per_day, 2),
                    "per_driver_daily_capacity_estimate": per_driver_daily_capacity,
                },
                "estimated_additional_deliveries_today": recommended_acceptance,
                "assumptions": [
                    "Uses last 14 days completion throughput as baseline.",
                    "Limits per-driver contribution to a practical range.",
                    "Applies penalties for backlog and heavy same-day queue.",
                ],
            }
        )
    finally:
        cursor.close()
        db.close()


def simulate_capacity_request(
    safe_cursor,
    *,
    parcel_count: Optional[int],
    weight_kg_each: Optional[float],
    address_count: Optional[int],
) -> Jsonish:
    """
    Deterministic capacity simulation with explicit constraints:
    - driver/vehicle availability
    - recent throughput
    - approximate weight carrying ability
    - address complexity
    """
    base = estimate_acceptance_capacity_today(safe_cursor)
    metrics = base.get("metrics", {})

    available_drivers = _to_int(metrics.get("available_drivers"), 0)
    available_vehicles = _to_int(metrics.get("available_vehicles"), 0)
    open_deliveries = _to_int(metrics.get("open_deliveries"), 0)
    avg_completed_per_day = _to_float(metrics.get("avg_completed_per_day_last_14d"), 0.0)
    per_driver_daily_capacity = _to_float(metrics.get("per_driver_daily_capacity_estimate"), 0.0)
    baseline_additional = _to_int(base.get("estimated_additional_deliveries_today"), 0)

    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT COALESCE(SUM(vmax_weight), 0) AS total_weight_capacity
            FROM VEHICLE
            WHERE status = 'Available'
            """
        )
        total_weight_capacity_now = _to_float((cursor.fetchone() or {}).get("total_weight_capacity"), 0.0)
    finally:
        cursor.close()
        db.close()

    trips_factor = max(min((avg_completed_per_day / max(available_drivers, 1)), 3.0), 1.0) if available_drivers else 1.0
    daily_weight_capacity = total_weight_capacity_now * trips_factor

    request_count = max(_to_int(parcel_count, 0), 0) if parcel_count is not None else None
    request_weight_each = max(_to_float(weight_kg_each, 0.0), 0.0) if weight_kg_each is not None else None
    request_addresses = max(_to_int(address_count, 0), 0) if address_count is not None else None

    max_by_flow = baseline_additional
    max_by_vehicle_slots = max(min(available_drivers, available_vehicles) * max(int(round(per_driver_daily_capacity)), 1), 0)
    max_by_addresses = max(min(available_drivers, available_vehicles) * 3, 0)

    max_by_weight = None
    if request_weight_each and request_weight_each > 0:
        max_by_weight = int(daily_weight_capacity // request_weight_each)

    hard_limits = [max_by_flow, max_by_vehicle_slots]
    if max_by_weight is not None:
        hard_limits.append(max_by_weight)
    simulated_max_accept = min(hard_limits) if hard_limits else 0

    bottlenecks: List[str] = []
    if simulated_max_accept == max_by_flow:
        bottlenecks.append("throughput_baseline")
    if simulated_max_accept == max_by_vehicle_slots:
        bottlenecks.append("driver_vehicle_slots")
    if max_by_weight is not None and simulated_max_accept == max_by_weight:
        bottlenecks.append("weight_capacity")
    if open_deliveries > 100:
        bottlenecks.append("open_backlog_pressure")

    feasible = None
    if request_count is not None:
        feasible = request_count <= simulated_max_accept
        if request_addresses is not None and request_addresses > max_by_addresses:
            feasible = False

    return _safe_json_dump(
        {
            "request": {
                "parcel_count": request_count,
                "weight_kg_each": request_weight_each,
                "address_count": request_addresses,
            },
            "result": {
                "feasible": feasible,
                "max_acceptable_today": int(simulated_max_accept),
                "recommended_accept_today": int(max(simulated_max_accept - int(round(simulated_max_accept * 0.1)), 0)),
            },
            "constraints": {
                "max_by_flow": int(max_by_flow),
                "max_by_vehicle_slots": int(max_by_vehicle_slots),
                "max_by_weight": int(max_by_weight) if max_by_weight is not None else None,
                "max_by_addresses": int(max_by_addresses),
                "daily_weight_capacity_estimate_kg": round(daily_weight_capacity, 2),
                "trips_factor": round(trips_factor, 2),
            },
            "ops_snapshot": {
                "available_drivers": available_drivers,
                "available_vehicles": available_vehicles,
                "open_deliveries": open_deliveries,
                "avg_completed_per_day_last_14d": avg_completed_per_day,
                "per_driver_daily_capacity_estimate": per_driver_daily_capacity,
            },
            "bottlenecks": bottlenecks,
            "confidence": "medium",
            "notes": [
                "Deterministic simulation using availability, recent throughput, and capacity constraints.",
                "Use for planning guidance; exact dispatch feasibility depends on geography and time windows.",
            ],
        }
    )


def _support_ensure_table(safe_cursor) -> None:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS SUPPORT_MESSAGE (
                message_id BIGINT NOT NULL AUTO_INCREMENT,
                participant_type VARCHAR(20) NOT NULL,
                participant_id INT NOT NULL,
                actor_role VARCHAR(20) NOT NULL,
                actor_id INT NULL,
                direction VARCHAR(20) NOT NULL,
                channel VARCHAR(20) NULL,
                subject VARCHAR(255) NULL,
                body TEXT NOT NULL,
                related_order_id BIGINT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (message_id),
                INDEX idx_support_thread (participant_type, participant_id, created_at)
            )
            """
        )
        db.commit()
    finally:
        cursor.close()
        db.close()


def _support_participant_name(safe_cursor, participant_type: str, participant_id: int) -> str:
    ptype = (participant_type or "").strip().lower()
    db, cursor = safe_cursor()
    try:
        if ptype == "customer":
            cursor.execute("SELECT name FROM CUSTOMER WHERE customer_id = %s", (participant_id,))
            row = cursor.fetchone()
            return (row or {}).get("name") or f"Customer #{participant_id}"
        if ptype == "driver":
            cursor.execute("SELECT name FROM DRIVER WHERE driver_id = %s", (participant_id,))
            row = cursor.fetchone()
            return (row or {}).get("name") or f"Driver #{participant_id}"
        return f"{participant_type} #{participant_id}"
    finally:
        cursor.close()
        db.close()


def _support_insert_message(
    safe_cursor,
    *,
    participant_type: str,
    participant_id: int,
    actor_role: str,
    actor_id: Optional[int],
    direction: str,
    body: str,
    channel: Optional[str] = None,
    subject: Optional[str] = None,
    related_order_id: Optional[int] = None,
) -> Jsonish:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            INSERT INTO SUPPORT_MESSAGE
            (participant_type, participant_id, actor_role, actor_id, direction, channel, subject, body, related_order_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                participant_type,
                participant_id,
                actor_role,
                actor_id,
                direction,
                channel,
                subject,
                body,
                related_order_id,
            ),
        )
        db.commit()
        return {"message_id": cursor.lastrowid}
    finally:
        cursor.close()
        db.close()


def _support_detect_kind(text: str, actor_role: str = "", subject: str = "") -> str:
    blob = f"{subject or ''} {text or ''}".lower()
    if "complaint" in blob or "unhappy" in blob or "damaged" in blob or "refund" in blob:
        return "complaint"
    if "leave" in blob or "off duty" in blob or "not available" in blob:
        return "leave_notice"
    if "late" in blob or "delay" in blob or "traffic" in blob or "congestion" in blob:
        return "delay_alert"
    if actor_role == "admin":
        return "operator_update"
    return "general"


def _support_seed_demo_data(safe_cursor) -> Dict[str, int]:
    _support_ensure_table(safe_cursor)
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            "SELECT COUNT(*) AS c FROM SUPPORT_MESSAGE WHERE subject = %s",
            ("Demo: Ops Comms Seed",),
        )
        row = cursor.fetchone() or {}
        if int(row.get("c") or 0) > 0:
            return {"seeded": 0}

        demo_rows = [
            {
                "participant_type": "customer",
                "participant_id": 8,
                "actor_role": "customer",
                "direction": "inbound",
                "channel": "chat",
                "subject": "Demo: Ops Comms Seed",
                "body": "Complaint: Order #1008 was expected by 14:00. I still do not have a delivery ETA.",
            },
            {
                "participant_type": "customer",
                "participant_id": 8,
                "actor_role": "admin",
                "direction": "outbound",
                "channel": "chat",
                "subject": "Demo: Ops Comms Seed",
                "body": "Update: We escalated route 5006 and assigned priority handling. Next ETA update in 20 minutes.",
            },
            {
                "participant_type": "customer",
                "participant_id": 12,
                "actor_role": "customer",
                "direction": "inbound",
                "channel": "email",
                "subject": "Demo: Ops Comms Seed",
                "body": "Complaint: Cold-chain parcel arrived warmer than expected. Please inspect and advise replacement steps.",
            },
            {
                "participant_type": "customer",
                "participant_id": 20,
                "actor_role": "admin",
                "direction": "outbound",
                "channel": "sms",
                "subject": "Demo: Ops Comms Seed",
                "body": "Status update: Order #1139 is delayed at Shanghai hub due to congestion. Revised ETA is 18:30.",
            },
            {
                "participant_type": "driver",
                "participant_id": 2014,
                "actor_role": "driver",
                "direction": "inbound",
                "channel": "chat",
                "subject": "Demo: Ops Comms Seed",
                "body": "Leave notice: I am on medical leave through Friday and unavailable for assignments.",
            },
            {
                "participant_type": "driver",
                "participant_id": 2026,
                "actor_role": "driver",
                "direction": "inbound",
                "channel": "chat",
                "subject": "Demo: Ops Comms Seed",
                "body": "Delay alert: Heavy congestion on G4 expressway. Running 35 minutes behind schedule.",
            },
            {
                "participant_type": "driver",
                "participant_id": 2026,
                "actor_role": "admin",
                "direction": "outbound",
                "channel": "chat",
                "subject": "Demo: Ops Comms Seed",
                "body": "Acknowledged. Please switch to route alternative B and confirm updated stop sequence.",
            },
            {
                "participant_type": "driver",
                "participant_id": 2001,
                "actor_role": "driver",
                "direction": "inbound",
                "channel": "chat",
                "subject": "Demo: Ops Comms Seed",
                "body": "Issue report: Lift-gate sensor warning detected. Vehicle remains operable but needs maintenance check tonight.",
            },
        ]

        for row_data in demo_rows:
            cursor.execute(
                """
                INSERT INTO SUPPORT_MESSAGE
                (participant_type, participant_id, actor_role, actor_id, direction, channel, subject, body, related_order_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    row_data["participant_type"],
                    row_data["participant_id"],
                    row_data["actor_role"],
                    row_data["participant_id"] if row_data["actor_role"] in {"customer", "driver"} else None,
                    row_data["direction"],
                    row_data["channel"],
                    row_data["subject"],
                    row_data["body"],
                    None,
                ),
            )
        db.commit()
        return {"seeded": len(demo_rows)}
    finally:
        cursor.close()
        db.close()


def _support_fetch_inbox(safe_cursor, limit: int = 120) -> List[Dict[str, Any]]:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT m.participant_type, m.participant_id, m.message_id, m.actor_role, m.direction, m.channel,
                   m.subject, m.body, m.created_at
            FROM SUPPORT_MESSAGE m
            JOIN (
                SELECT participant_type, participant_id, MAX(message_id) AS latest_message_id
                FROM SUPPORT_MESSAGE
                GROUP BY participant_type, participant_id
            ) t
              ON m.participant_type = t.participant_type
             AND m.participant_id = t.participant_id
             AND m.message_id = t.latest_message_id
            ORDER BY m.message_id DESC
            LIMIT %s
            """,
            (max(1, min(int(limit), 500)),),
        )
        rows = cursor.fetchall()
    finally:
        cursor.close()
        db.close()

    out = []
    for r in rows:
        kind = _support_detect_kind(str(r.get("body") or ""), str(r.get("actor_role") or ""), str(r.get("subject") or ""))
        out.append(
            {
                **r,
                "participant_name": _support_participant_name(safe_cursor, r["participant_type"], int(r["participant_id"])),
                "kind": kind,
                "needs_attention": bool(kind in {"complaint", "delay_alert", "leave_notice"} and r.get("actor_role") in {"customer", "driver"}),
            }
        )
    out.sort(key=lambda x: (1 if x.get("needs_attention") else 0, int(x.get("message_id") or 0)), reverse=True)
    return _safe_json_dump(out)


def _support_fetch_feed(safe_cursor, *, since_id: int = 0, limit: int = 150) -> Dict[str, Any]:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT message_id, participant_type, participant_id, actor_role, direction, channel, subject, body, related_order_id, created_at
            FROM SUPPORT_MESSAGE
            WHERE message_id > %s
            ORDER BY message_id ASC
            LIMIT %s
            """,
            (max(0, int(since_id)), max(1, min(int(limit), 500))),
        )
        rows = cursor.fetchall()
        cursor.execute("SELECT COALESCE(MAX(message_id), 0) AS max_id FROM SUPPORT_MESSAGE")
        max_row = cursor.fetchone() or {}
        latest_id = int(max_row.get("max_id") or 0)
    finally:
        cursor.close()
        db.close()

    feed = []
    for r in rows:
        kind = _support_detect_kind(str(r.get("body") or ""), str(r.get("actor_role") or ""), str(r.get("subject") or ""))
        feed.append(
            {
                **r,
                "participant_name": _support_participant_name(safe_cursor, r["participant_type"], int(r["participant_id"])),
                "kind": kind,
            }
        )
    return {"events": _safe_json_dump(feed), "latest_message_id": latest_id}


def _support_overview_metrics(safe_cursor) -> Dict[str, int]:
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT COUNT(*) AS c FROM CUSTOMER")
        customers_total = int((cursor.fetchone() or {}).get("c") or 0)

        cursor.execute("SELECT COUNT(*) AS c FROM DRIVER")
        drivers_total = int((cursor.fetchone() or {}).get("c") or 0)

        cursor.execute("SELECT COUNT(*) AS c FROM DRIVER WHERE status = 'On Leave'")
        drivers_on_leave = int((cursor.fetchone() or {}).get("c") or 0)

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM SUPPORT_MESSAGE
            WHERE created_at >= (NOW() - INTERVAL 24 HOUR)
              AND actor_role = 'customer'
              AND (LOWER(body) LIKE '%complaint%' OR LOWER(body) LIKE '%refund%' OR LOWER(body) LIKE '%damaged%')
            """
        )
        complaints_24h = int((cursor.fetchone() or {}).get("c") or 0)

        cursor.execute(
            """
            SELECT COUNT(*) AS c
            FROM SUPPORT_MESSAGE
            WHERE created_at >= (NOW() - INTERVAL 24 HOUR)
              AND actor_role = 'driver'
              AND (LOWER(body) LIKE '%delay%' OR LOWER(body) LIKE '%late%' OR LOWER(body) LIKE '%congestion%')
            """
        )
        delays_24h = int((cursor.fetchone() or {}).get("c") or 0)
    finally:
        cursor.close()
        db.close()

    return {
        "customers_total": customers_total,
        "drivers_total": drivers_total,
        "drivers_on_leave": drivers_on_leave,
        "complaints_24h": complaints_24h,
        "delay_alerts_24h": delays_24h,
    }


def _extract_order_id_from_text(text: str) -> Optional[int]:
    blob = str(text or "")
    m = re.search(r"\border\s*#?\s*(\d{1,12})\b", blob, flags=re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r"#(\d{3,12})\b", blob)
    if m:
        return int(m.group(1))
    return None


def _complaint_severity(text: str) -> str:
    blob = str(text or "").lower()
    high_kw = ("damaged", "broken", "refund", "medical", "cold-chain", "cold chain", "urgent", "lost")
    med_kw = ("late", "delay", "eta", "where", "not delivered", "missed", "slow")
    if any(k in blob for k in high_kw):
        return "high"
    if any(k in blob for k in med_kw):
        return "medium"
    return "low"


def _support_latest_order_for_customer(safe_cursor, customer_id: int) -> Optional[int]:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT order_id
            FROM C_ORDER
            WHERE sender_id = %s OR receiver_id = %s
            ORDER BY order_id DESC
            LIMIT 1
            """,
            (customer_id, customer_id),
        )
        row = cursor.fetchone() or {}
        oid = row.get("order_id")
        return int(oid) if oid is not None else None
    finally:
        cursor.close()
        db.close()


def _support_fetch_complaint_cases(safe_cursor, limit: int = 120) -> Dict[str, Any]:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT message_id, participant_id, subject, body, created_at
            FROM SUPPORT_MESSAGE
            WHERE participant_type = 'customer'
              AND actor_role = 'customer'
              AND (
                    LOWER(COALESCE(subject, '')) LIKE '%complaint%'
                 OR LOWER(COALESCE(body, '')) LIKE '%complaint%'
                 OR LOWER(COALESCE(body, '')) LIKE '%refund%'
                 OR LOWER(COALESCE(body, '')) LIKE '%damaged%'
              )
            ORDER BY message_id DESC
            LIMIT %s
            """,
            (max(1, min(int(limit), 500)),),
        )
        complaint_roots = cursor.fetchall()
    finally:
        cursor.close()
        db.close()

    cases: List[Dict[str, Any]] = []
    bucket_counts = {"high": 0, "medium": 0, "low": 0, "open": 0, "resolved": 0}

    for root in complaint_roots:
        complaint_id = int(root["message_id"])
        customer_id = int(root["participant_id"])

        db2, cursor2 = safe_cursor()
        try:
            cursor2.execute(
                """
                SELECT MIN(message_id) AS next_complaint_id
                FROM SUPPORT_MESSAGE
                WHERE participant_type = 'customer'
                  AND participant_id = %s
                  AND actor_role = 'customer'
                  AND message_id > %s
                  AND (
                        LOWER(COALESCE(subject, '')) LIKE '%complaint%'
                     OR LOWER(COALESCE(body, '')) LIKE '%complaint%'
                     OR LOWER(COALESCE(body, '')) LIKE '%refund%'
                     OR LOWER(COALESCE(body, '')) LIKE '%damaged%'
                  )
                """,
                (customer_id, complaint_id),
            )
            nr = cursor2.fetchone() or {}
            next_complaint_id = nr.get("next_complaint_id")

            if next_complaint_id is None:
                cursor2.execute(
                    """
                    SELECT message_id, actor_role, direction, channel, subject, body, related_order_id, created_at
                    FROM SUPPORT_MESSAGE
                    WHERE participant_type = 'customer'
                      AND participant_id = %s
                      AND message_id >= %s
                    ORDER BY message_id ASC
                    LIMIT 300
                    """,
                    (customer_id, complaint_id),
                )
            else:
                cursor2.execute(
                    """
                    SELECT message_id, actor_role, direction, channel, subject, body, related_order_id, created_at
                    FROM SUPPORT_MESSAGE
                    WHERE participant_type = 'customer'
                      AND participant_id = %s
                      AND message_id >= %s
                      AND message_id < %s
                    ORDER BY message_id ASC
                    LIMIT 300
                    """,
                    (customer_id, complaint_id, int(next_complaint_id)),
                )
            thread_rows = cursor2.fetchall()
        finally:
            cursor2.close()
            db2.close()

        has_admin_reply = any(
            (r.get("actor_role") == "admin")
            and str(r.get("subject") or "").strip().lower().startswith("complaint response")
            for r in thread_rows[1:]
        )
        status = "resolved" if has_admin_reply else "open"
        sev = _complaint_severity(root.get("body") or "")
        order_id = _extract_order_id_from_text(f"{root.get('subject') or ''} {root.get('body') or ''}")
        if order_id is None:
            for r in thread_rows:
                rel = r.get("related_order_id")
                if rel is not None:
                    order_id = int(rel)
                    break
        if order_id is None:
            order_id = _support_latest_order_for_customer(safe_cursor, customer_id)

        participant_name = _support_participant_name(safe_cursor, "customer", customer_id)
        case_summary = {
            "complaint_id": complaint_id,
            "customer_id": customer_id,
            "customer_name": participant_name,
            "created_at": root.get("created_at"),
            "subject": root.get("subject"),
            "body": root.get("body"),
            "severity": sev,
            "status": status,
            "order_id": order_id,
            "message_count": len(thread_rows),
            "latest_message_at": thread_rows[-1]["created_at"] if thread_rows else root.get("created_at"),
        }
        cases.append(case_summary)
        bucket_counts[sev] += 1
        bucket_counts[status] += 1

    cases.sort(key=lambda x: (0 if x["status"] == "open" else 1, 0 if x["severity"] == "high" else 1 if x["severity"] == "medium" else 2, -(int(x["complaint_id"])) ))
    return {"cases": _safe_json_dump(cases), "bucket_counts": bucket_counts}


def _support_fetch_complaint_case_detail(safe_cursor, complaint_id: int) -> Optional[Dict[str, Any]]:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT message_id, participant_id, subject, body, created_at
            FROM SUPPORT_MESSAGE
            WHERE message_id = %s
              AND participant_type = 'customer'
              AND actor_role = 'customer'
            LIMIT 1
            """,
            (complaint_id,),
        )
        root = cursor.fetchone()
    finally:
        cursor.close()
        db.close()
    if not root:
        return None

    customer_id = int(root["participant_id"])
    db2, cursor2 = safe_cursor()
    try:
        cursor2.execute(
            """
            SELECT MIN(message_id) AS next_complaint_id
            FROM SUPPORT_MESSAGE
            WHERE participant_type = 'customer'
              AND participant_id = %s
              AND actor_role = 'customer'
              AND message_id > %s
              AND (
                    LOWER(COALESCE(subject, '')) LIKE '%complaint%'
                 OR LOWER(COALESCE(body, '')) LIKE '%complaint%'
                 OR LOWER(COALESCE(body, '')) LIKE '%refund%'
                 OR LOWER(COALESCE(body, '')) LIKE '%damaged%'
              )
            """,
            (customer_id, complaint_id),
        )
        nr = cursor2.fetchone() or {}
        next_complaint_id = nr.get("next_complaint_id")

        if next_complaint_id is None:
            cursor2.execute(
                """
                SELECT message_id, actor_role, direction, channel, subject, body, related_order_id, created_at
                FROM SUPPORT_MESSAGE
                WHERE participant_type = 'customer'
                  AND participant_id = %s
                  AND message_id >= %s
                ORDER BY message_id ASC
                LIMIT 300
                """,
                (customer_id, complaint_id),
            )
        else:
            cursor2.execute(
                """
                SELECT message_id, actor_role, direction, channel, subject, body, related_order_id, created_at
                FROM SUPPORT_MESSAGE
                WHERE participant_type = 'customer'
                  AND participant_id = %s
                  AND message_id >= %s
                  AND message_id < %s
                ORDER BY message_id ASC
                LIMIT 300
                """,
                (customer_id, complaint_id, int(next_complaint_id)),
            )
        thread_rows = cursor2.fetchall()
    finally:
        cursor2.close()
        db2.close()

    order_id = _extract_order_id_from_text(f"{root.get('subject') or ''} {root.get('body') or ''}")
    if order_id is None:
        for r in thread_rows:
            rel = r.get("related_order_id")
            if rel is not None:
                order_id = int(rel)
                break
    if order_id is None:
        order_id = _support_latest_order_for_customer(safe_cursor, customer_id)

    order_context = None
    if order_id is not None:
        context, cerr = fetch_shipment_context_for_ai(safe_cursor, int(order_id))
        if not cerr:
            order_context = context

    has_admin_reply = any(
        (r.get("actor_role") == "admin")
        and str(r.get("subject") or "").strip().lower().startswith("complaint response")
        for r in thread_rows[1:]
    )
    return {
        "complaint_id": complaint_id,
        "customer_id": customer_id,
        "customer_name": _support_participant_name(safe_cursor, "customer", customer_id),
        "severity": _complaint_severity(root.get("body") or ""),
        "status": "resolved" if has_admin_reply else "open",
        "order_id": order_id,
        "root": _safe_json_dump(root),
        "thread": _safe_json_dump(thread_rows),
        "order_context": order_context,
    }


def _round_half(v: float) -> float:
    return round(v * 2.0) / 2.0


def _driver_profiles(safe_cursor, *, limit: int = 300) -> List[Dict[str, Any]]:
    db, cursor = safe_cursor()
    try:
        cursor.execute(
            """
            SELECT d.driver_id, d.name, d.status, d.working_hours, d.license_class,
                   COALESCE(a.active_assignments, 0) AS active_assignments
            FROM DRIVER d
            LEFT JOIN (
                SELECT driver_id, COUNT(*) AS active_assignments
                FROM DRIVER_VEHICLE_ASSIGNMENT
                WHERE status NOT IN ('Completed', 'Cancelled')
                GROUP BY driver_id
            ) a ON a.driver_id = d.driver_id
            ORDER BY d.driver_id ASC
            LIMIT %s
            """,
            (max(1, min(limit, 1000)),),
        )
        drivers = cursor.fetchall()

        cursor.execute(
            """
            SELECT participant_id AS driver_id,
                   SUM(CASE WHEN LOWER(body) LIKE '%delay%' OR LOWER(body) LIKE '%late%' OR LOWER(body) LIKE '%congestion%' THEN 1 ELSE 0 END) AS late_alerts,
                   SUM(CASE WHEN LOWER(body) LIKE '%issue%' OR LOWER(body) LIKE '%warning%' OR LOWER(body) LIKE '%problem%' THEN 1 ELSE 0 END) AS issue_reports,
                   SUM(CASE WHEN LOWER(body) LIKE '%leave%' OR LOWER(body) LIKE '%off duty%' THEN 1 ELSE 0 END) AS leave_notices
            FROM SUPPORT_MESSAGE
            WHERE participant_type = 'driver'
              AND actor_role = 'driver'
              AND created_at >= (NOW() - INTERVAL 14 DAY)
            GROUP BY participant_id
            """
        )
        signal_rows = cursor.fetchall()
    finally:
        cursor.close()
        db.close()

    signals_by_driver = {
        int(r["driver_id"]): {
            "late_alerts": int(r.get("late_alerts") or 0),
            "issue_reports": int(r.get("issue_reports") or 0),
            "leave_notices": int(r.get("leave_notices") or 0),
        }
        for r in signal_rows
    }

    complaint_cases = _support_fetch_complaint_cases(safe_cursor, limit=400).get("cases", [])
    open_orders = [int(c["order_id"]) for c in complaint_cases if c.get("status") == "open" and c.get("order_id") is not None]
    complaint_by_driver: Dict[int, int] = {}
    if open_orders:
        # Use one query to map open complaint orders to currently assigned drivers.
        db2, cursor2 = safe_cursor()
        try:
            placeholders = ",".join(["%s"] * len(open_orders))
            cursor2.execute(
                f"""
                SELECT dva.driver_id, COUNT(DISTINCT d.order_id) AS open_complaints
                FROM DELIVERY d
                JOIN DRIVER_VEHICLE_ASSIGNMENT dva ON d.assignment_id = dva.assignment_id
                WHERE d.order_id IN ({placeholders})
                GROUP BY dva.driver_id
                """,
                tuple(open_orders),
            )
            for r in cursor2.fetchall():
                complaint_by_driver[int(r["driver_id"])] = int(r.get("open_complaints") or 0)
        finally:
            cursor2.close()
            db2.close()

    out: List[Dict[str, Any]] = []
    for d in drivers:
        did = int(d["driver_id"])
        sig = signals_by_driver.get(did, {"late_alerts": 0, "issue_reports": 0, "leave_notices": 0})
        open_complaints = int(complaint_by_driver.get(did, 0))
        late_alerts = int(sig["late_alerts"])
        issue_reports = int(sig["issue_reports"])
        leave_notices = int(sig["leave_notices"])

        rating = 5.0
        rating -= 0.8 * open_complaints
        rating -= 0.4 * late_alerts
        rating -= 0.3 * issue_reports
        rating -= 0.2 * leave_notices
        if str(d.get("status") or "").lower() == "active":
            rating += 0.2
        if str(d.get("status") or "").lower() == "on leave":
            rating -= 0.4
        rating = min(5.0, max(1.0, rating))
        rating = _round_half(rating)

        risk_flags: List[str] = []
        if open_complaints > 0:
            risk_flags.append("active_complaint")
        if late_alerts > 0:
            risk_flags.append("late_delivery_risk")
        if issue_reports > 0:
            risk_flags.append("operational_issue")
        if str(d.get("status") or "").lower() == "on leave":
            risk_flags.append("on_leave")

        out.append(
            {
                "driver_id": did,
                "name": d.get("name"),
                "status": d.get("status"),
                "working_hours": d.get("working_hours"),
                "license_class": d.get("license_class"),
                "active_assignments": int(d.get("active_assignments") or 0),
                "open_complaints": open_complaints,
                "late_alerts_14d": late_alerts,
                "issue_reports_14d": issue_reports,
                "leave_notices_14d": leave_notices,
                "rating": rating,
                "risk_flags": risk_flags,
                "is_risk": len(risk_flags) > 0,
            }
        )

    # Risk-first ordering for operations visibility.
    out.sort(
        key=lambda x: (
            0 if x["is_risk"] else 1,
            -(len(x["risk_flags"])),
            x["rating"],
            x["driver_id"],
        )
    )
    return _safe_json_dump(out)


def _parse_horizon_to_days(horizon: str) -> int:
    h = str(horizon or "").strip().lower()
    if h in {"24h", "1d"}:
        return 1
    if h in {"7d", "1w"}:
        return 7
    if h in {"30d", "1m"}:
        return 30
    if h in {"90d", "3m"}:
        return 90
    return 30


def _ops_advanced_analytics(safe_cursor, *, horizon: str = "30d") -> Dict[str, Any]:
    days = _parse_horizon_to_days(horizon)
    cases = _support_fetch_complaint_cases(safe_cursor, limit=800).get("cases", [])

    now = datetime.now()
    cutoff = now.timestamp() - days * 24 * 3600
    scoped: List[Dict[str, Any]] = []
    for c in cases:
        ts = c.get("created_at")
        try:
            created = datetime.fromisoformat(str(ts))
        except Exception:
            continue
        if created.timestamp() >= cutoff:
            scoped.append(c)

    open_cases = [c for c in scoped if c.get("status") == "open"]
    resolved_cases = [c for c in scoped if c.get("status") == "resolved"]

    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for c in scoped:
        sev = str(c.get("severity") or "low").lower()
        if sev not in severity_counts:
            sev = "low"
        severity_counts[sev] += 1

    root_cause_counts = {
        "delay_or_eta": 0,
        "damage_quality": 0,
        "cold_chain_temp": 0,
        "communication_gap": 0,
        "other": 0,
    }
    for c in scoped:
        body = str(c.get("body") or "").lower()
        if any(k in body for k in ("delay", "late", "eta", "not delivered", "missed")):
            root_cause_counts["delay_or_eta"] += 1
        elif any(k in body for k in ("damaged", "dented", "broken", "refund")):
            root_cause_counts["damage_quality"] += 1
        elif any(k in body for k in ("cold-chain", "cold chain", "temperature", "warmer")):
            root_cause_counts["cold_chain_temp"] += 1
        elif any(k in body for k in ("no update", "no proactive", "not informed", "no message")):
            root_cause_counts["communication_gap"] += 1
        else:
            root_cause_counts["other"] += 1

    # Aging distribution of open complaints.
    aging = {"under_2h": 0, "h2_to_24": 0, "d1_to_3": 0, "over_3d": 0}
    for c in open_cases:
        try:
            created = datetime.fromisoformat(str(c.get("created_at")))
            hrs = max(0.0, (now - created).total_seconds() / 3600.0)
        except Exception:
            continue
        if hrs < 2:
            aging["under_2h"] += 1
        elif hrs < 24:
            aging["h2_to_24"] += 1
        elif hrs < 72:
            aging["d1_to_3"] += 1
        else:
            aging["over_3d"] += 1

    # Recovery times (approx from created_at to latest_message_at for resolved).
    resolution_hours: List[float] = []
    for c in resolved_cases:
        try:
            t0 = datetime.fromisoformat(str(c.get("created_at")))
            t1 = datetime.fromisoformat(str(c.get("latest_message_at")))
            h = max(0.0, (t1 - t0).total_seconds() / 3600.0)
            resolution_hours.append(h)
        except Exception:
            continue
    resolution_hours_sorted = sorted(resolution_hours)
    median_resolution_hours = 0.0
    if resolution_hours_sorted:
        m = len(resolution_hours_sorted) // 2
        if len(resolution_hours_sorted) % 2 == 1:
            median_resolution_hours = resolution_hours_sorted[m]
        else:
            median_resolution_hours = (resolution_hours_sorted[m - 1] + resolution_hours_sorted[m]) / 2.0

    # Driver impact linked by open complaint order IDs.
    open_orders = [int(c["order_id"]) for c in open_cases if c.get("order_id") is not None]
    driver_impact: List[Dict[str, Any]] = []
    if open_orders:
        db, cursor = safe_cursor()
        try:
            placeholders = ",".join(["%s"] * len(open_orders))
            cursor.execute(
                f"""
                SELECT dva.driver_id, dr.name AS driver_name, COUNT(DISTINCT d.order_id) AS linked_open_orders
                FROM DELIVERY d
                JOIN DRIVER_VEHICLE_ASSIGNMENT dva ON d.assignment_id = dva.assignment_id
                JOIN DRIVER dr ON dr.driver_id = dva.driver_id
                WHERE d.order_id IN ({placeholders})
                GROUP BY dva.driver_id, dr.name
                ORDER BY linked_open_orders DESC, dva.driver_id ASC
                LIMIT 10
                """,
                tuple(open_orders),
            )
            driver_impact = cursor.fetchall()
        finally:
            cursor.close()
            db.close()

    total = max(1, len(scoped))
    open_rate = len(open_cases) / total
    critical_pressure = round(
        min(100.0, severity_counts["high"] * 18 + aging["over_3d"] * 16 + aging["d1_to_3"] * 7 + len(open_cases) * 3),
        1,
    )
    recovery_efficiency = round(max(0.0, min(100.0, (len(resolved_cases) / total) * 100.0 - (median_resolution_hours * 0.8))), 1)

    insights: List[str] = []
    if critical_pressure >= 70:
        insights.append("Critical pressure is high: prioritize high-severity and oldest open complaints immediately.")
    elif critical_pressure >= 40:
        insights.append("Pressure is elevated: keep targeted recovery cadence and reduce aging backlog first.")
    else:
        insights.append("Pressure is controlled: maintain recovery discipline and proactive customer updates.")
    top_root = max(root_cause_counts.items(), key=lambda x: x[1])[0] if scoped else "other"
    insights.append(f"Top complaint driver in this window is '{top_root}'.")
    if median_resolution_hours > 0:
        insights.append(f"Median resolution time is {round(median_resolution_hours, 1)} hours.")

    return _safe_json_dump(
        {
            "horizon_days": days,
            "total_complaints": len(scoped),
            "open_complaints": len(open_cases),
            "resolved_complaints": len(resolved_cases),
            "open_rate_pct": round(open_rate * 100.0, 1),
            "severity_counts": severity_counts,
            "root_cause_counts": root_cause_counts,
            "aging_open_counts": aging,
            "median_resolution_hours": round(median_resolution_hours, 2),
            "critical_pressure_index": critical_pressure,
            "recovery_efficiency_score": recovery_efficiency,
            "driver_impact_top": driver_impact,
            "insights": insights,
        }
    )


def register_ai_routes(app, *, safe_cursor: Callable, verify_token: Callable) -> None:
    @app.route("/api/ai/health", methods=["GET"])
    def ai_health():
        ok = bool(os.environ.get("OPENROUTER_API_KEY", "").strip())
        return jsonify({"status": "ok", "openrouter_configured": ok}), 200

    def _customer_from_token():
        user = verify_token(request)
        if not user:
            return None, (jsonify({"error": "Unauthorized"}), 401)
        if user.get("role") != "customer":
            return None, (jsonify({"error": "Customer session required"}), 403)
        return user, None

    def _admin_from_token():
        user = verify_token(request)
        if not user:
            return None, (jsonify({"error": "Unauthorized"}), 401)
        if user.get("role") != "admin":
            return None, (jsonify({"error": "Admin session required"}), 403)
        return user, None

    def _authorize_notification(order_id: int):
        auth = verify_token(request)
        if not auth:
            return (jsonify({"error": "Unauthorized"}), 401)
        db, cursor = safe_cursor()
        try:
            cursor.execute(
                "SELECT sender_id, receiver_id FROM C_ORDER WHERE order_id=%s",
                (order_id,),
            )
            row = cursor.fetchone()
            if not row:
                return (jsonify({"error": "Order not found"}), 404)
            if auth.get("role") == "admin":
                return None
            if auth.get("role") == "customer" and auth.get("user_id") in (
                row["sender_id"],
                row["receiver_id"],
            ):
                return None
        finally:
            cursor.close()
            db.close()
        return (jsonify({"error": "Forbidden"}), 403)

    @app.route("/api/ai/tracking-assistant", methods=["POST"])
    def ai_tracking_assistant():
        if not os.environ.get("OPENROUTER_API_KEY", "").strip():
            return jsonify({"error": "AI not configured on server (set OPENROUTER_API_KEY)"}), 503
        _, err = _customer_from_token()
        if err:
            return err

        payload = request.get_json(silent=True) or {}
        try:
            order_id = int(payload.get("order_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "order_id is required"}), 400

        message = str(payload.get("message") or payload.get("question") or "").strip()
        if len(message) > 4000:
            return jsonify({"error": "message too long"}), 400

        user = verify_token(request)
        uid = int(user["user_id"])

        db, cursor = safe_cursor()
        try:
            cursor.execute(
                "SELECT order_id, sender_id, receiver_id FROM C_ORDER WHERE order_id=%s",
                (order_id,),
            )
            chk = cursor.fetchone()
            if not chk:
                return jsonify({"error": "Order not found"}), 404
            if uid not in (chk["sender_id"], chk["receiver_id"]):
                return jsonify({"error": "Forbidden"}), 403
        finally:
            cursor.close()
            db.close()

        context, cerr = fetch_shipment_context_for_ai(safe_cursor, order_id)
        if cerr:
            return jsonify({"error": cerr}), 404

        system = """You are a shipment tracking assistant for an authenticated party (sender or receiver).
Rules:
    - Base every factual claim ONLY on the JSON FACTS provided. Do not invent routes, ETAs, or addresses.
    - If FACTS omit something, say it is not available in our system rather than guessing.
    - Never print password hashes or internal credentials.
    - Be concise and friendly; use bullets when listing updates chronologically when helpful."""

        user_message = json.dumps({"FACTS": context, "USER_QUESTION": message or "(no question — summarize current status briefly)"})

        try:
            rsp = chat_completion(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_message},
                ],
                temperature=0.25,
                max_tokens=1400,
                timeout_seconds=60.0,
            )
            answer = extract_message_text(rsp)
        except OpenRouterError as e:
            return jsonify({"error": str(e)}), 503

        return jsonify({"answer": answer}), 200

    @app.route("/api/ai/admin-copilot", methods=["POST"])
    def ai_admin_copilot():
        if not os.environ.get("OPENROUTER_API_KEY", "").strip():
            return jsonify({"error": "AI not configured on server (set OPENROUTER_API_KEY)"}), 503
        _, err = _admin_from_token()
        if err:
            return err

        body = request.get_json(silent=True) or {}
        msg = str(body.get("message", "")).strip()
        if not msg:
            return jsonify({"error": "message is required"}), 400
        if len(msg) > 12000:
            return jsonify({"error": "message too long"}), 400

        mode = str(body.get("mode", "answer")).strip().lower()
        intent_override = body.get("intent")
        params_override = body.get("params") if isinstance(body.get("params"), dict) else None

        try:
            allowed = set(_allowed_intent_list())
            if intent_override:
                inn = str(intent_override).strip()
                classified = {"intent": inn if inn in allowed else "help", "params": params_override or {}}
            else:
                classified = classify_admin_intent(msg)
                if classified.get("intent") not in allowed:
                    classified = {"intent": "help", "params": {}}

            exec_result = dispatch_admin_intent(safe_cursor, classified["intent"], classified.get("params") or {})

            if exec_result.get("intent") == "help":
                return (
                    jsonify(
                        {"answer": exec_result.get("message", INTENT_HELP), "intent": "help", "tool_raw": exec_result}
                    ),
                    200,
                )

            if exec_result.get("error"):
                assistant = summarize_with_model(
                    "You help logistics admins. Explain the tool outcome succinctly (error or clarification).",
                    json.dumps(exec_result, default=str),
                )
                return jsonify({"answer": assistant, "intent": classified.get("intent"), "tool_raw": exec_result}), 200

            if mode == "data":
                return jsonify({"answer": "", "intent": classified.get("intent"), "tool_raw": exec_result}), 200

            summary_instruction = summarize_with_model(
                "You summarize operational data for logistics admins. Prefer concise bullets or a short table narrative. Mention if truncated.",
                "ORIGINAL QUESTION:\n%s\n\nDATA_JSON:\n%s" % (msg, json.dumps(exec_result, default=str)),
            )
            return (
                jsonify({"answer": summary_instruction, "intent": classified.get("intent"), "tool_raw": exec_result}),
                200,
            )

        except OpenRouterError as e:
            return jsonify({"error": str(e)}), 503

    @app.route("/api/ai/admin-insights", methods=["POST"])
    def ai_admin_insights():
        if not os.environ.get("OPENROUTER_API_KEY", "").strip():
            return jsonify({"error": "AI not configured on server (set OPENROUTER_API_KEY)"}), 503
        _, err = _admin_from_token()
        if err:
            return err

        body = request.get_json(silent=True) or {}
        days = body.get("days", 7)
        try:
            days = max(1, min(int(days), 60))
        except (TypeError, ValueError):
            days = 7

        snapshot = collect_admin_ops_snapshot(safe_cursor, days=days)
        prompt_payload = json.dumps(snapshot, default=str)
        try:
            summary = summarize_with_model(
                "You are a logistics operations strategist. Using ONLY the JSON snapshot, produce: "
                "1) top 3 operational risks, 2) top 3 actions for next 24 hours, 3) one medium-term improvement. "
                "Keep it concise with bullets.",
                prompt_payload,
            )
        except OpenRouterError as e:
            return jsonify({"error": str(e)}), 503

        return jsonify({"summary": summary, "snapshot": snapshot}), 200

    @app.route("/api/ai/assignment-recommendation", methods=["POST"])
    def ai_assignment_recommendation():
        _, err = _admin_from_token()
        if err:
            return err

        body = request.get_json(silent=True) or {}
        try:
            order_id = int(body.get("order_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "order_id is required"}), 400

        recommendation = recommend_assignment_for_order(safe_cursor, order_id)
        if recommendation.get("error"):
            return jsonify(recommendation), 200

        reasoning = ""
        if os.environ.get("OPENROUTER_API_KEY", "").strip():
            try:
                reasoning = summarize_with_model(
                    "You are an operations copilot. Explain why the top recommendation is suitable in 3 short bullets. "
                    "Use only the JSON input.",
                    json.dumps(recommendation, default=str),
                )
            except OpenRouterError:
                reasoning = ""

        return jsonify({"recommendation": recommendation, "reasoning": reasoning}), 200

    @app.route("/api/ai/ops-chatbot", methods=["POST"])
    def ai_ops_chatbot():
        if not os.environ.get("OPENROUTER_API_KEY", "").strip():
            return jsonify({"error": "AI not configured on server (set OPENROUTER_API_KEY)"}), 503
        _, err = _admin_from_token()
        if err:
            return err

        body = request.get_json(silent=True) or {}
        message = str(body.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message is required"}), 400
        if len(message) > 6000:
            return jsonify({"error": "message too long"}), 400
        history = body.get("history") if isinstance(body.get("history"), list) else []

        try:
            routed = classify_ops_chat_intent(message, history=history)
            intent = routed.get("intent", "help")
            params = routed.get("params") or {}

            if intent == "capacity_today":
                req = _parse_capacity_request(message)
                payload = simulate_capacity_request(
                    safe_cursor,
                    parcel_count=req.get("parcel_count"),
                    weight_kg_each=req.get("weight_kg_each"),
                    address_count=req.get("address_count"),
                )
                result = payload.get("result", {})
                request_payload = payload.get("request", {})
                constraints = payload.get("constraints", {})
                feasible = result.get("feasible")
                feasibility_line = "Feasibility not fully specified (missing quantity/weight/address details)."
                if feasible is True:
                    feasibility_line = "Feasible: Yes, this load can be accepted today."
                elif feasible is False:
                    feasibility_line = "Feasible: No, this exceeds today’s safe operating capacity."

                answer = (
                    f"{feasibility_line}\n\n"
                    f"Estimated max acceptable today: {result.get('max_acceptable_today', 0)} deliveries.\n"
                    f"Recommended intake cap today: {result.get('recommended_accept_today', 0)} deliveries.\n\n"
                    f"Request interpreted as:\n"
                    f"- Parcel count: {request_payload.get('parcel_count')}\n"
                    f"- Weight each (kg): {request_payload.get('weight_kg_each')}\n"
                    f"- Address count: {request_payload.get('address_count')}\n\n"
                    f"Key constraints:\n"
                    f"- Flow cap: {constraints.get('max_by_flow')}\n"
                    f"- Driver/vehicle slot cap: {constraints.get('max_by_vehicle_slots')}\n"
                    f"- Weight cap: {constraints.get('max_by_weight')}\n"
                    f"- Address handling cap: {constraints.get('max_by_addresses')}"
                )
                return jsonify({"intent": intent, "answer": answer, "tool_raw": payload}), 200

            if intent == "auto_route_order":
                order_id = params.get("order_id")
                if order_id is None:
                    m = re.search(r"\b(\d{3,})\b", message)
                    order_id = int(m.group(1)) if m else None
                if order_id is None:
                    return jsonify(
                        {
                            "intent": intent,
                            "answer": "Please provide an order ID so I can run auto-routing and assignment recommendations.",
                            "tool_raw": {"error": "order_id missing"},
                        }
                    ), 200
                rec = recommend_assignment_for_order(safe_cursor, int(order_id))
                if rec.get("error"):
                    return jsonify({"intent": intent, "answer": rec.get("error"), "tool_raw": rec}), 200
                answer = summarize_with_model(
                    "You are a logistics dispatch copilot. Explain the recommended driver/vehicle/route and why it is suitable "
                    "in concise bullets with explicit next action.",
                    json.dumps(rec, default=str),
                )
                return jsonify({"intent": intent, "answer": answer, "tool_raw": rec}), 200

            if intent == "control_tower":
                days = params.get("days", 7)
                try:
                    days = max(1, min(int(days), 60))
                except (TypeError, ValueError):
                    days = 7
                snap = collect_admin_ops_snapshot(safe_cursor, days=days)
                answer = summarize_with_model(
                    "You are a logistics control-tower analyst. Provide top risks, impact, and immediate actions (next 24h). "
                    "Prioritize by severity.",
                    json.dumps(snap, default=str),
                )
                return jsonify({"intent": intent, "answer": answer, "tool_raw": snap}), 200

            if intent == "admin_data_qna":
                classified = classify_admin_intent(message)
                allowed = set(_allowed_intent_list())
                if classified.get("intent") not in allowed:
                    classified = {"intent": "help", "params": {}}
                exec_result = dispatch_admin_intent(safe_cursor, classified["intent"], classified.get("params") or {})
                if exec_result.get("intent") == "help":
                    return jsonify({"intent": intent, "answer": exec_result.get("message", INTENT_HELP), "tool_raw": exec_result}), 200
                if exec_result.get("error"):
                    answer = summarize_with_model(
                        "You help logistics admins. Explain query result or error succinctly.",
                        json.dumps(exec_result, default=str),
                    )
                    return jsonify({"intent": intent, "answer": answer, "tool_raw": exec_result}), 200
                answer = summarize_with_model(
                    "Summarize logistics operational data for an admin in concise bullets. Mention if truncated.",
                    "QUESTION:\n%s\n\nDATA:\n%s" % (message, json.dumps(exec_result, default=str)),
                )
                return jsonify({"intent": intent, "answer": answer, "tool_raw": exec_result}), 200

            return jsonify(
                {
                    "intent": "help",
                    "answer": (
                        "I can help with: capacity planning for today, control-tower risk overview, "
                        "auto-routing recommendation for an order ID, and logistics data Q&A."
                    ),
                    "tool_raw": {"intent": "help"},
                }
            ), 200

        except OpenRouterError as e:
            return jsonify({"error": str(e)}), 503

    @app.route("/api/ai/support/fake-send", methods=["POST"])
    def ai_support_fake_send():
        user, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)

        body = request.get_json(silent=True) or {}
        participant_type = str(body.get("participant_type") or "").strip().lower()
        if participant_type not in {"customer", "driver"}:
            return jsonify({"error": "participant_type must be customer or driver"}), 400
        try:
            participant_id = int(body.get("participant_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "participant_id is required"}), 400
        channel = str(body.get("channel") or "email").strip().lower()
        if channel not in {"sms", "email"}:
            return jsonify({"error": "channel must be sms or email"}), 400
        subject = str(body.get("subject") or "").strip()[:255]
        message = str(body.get("message") or body.get("body") or "").strip()
        if not message:
            return jsonify({"error": "message/body is required"}), 400
        related_order_id = body.get("order_id")
        related_order_id = int(related_order_id) if isinstance(related_order_id, (int, str)) and str(related_order_id).isdigit() else None

        sent = _support_insert_message(
            safe_cursor,
            participant_type=participant_type,
            participant_id=participant_id,
            actor_role="admin",
            actor_id=int(user.get("user_id")),
            direction="outbound",
            channel=channel,
            subject=subject or None,
            body=message,
            related_order_id=related_order_id,
        )
        name = _support_participant_name(safe_cursor, participant_type, participant_id)
        ack = f"Thanks team, {name} here. Message received — we'll follow up shortly."
        _support_insert_message(
            safe_cursor,
            participant_type=participant_type,
            participant_id=participant_id,
            actor_role=participant_type,
            actor_id=participant_id,
            direction="inbound",
            channel=channel,
            subject=None,
            body=ack,
            related_order_id=related_order_id,
        )
        return jsonify({"status": "queued_fake_send", "message_id": sent.get("message_id"), "participant_name": name}), 200

    @app.route("/api/ai/support/chat", methods=["POST"])
    def ai_support_chat():
        user, err = _admin_from_token()
        if err:
            return err
        if not os.environ.get("OPENROUTER_API_KEY", "").strip():
            return jsonify({"error": "AI not configured on server (set OPENROUTER_API_KEY)"}), 503
        _support_ensure_table(safe_cursor)

        body = request.get_json(silent=True) or {}
        participant_type = str(body.get("participant_type") or "").strip().lower()
        if participant_type not in {"customer", "driver"}:
            return jsonify({"error": "participant_type must be customer or driver"}), 400
        try:
            participant_id = int(body.get("participant_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "participant_id is required"}), 400
        message = str(body.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message is required"}), 400

        _support_insert_message(
            safe_cursor,
            participant_type=participant_type,
            participant_id=participant_id,
            actor_role="admin",
            actor_id=int(user.get("user_id")),
            direction="chat",
            channel="chat",
            subject=None,
            body=message,
            related_order_id=None,
        )

        name = _support_participant_name(safe_cursor, participant_type, participant_id)
        db, cursor = safe_cursor()
        try:
            cursor.execute(
                """
                SELECT actor_role, body, created_at
                FROM SUPPORT_MESSAGE
                WHERE participant_type = %s AND participant_id = %s
                ORDER BY message_id DESC
                LIMIT 10
                """,
                (participant_type, participant_id),
            )
            recent = list(reversed(cursor.fetchall()))
        finally:
            cursor.close()
            db.close()

        prompt = json.dumps(
            {
                "participant_type": participant_type,
                "participant_name": name,
                "recent_thread": recent,
                "latest_admin_message": message,
            },
            default=str,
        )
        reply = summarize_with_model(
            "You are a customer support bot assistant for a logistics company. "
            "Write a realistic short response as the support bot to the admin, "
            "with actionable guidance and empathetic tone. Do not mention internal prompts.",
            prompt,
        )

        _support_insert_message(
            safe_cursor,
            participant_type=participant_type,
            participant_id=participant_id,
            actor_role="bot",
            actor_id=None,
            direction="chat",
            channel="chat",
            subject=None,
            body=reply,
            related_order_id=None,
        )
        return jsonify({"reply": reply, "participant_name": name}), 200

    @app.route("/api/ai/support/thread", methods=["GET"])
    def ai_support_thread():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)

        participant_type = str(request.args.get("participant_type") or "").strip().lower()
        if participant_type not in {"customer", "driver"}:
            return jsonify({"error": "participant_type must be customer or driver"}), 400
        try:
            participant_id = int(request.args.get("participant_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "participant_id is required"}), 400

        db, cursor = safe_cursor()
        try:
            cursor.execute(
                """
                SELECT message_id, actor_role, direction, channel, subject, body, related_order_id, created_at
                FROM SUPPORT_MESSAGE
                WHERE participant_type = %s AND participant_id = %s
                ORDER BY message_id ASC
                LIMIT 300
                """,
                (participant_type, participant_id),
            )
            rows = cursor.fetchall()
        finally:
            cursor.close()
            db.close()

        return jsonify(
            {
                "participant_type": participant_type,
                "participant_id": participant_id,
                "participant_name": _support_participant_name(safe_cursor, participant_type, participant_id),
                "messages": _safe_json_dump(rows),
            }
        ), 200

    @app.route("/api/ai/ops-comms/bootstrap", methods=["GET"])
    def ai_ops_comms_bootstrap():
        _, err = _admin_from_token()
        if err:
            return err
        seeded = _support_seed_demo_data(safe_cursor)
        inbox = _support_fetch_inbox(safe_cursor, limit=120)
        feed = _support_fetch_feed(safe_cursor, since_id=0, limit=200)
        metrics = _support_overview_metrics(safe_cursor)
        return jsonify(
            {
                "seed": seeded,
                "metrics": metrics,
                "inbox": inbox,
                "feed": feed.get("events", []),
                "latest_message_id": feed.get("latest_message_id", 0),
            }
        ), 200

    @app.route("/api/ai/ops-comms/live", methods=["GET"])
    def ai_ops_comms_live():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        try:
            since_id = int(request.args.get("since_id") or 0)
        except (TypeError, ValueError):
            since_id = 0
        payload = _support_fetch_feed(safe_cursor, since_id=since_id, limit=200)
        return jsonify(payload), 200

    @app.route("/api/ai/ops-comms/inbox", methods=["GET"])
    def ai_ops_comms_inbox():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        try:
            limit = int(request.args.get("limit") or 120)
        except (TypeError, ValueError):
            limit = 120
        inbox = _support_fetch_inbox(safe_cursor, limit=limit)
        return jsonify({"threads": inbox, "metrics": _support_overview_metrics(safe_cursor)}), 200

    @app.route("/api/ai/ops-comms/thread", methods=["GET"])
    def ai_ops_comms_thread():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        participant_type = str(request.args.get("participant_type") or "").strip().lower()
        if participant_type not in {"customer", "driver"}:
            return jsonify({"error": "participant_type must be customer or driver"}), 400
        try:
            participant_id = int(request.args.get("participant_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "participant_id is required"}), 400
        try:
            limit = int(request.args.get("limit") or 300)
        except (TypeError, ValueError):
            limit = 300

        db, cursor = safe_cursor()
        try:
            cursor.execute(
                """
                SELECT message_id, actor_role, direction, channel, subject, body, related_order_id, created_at
                FROM SUPPORT_MESSAGE
                WHERE participant_type = %s AND participant_id = %s
                ORDER BY message_id DESC
                LIMIT %s
                """,
                (participant_type, participant_id, max(1, min(limit, 1000))),
            )
            rows = list(reversed(cursor.fetchall()))
        finally:
            cursor.close()
            db.close()

        return jsonify(
            {
                "participant_type": participant_type,
                "participant_id": participant_id,
                "participant_name": _support_participant_name(safe_cursor, participant_type, participant_id),
                "messages": _safe_json_dump(rows),
            }
        ), 200

    @app.route("/api/ai/ops-comms/complaints", methods=["GET"])
    def ai_ops_comms_complaints():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        try:
            limit = int(request.args.get("limit") or 120)
        except (TypeError, ValueError):
            limit = 120
        payload = _support_fetch_complaint_cases(safe_cursor, limit=limit)
        return jsonify(payload), 200

    @app.route("/api/ai/ops-comms/complaint-case", methods=["GET"])
    def ai_ops_comms_complaint_case():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        try:
            complaint_id = int(request.args.get("complaint_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "complaint_id is required"}), 400

        detail = _support_fetch_complaint_case_detail(safe_cursor, complaint_id)
        if not detail:
            return jsonify({"error": "complaint case not found"}), 404
        return jsonify(detail), 200

    @app.route("/api/ai/ops-comms/complaint-reply", methods=["POST"])
    def ai_ops_comms_complaint_reply():
        user, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        body = request.get_json(silent=True) or {}
        try:
            complaint_id = int(body.get("complaint_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "complaint_id is required"}), 400
        message = str(body.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message is required"}), 400
        channel = str(body.get("channel") or "chat").strip().lower()
        if channel not in {"chat", "sms", "email"}:
            channel = "chat"
        subject = str(body.get("subject") or "Complaint response").strip()[:255]

        case_detail = _support_fetch_complaint_case_detail(safe_cursor, complaint_id)
        if not case_detail:
            return jsonify({"error": "complaint case not found"}), 404
        customer_id = int(case_detail["customer_id"])
        order_id = case_detail.get("order_id")

        inserted = _support_insert_message(
            safe_cursor,
            participant_type="customer",
            participant_id=customer_id,
            actor_role="admin",
            actor_id=int(user.get("user_id")),
            direction="outbound" if channel in {"sms", "email"} else "chat",
            channel=channel,
            subject=subject or None,
            body=message,
            related_order_id=int(order_id) if isinstance(order_id, int) else None,
        )
        return jsonify({"status": "ok", "message_id": inserted.get("message_id")}), 200

    @app.route("/api/ai/ops-comms/thread-message", methods=["POST"])
    def ai_ops_comms_thread_message():
        user, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        body = request.get_json(silent=True) or {}
        participant_type = str(body.get("participant_type") or "").strip().lower()
        if participant_type not in {"customer", "driver"}:
            return jsonify({"error": "participant_type must be customer or driver"}), 400
        try:
            participant_id = int(body.get("participant_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "participant_id is required"}), 400
        message = str(body.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message is required"}), 400

        channel = str(body.get("channel") or "chat").strip().lower()
        if channel not in {"chat", "sms", "email"}:
            channel = "chat"
        subject = str(body.get("subject") or "").strip()[:255] or None
        auto_reply = bool(body.get("auto_reply", True))

        _support_insert_message(
            safe_cursor,
            participant_type=participant_type,
            participant_id=participant_id,
            actor_role="admin",
            actor_id=int(user.get("user_id")),
            direction="outbound" if channel in {"sms", "email"} else "chat",
            channel=channel,
            subject=subject,
            body=message,
            related_order_id=None,
        )

        name = _support_participant_name(safe_cursor, participant_type, participant_id)
        reply = ""
        if auto_reply:
            if os.environ.get("OPENROUTER_API_KEY", "").strip():
                prompt = json.dumps(
                    {
                        "participant_type": participant_type,
                        "participant_name": name,
                        "latest_admin_message": message,
                    }
                )
                reply = summarize_with_model(
                    "You are a logistics customer support participant. Reply briefly and realistically. "
                    "For drivers, include operational detail. For customers, include complaint/ETA context if relevant.",
                    prompt,
                )
            else:
                reply = f"Acknowledged by {name}. We have received the update and will follow the next action."

            _support_insert_message(
                safe_cursor,
                participant_type=participant_type,
                participant_id=participant_id,
                actor_role=participant_type,
                actor_id=participant_id,
                direction="inbound" if channel in {"sms", "email"} else "chat",
                channel=channel,
                subject=None,
                body=reply,
                related_order_id=None,
            )

        return jsonify({"status": "ok", "participant_name": name, "reply": reply}), 200

    @app.route("/api/ai/ops-comms/broadcast", methods=["POST"])
    def ai_ops_comms_broadcast():
        user, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        body = request.get_json(silent=True) or {}
        audience = str(body.get("audience") or "all").strip().lower()
        if audience not in {"all", "drivers", "customers"}:
            return jsonify({"error": "audience must be all, drivers, or customers"}), 400
        message = str(body.get("message") or "").strip()
        if not message:
            return jsonify({"error": "message is required"}), 400
        subject = str(body.get("subject") or "").strip()[:255] or None
        channel = str(body.get("channel") or "chat").strip().lower()
        if channel not in {"chat", "sms", "email"}:
            channel = "chat"

        db, cursor = safe_cursor()
        try:
            recipients: List[Tuple[str, int]] = []
            if audience in {"all", "customers"}:
                cursor.execute("SELECT customer_id FROM CUSTOMER ORDER BY customer_id LIMIT 500")
                recipients.extend([("customer", int(r["customer_id"])) for r in cursor.fetchall()])
            if audience in {"all", "drivers"}:
                cursor.execute("SELECT driver_id FROM DRIVER ORDER BY driver_id LIMIT 500")
                recipients.extend([("driver", int(r["driver_id"])) for r in cursor.fetchall()])
        finally:
            cursor.close()
            db.close()

        inserted = 0
        for ptype, pid in recipients:
            _support_insert_message(
                safe_cursor,
                participant_type=ptype,
                participant_id=pid,
                actor_role="admin",
                actor_id=int(user.get("user_id")),
                direction="outbound" if channel in {"sms", "email"} else "chat",
                channel=channel,
                subject=subject,
                body=message,
                related_order_id=None,
            )
            inserted += 1

        return jsonify({"status": "ok", "audience": audience, "messages_created": inserted}), 200

    @app.route("/api/ai/ops-comms/log-driver-status", methods=["POST"])
    def ai_ops_comms_log_driver_status():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        body = request.get_json(silent=True) or {}
        try:
            driver_id = int(body.get("driver_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "driver_id is required"}), 400
        status_type = str(body.get("status_type") or "issue").strip().lower()
        if status_type not in {"late", "leave", "issue"}:
            return jsonify({"error": "status_type must be late, leave, or issue"}), 400
        detail = str(body.get("detail") or "").strip()
        if not detail:
            return jsonify({"error": "detail is required"}), 400

        prefix = {
            "late": "Delay alert",
            "leave": "Leave notice",
            "issue": "Issue report",
        }[status_type]
        _support_insert_message(
            safe_cursor,
            participant_type="driver",
            participant_id=driver_id,
            actor_role="driver",
            actor_id=driver_id,
            direction="inbound",
            channel="chat",
            subject="Driver status update",
            body=f"{prefix}: {detail}",
            related_order_id=None,
        )
        return jsonify({"status": "ok"}), 200

    @app.route("/api/ai/ops-comms/log-customer-complaint", methods=["POST"])
    def ai_ops_comms_log_customer_complaint():
        _, err = _admin_from_token()
        if err:
            return err
        _support_ensure_table(safe_cursor)
        body = request.get_json(silent=True) or {}
        try:
            customer_id = int(body.get("customer_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "customer_id is required"}), 400
        detail = str(body.get("detail") or "").strip()
        if not detail:
            return jsonify({"error": "detail is required"}), 400

        _support_insert_message(
            safe_cursor,
            participant_type="customer",
            participant_id=customer_id,
            actor_role="customer",
            actor_id=customer_id,
            direction="inbound",
            channel="chat",
            subject="Customer complaint",
            body=f"Complaint: {detail}",
            related_order_id=None,
        )
        return jsonify({"status": "ok"}), 200

    @app.route("/api/ai/ops-comms/driver-profiles", methods=["GET"])
    def ai_ops_comms_driver_profiles():
        _, err = _admin_from_token()
        if err:
            return err
        try:
            limit = int(request.args.get("limit") or 300)
        except (TypeError, ValueError):
            limit = 300
        profiles = _driver_profiles(safe_cursor, limit=limit)
        return jsonify({"profiles": profiles}), 200

    @app.route("/api/ai/ops-comms/advanced-analytics", methods=["GET"])
    def ai_ops_comms_advanced_analytics():
        _, err = _admin_from_token()
        if err:
            return err
        horizon = str(request.args.get("horizon") or "30d").strip().lower()
        payload = _ops_advanced_analytics(safe_cursor, horizon=horizon)
        return jsonify(payload), 200

    @app.route("/api/ai/notification-draft", methods=["POST"])
    def ai_notification_draft():
        if not os.environ.get("OPENROUTER_API_KEY", "").strip():
            return jsonify({"error": "AI not configured on server (set OPENROUTER_API_KEY)"}), 503
        body = request.get_json(silent=True) or {}
        try:
            order_id = int(body.get("order_id"))
        except (TypeError, ValueError):
            return jsonify({"error": "order_id required"}), 400

        channel = str(body.get("channel") or "").strip().lower()
        if channel not in ("sms", "email"):
            return jsonify({"error": 'channel must be "sms" or "email"'}), 400

        event_cls = str(body.get("template") or body.get("event") or "status_update_general").strip().lower()

        tone = str(body.get("tone") or "professional concise").strip()[:120]

        extra = str(body.get("extra_instructions") or "").strip()[:2000]

        auth_err = _authorize_notification(order_id)
        if auth_err:
            return auth_err[0], auth_err[1]

        context, cerr = fetch_shipment_context_for_ai(safe_cursor, order_id)
        if cerr:
            return jsonify({"error": cerr}), 404

        system = """You draft customer-facing courier notifications. Output JSON ONLY with keys:
  "subject": string (for email; empty string for sms),
  "body": string (the message),

Rules:
    - NEVER include passwords, tokens, hashes, or speculative personal data not in FACTS.
    - For SMS ("body"): keep under ~480 characters whenever possible.
    - For email: set a clear subject line."""

        user_json = json.dumps(
            {
                "CHANNEL": channel,
                "EVENT_CLASS": event_cls,
                "TONE": tone,
                "EXTRA": extra or None,
                "FACTS": context,
            }
        )

        try:
            rsp = chat_completion(
                [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user_json},
                ],
                temperature=0.35,
                max_tokens=800,
                timeout_seconds=50.0,
                response_format_json=True,
            )
            txt = extract_message_text(rsp)
            parsed = extract_json_object(txt)
            subject = str(parsed.get("subject") or "")
            bod = str(parsed.get("body") or "")
            if channel == "sms" and len(bod) > 480:
                bod = bod[:477] + "..."
            return jsonify({"subject": subject, "body": bod, "channel": channel}), 200
        except OpenRouterError as e:
            return jsonify({"error": str(e)}), 503
