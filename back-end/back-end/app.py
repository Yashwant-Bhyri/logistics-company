from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import datetime
import json
import requests
import math
import os
from datetime import datetime as dt
import hashlib

from ai_routes import register_ai_routes

app = Flask(__name__)
app.config["SECRET_KEY"] = (
    os.environ.get("JWT_SECRET_KEY")
    or os.environ.get("SECRET_KEY")
    or "dev-only-insecure-secret-change-me"
)
# Allow any localhost / 127.0.0.1 dev port so sign-in works if CRA uses :3001, etc.
_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]
CORS(app, origins=_DEV_ORIGINS)
CORS(app, supports_credentials=True)
CORS(app, resources={
    r"/route/*": {
        "origins": _DEV_ORIGINS,
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Database connection
DB_HOST = os.environ.get("MYSQL_HOST", "localhost")
DB_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
DB_USER = os.environ.get("MYSQL_USER", "root")
DB_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
DB_NAME = os.environ.get("MYSQL_DATABASE", "LOGISTICS_COMPANY")

def get_db_connection():
    return mysql.connector.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME
    )

def safe_cursor():
    db = get_db_connection()
    cursor = db.cursor(dictionary=True, buffered=True)
    return db, cursor

# Open-Meteo API (weather)
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

def get_weather_data(lat, lng):
    """Get weather from Open-Meteo API - free and reliable"""
    try:
        params = {
            'latitude': lat,
            'longitude': lng,
            'current_weather': True,
            'timezone': 'auto'
        }
        response = requests.get(OPEN_METEO_URL, params=params, timeout=10)

        if response.status_code == 200:
            data = response.json()
            current = data.get('current_weather', {})
            weather_code = current.get('weathercode', 0)

            if weather_code == 0:
                weather_status = 'Clear'
            elif weather_code == 1:
                weather_status = 'Sunny'
            elif weather_code in [2, 3]:
                weather_status = 'Cloudy'
            elif weather_code in [45, 48]:
                weather_status = 'Foggy'
            elif weather_code in [51, 53, 55, 56, 57]:
                weather_status = 'Rainy'
            elif weather_code in [61, 63, 65, 66, 67]:
                weather_status = 'Rainy'
            elif weather_code in [71, 73, 75, 77]:
                weather_status = 'Snow'
            elif weather_code in [80, 81, 82]:
                weather_status = 'Rainy'
            elif weather_code in [95, 96, 99]:
                weather_status = 'Storm'
            else:
                weather_status = 'Clear'

            humidity = 65
            if weather_status == 'Rainy':
                humidity = 85
            elif weather_status == 'Clear' or weather_status == 'Sunny':
                humidity = 55

            return {
                'weather_status': weather_status,
                'temperature': round(current.get('temperature', 22)),
                'wind_speed': round(current.get('windspeed', 5)),
                'humidity': humidity,
                'description': weather_status.lower(),
                'source': 'open-meteo'
            }
        else:
            print(f"Open-Meteo returned status: {response.status_code}")
            return get_fallback_weather(lat, lng)

    except requests.exceptions.Timeout:
        print("Open-Meteo timeout, using fallback")
        return get_fallback_weather(lat, lng)
    except Exception as e:
        print(f"Open-Meteo error: {e}")
        return get_fallback_weather(lat, lng)

def get_fallback_weather(lat, lng):
    """Fallback weather based on location and season (no API call)"""
    from datetime import datetime as dt
    month = dt.now().month

    # Guangzhou/Shenzhen area (subtropical)
    if 22.5 < lat < 23.5:
        if month in [5, 6, 7, 8, 9]:
            return {'weather_status': 'Rainy', 'temperature': 32, 'wind_speed': 8, 'humidity': 85, 'description': 'rainy season', 'source': 'fallback'}
        elif month in [11, 12, 1, 2]:
            return {'weather_status': 'Clear', 'temperature': 18, 'wind_speed': 6, 'humidity': 65, 'description': 'clear sky', 'source': 'fallback'}
        else:
            return {'weather_status': 'Cloudy', 'temperature': 25, 'wind_speed': 7, 'humidity': 75, 'description': 'partly cloudy', 'source': 'fallback'}

    # Beijing area (temperate)
    elif 39.5 < lat < 40.5:
        if month in [12, 1, 2]:
            return {'weather_status': 'Clear', 'temperature': 2, 'wind_speed': 10, 'humidity': 45, 'description': 'cold and dry', 'source': 'fallback'}
        elif month in [6, 7, 8]:
            return {'weather_status': 'Sunny', 'temperature': 30, 'wind_speed': 8, 'humidity': 60, 'description': 'hot and sunny', 'source': 'fallback'}
        else:
            return {'weather_status': 'Cloudy', 'temperature': 18, 'wind_speed': 9, 'humidity': 50, 'description': 'pleasant', 'source': 'fallback'}

    # Shanghai area
    elif 31 < lat < 32:
        if month in [6, 7, 8]:
            return {'weather_status': 'Rainy', 'temperature': 28, 'wind_speed': 12, 'humidity': 80, 'description': 'humid and rainy', 'source': 'fallback'}
        elif month in [12, 1, 2]:
            return {'weather_status': 'Cloudy', 'temperature': 8, 'wind_speed': 10, 'humidity': 65, 'description': 'cold and cloudy', 'source': 'fallback'}
        else:
            return {'weather_status': 'Cloudy', 'temperature': 18, 'wind_speed': 11, 'humidity': 70, 'description': 'mild', 'source': 'fallback'}

    # Hong Kong area
    elif 22.2 < lat < 22.4:
        if month in [5, 6, 7, 8, 9]:
            return {'weather_status': 'Rainy', 'temperature': 30, 'wind_speed': 10, 'humidity': 85, 'description': 'humid', 'source': 'fallback'}
        else:
            return {'weather_status': 'Clear', 'temperature': 22, 'wind_speed': 8, 'humidity': 70, 'description': 'pleasant', 'source': 'fallback'}

    # Default fallback
    return {
        'weather_status': 'Clear',
        'temperature': 22,
        'wind_speed': 5,
        'humidity': 60,
        'description': 'clear sky',
        'source': 'fallback'
    }

# HELPER FUNCTIONS

def parse_location(location):
    if not location:
        return None, None
    try:
        if isinstance(location, str) and ',' in location:
            parts = location.split(',')
            if len(parts) == 2:
                return float(parts[0].strip()), float(parts[1].strip())
    except Exception as e:
        print("Location error:", e)
    return None, None

def generate_token(user_id, role):
    return jwt.encode({
        "user_id": user_id,
        "role": role,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2)
    }, app.config["SECRET_KEY"], algorithm="HS256")

def verify_token(request):
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    token = auth_header.split(' ')[1]
    try:
        payload = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
        return payload
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None

def _auth_error(code, message):
    return jsonify({"message": message}), code

def _can_access_order(cursor, user, order_id):
    role = user.get("role")
    uid = user.get("user_id")
    if role == "admin":
        return True
    if role == "customer":
        cursor.execute(
            "SELECT 1 FROM C_ORDER WHERE order_id=%s AND (sender_id=%s OR receiver_id=%s) LIMIT 1",
            (order_id, uid, uid),
        )
        return cursor.fetchone() is not None
    if role == "driver":
        cursor.execute(
            """
            SELECT 1
            FROM DELIVERY d
            JOIN DRIVER_VEHICLE_ASSIGNMENT dva ON d.assignment_id = dva.assignment_id
            WHERE d.order_id = %s AND dva.driver_id = %s
            LIMIT 1
            """,
            (order_id, uid),
        )
        return cursor.fetchone() is not None
    return False

@app.before_request
def enforce_route_auth():
    if request.method == "OPTIONS":
        return None

    path = request.path or ""
    user = verify_token(request)

    if path.startswith("/admin"):
        if not user:
            return _auth_error(401, "Unauthorized")
        if user.get("role") != "admin":
            return _auth_error(403, "Admin session required")

    if path in {"/driver/assignments", "/add_stop_notes", "/update_stop_status", "/save_current_conditions"}:
        if not user:
            return _auth_error(401, "Unauthorized")
        if user.get("role") != "driver":
            return _auth_error(403, "Driver session required")

    if path in {"/create_order", "/select_payment_method"}:
        if not user:
            return _auth_error(401, "Unauthorized")
        if user.get("role") != "customer":
            return _auth_error(403, "Customer session required")

    if path == "/orders" or path.startswith("/track_order/"):
        if not user:
            return _auth_error(401, "Unauthorized")
        if user.get("role") not in {"customer", "driver", "admin"}:
            return _auth_error(403, "Forbidden")
    return None

def calculate_haversine_distance(lat1, lng1, lat2, lng2):
    if not lat1 or not lng1 or not lat2 or not lng2:
        return 0
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    a = math.sin(delta_lat/2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng/2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def calculate_weather_risk(weather_data):
    if not weather_data:
        return 0.3
    risk = 0.1
    weather = weather_data.get('weather_status', '').lower()
    if weather in ['storm', 'thunderstorm']:
        risk += 0.6
    elif weather in ['snow', 'blizzard']:
        risk += 0.5
    elif weather in ['rainy', 'drizzle']:
        risk += 0.35
    elif weather in ['foggy', 'mist', 'haze']:
        risk += 0.3
    elif weather in ['cloudy']:
        risk += 0.1
    elif weather in ['sunny', 'clear']:
        risk -= 0.05
    wind_speed = weather_data.get('wind_speed', 0)
    if wind_speed > 25:
        risk += 0.4
    elif wind_speed > 15:
        risk += 0.2
    elif wind_speed > 10:
        risk += 0.1
    return min(max(risk, 0), 1)

def get_traffic_data(lat, lng):
    now = dt.now()
    hour = now.hour
    is_weekend = now.weekday() >= 5
    return {
        'congestion_level': 25,
        'traffic_status': 'Light Traffic',
        'estimated_delay_minutes': 5,
        'peak_hour': False
    }

def calculate_traffic_risk(traffic_data):
    if not traffic_data:
        return 0.2
    return 0.25

# AUTHENTICATION ENDPOINTS

@app.route("/login", methods=["POST"])
def login():
    db, cursor = safe_cursor()
    try:
        data = request.json
        role = data.get("role")
        identifier = data.get("identifier")
        password = data.get("password")

        hashed_password = hashlib.sha256(password.encode()).hexdigest()

        if role == "customer":
            cursor.execute("SELECT * FROM CUSTOMER WHERE email=%s OR phone=%s", (identifier, identifier))
            user = cursor.fetchone()
            if user and user["password_hash"] == hashed_password:
                token = generate_token(user["customer_id"], "customer")
                return jsonify({"token": token, "customer_id": user["customer_id"], "name": user["name"]})
            return jsonify({"message": "Invalid credentials"}), 401

        elif role == "driver":
            cursor.execute("SELECT * FROM DRIVER WHERE email=%s OR phone=%s", (identifier, identifier))
            user = cursor.fetchone()
            if not user:
                return jsonify({"message": "Driver not found"}), 401
            if not user.get("password_hash"):
                return jsonify({"message": "Account not activated yet"}), 401
            if user["password_hash"] == hashed_password:
                token = generate_token(user["driver_id"], "driver")
                return jsonify({"token": token, "driver_id": user["driver_id"], "name": user["name"], "role": "driver"})
            return jsonify({"message": "Invalid credentials"}), 401

        elif role == "admin":
            cursor.execute("SELECT * FROM ADMIN WHERE email=%s OR phone=%s", (identifier, identifier))
            user = cursor.fetchone()
            if user and user["password_hash"] == hashed_password:
                token = generate_token(user["admin_id"], "admin")
                return jsonify({"token": token, "admin_id": user["admin_id"], "name": user["name"], "role": "admin"})
            return jsonify({"message": "Invalid credentials"}), 401

        return jsonify({"message": "Invalid role"}), 400
    except Exception as e:
        print(f"LOGIN ERROR: {e}")
        return jsonify({"message": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/register", methods=["POST"])
def register():
    db, cursor = safe_cursor()
    try:
        data = request.json
        password_hash = hashlib.sha256(data["password"].encode()).hexdigest()

        cursor.execute("""
            INSERT INTO CUSTOMER (name, phone, email, address, password_hash)
            VALUES (%s, %s, %s, %s, %s)
        """, (data["name"], data["phone"], data["email"], data["address"], password_hash))
        db.commit()
        return jsonify({"message": "Registration successful", "customer_id": cursor.lastrowid}), 200
    except Exception as e:
        return jsonify({"message": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/driver/verify_token", methods=["POST"])
def verify_driver_token():
    db, cursor = safe_cursor()
    try:
        data = request.json
        token = data.get("token")
        cursor.execute("SELECT driver_id, status FROM DRIVER WHERE activation_token = %s", (token,))
        driver = cursor.fetchone()
        if not driver:
            return jsonify({"valid": False, "message": "Invalid token"}), 400
        if driver["status"] != "Pending":
            return jsonify({"valid": False, "message": "Driver already active"}), 400
        return jsonify({"valid": True, "driver_id": driver["driver_id"]})
    finally:
        cursor.close()
        db.close()

@app.route("/driver/set_password", methods=["POST"])
def set_driver_password():
    db, cursor = safe_cursor()
    try:
        data = request.json
        token = data.get("token")
        password = data.get("password")
        if not token or not password:
            return jsonify({"success": False, "message": "Missing token or password"}), 400
        cursor.execute("SELECT driver_id FROM DRIVER WHERE activation_token = %s AND status='Pending'", (token,))
        driver = cursor.fetchone()
        if not driver:
            return jsonify({"success": False, "message": "Invalid or expired token"}), 400

        password_hash = hashlib.sha256(password.encode()).hexdigest()
        cursor.execute("""
            UPDATE DRIVER SET password_hash = %s, activation_token = NULL, status = 'Active'
            WHERE driver_id = %s
        """, (password_hash, driver["driver_id"]))
        db.commit()
        return jsonify({"success": True, "message": "Account activated successfully", "driver_id": driver["driver_id"]}), 200
    except Exception as e:
        return jsonify({"success": False, "message": "Server error"}), 500
    finally:
        cursor.close()
        db.close()

# ORDER ENDPOINTS

@app.route('/create_order', methods=['POST'])
def create_order():
    user = verify_token(request)
    db, cursor = safe_cursor()
    try:
        data = request.json
        price = calculate_price(data['weight'], data.get('length', 0), data.get('width', 0), data.get('height', 0), data.get('type'))
        cursor.execute("""
            INSERT INTO C_ORDER (sender_id, receiver_id, weight, length, width, height, type, status, price)
            VALUES (%s, %s, %s, %s, %s, %s, %s, 'Pending', %s)
        """, (user["user_id"], data['receiver_id'], data['weight'],
              data.get('length', 0), data.get('width', 0), data.get('height', 0),
              data.get('type'), price))
        db.commit()
        return jsonify({"message": "Order created!", "order_id": cursor.lastrowid})
    finally:
        cursor.close()
        db.close()

@app.route("/orders", methods=["GET"])
def get_all_orders():
    user = verify_token(request)
    try:
        db, cursor = safe_cursor()

        if user["role"] == "admin":
            cursor.execute("SELECT * FROM C_ORDER")
        elif user["role"] == "customer":
            cursor.execute(
                "SELECT * FROM C_ORDER WHERE sender_id=%s OR receiver_id=%s ORDER BY order_id DESC",
                (user["user_id"], user["user_id"]),
            )
        elif user["role"] == "driver":
            cursor.execute(
                """
                SELECT o.*
                FROM C_ORDER o
                JOIN DELIVERY d ON o.order_id = d.order_id
                JOIN DRIVER_VEHICLE_ASSIGNMENT dva ON d.assignment_id = dva.assignment_id
                WHERE dva.driver_id = %s
                ORDER BY o.order_id DESC
                """,
                (user["user_id"],),
            )
        else:
            return jsonify({"message": "Forbidden"}), 403
        orders = cursor.fetchall()

        cursor.close()
        db.close()

        return jsonify(orders), 200

    except Exception as e:
        print("Error fetching orders:", e)
        return jsonify({"error": str(e)}), 500

@app.route('/track_order/<int:order_id>', methods=['GET', 'OPTIONS'])
def track_order(order_id):
    user = verify_token(request)
    db, cursor = safe_cursor()
    try:
        if not _can_access_order(cursor, user, order_id):
            return jsonify({"error": "Forbidden"}), 403

        cursor.execute("SELECT * FROM C_ORDER WHERE order_id = %s", (order_id,))
        order = cursor.fetchone()

        if order:
            cursor.execute("""
                SELECT update_type, new_status, notes, updated_at, driver_id
                FROM ORDER_UPDATE
                WHERE order_id = %s
                ORDER BY updated_at DESC
                LIMIT 10
            """, (order_id,))
            updates = cursor.fetchall()
            order['updates'] = updates

        return jsonify(order), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route('/select_payment_method', methods=['POST'])
def select_payment_method():
    user = verify_token(request)
    db, cursor = safe_cursor()
    try:
        data = request.json
        order_id = data['order_id']
        if not _can_access_order(cursor, user, order_id):
            return jsonify({"error": "Forbidden"}), 403

        cursor.execute("""
            INSERT INTO PAYMENT (order_id, method, status, timestamp)
            VALUES (%s, %s, 'Pending', NOW())
        """, (order_id, data['method']))
        cursor.execute("UPDATE C_ORDER SET status = 'In Progress' WHERE order_id = %s", (order_id,))
        db.commit()
        return jsonify({"message": "Payment method selected!"})
    finally:
        cursor.close()
        db.close()


# DRIVER ENDPOINTS

@app.route("/driver/assignments", methods=["GET"])
def driver_assignments():
    user = verify_token(request)
    if not user or user["role"] != "driver":
        return jsonify({"message": "Unauthorized"}), 401
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT dva.assignment_id, dva.driver_id, dva.route_id, dva.status as assignment_status,
                   v.type as vehicle_type, v.license_plate, r.total_distance, r.estimated_time,
                   r.optimized_path
            FROM DRIVER_VEHICLE_ASSIGNMENT dva
            LEFT JOIN VEHICLE v ON dva.vehicle_id = v.vehicle_id
            LEFT JOIN ROUTE r ON dva.route_id = r.route_id
            WHERE dva.driver_id = %s AND dva.status = 'Assigned'
        """, (user["user_id"],))
        assignments = cursor.fetchall()

        for assignment in assignments:
            total_stops = 0
            completed_stops = 0
            estimated_eta_minutes = 0
            estimated_eta_hours = 0

            if assignment.get('optimized_path'):
                try:
                    path_data = json.loads(assignment['optimized_path'])
                    stops = path_data.get('stops', [])
                    total_stops = len(stops)
                    completed_stops = sum(1 for stop in stops if stop.get('scan_status') == 'COMPLETED')

                    # Calculate ETA from distance
                    distance = assignment.get('total_distance') or 0
                    if distance > 0:
                        # Base speed 50 km/h, convert to minutes
                        estimated_eta_minutes = round((distance / 50) * 60)
                    else:
                        # If no distance, calculate from coordinates
                        prev_lat, prev_lng = None, None
                        total_distance = 0
                        for stop in stops:
                            lat = stop.get('lat')
                            lng = stop.get('lng')
                            if not lat and 'location' in stop:
                                lat, lng = parse_location(stop.get('location'))
                            if prev_lat and lat:
                                total_distance += calculate_haversine_distance(prev_lat, prev_lng, lat, lng)
                            prev_lat, prev_lng = lat, lng
                        estimated_eta_minutes = round((total_distance / 50) * 60)

                    estimated_eta_hours = round(estimated_eta_minutes / 60, 1)

                except Exception as e:
                    print(f"Error calculating ETA: {e}")
                    estimated_eta_minutes = 0
                    estimated_eta_hours = 0

            assignment['total_stops'] = total_stops
            assignment['completed_stops'] = completed_stops
            assignment['estimated_eta_minutes'] = estimated_eta_minutes
            assignment['estimated_eta_hours'] = estimated_eta_hours

            if 'optimized_path' in assignment:
                del assignment['optimized_path']

        return jsonify(assignments), 200
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

def calculate_price(weight, length, width, height, order_type):
    base = 5
    weight_cost = weight * 2
    size_cost = (length + width + height) * 0.1
    multiplier = 1.5 if order_type == "Express" else 2 if order_type == "Priority" else 1
    return (base + weight_cost + size_cost) * multiplier

# ROUTE ENDPOINTS

@app.route("/route/<int:route_id>/stops", methods=["GET"])
def get_route_stops(route_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT stop_id, name, location, sequence_order, facility_type, scan_status
            FROM ROUTE_STOP
            WHERE route_id = %s
            ORDER BY sequence_order
        """, (route_id,))
        stops = cursor.fetchall()

        for stop in stops:
            lat, lng = parse_location(stop.get('location'))
            stop['lat'] = lat
            stop['lng'] = lng

            # Get latest notes for this stop
            cursor.execute("""
                SELECT notes FROM ORDER_UPDATE
                WHERE stop_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
            """, (stop['stop_id'],))
            note_result = cursor.fetchone()
            stop['notes'] = note_result['notes'] if note_result else None

        return jsonify(stops), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/add_stop_notes", methods=["POST"])
def add_stop_notes():
    user = verify_token(request)

    data = request.json
    stop_id = data.get("stop_id")
    notes = data.get("notes", "")

    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            INSERT INTO ORDER_UPDATE
            (driver_id, stop_id, update_type, notes, updated_at)
            VALUES (%s, %s, 'DRIVER_NOTE', %s, NOW())
        """, (user["user_id"], stop_id, notes))

        db.commit()
        return jsonify({"message": "Notes added successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/route/<int:route_id>/details", methods=["GET"])
def get_route_details(route_id):
    db, cursor = safe_cursor()
    try:
        # Get stops from ROUTE_STOP
        cursor.execute("""
            SELECT stop_id, name, location, sequence_order, facility_type, scan_status
            FROM ROUTE_STOP
            WHERE route_id = %s
            ORDER BY sequence_order
        """, (route_id,))
        stops = cursor.fetchall()

        result = []
        prev_lat, prev_lng = None, None

        for stop in stops:
            lat, lng = parse_location(stop.get('location'))

            # Get latest notes for this stop from ORDER_UPDATE
            cursor.execute("""
                SELECT notes FROM ORDER_UPDATE
                WHERE stop_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
            """, (stop['stop_id'],))
            note_result = cursor.fetchone()
            notes = note_result['notes'] if note_result else None

            weather = get_weather_data(lat, lng) if lat and lng else None
            traffic = get_traffic_data(lat, lng) if lat and lng else None
            weather_risk = calculate_weather_risk(weather) if weather else 0.3
            traffic_risk = 0.25
            distance_to_prev = calculate_haversine_distance(prev_lat, prev_lng, lat, lng) if prev_lat and lat else 0
            eta = (distance_to_prev / 50 * 60) if prev_lat else 0
            risk_score = (weather_risk * 0.6) + (traffic_risk * 0.4)

            result.append({
                'stop_id': stop['stop_id'],
                'name': stop['name'],
                'location': stop.get('location', 'Unknown'),
                'sequence_order': stop['sequence_order'],
                'facility_type': stop.get('facility_type', 'Stop'),
                'scan_status': stop.get('scan_status', 'Pending'),
                'lat': lat, 'lng': lng,
                'weather': weather,
                'traffic': traffic,
                'weather_risk': round(weather_risk, 2),
                'traffic_risk': round(traffic_risk, 2),
                'distance_from_prev': round(distance_to_prev, 1),
                'eta_from_prev': round(eta, 1),
                'risk_score': round(risk_score, 2),
                'notes': notes
            })
            prev_lat, prev_lng = lat, lng

        return jsonify({'stops': result, 'total_eta': 0}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/update_stop_status", methods=["POST"])
def update_stop_status():
    user = verify_token(request)
    if not user or user["role"] != "driver":
        return jsonify({"message": "Unauthorized"}), 401

    data = request.json
    route_id = data.get("route_id")
    stop_sequence = data.get("stop_sequence")
    status = data.get("status")
    notes = data.get("notes", "")

    scan_type = "GPS_ARRIVAL" if status == "ARRIVED" else "DELIVERY_SCAN"
    db, cursor = safe_cursor()
    try:
        # 1. Update ROUTE_STOP
        if status == "ARRIVED":
            cursor.execute("""
                UPDATE ROUTE_STOP
                SET scan_status = %s, actual_arrival = NOW()
                WHERE route_id = %s AND sequence_order = %s
            """, (status, route_id, stop_sequence))
        else:
            cursor.execute("""
                UPDATE ROUTE_STOP
                SET scan_status = %s
                WHERE route_id = %s AND sequence_order = %s
            """, (status, route_id, stop_sequence))

        # 2. Get stop_id
        cursor.execute("""
            SELECT stop_id FROM ROUTE_STOP
            WHERE route_id = %s AND sequence_order = %s
        """, (route_id, stop_sequence))
        stop_info = cursor.fetchone()

        if not stop_info:
            return jsonify({"error": "Stop not found"}), 404

        # 3. Update optimized_path JSON
        cursor.execute("SELECT optimized_path FROM ROUTE WHERE route_id = %s", (route_id,))
        route = cursor.fetchone()

        if route and route["optimized_path"]:
            path_data = json.loads(route["optimized_path"])

            for stop in path_data.get("stops", []):
                if stop.get("sequence") == stop_sequence or stop.get("sequence_order") == stop_sequence:
                    stop["scan_status"] = status
                    if status == "ARRIVED":
                        stop["actual_arrival"] = dt.now().isoformat()
                    break

            cursor.execute("""
                UPDATE ROUTE SET optimized_path = %s WHERE route_id = %s
            """, (json.dumps(path_data), route_id))

        # 4. INSERT update + notes together
        cursor.execute("""
            INSERT INTO ORDER_UPDATE
            (driver_id, stop_id, update_type, scan_type, notes, new_status, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """, (
            user["user_id"],
            stop_info["stop_id"],
            "STATUS_UPDATE",
            scan_type,
            notes,
            status
        ))

        db.commit()

        return jsonify({
            "message": f"Stop {stop_sequence} updated to {status}",
            "notes_saved": notes
        }), 200

    except Exception as e:
        db.rollback()
        print("ERROR:", e)
        return jsonify({"error": str(e)}), 500

    finally:
        cursor.close()
        db.close()

@app.route("/route/weather/<int:route_id>", methods=["GET"])
def get_route_weather(route_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT stop_id, name, location, sequence_order
            FROM ROUTE_STOP
            WHERE route_id = %s
            ORDER BY sequence_order
        """, (route_id,))
        stops = cursor.fetchall()

        weather_data = []
        for stop in stops:
            lat, lng = parse_location(stop.get('location'))
            if lat is not None and lng is not None:
                weather = get_weather_data(lat, lng)
                weather['stop_name'] = stop['name']
                weather['stop_id'] = stop['stop_id']
                weather['risk_score'] = calculate_weather_risk(weather)
                weather_data.append(weather)

                try:
                    cursor.execute("""
                        INSERT INTO CONDITION_REPORT
                        (route_id, region, weather_status, road_status, risk_score, recorded_at)
                        VALUES (%s, %s, %s, %s, %s, NOW())
                    """, (
                        route_id,
                        stop['name'],
                        weather.get('weather_status', 'Unknown'),
                        'Normal',
                        weather['risk_score']
                    ))
                    db.commit()
                except Exception as save_err:
                    print(f"Error saving to CONDITION_REPORT: {save_err}")
            else:
                weather_data.append({
                    'stop_name': stop['name'],
                    'temperature': 22,
                    'weather_status': 'Clear',
                    'wind_speed': 5,
                    'humidity': 60,
                    'risk_score': 0.2
                })
        return jsonify(weather_data), 200
    except Exception as e:
        print(f"Weather error: {e}")
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

def reset_route_progress(route_id):
    """Reset all stops progress for a route"""
    db, cursor = safe_cursor()
    try:
        # Reset ROUTE_STOP table
        cursor.execute("""
            UPDATE ROUTE_STOP
            SET scan_status = 'Pending',
                actual_arrival = NULL,
                actual_departure = NULL
            WHERE route_id = %s
        """, (route_id,))

        # Reset optimized_path JSON
        cursor.execute("SELECT optimized_path FROM ROUTE WHERE route_id = %s", (route_id,))
        route = cursor.fetchone()

        if route and route['optimized_path']:
            path_data = json.loads(route['optimized_path'])
            for stop in path_data.get('stops', []):
                stop['scan_status'] = 'Pending'
                stop.pop('actual_arrival', None)
                stop.pop('actual_departure', None)

            cursor.execute("""
                UPDATE ROUTE SET optimized_path = %s WHERE route_id = %s
            """, (json.dumps(path_data), route_id))

        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error resetting route progress: {e}")
        return False
    finally:
        cursor.close()
        db.close()

@app.route("/route/traffic/<int:route_id>", methods=["GET"])
def get_route_traffic(route_id):

    now = dt.now()
    hour = now.hour
    is_weekend = now.weekday() >= 5

    if is_weekend:
        if 10 <= hour <= 12 or 14 <= hour <= 18:
            congestion = 60
            status = "Moderate Traffic"
            delay = 15
        else:
            congestion = 30
            status = "Light Traffic"
            delay = 8
    else:
        if 7 <= hour <= 9 or 17 <= hour <= 19:
            congestion = 85
            status = "Heavy Traffic"
            delay = 25
        elif 12 <= hour <= 13:
            congestion = 50
            status = "Moderate Traffic"
            delay = 12
        else:
            congestion = 35
            status = "Light Traffic"
            delay = 8

    # Create mock stops based on route_id (testing data)
    if route_id == 200:
        stops_data = [
            {'name': 'Guangzhou Warehouse', 'sequence': 1},
            {'name': 'Foshan Distribution', 'sequence': 2},
            {'name': 'Shenzhen Customer A', 'sequence': 3},
            {'name': 'Shenzhen Customer B', 'sequence': 4},
            {'name': 'Hong Kong Warehouse', 'sequence': 5}
        ]
    elif route_id == 201:
        stops_data = [
            {'name': 'Beijing Warehouse', 'sequence': 1},
            {'name': 'Tianjin Distribution', 'sequence': 2},
            {'name': 'Jinan Hub', 'sequence': 3},
            {'name': 'Nanjing Warehouse', 'sequence': 4},
            {'name': 'Shanghai Customer', 'sequence': 5}
        ]
    elif route_id == 202:
        stops_data = [
            {'name': 'Shanghai Warehouse', 'sequence': 1},
            {'name': 'Hangzhou Customer', 'sequence': 2},
            {'name': 'Ningbo Port', 'sequence': 3}
        ]
    else:
        stops_data = [
            {'name': f'Stop {i}', 'sequence': i} for i in range(1, 4)
        ]

    traffic_data = []
    for stop in stops_data:
        traffic_data.append({
            'stop_name': stop['name'],
            'stop_id': stop['sequence'],
            'congestion_level': congestion,
            'traffic_status': status,
            'estimated_delay_minutes': delay,
            'risk_score': congestion / 100,
            'peak_hour': (7 <= hour <= 9 or 17 <= hour <= 19) and not is_weekend
        })

    return jsonify({"status": "success", "data": traffic_data}), 200

@app.route("/route/combined_risk/<int:route_id>", methods=["GET"])
def get_combined_risk(route_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT optimized_path FROM ROUTE WHERE route_id = %s", (route_id,))
        route = cursor.fetchone()
        if not route or not route['optimized_path']:
            return jsonify({"combined_risk": 0.25, "weather_risk": 0.2, "traffic_risk": 0.3}), 200
        path_data = json.loads(route['optimized_path'])
        stops = path_data.get('stops', [])
        weather_risks = []
        for stop in stops:
            lat = stop.get('lat')
            lng = stop.get('lng')
            if not lat and 'location' in stop:
                lat, lng = parse_location(stop.get('location'))
            if lat is not None and lng is not None:
                weather = get_weather_data(lat, lng)
                weather_risk = calculate_weather_risk(weather)
                weather_risks.append(weather_risk)

                # Save to CONDITION_REPORT
                try:
                    cursor.execute("""
                        INSERT INTO CONDITION_REPORT
                        (route_id, region, weather_status, road_status, risk_score, recorded_at)
                        VALUES (%s, %s, %s, %s, %s, NOW())
                    """, (
                        route_id,
                        stop.get('name', 'Unknown'),
                        weather.get('weather_status', 'Unknown'),
                        'Normal',
                        weather_risk
                    ))
                    db.commit()
                except Exception as save_err:
                    print(f"Error saving: {save_err}")
            else:
                weather_risks.append(0.2)

        avg_weather = sum(weather_risks) / len(weather_risks) if weather_risks else 0.3
        combined = (avg_weather * 0.6) + (0.25 * 0.4)

        return jsonify({
            "combined_risk": round(combined, 2),
            "weather_risk": round(avg_weather, 2),
            "traffic_risk": 0.25
        }), 200
    except Exception as e:
        return jsonify({"combined_risk": 0.25, "weather_risk": 0.2, "traffic_risk": 0.3}), 200
    finally:
        cursor.close()
        db.close()

@app.route("/save_current_conditions/<int:route_id>", methods=["POST"])
def save_current_conditions(route_id):
    """Save current weather and traffic conditions for all stops in a route"""
    user = verify_token(request)
    if not user or user["role"] != "driver":
        return jsonify({"message": "Unauthorized"}), 401

    db, cursor = safe_cursor()
    try:
        # Get all stops for this route
        cursor.execute("""
            SELECT stop_id, name, location, sequence_order
            FROM ROUTE_STOP
            WHERE route_id = %s
            ORDER BY sequence_order
        """, (route_id,))
        stops = cursor.fetchall()

        saved_count = 0
        for stop in stops:
            lat, lng = parse_location(stop.get('location'))
            if lat is not None and lng is not None:
                # Get weather data
                weather = get_weather_data(lat, lng)
                weather_status = weather.get('weather_status', 'Unknown')
                weather_risk = calculate_weather_risk(weather)

                # Get traffic data based on time
                now = dt.now()
                hour = now.hour
                is_weekend = now.weekday() >= 5

                if is_weekend:
                    if 10 <= hour <= 12 or 14 <= hour <= 18:
                        road_status = "Moderate Traffic"
                        traffic_risk = 0.6
                    else:
                        road_status = "Light Traffic"
                        traffic_risk = 0.3
                else:
                    if 7 <= hour <= 9 or 17 <= hour <= 19:
                        road_status = "Heavy Traffic"
                        traffic_risk = 0.85
                    elif 12 <= hour <= 13:
                        road_status = "Moderate Traffic"
                        traffic_risk = 0.5
                    else:
                        road_status = "Light Traffic"
                        traffic_risk = 0.35

                # Combined risk (60% weather, 40% traffic)
                combined_risk = (weather_risk * 0.6) + (traffic_risk * 0.4)

                # Save to CONDITION_REPORT
                cursor.execute("""
                    INSERT INTO CONDITION_REPORT
                    (route_id, region, weather_status, road_status, risk_score, recorded_at)
                    VALUES (%s, %s, %s, %s, %s, NOW())
                """, (
                    route_id,
                    stop['name'],
                    weather_status,
                    road_status,
                    combined_risk
                ))
                saved_count += 1

        db.commit()
        return jsonify({
            "message": f"Saved conditions for {saved_count} stops",
            "saved_count": saved_count
        }), 200
    except Exception as e:
        db.rollback()
        print(f"Error saving conditions: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/condition_reports/<int:route_id>", methods=["GET"])
def get_condition_reports(route_id):
    """Get historical weather and traffic reports for a route"""

    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT report_id, region, weather_status, road_status, risk_score, recorded_at
            FROM CONDITION_REPORT
            WHERE route_id = %s
            ORDER BY recorded_at DESC
            LIMIT 20
        """, (route_id,))
        reports = cursor.fetchall()
        return jsonify(reports), 200
    except Exception as e:
        print(f"Error fetching reports: {e}")
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/save_traffic_report/<int:route_id>", methods=["POST"])
def save_traffic_report(route_id):
    """Save traffic conditions to CONDITION_REPORT table"""

    db, cursor = safe_cursor()
    try:
        # Get current traffic conditions
        now = dt.now()
        hour = now.hour
        is_weekend = now.weekday() >= 5

        if is_weekend:
            if 10 <= hour <= 12 or 14 <= hour <= 18:
                road_status = "Moderate Traffic"
                risk_score = 0.6
            else:
                road_status = "Light Traffic"
                risk_score = 0.3
        else:
            if 7 <= hour <= 9 or 17 <= hour <= 19:
                road_status = "Heavy Traffic"
                risk_score = 0.85
            elif 12 <= hour <= 13:
                road_status = "Moderate Traffic"
                risk_score = 0.5
            else:
                road_status = "Light Traffic"
                risk_score = 0.35

        # Get stops for this route
        cursor.execute("""
            SELECT stop_id, name, location
            FROM ROUTE_STOP
            WHERE route_id = %s
            ORDER BY sequence_order
        """, (route_id,))
        stops = cursor.fetchall()

        for stop in stops:
            cursor.execute("""
                INSERT INTO CONDITION_REPORT
                (route_id, region, weather_status, road_status, risk_score, recorded_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
            """, (
                route_id,
                stop['name'],
                'Unknown',
                road_status,
                risk_score
            ))

        db.commit()
        return jsonify({"message": f"Traffic report saved for route {route_id}"}), 200
    except Exception as e:
        print(f"Error saving traffic report: {e}")
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/route/optimize/<int:route_id>", methods=["POST"])
def optimize_route(route_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT optimized_path FROM ROUTE WHERE route_id = %s", (route_id,))
        route = cursor.fetchone()
        if not route or not route['optimized_path']:
            return jsonify({"error": "Route not found"}), 404
        path_data = json.loads(route['optimized_path'])
        stops = path_data.get('stops', [])
        stops_with_risk = []
        for stop in stops:
            lat = stop.get('lat')
            lng = stop.get('lng')
            if not lat and 'location' in stop:
                lat, lng = parse_location(stop.get('location'))
            if lat is not None and lng is not None:
                weather = get_weather_data(lat, lng)
                weather_risk = calculate_weather_risk(weather)
            else:
                weather_risk = 0.3
            risk_score = weather_risk * 0.6 + 0.25 * 0.4
            stops_with_risk.append({'stop': stop, 'risk_score': risk_score})
        optimized = sorted(stops_with_risk, key=lambda x: x['risk_score'])
        for idx, item in enumerate(optimized, 1):
            item['stop']['sequence'] = idx
            item['stop']['sequence_order'] = idx
        path_data['stops'] = [item['stop'] for item in optimized]
        cursor.execute("UPDATE ROUTE SET optimized_path = %s WHERE route_id = %s", (json.dumps(path_data), route_id))
        db.commit()
        return jsonify({"message": "Route optimized by risk level"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

# ADMIN ENDPOINTS - ADD THESE

@app.route("/admin/routes", methods=["GET"])
def admin_get_routes():
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT route_id, total_distance, estimated_time FROM ROUTE")
        routes = cursor.fetchall()
        return jsonify(routes), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/routes/<int:route_id>/stops", methods=["GET"])
def admin_get_route_stops(route_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT stop_id, name, location, sequence_order, facility_type,
                   fmax_weight, fmax_volume, operating_hours, planned_eta, scan_status
            FROM ROUTE_STOP
            WHERE route_id = %s
            ORDER BY sequence_order
        """, (route_id,))
        stops = cursor.fetchall()
        return jsonify(stops), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/vehicles", methods=["GET"])
def admin_get_vehicles():
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT vehicle_id, type, license_plate, vmax_weight, vmax_volume, status FROM VEHICLE")
        vehicles = cursor.fetchall()
        return jsonify(vehicles), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/assignments", methods=["GET"])
def admin_get_assignments():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT a.*, v.type as vehicle_type, d.name as driver_name,
                   d.phone as driver_phone, d.email as driver_email,
                   d.status as driver_status
            FROM DRIVER_VEHICLE_ASSIGNMENT a
            LEFT JOIN VEHICLE v ON a.vehicle_id = v.vehicle_id
            LEFT JOIN DRIVER d ON a.driver_id = d.driver_id
            ORDER BY a.assignment_id DESC
        """)
        assignments = cursor.fetchall()
        return jsonify(assignments), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/order_updates", methods=["GET"])
def admin_get_order_updates():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT ou.update_id, ou.order_id, ou.update_type, ou.scan_type, ou.notes, ou.new_status, ou.updated_at,
                   d.name as driver_name, rs.name as stop_name
            FROM ORDER_UPDATE ou
            LEFT JOIN DRIVER d ON ou.driver_id = d.driver_id
            LEFT JOIN ROUTE_STOP rs ON ou.stop_id = rs.stop_id
            ORDER BY ou.updated_at DESC
            LIMIT 100
        """)
        updates = cursor.fetchall()
        return jsonify(updates), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/stops", methods=["POST"])
def admin_create_stop():
    data = request.json
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            INSERT INTO ROUTE_STOP (route_id, name, location, facility_type, sequence_order,
                                   fmax_weight, fmax_volume, operating_hours, planned_eta, scan_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (data.get('route_id'), data.get('name'), data.get('location'), data.get('facility_type'),
              data.get('sequence_order'), data.get('fmax_weight'), data.get('fmax_volume'),
              data.get('operating_hours'), data.get('planned_eta'), data.get('scan_status')))
        db.commit()
        return jsonify({"message": "Stop created successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/stops/<int:stop_id>", methods=["PUT"])
def admin_update_stop(stop_id):
    data = request.json
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            UPDATE ROUTE_STOP
            SET name=%s, location=%s, facility_type=%s, sequence_order=%s,
                fmax_weight=%s, fmax_volume=%s, operating_hours=%s,
                planned_eta=%s, scan_status=%s
            WHERE stop_id=%s
        """, (data.get('name'), data.get('location'), data.get('facility_type'),
              data.get('sequence_order'), data.get('fmax_weight'), data.get('fmax_volume'),
              data.get('operating_hours'), data.get('planned_eta'),
              data.get('scan_status'), stop_id))
        db.commit()
        return jsonify({"message": "Stop updated successfully"}), 200
    except Exception as e:
        db.rollback()
        print(f"Error updating stop: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/stops/<int:stop_id>", methods=["DELETE"])
def admin_delete_stop(stop_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("DELETE FROM ROUTE_STOP WHERE stop_id = %s", (stop_id,))
        db.commit()
        return jsonify({"message": "Stop deleted successfully"}), 200
    except Exception as e:
        db.rollback()
        print(f"Error deleting stop: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/vehicles/<int:vehicle_id>", methods=["PUT"])
def admin_update_vehicle(vehicle_id):
    data = request.json
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            UPDATE VEHICLE
            SET type=%s, vmax_weight=%s, vmax_volume=%s, status=%s, license_plate=%s
            WHERE vehicle_id=%s
        """, (data.get('type'), data.get('vmax_weight'), data.get('vmax_volume'),
              data.get('status'), data.get('license_plate'), vehicle_id))
        db.commit()
        return jsonify({"message": "Vehicle updated successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/vehicles/<int:vehicle_id>", methods=["DELETE"])
def admin_delete_vehicle(vehicle_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("DELETE FROM VEHICLE WHERE vehicle_id = %s", (vehicle_id,))
        db.commit()
        return jsonify({"message": "Vehicle deleted successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/vehicles", methods=["POST"])
def admin_create_vehicle():
    data = request.json
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            INSERT INTO VEHICLE (type, license_plate, vmax_weight, vmax_volume, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (data.get('type'), data.get('license_plate'), data.get('vmax_weight'),
              data.get('vmax_volume'), data.get('status')))
        db.commit()
        return jsonify({"message": "Vehicle created successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/assignments", methods=["POST"])
def admin_create_assignment():
    data = request.json
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            INSERT INTO DRIVER_VEHICLE_ASSIGNMENT (driver_id, vehicle_id, route_id, start_time, status)
            VALUES (%s, %s, %s, %s, 'Assigned')
        """, (data.get('driver_id'), data.get('vehicle_id'), data.get('route_id'), data.get('start_time')))

        assignment_id = cursor.lastrowid
        order_id = data.get('order_id')
        route_id = data.get('route_id')

        reset_route_progress(route_id)

        if order_id:
            cursor.execute("""
                INSERT INTO DELIVERY (order_id, assignment_id, status, scheduled_time)
                VALUES (%s, %s, 'Assigned', NOW())
            """, (order_id, assignment_id))

        db.commit()

        return jsonify({
            "message": "Assignment created successfully - Route progress has been reset",
            "assignment_id": assignment_id
        }), 200
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/assignments/<int:assignment_id>/complete", methods=["PUT"])
def admin_complete_assignment(assignment_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("SELECT route_id FROM DRIVER_VEHICLE_ASSIGNMENT WHERE assignment_id = %s", (assignment_id,))
        result = cursor.fetchone()
        route_id = result['route_id'] if result else None

        cursor.execute("""
            UPDATE DRIVER_VEHICLE_ASSIGNMENT
            SET status = 'Completed', end_time = NOW()
            WHERE assignment_id = %s
        """, (assignment_id,))

        db.commit()
        return jsonify({"message": "Assignment completed successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

# ADMIN CONDITION REPORTS ENDPOINT

@app.route("/admin/condition_reports", methods=["GET"])
def admin_get_condition_reports():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT report_id, route_id, region, weather_status, road_status, risk_score, recorded_at
            FROM CONDITION_REPORT
            ORDER BY recorded_at DESC
            LIMIT 200
        """)
        reports = cursor.fetchall()
        return jsonify(reports), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

# ADMIN OVERRIDES ENDPOINTS

@app.route("/admin/overrides", methods=["GET"])
def admin_get_overrides():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT override_id, delivery_id, admin_id, override_type, reason, old_value, new_value, created_at
            FROM ADMIN_OVERRIDE
            ORDER BY created_at DESC
            LIMIT 100
        """)
        overrides = cursor.fetchall()
        return jsonify(overrides), 200
    except Exception as e:
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/overrides", methods=["POST"])
def admin_create_override():
    data = request.json
    print(f"Received override data: {data}")
    print(f"delivery_id value: {data.get('delivery_id')}, type: {type(data.get('delivery_id'))}")
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            INSERT INTO ADMIN_OVERRIDE (delivery_id, admin_id, override_type, reason, old_value, new_value, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
        """, (data.get('delivery_id'), data.get('admin_id', 1), data.get('override_type'),
              data.get('reason'), data.get('old_value'), data.get('new_value')))
        db.commit()

        new_id = cursor.lastrowid

        return jsonify({
            "message": "Override recorded successfully",
            "override_id": new_id
        }), 200
    except Exception as e:
        db.rollback()
        print(f"Error creating override: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/override_status", methods=["POST"])
def admin_override_status():
    data = request.json
    db, cursor = safe_cursor()
    try:
        order_id = data.get('order_id')
        new_status = data.get('new_status')
        admin_id = data.get('admin_id', 1)
        reason = data.get('reason', 'Admin status change')

        cursor.execute("SELECT status FROM C_ORDER WHERE order_id = %s", (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({"error": f"Order {order_id} not found"}), 404

        old_status = order['status']

        cursor.execute("UPDATE C_ORDER SET status = %s WHERE order_id = %s", (new_status, order_id))

        cursor.execute("SELECT delivery_id FROM DELIVERY WHERE order_id = %s", (order_id,))
        delivery = cursor.fetchone()

        if delivery:
            delivery_id = delivery['delivery_id']
            cursor.execute("UPDATE DELIVERY SET status = %s WHERE delivery_id = %s", (new_status, delivery_id))
        else:
            cursor.execute("""
                INSERT INTO DELIVERY (order_id, status, scheduled_time)
                VALUES (%s, %s, NOW())
            """, (order_id, new_status))
            delivery_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO ADMIN_OVERRIDE (delivery_id, admin_id, override_type, reason, old_value, new_value, created_at)
            VALUES (%s, %s, 'Status Change', %s, %s, %s, NOW())
        """, (delivery_id, admin_id, reason, old_status, new_status))

        db.commit()
        override_id = cursor.lastrowid

        cursor.execute("""
            INSERT INTO ORDER_UPDATE (order_id, update_type, new_status, notes, updated_at)
            VALUES (%s, 'ADMIN_OVERRIDE', %s, CONCAT('Admin ', %s, ': ', %s), NOW())
        """, (order_id, new_status, admin_id, reason))
        db.commit()

        return jsonify({
            "message": f"Order #{order_id} status changed from {old_status} to {new_status}",
            "old_status": old_status,
            "new_status": new_status,
            "override_id": override_id,
            "delivery_id": delivery_id
        }), 200

    except mysql.connector.Error as e:
        db.rollback()
        print(f"MySQL Error: {e}")
        return jsonify({"error": f"Database error: {str(e)}"}), 500
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/available_drivers", methods=["GET"])
def get_available_drivers():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT driver_id, name, phone, email, status
            FROM DRIVER
            WHERE status = 'Active'
            AND driver_id NOT IN (
                SELECT driver_id FROM DRIVER_VEHICLE_ASSIGNMENT
                WHERE status NOT IN ('Completed', 'Cancelled')
            )
            ORDER BY name
        """)
        drivers = cursor.fetchall()
        print(f"Found {len(drivers)} available drivers")
        return jsonify(drivers), 200
    except Exception as e:
        print(f"Error fetching available drivers: {e}")
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/available_vehicles", methods=["GET"])
def get_available_vehicles():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT vehicle_id, type, license_plate, vmax_weight, vmax_volume, status
            FROM VEHICLE
            WHERE status = 'Available'
            ORDER BY type
        """)
        vehicles = cursor.fetchall()
        print(f"Found {len(vehicles)} available vehicles")
        return jsonify(vehicles), 200
    except Exception as e:
        print(f"Error fetching available vehicles: {e}")
        return jsonify([]), 200
    finally:
        cursor.close()
        db.close()

@app.route("/admin/drivers", methods=["GET"])
def admin_get_drivers():
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT driver_id, name, phone, email, license_class,
                   working_hours, status,
                   CASE WHEN password_hash IS NULL THEN 'No' ELSE 'Yes' END as has_password
            FROM DRIVER
            ORDER BY driver_id DESC
        """)
        drivers = cursor.fetchall()
        return jsonify(drivers), 200
    except Exception as e:
        print(f"Error fetching drivers: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/drivers", methods=["POST"])
def admin_create_driver():
    data = request.json
    db, cursor = safe_cursor()
    try:
        import uuid
        activation_token = str(uuid.uuid4()).replace('-', '')[:20]

        cursor.execute("""
            INSERT INTO DRIVER (name, phone, email, license_class, working_hours, status, activation_token)
            VALUES (%s, %s, %s, %s, %s, 'Pending', %s)
        """, (data.get('name'), data.get('phone'), data.get('email'),
              data.get('license_class'), data.get('working_hours'), activation_token))
        db.commit()

        new_id = cursor.lastrowid

        return jsonify({
            "message": "Driver created successfully",
            "driver_id": new_id,
            "activation_token": activation_token
        }), 200
    except Exception as e:
        db.rollback()
        print(f"Error creating driver: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/drivers/<int:driver_id>", methods=["PUT"])
def admin_update_driver(driver_id):
    data = request.json
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            UPDATE DRIVER
            SET name = %s, phone = %s, email = %s,
                license_class = %s, working_hours = %s, status = %s
            WHERE driver_id = %s
        """, (data.get('name'), data.get('phone'), data.get('email'),
              data.get('license_class'), data.get('working_hours'),
              data.get('status'), driver_id))
        db.commit()

        return jsonify({"message": "Driver updated successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/drivers/<int:driver_id>", methods=["DELETE"])
def admin_delete_driver(driver_id):
    db, cursor = safe_cursor()
    try:
        cursor.execute("""
            SELECT COUNT(*) as count FROM DRIVER_VEHICLE_ASSIGNMENT
            WHERE driver_id = %s AND status NOT IN ('Completed', 'Cancelled')
        """, (driver_id,))
        result = cursor.fetchone()

        if result and result['count'] > 0:
            return jsonify({"error": "Cannot delete driver with active assignments"}), 400

        cursor.execute("DELETE FROM DRIVER WHERE driver_id = %s", (driver_id,))
        db.commit()

        return jsonify({"message": "Driver deleted successfully"}), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

@app.route("/admin/drivers/<int:driver_id>/resend_token", methods=["POST"])
def resend_driver_token(driver_id):
    db, cursor = safe_cursor()
    try:
        import uuid
        new_token = str(uuid.uuid4()).replace('-', '')[:20]

        cursor.execute("""
            UPDATE DRIVER
            SET activation_token = %s, status = 'Pending', password_hash = NULL
            WHERE driver_id = %s
        """, (new_token, driver_id))
        db.commit()

        return jsonify({
            "message": "Activation token regenerated",
            "activation_token": new_token
        }), 200
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cursor.close()
        db.close()

register_ai_routes(app, safe_cursor=safe_cursor, verify_token=verify_token)

if __name__ == "__main__":
    app.run(debug=True, port=5000)
