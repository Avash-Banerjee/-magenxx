"""
Database service — SQLite schema + CRUD operations for the FitScan app.
Auto-creates tables on first import.
"""

import sqlite3
import json
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "db", "health_app.db")


def get_db():
    """Get a database connection with row_factory for dict-like access."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            age INTEGER,
            gender TEXT,
            height_cm REAL,
            weight_kg REAL,
            experience_level TEXT,
            training_days_per_week INTEGER,
            preferred_time TEXT,
            equipment TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            goal_type TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS target_muscles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            muscle_group TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS diet_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            diet_type TEXT NOT NULL,
            indianize INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS scan_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            body_type TEXT,
            classification TEXT,
            endomorphy REAL,
            mesomorphy REAL,
            ectomorphy REAL,
            somatotype_rating TEXT,
            bmi REAL,
            pose_data TEXT,
            hmr_data TEXT,
            annotated_image TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS exercise_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            scan_id INTEGER,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            plan_data TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (scan_id) REFERENCES scan_results(id)
        );

        CREATE TABLE IF NOT EXISTS exercise_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            plan_id INTEGER NOT NULL,
            day_name TEXT,
            exercise_name TEXT,
            completed INTEGER DEFAULT 0,
            completed_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (plan_id) REFERENCES exercise_plans(id)
        );

        CREATE TABLE IF NOT EXISTS diet_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            scan_id INTEGER,
            generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            indianized INTEGER DEFAULT 0,
            plan_data TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (scan_id) REFERENCES scan_results(id)
        );
    """)

    # ── Migrations for existing databases ──
    migrations = [
        "ALTER TABLE users ADD COLUMN email TEXT",
        "ALTER TABLE users ADD COLUMN password_hash TEXT",
        "ALTER TABLE profiles ADD COLUMN target_weight REAL",
        "ALTER TABLE profiles ADD COLUMN minutes_per_session INTEGER",
    ]
    for sql in migrations:
        try:
            conn.execute(sql)
        except Exception:
            pass
    try:
        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    except Exception:
        pass

    conn.commit()
    conn.close()


# ═══════════════════════════════════════
#  USER CRUD
# ═══════════════════════════════════════

def create_user(name, email, password_hash):
    """Create a new user with email and hashed password. Returns user dict."""
    conn = get_db()
    try:
        cur = conn.execute(
            "INSERT INTO users (name, email, password_hash, last_login) VALUES (?, ?, ?, ?)",
            (name.strip(), email.strip().lower(), password_hash, datetime.now().isoformat()),
        )
        conn.commit()
        user_id = cur.lastrowid
        user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
        conn.close()
        return user
    except sqlite3.IntegrityError:
        conn.close()
        return None


def get_user_by_email(email):
    """Get user by email. Returns user dict with password_hash, or None."""
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_or_get_user(name):
    """Create a user if not exists, or return existing. Returns user dict."""
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE name = ?", (name.strip(),)).fetchone()
    if row:
        conn.execute("UPDATE users SET last_login = ? WHERE id = ?",
                      (datetime.now().isoformat(), row["id"]))
        conn.commit()
        user_id = row["id"]
    else:
        cur = conn.execute("INSERT INTO users (name, last_login) VALUES (?, ?)",
                           (name.strip(), datetime.now().isoformat()))
        conn.commit()
        user_id = cur.lastrowid

    user = dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())
    conn.close()
    return user


def get_user(user_id):
    """Get user by ID."""
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


# ═══════════════════════════════════════
#  PROFILE CRUD
# ═══════════════════════════════════════

