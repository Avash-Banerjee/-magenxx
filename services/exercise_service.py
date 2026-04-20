"""
Exercise plan generation — pure rule engine, no Gemini.

Selects exercises from the 270-exercise database using:
  - Body type (Endo/Meso/Ecto) → sets, reps, rest time, compound priority
  - Goal (muscle_gain/fat_loss/general_fitness) → rep range, exercise type
  - Experience level → Beginner / Intermediate / Advanced filter
  - Equipment → modality filter (FW/C/M)
  - Target muscles → muscle group priority
  - Training days/week → split template (PPL, Full Body, Upper/Lower)
"""

import random
from collections import defaultdict

from services.exercise_data import (
    EXERCISE_DB, MUSCLE_GROUP_TAGS, TARGET_TO_MUSCLE_GROUPS,
    EQUIPMENT_MODALITY_MAP, BODYWEIGHT_EXERCISES, get_search_name,
)
from services.rule_engine import (
    BODY_TYPE_EXERCISE_RULES, GOAL_EXERCISE_TWEAKS, GENDER_EXERCISE_ADJUSTMENTS,
    WARMUPS, COOLDOWNS, EXERCISE_PLAN_SUMMARIES, WEEKLY_EXERCISE_NOTES,
    get_split_template, get_allowed_modalities,
    get_exercise_benefit, get_exercise_tip, get_estimated_duration,
    get_rest_day_content, _primary_goal,
)


# ─────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────

def generate_exercise_plan(user_data):
    """
    Generate a 7-day exercise plan using the rule engine.
    Returns JSON-serialisable dict matching the UI's expected structure.
    """
    profile  = user_data.get("profile", {}) or {}
    scan     = user_data.get("latest_scan", {}) or {}
    goals    = user_data.get("goals", []) or []
    muscles  = user_data.get("target_muscles", []) or []

    body_type  = scan.get("body_type", "Unknown")
    experience = profile.get("experience_level", "beginner")
    training_days = int(profile.get("training_days_per_week", 4))
    training_days = max(3, min(6, training_days))   # clamp 3–6
    equipment  = profile.get("equipment", []) or []
    gender     = (profile.get("gender") or "male").lower()
    gender_key = "female" if gender in ("female", "f") else "male"
    gender_adj = GENDER_EXERCISE_ADJUSTMENTS[gender_key]

    primary_goal  = _primary_goal(goals)
    bt_rules      = BODY_TYPE_EXERCISE_RULES.get(body_type, BODY_TYPE_EXERCISE_RULES["Unknown"])
    goal_tweaks   = GOAL_EXERCISE_TWEAKS.get(primary_goal, GOAL_EXERCISE_TWEAKS["general_fitness"])

    # Resolve rep range, then shift both ends by gender offset
    rep_range = goal_tweaks["rep_range_override"] or bt_rules["rep_range"]
    offset = gender_adj["rep_range_offset"]
    if offset:
        low, high = (int(x) for x in rep_range.split("-"))
        rep_range = f"{low + offset}-{high + offset}"

    # sets
    sets = bt_rules["sets"] + goal_tweaks["sets_bonus"]
    # rest — females recover faster; reduce rest by 15s
    rest_seconds = bt_rules["rest_seconds"]
    if gender_key == "female":
        rest_seconds = max(30, rest_seconds - 15)

    # Allowed modalities from equipment
    allowed_modalities = get_allowed_modalities(equipment)

    # Experience → allowed levels
    exp_levels = _get_allowed_levels(experience)

    # Target muscle groups (priority) + gender priority muscles merged
    priority_muscle_groups = _resolve_target_muscles(muscles) | gender_adj["priority_muscles"]

    # Day split template
    split_template = get_split_template(training_days)

    # Build exercise pool per split type
    exercise_pool = _build_exercise_pool(
        body_type, primary_goal, allowed_modalities, exp_levels,
        priority_muscle_groups, goal_tweaks, gender_adj
    )

    # Generate 7-day plan
    weekly_plan = []
    for day_num, (day_name, split_type, focus_label) in enumerate(split_template, start=1):
        if split_type == "rest":
            weekly_plan.append(_build_rest_day(day_name, day_num, body_type))
        else:
            day_exercises = _select_exercises_for_day(
                split_type, exercise_pool, sets, rep_range, rest_seconds,
                body_type, goals, experience, training_days, gender_adj
            )
            warmup  = WARMUPS.get(split_type, WARMUPS["full_body"])
            cooldown = COOLDOWNS.get(split_type, COOLDOWNS["full_body"])
            duration = get_estimated_duration(len(day_exercises), sets, rest_seconds)
            weekly_plan.append({
                "day":                   day_name,
                "day_number":            day_num,
                "is_rest_day":           False,
                "focus":                 focus_label,
                "warmup":                warmup,
                "exercises":             day_exercises,
                "cooldown":              cooldown,
                "estimated_duration_min": duration,
            })

    # Summary
    plan_summary = (
        EXERCISE_PLAN_SUMMARIES
        .get(body_type, EXERCISE_PLAN_SUMMARIES["Unknown"])
        .get(primary_goal, EXERCISE_PLAN_SUMMARIES["Unknown"]["general_fitness"])
    )
    weekly_notes = WEEKLY_EXERCISE_NOTES.get(body_type, WEEKLY_EXERCISE_NOTES["Unknown"])

    return {
        "plan_summary": plan_summary,
        "weekly_plan":  weekly_plan,
        "weekly_notes": weekly_notes,
    }


