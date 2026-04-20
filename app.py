"""
FitScan — Full Health & Gym Application
Flask backend with MediaPipe pose analysis, Colab HMR integration,
and a rule-engine-powered exercise & diet planner (no external AI API).

  python app.py
  → http://localhost:5050
"""

import os
import json
import requests as http_requests
from flask import (Flask, render_template, request, jsonify,
                   session, redirect, url_for)
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv
from pose_analyzer import PoseAnalyzer
from services import db_service as db

load_dotenv()

# ─────────────────────────────────────────────
#  CONFIG
# ─────────────────────────────────────────────
COLAB_URL = os.getenv("COLAB_URL", "https://adducent-merrie-dissipative.ngrok-free.dev/")

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "fitscan-dev-secret-key-change-me")

# Initialize pose analyzer once
pose_analyzer = PoseAnalyzer()
print("✅ MediaPipe PoseAnalyzer loaded")


# ═══════════════════════════════════════════
#  MIDDLEWARE
# ═══════════════════════════════════════════

@app.context_processor
def inject_session():
    """Make session available in all templates."""
    return dict(session=session)


@app.errorhandler(500)
def handle_500(e):
    """Return JSON for API routes, HTML for pages."""
    if request.path.startswith("/api/"):
        return jsonify({"error": f"Internal server error: {e}"}), 500
    return render_template("base.html", content="Something went wrong."), 500


# ═══════════════════════════════════════════
#  PAGE ROUTES
# ═══════════════════════════════════════════

@app.route("/")
def index():
    if session.get("user_id"):
        return redirect(url_for("dashboard_page"))
    return redirect(url_for("login_page"))


@app.route("/login")
def login_page():
    if session.get("user_id"):
        return redirect(url_for("dashboard_page"))
    return render_template("login.html", show_nav=False)


@app.route("/register")
def register_page():
    if session.get("user_id"):
        return redirect(url_for("dashboard_page"))
    return render_template("register.html", show_nav=False)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))


@app.route("/onboarding")
def onboarding_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    return render_template("onboarding.html", show_nav=False)


@app.route("/scan")
def scan_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    profile = db.get_profile(session["user_id"])
    return render_template("scan.html", active_page="scan",
                           colab_url=COLAB_URL.rstrip("/"),
                           profile=profile)


@app.route("/dashboard")
def dashboard_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    user_data = db.get_full_user_data(session["user_id"])
    today_stats = db.get_today_exercise_stats(session["user_id"])
    return render_template("dashboard.html", active_page="dashboard",
                           data=user_data, today_stats=today_stats)


@app.route("/exercise")
def exercise_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    user_data = db.get_full_user_data(session["user_id"])
    plan = db.get_latest_exercise_plan(session["user_id"])
    return render_template("exercise.html", active_page="exercise",
                           data=user_data, plan=plan)


@app.route("/diet")
def diet_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    user_data = db.get_full_user_data(session["user_id"])
    plan = db.get_latest_diet_plan(session["user_id"])
    return render_template("diet.html", active_page="diet",
                           data=user_data, plan=plan)


# ═══════════════════════════════════════════
#  AUTH / PROFILE API
# ═══════════════════════════════════════════

