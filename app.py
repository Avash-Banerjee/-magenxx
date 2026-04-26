"""
FitScan — Full Health & Gym Application
Flask backend with MediaPipe pose analysis, Colab HMR integration,
and a rule-engine-powered exercise & diet planner (no external AI API).

  python app.py
  → http://localhost:5050
"""

import os
import json
import math
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
COLAB_URL    = os.getenv("COLAB_URL", "https://adducent-merrie-dissipative.ngrok-free.dev/")
GAUSSIAN_URL = os.getenv("GAUSSIAN_COLAB_URL", "").rstrip("/")

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
                           gaussian_url=GAUSSIAN_URL,
                           profile=profile)


@app.route("/dashboard")
def dashboard_page():
    if not session.get("user_id"):
        return redirect(url_for("login_page"))
    user_data = db.get_full_user_data(session["user_id"])
    today_stats = db.get_today_exercise_stats(session["user_id"])
    resp = app.make_response(render_template("dashboard.html", active_page="dashboard",
                           data=user_data, today_stats=today_stats,
                           gaussian_url=GAUSSIAN_URL))
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp


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


@app.route("/api/analyze/video", methods=["POST"])
def api_analyze_video():
    """
    Multi-view video analysis.
    1. Extract front / side / 45-degree frames from rotation video.
    2. Run local MediaPipe pose on each frame.
    3. Call Colab HMR /classify on each frame, average circumference measurements.
    4. Return merged result (front-view classification + averaged measurements).
    """
    if not session.get("user_id"):
        return jsonify({"error": "Not logged in"}), 401

    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400

    height_cm = request.form.get("height_cm", type=float)
    weight_kg = request.form.get("weight_kg", type=float)
    if not height_cm or not weight_kg:
        return jsonify({"error": "height_cm and weight_kg are required"}), 400

    import tempfile, base64 as _b64

    video_file = request.files["video"]
    suffix = os.path.splitext(video_file.filename or "scan.mp4")[1] or ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        video_file.save(tmp.name)
        tmp_path = tmp.name

    try:
        video_result = pose_analyzer.analyze_video(tmp_path, height_cm=height_cm)
    finally:
        os.unlink(tmp_path)

    if "error" in video_result:
        return jsonify(video_result), 422

    colab_url = _valid_colab_url()

    # Helper: call Colab /classify with one frame + mp_ratios from its pose data
    def _colab_classify(view_key):
        view = video_result[view_key]
        frame_jpg = view["frame_jpg"]
        pose = view["pose"]
        files = {"image": (f"{view_key}.jpg", frame_jpg, "image/jpeg")}
        form = {"height_cm": str(height_cm), "weight_kg": str(weight_kg)}
        if pose.get("skeletal_ratios"):
            import json as _json
            form["mp_ratios"] = _json.dumps(pose["skeletal_ratios"])
        try:
            r = http_requests.post(
                colab_url + "/classify",
                files=files,
                data=form,
                headers={"ngrok-skip-browser-warning": "true"},
                timeout=180,
            )
            if r.ok and "application/json" in r.headers.get("content-type", ""):
                return r.json()
        except Exception as e:
            print(f"Colab classify failed for {view_key}: {e}")
        return None

    front_pose = video_result["front"]["pose"]

    if colab_url:
        front_colab = _colab_classify("front")
        side_colab  = _colab_classify("side")
        diag_colab  = _colab_classify("diagonal")

        successful = [c for c in (front_colab, side_colab, diag_colab) if c and not c.get("error")]

        if successful:
            # Average circumference measurements across successful Colab responses
            meas_keys = ["chest", "waist", "hip", "shoulder", "thigh", "belly"]
            avg_meas = {}
            for k in meas_keys:
                vals = [c["measurements_cm"][k] for c in successful if k in c.get("measurements_cm", {})]
                if vals:
                    avg_meas[k] = round(sum(vals) / len(vals), 2)

            # Use front-view classification result as primary
            primary = front_colab or successful[0]
            if avg_meas:
                primary["measurements_cm"].update(avg_meas)
                primary["multi_view"] = {
                    "views_used": len(successful),
                    "averaged_keys": list(avg_meas.keys()),
                }

            return jsonify({
                "success": True,
                "colab": primary,
                "pose": front_pose,
                "views": {
                    k: {
                        "shoulder_width_px": video_result[k]["shoulder_width_px"],
                        "frame_b64": "data:image/jpeg;base64," + _b64.b64encode(video_result[k]["frame_jpg"]).decode(),
                    }
                    for k in ("front", "side", "diagonal")
                },
                "frames_sampled": video_result["frames_sampled"],
            })

    # Colab not configured — return pose-only result
    return jsonify({
        "success": True,
        "colab": None,
        "pose": front_pose,
        "views": {
            k: {
                "shoulder_width_px": video_result[k]["shoulder_width_px"],
                "frame_b64": "data:image/jpeg;base64," + _b64.b64encode(video_result[k]["frame_jpg"]).decode(),
            }
            for k in ("front", "side", "diagonal")
        },
        "frames_sampled": video_result["frames_sampled"],
    })