def save_profile(user_id, data):
    """Save or update user profile. data is a dict with profile fields."""
    conn = get_db()
    existing = conn.execute("SELECT id FROM profiles WHERE user_id = ?", (user_id,)).fetchone()

    equipment_json = json.dumps(data.get("equipment", []))

    if existing:
        conn.execute("""
            UPDATE profiles SET age=?, gender=?, height_cm=?, weight_kg=?,
            experience_level=?, training_days_per_week=?, preferred_time=?, equipment=?,
            target_weight=?, minutes_per_session=?
            WHERE user_id=?
        """, (data.get("age"), data.get("gender"), data.get("height_cm"),
              data.get("weight_kg"), data.get("experience_level"),
              data.get("training_days_per_week"), data.get("preferred_time"),
              equipment_json, data.get("target_weight"), data.get("minutes_per_session"),
              user_id))
    else:
        conn.execute("""
            INSERT INTO profiles (user_id, age, gender, height_cm, weight_kg,
            experience_level, training_days_per_week, preferred_time, equipment,
            target_weight, minutes_per_session)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (user_id, data.get("age"), data.get("gender"), data.get("height_cm"),
              data.get("weight_kg"), data.get("experience_level"),
              data.get("training_days_per_week"), data.get("preferred_time"),
              equipment_json, data.get("target_weight"), data.get("minutes_per_session")))

    conn.commit()
    conn.close()


def get_profile(user_id):
    """Get user profile as dict. Returns None if not set."""
    conn = get_db()
    row = conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    profile = dict(row)
    profile["equipment"] = json.loads(profile.get("equipment") or "[]")
    return profile


# ═══════════════════════════════════════
#  GOALS
# ═══════════════════════════════════════

def save_goals(user_id, goal_types):
    """Replace user's goals with new list."""
    conn = get_db()
    conn.execute("DELETE FROM goals WHERE user_id = ?", (user_id,))
    for g in goal_types:
        conn.execute("INSERT INTO goals (user_id, goal_type) VALUES (?, ?)", (user_id, g))
    conn.commit()
    conn.close()


def get_goals(user_id):
    """Get list of goal_type strings."""
    conn = get_db()
    rows = conn.execute("SELECT goal_type FROM goals WHERE user_id = ?", (user_id,)).fetchall()
    conn.close()
    return [r["goal_type"] for r in rows]


# ═══════════════════════════════════════
#  TARGET MUSCLES
# ═══════════════════════════════════════

def save_target_muscles(user_id, muscles):
    """Replace user's target muscles with new list."""
    conn = get_db()
    conn.execute("DELETE FROM target_muscles WHERE user_id = ?", (user_id,))
    for m in muscles:
        conn.execute("INSERT INTO target_muscles (user_id, muscle_group) VALUES (?, ?)",
                     (user_id, m))
    conn.commit()
    conn.close()


def get_target_muscles(user_id):
    """Get list of muscle_group strings."""
    conn = get_db()
    rows = conn.execute("SELECT muscle_group FROM target_muscles WHERE user_id = ?",
                        (user_id,)).fetchall()
    conn.close()
    return [r["muscle_group"] for r in rows]


# ═══════════════════════════════════════
#  DIET PREFERENCES
# ═══════════════════════════════════════

def save_diet_preferences(user_id, diet_type, indianize=False):
    """Save or update diet preferences."""
    conn = get_db()
    existing = conn.execute("SELECT id FROM diet_preferences WHERE user_id = ?",
                            (user_id,)).fetchone()
    if existing:
        conn.execute("UPDATE diet_preferences SET diet_type=?, indianize=? WHERE user_id=?",
                     (diet_type, int(indianize), user_id))
    else:
        conn.execute("INSERT INTO diet_preferences (user_id, diet_type, indianize) VALUES (?,?,?)",
                     (user_id, diet_type, int(indianize)))
    conn.commit()
    conn.close()


def get_diet_preferences(user_id):
    """Get diet preferences as dict."""
    conn = get_db()
    row = conn.execute("SELECT * FROM diet_preferences WHERE user_id = ?",
                       (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["indianize"] = bool(d.get("indianize", 0))
    return d


# ═══════════════════════════════════════
#  SCAN RESULTS
# ═══════════════════════════════════════

def save_scan_result(user_id, scan_data):
    """Save a body scan result. scan_data is a dict."""
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO scan_results (user_id, body_type, classification,
        endomorphy, mesomorphy, ectomorphy, somatotype_rating, bmi,
        pose_data, hmr_data, annotated_image)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        scan_data.get("body_type"),
        scan_data.get("classification"),
        scan_data.get("endomorphy"),
        scan_data.get("mesomorphy"),
        scan_data.get("ectomorphy"),
        scan_data.get("somatotype_rating"),
        scan_data.get("bmi"),
        json.dumps(scan_data.get("pose_data", {})),
        json.dumps(scan_data.get("hmr_data", {})),
        scan_data.get("annotated_image", ""),
    ))
    conn.commit()
    scan_id = cur.lastrowid
    conn.close()
    return scan_id


def get_latest_scan(user_id):
    """Get the most recent scan result for a user."""
    conn = get_db()
    row = conn.execute("""
        SELECT * FROM scan_results WHERE user_id = ?
        ORDER BY scanned_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    scan = dict(row)
    scan["pose_data"] = json.loads(scan.get("pose_data") or "{}")
    scan["hmr_data"] = json.loads(scan.get("hmr_data") or "{}")
    return scan


def get_scan_history(user_id):
    """Get all scans for a user, newest first."""
    conn = get_db()
    rows = conn.execute("""
        SELECT id, scanned_at, body_type, classification, endomorphy, mesomorphy,
        ectomorphy, somatotype_rating, bmi FROM scan_results
        WHERE user_id = ? ORDER BY scanned_at DESC
    """, (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_scan_by_id(scan_id):
    """Get a specific scan by ID."""
    conn = get_db()
    row = conn.execute("SELECT * FROM scan_results WHERE id = ?", (scan_id,)).fetchone()
    conn.close()
    if not row:
        return None
    scan = dict(row)
    scan["pose_data"] = json.loads(scan.get("pose_data") or "{}")
    scan["hmr_data"] = json.loads(scan.get("hmr_data") or "{}")
    return scan


# ═══════════════════════════════════════
#  EXERCISE PLANS
# ═══════════════════════════════════════

def save_exercise_plan(user_id, scan_id, plan_data):
    """Save a generated exercise plan. plan_data is a dict (Gemini response)."""
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO exercise_plans (user_id, scan_id, plan_data) VALUES (?, ?, ?)
    """, (user_id, scan_id, json.dumps(plan_data)))
    conn.commit()
    plan_id = cur.lastrowid
    conn.close()
    return plan_id


def get_latest_exercise_plan(user_id):
    """Get the most recent exercise plan."""
    conn = get_db()
    row = conn.execute("""
        SELECT * FROM exercise_plans WHERE user_id = ?
        ORDER BY generated_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    plan = dict(row)
    plan["plan_data"] = json.loads(plan.get("plan_data") or "{}")
    return plan


def log_exercise(user_id, plan_id, day_name, exercise_name, completed=True):
    """Log an exercise as completed."""
    conn = get_db()
    existing = conn.execute("""
        SELECT id FROM exercise_log
        WHERE user_id=? AND plan_id=? AND day_name=? AND exercise_name=?
    """, (user_id, plan_id, day_name, exercise_name)).fetchone()

    if existing:
        conn.execute("""
            UPDATE exercise_log SET completed=?, completed_at=? WHERE id=?
        """, (int(completed), datetime.now().isoformat() if completed else None,
              existing["id"]))
    else:
        conn.execute("""
            INSERT INTO exercise_log (user_id, plan_id, day_name, exercise_name, completed, completed_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, plan_id, day_name, exercise_name, int(completed),
              datetime.now().isoformat() if completed else None))

    conn.commit()
    conn.close()


def get_exercise_log(user_id, plan_id):
    """Get all exercise log entries for a plan."""
    conn = get_db()
    rows = conn.execute("""
        SELECT * FROM exercise_log WHERE user_id=? AND plan_id=?
    """, (user_id, plan_id)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_today_exercise_stats(user_id):
    """Get today's completed exercises and estimate calories burned.

    Calorie estimation per exercise (MET-based approximation):
    - Compound lifts (bench, squat, deadlift): ~8-10 cal per set
    - Isolation exercises: ~5-7 cal per set
    - Cardio/HIIT exercises: ~12-15 cal per set
    - Default: ~7 cal per set
    We estimate ~4 sets average per exercise.
    """
    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_db()

    # Get today's completed exercises
    rows = conn.execute("""
        SELECT el.exercise_name, el.day_name, el.completed_at
        FROM exercise_log el
        WHERE el.user_id = ? AND el.completed = 1
        AND date(el.completed_at) = ?
    """, (user_id, today)).fetchall()

    # Also get the plan data to find sets/reps info
    plan = conn.execute("""
        SELECT plan_data FROM exercise_plans
        WHERE user_id = ? ORDER BY generated_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    conn.close()

    completed_exercises = [dict(r) for r in rows]
    total_completed = len(completed_exercises)

    # Build exercise lookup from plan
    exercise_details = {}
    total_plan_exercises_today = 0
    if plan:
        plan_data = json.loads(plan["plan_data"] or "{}")
        today_day = datetime.now().strftime("%A")  # "Monday", "Tuesday", etc.
        for day in plan_data.get("weekly_plan", []):
            if day.get("day", "").lower() == today_day.lower():
                for ex in day.get("exercises", []):
                    exercise_details[ex.get("name", "")] = ex
                total_plan_exercises_today = len(day.get("exercises", []))
                break

    # Estimate calories
    HIGH_CAL_KEYWORDS = ["squat", "deadlift", "bench", "press", "row", "pull-up", "clean", "snatch", "lunge"]
    CARDIO_KEYWORDS = ["run", "jog", "jump", "burpee", "sprint", "hiit", "cardio", "cycling", "skip"]

    total_calories = 0
    for ex in completed_exercises:
        name = ex.get("exercise_name", "").lower()
        detail = exercise_details.get(ex.get("exercise_name", ""), {})
        sets = detail.get("sets", 4)

        if any(k in name for k in CARDIO_KEYWORDS):
            cal_per_set = 13
        elif any(k in name for k in HIGH_CAL_KEYWORDS):
            cal_per_set = 9
        else:
            cal_per_set = 7

        total_calories += sets * cal_per_set

    return {
        "total_completed": total_completed,
        "total_plan_today": total_plan_exercises_today,
        "calories_burned": total_calories,
        "exercises": [e.get("exercise_name", "") for e in completed_exercises],
    }


# ═══════════════════════════════════════
#  DIET PLANS
# ═══════════════════════════════════════

def save_diet_plan(user_id, scan_id, plan_data, indianized=False):
    """Save a generated diet plan."""
    conn = get_db()
    cur = conn.execute("""
        INSERT INTO diet_plans (user_id, scan_id, indianized, plan_data) VALUES (?, ?, ?, ?)
    """, (user_id, scan_id, int(indianized), json.dumps(plan_data)))
    conn.commit()
    plan_id = cur.lastrowid
    conn.close()
    return plan_id


def get_latest_diet_plan(user_id):
    """Get the most recent diet plan."""
    conn = get_db()
    row = conn.execute("""
        SELECT * FROM diet_plans WHERE user_id = ?
        ORDER BY generated_at DESC LIMIT 1
    """, (user_id,)).fetchone()
    conn.close()
    if not row:
        return None
    plan = dict(row)
    plan["plan_data"] = json.loads(plan.get("plan_data") or "{}")
    return plan


# ═══════════════════════════════════════
#  FULL USER DATA (for Gemini prompts)
# ═══════════════════════════════════════

def get_full_user_data(user_id):
    """Get everything about a user in one call — for building Gemini prompts."""
    user = get_user(user_id)
    if not user:
        return None
    return {
        "user": user,
        "profile": get_profile(user_id),
        "goals": get_goals(user_id),
        "target_muscles": get_target_muscles(user_id),
        "diet_preferences": get_diet_preferences(user_id),
        "latest_scan": get_latest_scan(user_id),
    }


# Initialize on import
init_db()