@app.route("/api/auth/register", methods=["POST"])
def api_auth_register():
    """Create a new user account with email and password."""
    data = request.get_json()
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    confirm = data.get("confirm_password", "")

    if not name:
        return jsonify({"error": "Name is required"}), 400
    if not email or "@" not in email:
        return jsonify({"error": "Valid email is required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if password != confirm:
        return jsonify({"error": "Passwords do not match"}), 400

    # Check if email already exists
    existing = db.get_user_by_email(email)
    if existing:
        return jsonify({"error": "An account with this email already exists"}), 409

    pw_hash = generate_password_hash(password)
    user = db.create_user(name, email, pw_hash)
    if not user:
        return jsonify({"error": "Could not create account"}), 500

    session["user_id"] = user["id"]
    session["user_name"] = user["name"]

    return jsonify({"success": True, "redirect": "/onboarding"})


@app.route("/api/auth/login", methods=["POST"])
def api_auth_login():
    """Sign in with email and password."""
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = db.get_user_by_email(email)
    if not user or not user.get("password_hash"):
        return jsonify({"error": "Invalid email or password"}), 401

    if not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Invalid email or password"}), 401

    session["user_id"] = user["id"]
    session["user_name"] = user["name"]

    # Update last login
    conn = db.get_db()
    from datetime import datetime
    conn.execute("UPDATE users SET last_login = ? WHERE id = ?",
                 (datetime.now().isoformat(), user["id"]))
    conn.commit()
    conn.close()

    # Check if user has profile
    profile = db.get_profile(user["id"])
    redirect_url = "/dashboard" if profile else "/onboarding"

    # Store preferred_time in session so base.html can emit the meta tag
    if profile:
        session["preferred_time"] = profile.get("preferred_time") or ""

    return jsonify({"success": True, "redirect": redirect_url})


@app.route("/api/profile", methods=["POST"])
def api_save_profile():
    """Save full onboarding profile."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    data = request.get_json()
    uid = session["user_id"]

    # Update user name if provided
    new_name = (data.get("name") or "").strip()
    if new_name:
        conn = db.get_db()
        conn.execute("UPDATE users SET name = ? WHERE id = ?", (new_name, uid))
        conn.commit()
        conn.close()
        session["user_name"] = new_name

    # Save profile
    db.save_profile(uid, {
        "age": data.get("age"),
        "gender": data.get("gender"),
        "height_cm": data.get("height_cm"),
        "weight_kg": data.get("weight_kg"),
        "experience_level": data.get("experience_level"),
        "training_days_per_week": data.get("training_days_per_week"),
        "preferred_time": data.get("preferred_time"),
        "equipment": data.get("equipment", []),
        "target_weight": data.get("target_weight"),
        "minutes_per_session": data.get("minutes_per_session"),
    })

    # Save goals
    db.save_goals(uid, data.get("goals", []))

    # Save target muscles
    db.save_target_muscles(uid, data.get("target_muscles", []))

    # Save diet preferences
    db.save_diet_preferences(
        uid,
        data.get("diet_type", "non_veg"),
        data.get("indianize", False),
    )

    return jsonify({"success": True, "redirect": "/scan"})


# ═══════════════════════════════════════════
#  BODY SCAN API
# ═══════════════════════════════════════════

@app.route("/api/analyze", methods=["POST"])
def api_analyze_pose():
    """Local MediaPipe pose analysis."""
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    height_cm = request.form.get("height_cm", type=float)
    image_file = request.files["image"]
    image_bytes = image_file.read()

    result = pose_analyzer.analyze_image(image_bytes, height_cm=height_cm)

    if "error" in result:
        return jsonify(result), 422

    return jsonify(result)


def _enrich_measurements(data):
    """Estimate additional circumferences from existing HMR measurements + height."""
    hmr = data.get("hmr_data") or {}
    m = hmr.get("measurements_cm") or {}
    profile = db.get_profile(session.get("user_id")) or {}
    height_cm = float(profile.get("height_cm") or data.get("height_cm") or 0)

    added = {}

    # Neck: ~37% of chest circumference (Behnke anthropometric reference)
    if "chest" in m and "neck" not in m:
        added["neck"] = round(m["chest"] * 0.37, 1)

    # Forearm: ~75% of upper arm circumference
    if "upper_arm" in m and "forearm" not in m:
        added["forearm"] = round(m["upper_arm"] * 0.75, 1)

    # Calf: ~66% of thigh circumference
    if "thigh" in m and "calf" not in m:
        added["calf"] = round(m["thigh"] * 0.66, 1)

    # Wrist: Martin formula — 17.5% of height
    if height_cm and "wrist" not in m:
        added["wrist"] = round(height_cm * 0.175, 1)

    # Ankle: ~21% of height
    if height_cm and "ankle" not in m:
        added["ankle"] = round(height_cm * 0.21, 1)

    if added:
        m.update(added)
        hmr["measurements_cm"] = m
        hmr.setdefault("estimated_fields", []).extend(added.keys())
        data["hmr_data"] = hmr

    return data


@app.route("/api/scan/save", methods=["POST"])
def api_save_scan():
    """Save scan results to database."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    data = request.get_json()
    data = _enrich_measurements(data)
    scan_id = db.save_scan_result(session["user_id"], data)
    return jsonify({"success": True, "scan_id": scan_id})


@app.route("/api/scan-results/latest")
def api_latest_scan():
    """Get the latest scan result."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    scan = db.get_latest_scan(session["user_id"])
    if not scan:
        return jsonify({"error": "No scans found"}), 404
    return jsonify(scan)


@app.route("/api/scan-history")
def api_scan_history():
    """Get all scans for current user."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    scans = db.get_scan_history(session["user_id"])
    return jsonify(scans)


# ═══════════════════════════════════════════
#  EXERCISE PLAN API
# ═══════════════════════════════════════════

@app.route("/api/exercise/generate", methods=["POST"])
def api_generate_exercise():
    """Generate exercise plan using the rule engine."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    from services.exercise_service import generate_exercise_plan

    user_data = db.get_full_user_data(session["user_id"])
    if not user_data.get("latest_scan"):
        return jsonify({"error": "Please complete a body scan first"}), 400

    try:
        plan_data = generate_exercise_plan(user_data)
        scan_id = user_data["latest_scan"]["id"]
        plan_id = db.save_exercise_plan(session["user_id"], scan_id, plan_data)
        return jsonify({"success": True, "plan_id": plan_id, "plan": plan_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/exercise/plan/latest")
def api_latest_exercise_plan():
    """Get the latest exercise plan."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    plan = db.get_latest_exercise_plan(session["user_id"])
    if not plan:
        return jsonify({"error": "No exercise plan found"}), 404
    return jsonify(plan)


@app.route("/api/exercise/log", methods=["POST"])
def api_log_exercise():
    """Log an exercise as completed/uncompleted."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    data = request.get_json()
    db.log_exercise(
        session["user_id"],
        data["plan_id"],
        data["day_name"],
        data["exercise_name"],
        data.get("completed", True),
    )
    return jsonify({"success": True})


@app.route("/api/exercise/log/<int:plan_id>")
def api_get_exercise_log(plan_id):
    """Get exercise log for a plan."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    logs = db.get_exercise_log(session["user_id"], plan_id)
    return jsonify(logs)


@app.route("/api/exercise/today-stats")
def api_today_exercise_stats():
    """Get today's exercise stats and calorie estimation."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    stats = db.get_today_exercise_stats(session["user_id"])
    return jsonify(stats)


# ═══════════════════════════════════════════
#  EXERCISE IMAGE PROXY (avoid CORS)
# ═══════════════════════════════════════════

# Cache exercise images in memory
_exercise_image_cache = {}

# Load free-exercise-db index on first call
_free_exercise_db = None

def _load_free_exercise_db():
    global _free_exercise_db
    if _free_exercise_db is not None:
        return _free_exercise_db
    try:
        resp = http_requests.get(
            "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
            timeout=15,
        )
        _free_exercise_db = resp.json()
        print(f"✅ Loaded free-exercise-db: {len(_free_exercise_db)} exercises")
    except Exception as e:
        print(f"⚠️ Failed to load free-exercise-db: {e}")
        _free_exercise_db = []
    return _free_exercise_db


def _fuzzy_match(query, name):
    """Simple fuzzy match: check if most query words appear in name."""
    query_words = query.lower().replace("-", " ").split()
    name_lower = name.lower().replace("_", " ").replace("-", " ")
    matches = sum(1 for w in query_words if w in name_lower)
    return matches / max(len(query_words), 1)


@app.route("/api/exercise/image")
def api_exercise_image():
    """Fetch exercise image URL from multiple sources. Returns JSON {url: ...}."""
    search = request.args.get("q", "").strip()
    if not search:
        return jsonify({"url": None})

    cache_key = search.lower()
    if cache_key in _exercise_image_cache:
        return jsonify({"url": _exercise_image_cache[cache_key]})

    url = None

    # ── Source 1: wger.de API ──
    try:
        r1 = http_requests.get(
            f"https://wger.de/api/v2/exercise/search/?term={search}&language=2&format=json",
            timeout=8,
        )
        suggestions = r1.json().get("suggestions", [])
        if suggestions:
            base_id = suggestions[0].get("data", {}).get("base_id") or suggestions[0].get("data", {}).get("id")
            if base_id:
                r2 = http_requests.get(
                    f"https://wger.de/api/v2/exerciseimage/?exercise_base={base_id}&format=json",
                    timeout=8,
                )
                results = r2.json().get("results", [])
                if results:
                    url = results[0].get("image")
    except Exception as e:
        print(f"wger API error for '{search}': {e}")

    # ── Source 2: free-exercise-db (GitHub) ──
    if not url:
        try:
            exercises = _load_free_exercise_db()
            best_score = 0
            best_match = None
            for ex in exercises:
                score = _fuzzy_match(search, ex.get("name", ""))
                if score > best_score and score >= 0.5:
                    best_score = score
                    best_match = ex
            if best_match and best_match.get("images"):
                img_path = best_match["images"][0]
                url = f"https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/{img_path}"
        except Exception as e:
            print(f"free-exercise-db error for '{search}': {e}")

    _exercise_image_cache[cache_key] = url
    return jsonify({"url": url})


@app.route("/api/exercise/animations")
def api_exercise_animations():
    """List available 3D exercise animations (for debugging)."""
    anim_dir = os.path.join(app.static_folder, "models", "animations")
    result = []
    if os.path.isdir(anim_dir):
        for folder in sorted(os.listdir(anim_dir)):
            folder_path = os.path.join(anim_dir, folder)
            if os.path.isdir(folder_path):
                fbx_files = [f for f in os.listdir(folder_path) if f.endswith(".fbx")]
                result.append({"folder": folder, "files": fbx_files})
    return jsonify(result)


# ═══════════════════════════════════════════
#  DIET PLAN API
# ═══════════════════════════════════════════

@app.route("/api/diet/generate", methods=["POST"])
def api_generate_diet():
    """Generate diet plan using the rule engine."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    from services.diet_service import generate_diet_plan

    user_data = db.get_full_user_data(session["user_id"])
    if not user_data.get("latest_scan"):
        return jsonify({"error": "Please complete a body scan first"}), 400

    data = request.get_json() or {}
    indianize = data.get("indianize", False)

    try:
        plan_data = generate_diet_plan(user_data, indianize=indianize)
        scan_id = user_data["latest_scan"]["id"]
        plan_id = db.save_diet_plan(session["user_id"], scan_id, plan_data, indianize)
        return jsonify({"success": True, "plan_id": plan_id, "plan": plan_data})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/diet/plan/latest")
def api_latest_diet_plan():
    """Get the latest diet plan."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    plan = db.get_latest_diet_plan(session["user_id"])
    if not plan:
        return jsonify({"error": "No diet plan found"}), 404
    return jsonify(plan)


# ═══════════════════════════════════════════
#  USER DATA API
# ═══════════════════════════════════════════

@app.route("/api/user/current")
def api_current_user():
    """Get full user data."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    data = db.get_full_user_data(session["user_id"])
    if not data:
        return jsonify({"error": "User not found"}), 404
    return jsonify(data)


# ═══════════════════════════════════════════
#  EXERCISE SET LOGS API
# ═══════════════════════════════════════════

@app.route("/api/exercise/log-set", methods=["POST"])
def api_log_exercise_set():
    """Log weight + reps for a specific set of an exercise."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    data = request.get_json()
    db.log_exercise_set(
        session["user_id"],
        data["plan_id"],
        data["day_name"],
        data["exercise_name"],
        data["set_number"],
        data.get("weight_kg"),
        data.get("reps_done"),
        data.get("notes", ""),
    )
    return jsonify({"success": True})


@app.route("/api/exercise/set-logs/<int:plan_id>")
def api_get_set_logs(plan_id):
    """Get all set logs for a plan."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    logs = db.get_set_logs(session["user_id"], plan_id)
    return jsonify(logs)


# ═══════════════════════════════════════════
#  MEAL LOGS API
# ═══════════════════════════════════════════

@app.route("/api/diet/log-meal", methods=["POST"])
def api_log_meal():
    """Log a meal as eaten / not eaten."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    data = request.get_json()
    db.log_meal(
        session["user_id"],
        data["plan_id"],
        data["day_name"],
        data["meal_name"],
        data.get("completed", True),
    )
    return jsonify({"success": True})


@app.route("/api/diet/meal-logs/<int:plan_id>")
def api_get_meal_logs(plan_id):
    """Get all meal logs for a plan."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    logs = db.get_meal_logs(session["user_id"], plan_id)
    return jsonify(logs)


# ═══════════════════════════════════════════
#  WATER TRACKING API
# ═══════════════════════════════════════════

@app.route("/api/water/update", methods=["POST"])
def api_update_water():
    """Set today's water glass count."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    data = request.get_json()
    glasses = db.update_water(session["user_id"], data.get("glasses", 0))
    return jsonify({"success": True, "glasses": glasses})


@app.route("/api/water/today")
def api_water_today():
    """Get today's water glass count."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    glasses = db.get_water_today(session["user_id"])
    return jsonify({"glasses": glasses})


# ═══════════════════════════════════════════
#  STREAK + PROGRESS HISTORY API
# ═══════════════════════════════════════════

@app.route("/api/progress/streak")
def api_streak():
    """Return current streak, best streak, and last 7 days status."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    data = db.get_streak_data(session["user_id"])
    return jsonify(data)


@app.route("/api/progress/history")
def api_progress_history():
    """Return all scans for history/comparison charts."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    scans = db.get_scan_history(session["user_id"])
    return jsonify(scans)


# ═══════════════════════════════════════════
#  EXERCISE SWAP API
# ═══════════════════════════════════════════

@app.route("/api/exercise/swap")
def api_swap_exercise():
    """Find the next best exercise for the given split, excluding the current one."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    day_name  = request.args.get("day_name", "")
    ex_name   = request.args.get("exercise_name", "")
    split_cat = request.args.get("split_cat", "push")

    user_data  = db.get_full_user_data(session["user_id"])
    body_type  = (user_data.get("latest_scan") or {}).get("body_type", "Unknown")
    goals      = user_data.get("goals", [])
    profile    = user_data.get("profile") or {}
    equipment  = profile.get("equipment", [])
    experience = profile.get("experience_level", "beginner")
    gender     = profile.get("gender") or "male"

    plan = db.get_latest_exercise_plan(session["user_id"])
    exclude = set()
    if plan and plan.get("plan_data"):
        for day in plan["plan_data"].get("weekly_plan", []):
            if day.get("day", "").lower() == day_name.lower():
                for ex in day.get("exercises", []):
                    exclude.add(ex["name"])
                break
    exclude.add(ex_name)

    result = db.get_next_exercise_for_swap(body_type, split_cat, exclude, goals, equipment, experience, gender)
    if not result:
        return jsonify({"error": "No suitable replacement found"}), 404

    from services.rule_engine import (get_exercise_benefit, get_exercise_tip,
                                      BODY_TYPE_EXERCISE_RULES, GENDER_EXERCISE_ADJUSTMENTS)
    from services.exercise_data import get_search_name
    bt_rules   = BODY_TYPE_EXERCISE_RULES.get(body_type, BODY_TYPE_EXERCISE_RULES["Unknown"])
    gender_key = "female" if str(gender).lower() in ("female", "f") else "male"
    gender_adj = GENDER_EXERCISE_ADJUSTMENTS[gender_key]
    rating, reason = get_exercise_benefit(result, body_type, goals)
    tip = get_exercise_tip(result["muscle_group"], body_type)

    # Apply gender rep-range offset to the swapped exercise
    rep_range = bt_rules["rep_range"]
    offset = gender_adj.get("rep_range_offset", 0)
    if offset:
        low, high = (int(x) for x in rep_range.split("-"))
        rep_range = f"{low + offset}-{high + offset}"

    rest_seconds = bt_rules["rest_seconds"]
    if gender_key == "female":
        rest_seconds = max(30, rest_seconds - 15)

    return jsonify({
        "name": result["name"],
        "search_name": get_search_name(result["name"]),
        "muscle_group": result["muscle_group"],
        "joint_type": result["joint_type"],
        "sets": bt_rules["sets"],
        "reps": rep_range,
        "rest_seconds": rest_seconds,
        "benefit_rating": rating,
        "benefit_reason": reason,
        "tips": tip,
        "muscle_groups": [result["muscle_group"].lower().split(" - ")[-1]],
    })


# ═══════════════════════════════════════════
#  SETTINGS PAGE + PROFILE UPDATE API
# ═══════════════════════════════════════════

@app.route("/settings")
def settings_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    user_data = db.get_full_user_data(session["user_id"])
    return render_template("settings.html", active_page="settings", data=user_data)


@app.route("/api/profile/update", methods=["POST"])
def api_update_profile():
    """Update user profile fields from settings page."""
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401
    data = request.get_json()
    uid = session["user_id"]

    new_name = (data.get("name") or "").strip()
    if new_name:
        conn = db.get_db()
        conn.execute("UPDATE users SET name=? WHERE id=?", (new_name, uid))
        conn.commit()
        conn.close()
        session["user_name"] = new_name

    db.save_profile(uid, {
        "age": data.get("age"),
        "gender": data.get("gender"),
        "height_cm": data.get("height_cm"),
        "weight_kg": data.get("weight_kg"),
        "experience_level": data.get("experience_level"),
        "training_days_per_week": data.get("training_days_per_week"),
        "preferred_time": data.get("preferred_time"),
        "equipment": data.get("equipment", []),
        "target_weight": data.get("target_weight"),
        "minutes_per_session": data.get("minutes_per_session"),
    })
    db.save_goals(uid, data.get("goals", []))
    db.save_target_muscles(uid, data.get("target_muscles", []))
    db.save_diet_preferences(uid, data.get("diet_type", "non_veg"), data.get("indianize", False))

    # Keep session in sync so base.html reminder banner uses latest value
    if data.get("preferred_time"):
        session["preferred_time"] = data.get("preferred_time")

    return jsonify({"success": True, "message": "Profile updated successfully"})


# ═══════════════════════════════════════════
#  RUN
# ═══════════════════════════════════════════

if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"🏋️  FitScan running at: http://localhost:5050")
    print(f"📡  Colab API target:   {COLAB_URL}")
    print(f"{'='*50}\n")
    app.run(host="0.0.0.0", port=5050, debug=True)