def _enrich_measurements(data):
    """Estimate additional circumferences and derived ratios from HMR + pose + profile."""
    hmr = data.get("hmr_data") or {}
    m = hmr.get("measurements_cm") or {}
    profile = db.get_profile(session.get("user_id")) or {}
    height_cm = float(profile.get("height_cm") or data.get("height_cm") or 0)

    # Pull joint lengths from pose data (populated by pose_analyzer)
    pose_cm = (data.get("pose_data") or {}).get("joint_lengths_cm") or {}

    added = {}

    # ── Circumferences — validated anthropometric ratios only ──

    # Neck: ~37% of chest (Behnke 1959)
    if "chest" in m and "neck" not in m:
        added["neck"] = round(m["chest"] * 0.37, 1)

    # Forearm: ~75% of upper arm (validated ratio)
    if "upper_arm" in m and "forearm" not in m:
        added["forearm"] = round(m["upper_arm"] * 0.75, 1)

    # Calf: ~66% of thigh (validated ratio)
    if "thigh" in m and "calf" not in m:
        added["calf"] = round(m["thigh"] * 0.66, 1)

    # Wrist: 17.5% of height (Martin & Saller 1957)
    if height_cm and "wrist" not in m:
        added["wrist"] = round(height_cm * 0.175, 1)

    # Ankle: ~21% of height (Claessens et al. 1990)
    if height_cm and "ankle" not in m:
        added["ankle"] = round(height_cm * 0.21, 1)

    # Head: ~34.5% of height (Rollnick 1984)
    if height_cm and "head" not in m:
        added["head"] = round(height_cm * 0.345, 1)

    # Knee: ~37% of thigh (Drillis & Contini 1966)
    if "thigh" in m and "knee" not in m:
        added["knee"] = round(m["thigh"] * 0.37, 1)

    # Hips fallback: ~64% of height (Claessens et al. 1990) — only if HMR didn't provide
    if height_cm and "hips" not in m and "hip" not in m:
        added["hips"] = round(height_cm * 0.64, 1)

    # Knee Upper: ~40% of thigh (2" above knee — Fit3D reference)
    if "thigh" in m and "knee_upper" not in m:
        added["knee_upper"] = round(m["thigh"] * 0.40, 1)

    # Overarm (deltoid circumference): ~162% of chest (Penn State anthropometry)
    if "chest" in m and "overarm" not in m:
        added["overarm"] = round(m["chest"] * 1.62, 1)

    # Armscye: ~40% of chest (apparel anthropometry standard)
    if "chest" in m and "armscye" not in m:
        added["armscye"] = round(m["chest"] * 0.40, 1)

    # Waist Natural: slightly less than standard waist (×0.95)
    waist_src = m.get("waist")
    if waist_src and "waist_natural" not in m:
        added["waist_natural"] = round(waist_src * 0.95, 1)

    # Waist Max: slightly more than standard waist (×1.05)
    if waist_src and "waist_max" not in m:
        added["waist_max"] = round(waist_src * 1.05, 1)

    # Hips Max: ~2% more than standard hip (×1.02)
    hips_src = m.get("hips") or m.get("hip")
    if hips_src and "hips_max" not in m:
        added["hips_max"] = round(hips_src * 1.02, 1)

    # Shoulder circumference: same formula as overarm (chest × 1.62)
    if "chest" in m and "shoulder_circumference" not in m:
        added["shoulder_circumference"] = round(m["chest"] * 1.62, 1)

    if added:
        m.update(added)
        hmr["measurements_cm"] = m
        hmr.setdefault("estimated_fields", []).extend(added.keys())
        data["hmr_data"] = hmr

    # ── Derived ratios ──
    m_full = m  # now includes added fields
    ratios = {}

    waist  = m_full.get("waist")
    hips   = m_full.get("hips") or m_full.get("hip")
    chest  = m_full.get("chest")
    thigh  = m_full.get("thigh")
    calf   = m_full.get("calf")

    shoulder_w = pose_cm.get("shoulder_width")
    hip_w      = pose_cm.get("hip_width")
    arm_total  = (pose_cm.get("left_arm_total") or pose_cm.get("right_arm_total"))
    spine_len  = pose_cm.get("spine_length")
    foot_len   = (pose_cm.get("left_foot") or pose_cm.get("right_foot"))

    # Waist-to-Hip Ratio (WHO standard)
    if waist and hips:
        ratios["waist_hip_ratio"] = round(waist / hips, 3)

    # Chest-to-Waist Ratio
    if chest and waist:
        ratios["chest_waist_ratio"] = round(chest / waist, 3)

    # Shoulder-to-Waist Ratio
    if shoulder_w and waist:
        ratios["shoulder_waist_ratio"] = round(shoulder_w / waist, 3)

    # Calf-to-Thigh Ratio
    if calf and thigh:
        ratios["calf_thigh_ratio"] = round(calf / thigh, 3)

    # Arm Length / Height
    if arm_total and height_cm:
        ratios["arm_height_ratio"] = round(arm_total / height_cm, 3)

    # Cormic Index proxy — spine length / height
    if spine_len and height_cm:
        ratios["cormic_index"] = round(spine_len / height_cm, 3)

    # Foot-to-Height Ratio
    if foot_len and height_cm:
        ratios["foot_height_ratio"] = round(foot_len / height_cm, 3)

    # Hip Width-to-Height Ratio
    if hip_w and height_cm:
        ratios["hip_width_height_ratio"] = round(hip_w / height_cm, 3)

    # Pull profile fields used by multiple indices
    age       = profile.get("age")
    gender    = (profile.get("gender") or "").lower()
    weight_kg = float(profile.get("weight_kg") or 0)
    bmi       = None
    if weight_kg and height_cm:
        bmi = weight_kg / (height_cm / 100) ** 2

    # Body Fat % — Deurenberg et al. 1991
    # BF% = 1.2×BMI + 0.23×age - 10.8×sex - 5.4  (sex: 1=male, 0=female)
    if bmi and age:
        sex = 1 if gender in ("male", "m") else 0
        bf  = round(1.2 * bmi + 0.23 * float(age) - 10.8 * sex - 5.4, 1)
        if 3.0 <= bf <= 60.0:
            ratios["body_fat_pct_estimated"] = bf

    # Waist-to-Height Ratio — Ashwell et al. 2012 (CVD risk; keep <0.5)
    if waist and height_cm:
        ratios["WHtR"] = round(waist / height_cm, 3)

    # Body Surface Area — Mosteller 1987 (m²)
    if height_cm and weight_kg:
        ratios["BSA_m2"] = round(math.sqrt(height_cm * weight_kg / 3600), 3)

    # Lean Body Mass — Boer 1984 (kg); sex-specific
    if weight_kg and height_cm:
        if gender in ("male", "m"):
            ratios["lean_body_mass_kg"] = round(0.407 * weight_kg + 0.267 * height_cm - 19.2, 1)
        elif gender in ("female", "f"):
            ratios["lean_body_mass_kg"] = round(0.252 * weight_kg + 0.473 * height_cm - 48.3, 1)

    # ABSI — A Body Shape Index, Krakauer & Krakauer 2012
    # ABSI = WC(m) / (BMI^(2/3) × height(m)^(1/2))
    if waist and bmi and height_cm:
        ratios["ABSI"] = round(
            (waist / 100) / (bmi ** (2 / 3) * (height_cm / 100) ** 0.5), 4)

    # BRI — Body Roundness Index, Thomas et al. 2013 (scale 1–20)
    # BRI = 364.2 - 365.5 × √(1 - (WC/2π)² / (H/2)²)
    if waist and height_cm:
        term = 1 - (waist / (2 * math.pi)) ** 2 / (height_cm / 2) ** 2
        if term > 0:
            ratios["BRI"] = round(364.2 - 365.5 * math.sqrt(term), 2)

    if ratios:
        hmr["derived_ratios"] = ratios
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
    resp = jsonify(scan)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    return resp


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
#  HMR COLAB PROXY
# ═══════════════════════════════════════════