# ─────────────────────────────────────────────
#  INTERNAL HELPERS
# ─────────────────────────────────────────────

def _get_allowed_levels(experience):
    """Allow all levels up to and including the user's experience level."""
    order = ["Beginner", "Intermediate", "Advanced"]
    exp_map = {"beginner": "Beginner", "intermediate": "Intermediate", "advanced": "Advanced"}
    target = exp_map.get(experience.lower(), "Beginner")
    idx = order.index(target)
    return set(order[:idx + 1])


def _resolve_target_muscles(muscles):
    """Expand target muscle user-tags to actual muscle group names."""
    if not muscles:
        return set()
    resolved = set()
    for m in muscles:
        groups = TARGET_TO_MUSCLE_GROUPS.get(m.lower(), [])
        resolved.update(groups)
    return resolved


def _build_exercise_pool(body_type, primary_goal, allowed_modalities, exp_levels,
                         priority_muscle_groups, goal_tweaks, gender_adj=None):
    """
    Build a dict: split_type → list of filtered exercises.
    Exercises are sorted: priority muscles first, compound first for relevant body types.
    gender_adj adjusts isolation rules and adds score bonuses for gender-priority muscles.
    """
    if gender_adj is None:
        gender_adj = GENDER_EXERCISE_ADJUSTMENTS["male"]

    compound_only = goal_tweaks.get("compound_only", False)
    isolation_allowed = BODY_TYPE_EXERCISE_RULES.get(
        body_type, BODY_TYPE_EXERCISE_RULES["Unknown"]
    )["isolation_allowed"]

    # Gender override: females can always use isolation regardless of body type
    if gender_adj.get("isolation_allowed_override") is True:
        isolation_allowed = True

    pool = defaultdict(list)

    for ex in EXERCISE_DB:
        # Level filter
        if ex["level"] not in exp_levels:
            continue

        # Equipment / modality filter
        ex_modality = ex["modality"]
        if ex_modality not in allowed_modalities:
            if "FW" in allowed_modalities and ex["name"] in BODYWEIGHT_EXERCISES:
                pass  # allow bodyweight exercises with FW modality
            else:
                continue

        # Compound-only filter for muscle gain goals on Ectomorphs
        if compound_only and ex["joint_type"] == "S":
            continue
        if not isolation_allowed and ex["joint_type"] == "S":
            continue

        # Determine split category
        mg_tag = MUSCLE_GROUP_TAGS.get(ex["muscle_group"])
        if not mg_tag:
            continue
        split_cat = mg_tag["split"]  # push / pull / legs / core

        # Score for sorting (higher = better)
        score = 0
        if ex["muscle_group"] in priority_muscle_groups:
            score += 10
        # Extra bonus for gender-priority muscles (glutes/lower-body for females)
        if ex["muscle_group"] in gender_adj.get("priority_muscles", set()):
            score += gender_adj.get("priority_muscle_bonus", 0)
        if ex["joint_type"] == "M":                     # compound
            score += 3
        if body_type == "Ectomorph" and ex["joint_type"] == "M":
            score += 5
        if ex["level"] == "Intermediate":
            score += 1

        pool[split_cat].append((score, ex))

    # Sort each split by score descending
    sorted_pool = {}
    for split_cat, items in pool.items():
        items.sort(key=lambda x: x[0], reverse=True)
        sorted_pool[split_cat] = [ex for _, ex in items]

    # Full body uses all splits
    sorted_pool["full_body"] = (
        sorted_pool.get("push", []) +
        sorted_pool.get("pull", []) +
        sorted_pool.get("legs", []) +
        sorted_pool.get("core", [])
    )
    return sorted_pool