def _valid_colab_url():
    url = (COLAB_URL or "").rstrip("/")
    if not url or url == "your_hmr_ngrok_url_here" or not url.startswith(("http://", "https://")):
        return ""
    return url


def _json_or_error_response(response, service_name):
    content_type = response.headers.get("content-type", "")
    if "application/json" in content_type:
        return response.json()
    body = response.text[:300].replace("\n", " ").strip()
    return {
        "error": f"{service_name} returned non-JSON response",
        "status": response.status_code,
        "content_type": content_type,
        "body_preview": body,
    }


@app.route("/api/hmr/status")
def hmr_status():
    """Check whether the HMR Colab API is reachable."""
    url = _valid_colab_url()
    if not url:
        return jsonify({
            "available": False,
            "reason": "COLAB_URL is not set to a valid HMR ngrok URL in .env",
        })
    try:
        r = http_requests.get(
            url + "/",
            headers={"ngrok-skip-browser-warning": "true"},
            timeout=8,
        )
        return jsonify({
            "available": r.ok and "application/json" in r.headers.get("content-type", ""),
            "reachable": r.ok,
            "status": r.status_code,
            "data": _json_or_error_response(r, "HMR Colab") if r.ok else {},
        })
    except Exception as e:
        return jsonify({"available": False, "reason": str(e)})