def _select_exercises_for_day(split_type, pool, sets, rep_range, rest_seconds,
                               body_type, goals, experience, training_days,
                               gender_adj=None):
    """
    Select exercises for a training day.

    Structure:
      - Main exercises from the day's split (push / pull / legs)
      - Core finishers appended at the end of EVERY training day
        Endo: 2 core finishers (metabolic + fat-burn focus)
        Meso: 2 core finishers (strength + stability)
        Ecto: 1 core finisher (minimise extra volume)
        Females get +1 core finisher on top of body-type default.
    """
    if gender_adj is None:
        gender_adj = GENDER_EXERCISE_ADJUSTMENTS["male"]

    target_n = _target_exercise_count(split_type, training_days, experience)

    if split_type == "full_body":
        # full_body already picks from core pool proportionally — no extra finishers needed
        exercises = _select_from_full_body(pool, target_n, body_type)
        core_finisher_count = 0
    else:
        # How many core finishers to tack on (body-type base + gender bonus)
        core_finisher_count = _core_finisher_count(body_type, gender_adj)
        main_n = target_n - core_finisher_count

        candidates = pool.get(split_type, [])
        _shuffle_equal_score_groups(candidates)
        exercises = candidates[:main_n]

    # ── Core finishers ──
    core_exercises = []
    if core_finisher_count > 0:
        core_pool = pool.get("core", [])
        used_main_names = {ex["name"] for ex in exercises}
        finisher_candidates = [ex for ex in core_pool if ex["name"] not in used_main_names]
        # Rotate by day seed so different core exercises appear each session
        random.shuffle(finisher_candidates)
        core_exercises = finisher_candidates[:core_finisher_count]

    all_exercises = exercises + core_exercises

    # ── Build exercise objects ──
    result = []
    for ex in all_exercises:
        rating, reason = get_exercise_benefit(ex, body_type, goals)
        tip = get_exercise_tip(ex["muscle_group"], body_type)
        # Core finishers use lighter sets / higher reps
        is_core = ex["muscle_group"].startswith("Abdominal")
        ex_sets = (3 if is_core else sets)
        ex_reps = ("15-20" if is_core else rep_range)
        ex_rest = (30 if is_core else rest_seconds)
        result.append({
            "name":           ex["name"],
            "search_name":    get_search_name(ex["name"]),
            "sets":           ex_sets,
            "reps":           ex_reps,
            "rest_seconds":   ex_rest,
            "muscle_groups":  _format_muscle_groups(ex["muscle_group"]),
            "tips":           tip,
            "benefit_rating": rating,
            "benefit_reason": reason,
        })
    return result


def _core_finisher_count(body_type, gender_adj=None):
    """How many core finisher exercises to append per session by body type + gender."""
    base = {"Endomorph": 2, "Mesomorph": 2, "Ectomorph": 1, "Unknown": 2}.get(body_type, 2)
    bonus = (gender_adj or {}).get("core_finisher_bonus", 0)
    return base + bonus


def _select_from_full_body(pool, target_n, body_type):
    """For full-body days: pick from push, pull, legs, core in proportion."""
    proportions = {
        "push": 0.30,
        "pull": 0.25,
        "legs": 0.30,
        "core": 0.15,
    }
    selected = []
    used_names = set()
    for cat, fraction in proportions.items():
        n = max(1, round(target_n * fraction))
        candidates = [ex for ex in pool.get(cat, []) if ex["name"] not in used_names]
        for ex in candidates[:n]:
            selected.append(ex)
            used_names.add(ex["name"])
    return selected[:target_n]


def _target_exercise_count(split_type, training_days, experience):
    """How many exercises per session."""
    base = {"push": 6, "pull": 6, "legs": 6, "full_body": 8, "core": 5}
    n = base.get(split_type, 6)
    if experience == "beginner":
        n = max(4, n - 1)
    elif experience == "advanced":
        n = min(9, n + 1)
    return n


def _shuffle_equal_score_groups(candidates):
    """Shuffle within tied-score groups for variety while preserving overall rank."""
    # The pool is already scored — just add light random noise within top-half
    mid = len(candidates) // 2
    if mid > 0:
        sub = candidates[:mid]
        random.shuffle(sub)
        candidates[:mid] = sub


def _build_rest_day(day_name, day_num, body_type):
    return {
        "day":                   day_name,
        "day_number":            day_num,
        "is_rest_day":           True,
        "focus":                 "Rest & Recovery",
        "warmup":                get_rest_day_content(body_type),
        "exercises":             [],
        "cooldown":              "Full-body static stretching + deep breathing (10 min). Prioritise 7–9 hours sleep tonight.",
        "estimated_duration_min": 30,
    }


def _format_muscle_groups(muscle_group_str):
    """Convert muscle group name to a short list."""
    mapping = {
        "Chest - Pectoralis":            ["chest"],
        "Back - Latissimus Dorsi":       ["back", "lats"],
        "Back - Lat.Dorsi/Rhomboids":    ["back", "rhomboids"],
        "Shoulders - Delts/Traps":       ["shoulders", "traps"],
        "Shoulders - Rotator Cuff":      ["shoulders", "rotator cuff"],
        "Biceps":                        ["biceps"],
        "Triceps":                       ["triceps"],
        "Legs - Quadriceps":             ["quads", "glutes"],
        "Legs - Hamstrings":             ["hamstrings", "glutes"],
        "Calves - Gastrocnemius":        ["calves"],
        "Calves - Soleus":               ["calves"],
        "Abdominals - Upper":            ["abs", "core"],
        "Abdominals - Lower":            ["lower abs", "core"],
        "Abdominals - Obliques":         ["obliques", "core"],
        "Abdominals - Total":            ["core", "abs"],
        "Lower Back - Erector Spinae":   ["lower back", "erectors"],
    }
    return mapping.get(muscle_group_str, [muscle_group_str.lower()])