@app.route("/api/hmr/classify", methods=["POST"])
def hmr_classify_proxy():
    """Forward scan image + body metrics to the HMR Colab classifier."""
    url = _valid_colab_url()
    if not url:
        return jsonify({
            "error": "COLAB_URL is not set to a valid HMR ngrok URL in .env",
            "hint": "Set COLAB_URL to the ngrok URL printed by colab_server.py, then restart Flask.",
        }), 503

    if "image" not in request.files:
        return jsonify({"error": "No image file provided"}), 400

    try:
        image_file = request.files["image"]
        files = {"image": (image_file.filename, image_file.stream, image_file.content_type)}
        form = {
            "height_cm": request.form.get("height_cm", ""),
            "weight_kg": request.form.get("weight_kg", ""),
        }
        if request.form.get("mp_ratios"):
            form["mp_ratios"] = request.form["mp_ratios"]

        r = http_requests.post(
            url + "/classify",
            files=files,
            data=form,
            headers={"ngrok-skip-browser-warning": "true"},
            timeout=180,
        )
        data = _json_or_error_response(r, "HMR Colab")
        return jsonify(data), r.status_code if r.status_code >= 400 else 200
    except Exception as e:
        return jsonify({"error": f"HMR Colab request failed: {e}"}), 502


# ═══════════════════════════════════════════
#  GAUSSIAN SPLATTING PROXY
# ═══════════════════════════════════════════

@app.route("/api/gaussian/status")
def gaussian_status():
    """Check whether the Gaussian Splatting Colab is reachable."""
    if not GAUSSIAN_URL:
        return jsonify({"available": False, "reason": "GAUSSIAN_COLAB_URL not set"})
    try:
        r = http_requests.get(GAUSSIAN_URL + "/status",
                              headers={"ngrok-skip-browser-warning": "true"}, timeout=6)
        data = r.json() if r.ok else {}
        output_ready = bool(data.get("available") or data.get("output_ready"))
        return jsonify({
            "available": r.ok and output_ready,
            "reachable": r.ok,
            "status": data.get("status", "unknown" if r.ok else "unreachable"),
            "stage": data.get("stage", ""),
            "message": data.get("message", ""),
            "error": data.get("error"),
            "job_id": data.get("job_id"),
            "output_ready": output_ready,
            "data": data,
        })
    except Exception as e:
        return jsonify({"available": False, "reason": str(e)})


@app.route("/api/gaussian/output.ply")
def gaussian_ply_proxy():
    """Proxy the latest Gaussian Splatting PLY output from the Colab notebook."""
    if not GAUSSIAN_URL:
        return jsonify({"error": "GAUSSIAN_COLAB_URL not configured"}), 503
    try:
        r = http_requests.get(GAUSSIAN_URL + "/output.ply",
                              headers={"ngrok-skip-browser-warning": "true"},
                              timeout=60, stream=True)
        if not r.ok:
            return jsonify({"error": "Gaussian Colab returned " + str(r.status_code)}), 502
        from flask import Response
        return Response(r.iter_content(chunk_size=8192),
                        content_type="application/octet-stream",
                        headers={"Content-Disposition": 'attachment; filename="gaussian_splat.ply"'})
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/gaussian/trigger", methods=["POST"])
def gaussian_trigger():
    """Forward a video file to the Gaussian Splatting Colab for processing."""
    if not GAUSSIAN_URL:
        return jsonify({"error": "GAUSSIAN_COLAB_URL not configured"}), 503
    if "video" not in request.files:
        return jsonify({"error": "No video file provided"}), 400
    try:
        video_file = request.files["video"]
        files = {"video": (video_file.filename, video_file.stream, video_file.content_type)}
        r = http_requests.post(GAUSSIAN_URL + "/process",
                               files=files,
                               headers={"ngrok-skip-browser-warning": "true"},
                               timeout=180)
        return jsonify(r.json() if r.ok else {"error": "Gaussian Colab error", "status": r.status_code}), r.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 502


# ═══════════════════════════════════════════
#  RUN
# ═══════════════════════════════════════════

if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"🏋️  FitScan running at: http://localhost:5050")
    print(f"📡  Colab API target:   {COLAB_URL}")
    print(f"🧊  Gaussian Colab:     {GAUSSIAN_URL or 'not configured'}")
    print(f"{'='*50}\n")
    app.run(host="0.0.0.0", port=5050, debug=True)
