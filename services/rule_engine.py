"""
Rule Engine — deterministic plan generation without any AI API.

Covers:
  1. BMR / TDEE calculation
  2. Macro targets by body type + goal
  3. Exercise selection rules (body type, goal, experience, equipment, muscles)
  4. Diet plan selection rules (body type, goal, diet type, indian flag)
  5. Report / explanation generation
"""

import math
import random
from collections import defaultdict


# ─────────────────────────────────────────────
#  1. CALORIE CALCULATIONS
# ─────────────────────────────────────────────

def calculate_bmr(weight_kg, height_cm, age, gender):
    """Mifflin-St Jeor BMR formula."""
    if gender.lower() in ("male", "m"):
        return 10 * weight_kg + 6.25 * height_cm - 5 * age + 5
    else:
        return 10 * weight_kg + 6.25 * height_cm - 5 * age - 161


def calculate_tdee(bmr, activity_level="moderate"):
    multipliers = {
        "sedentary":    1.2,
        "light":        1.375,
        "moderate":     1.55,
        "active":       1.725,
        "very_active":  1.9,
    }
    return bmr * multipliers.get(activity_level, 1.55)


def apply_goal_adjustment(tdee, goals):
    """Apply calorie surplus/deficit based on goals."""
    if any(g in goals for g in ["muscle_gain", "bulking", "gain_weight"]):
        return round(tdee + 400)
    if any(g in goals for g in ["fat_loss", "weight_loss", "cutting", "lose_weight"]):
        return round(tdee - 500)
    return round(tdee)  # maintenance


# ─────────────────────────────────────────────
#  2. MACRO TARGETS
#  Source: ISSN guidelines + Diet and Nutrition.xlsx somatotype splits
# ─────────────────────────────────────────────

# Macro ratios: (carbs%, protein%, fats%) per body type
MACRO_RATIOS = {
    "Endomorph":  {"carbs_pct": 35, "protein_pct": 35, "fats_pct": 30},
    "Mesomorph":  {"carbs_pct": 40, "protein_pct": 30, "fats_pct": 30},
    "Ectomorph":  {"carbs_pct": 50, "protein_pct": 25, "fats_pct": 25},
    "Unknown":    {"carbs_pct": 40, "protein_pct": 30, "fats_pct": 30},
}

# Goal-based tweaks to macro ratios (deltas applied on top)
GOAL_MACRO_TWEAKS = {
    "muscle_gain": {"carbs_pct": +5,  "protein_pct": +5,  "fats_pct": -10},
    "fat_loss":    {"carbs_pct": -5,  "protein_pct": +5,  "fats_pct": 0},
    "general_fitness": {"carbs_pct": 0, "protein_pct": 0, "fats_pct": 0},
}

# Gender-based macro adjustments (applied after goal tweaks).
# Research basis: females oxidise proportionally more fat during aerobic exercise
# (Tarnopolsky 2000, Venables 2005) → slightly lower carb %, higher healthy fat %.
# Absolute protein need is similar per kg, so protein % stays the same.
GENDER_MACRO_TWEAKS = {
    "female": {"carbs_pct": -3, "protein_pct": 0, "fats_pct": +3},
    "male":   {"carbs_pct":  0, "protein_pct": 0, "fats_pct":  0},
}

# Gender-based exercise adjustments
# Research basis: females have more slow-twitch muscle fibre proportion → respond
# better to higher rep ranges; recover faster between sets; benefit from extra
# core/glute work for pelvic stability (Staron 2000, Hunter 2004).
GENDER_EXERCISE_ADJUSTMENTS = {
    "female": {
        "rep_range_offset":           3,     # add to both ends: "8-12" → "11-15"
        "core_finisher_bonus":        1,     # +1 core exercise per session
        "isolation_allowed_override": True,  # allow isolation even for Ectomorph
        "priority_muscle_bonus":      4,     # extra score for glute/lower-body muscles
        "priority_muscles": {
            "Legs - Quadriceps", "Legs - Hamstrings",
            "Abdominals - Total", "Abdominals - Lower", "Abdominals - Obliques",
        },
    },
    "male": {
        "rep_range_offset":           0,
        "core_finisher_bonus":        0,
        "isolation_allowed_override": None,  # respect body-type default
        "priority_muscle_bonus":      0,
        "priority_muscles":           set(),
    },
}


def get_macro_targets(daily_calories, body_type, goals, weight_kg, gender="male"):
    ratios = MACRO_RATIOS.get(body_type, MACRO_RATIOS["Unknown"]).copy()

    # Apply goal tweaks
    primary_goal = _primary_goal(goals)
    tweaks = GOAL_MACRO_TWEAKS.get(primary_goal, GOAL_MACRO_TWEAKS["general_fitness"])
    ratios["carbs_pct"]   = max(20, min(60, ratios["carbs_pct"]   + tweaks["carbs_pct"]))
    ratios["protein_pct"] = max(20, min(50, ratios["protein_pct"] + tweaks["protein_pct"]))
    ratios["fats_pct"]    = max(15, min(40, ratios["fats_pct"]    + tweaks["fats_pct"]))

    # Apply gender tweaks
    gender_key = "female" if str(gender).lower() in ("female", "f") else "male"
    g_tweaks = GENDER_MACRO_TWEAKS[gender_key]
    ratios["carbs_pct"]   = max(20, min(60, ratios["carbs_pct"]   + g_tweaks["carbs_pct"]))
    ratios["protein_pct"] = max(20, min(50, ratios["protein_pct"] + g_tweaks["protein_pct"]))
    ratios["fats_pct"]    = max(15, min(40, ratios["fats_pct"]    + g_tweaks["fats_pct"]))

    # Normalise to 100%
    total = ratios["carbs_pct"] + ratios["protein_pct"] + ratios["fats_pct"]
    ratios = {k: round(v / total * 100) for k, v in ratios.items()}

    # Gram amounts (protein=4 cal/g, carbs=4 cal/g, fats=9 cal/g)
    protein_g = round(daily_calories * ratios["protein_pct"] / 100 / 4)
    carbs_g   = round(daily_calories * ratios["carbs_pct"]   / 100 / 4)
    fats_g    = round(daily_calories * ratios["fats_pct"]    / 100 / 9)

    protein_per_kg = round(protein_g / weight_kg, 2) if weight_kg else 0

    return {
        "protein_g":   protein_g,
        "carbs_g":     carbs_g,
        "fats_g":      fats_g,
        "protein_pct": ratios["protein_pct"],
        "carbs_pct":   ratios["carbs_pct"],
        "fats_pct":    ratios["fats_pct"],
        "protein_per_kg": protein_per_kg,
    }


# ─────────────────────────────────────────────
#  3. EXERCISE RULES
# ─────────────────────────────────────────────

BODY_TYPE_EXERCISE_RULES = {
    "Endomorph": {
        "sets": 4,
        "rep_range": "12-15",
        "rest_seconds": 45,
        "cardio": True,
        "hiit": True,
        "compound_priority": True,
        "isolation_allowed": True,
        "weekly_focus": "Calorie burn + metabolic conditioning",
        "tips_suffix": "Keep rest periods short (45–60s) to maximise calorie burn and metabolic stress.",
    },
    "Mesomorph": {
        "sets": 4,
        "rep_range": "8-12",
        "rest_seconds": 75,
        "cardio": "moderate",
        "hiit": False,
        "compound_priority": True,
        "isolation_allowed": True,
        "weekly_focus": "Progressive overload + muscle hypertrophy",
        "tips_suffix": "Focus on progressive overload — add small weight or reps each week.",
    },
    "Ectomorph": {
        "sets": 3,
        "rep_range": "5-8",
        "rest_seconds": 120,
        "cardio": False,
        "hiit": False,
        "compound_priority": True,
        "isolation_allowed": False,
        "weekly_focus": "Strength + mass gain with heavy compound lifts",
        "tips_suffix": "Rest 90–120s between sets. Prioritise compound lifts, minimize cardio.",
    },
    "Unknown": {
        "sets": 4,
        "rep_range": "10-12",
        "rest_seconds": 75,
        "cardio": "moderate",
        "hiit": False,
        "compound_priority": True,
        "isolation_allowed": True,
        "weekly_focus": "General fitness and body composition",
        "tips_suffix": "Work consistently and adjust based on how your body responds.",
    },
}

GOAL_EXERCISE_TWEAKS = {
    "muscle_gain": {
        "rep_range_override": None,   # use body type default
        "sets_bonus": +1,
        "compound_only": True,
        "cardio_reduce": True,
    },
    "fat_loss": {
        "rep_range_override": "12-15",
        "sets_bonus": 0,
        "compound_only": False,
        "cardio_reduce": False,
    },
    "general_fitness": {
        "rep_range_override": None,
        "sets_bonus": 0,
        "compound_only": False,
        "cardio_reduce": False,
    },
}

# Exercise benefit ratings: muscle_group + body_type + goal → rating + reason
EXERCISE_BENEFIT_RULES = {
    # Compound multi-joint exercises — always high benefit
    "compound_high_body_types": ["Endomorph", "Mesomorph", "Ectomorph"],
    "compound_exercises": {
        "Barbell Bench Press", "Incline Barbell Bench Press", "Incline Dumbbell Bench Press",
        "Dumbbell Bench Press", "Barbell Squat", "Deadlift", "Romanian Deadlift",
        "Pull-Up", "Bent-Over Barbell Row", "Bent-Over Dumbbell Row",
        "Barbell Shoulder Press", "Overhead Press", "Military Press",
        "Bulgarian Split Squat", "Barbell Lunge", "Dips", "Lat Pulldown",
        "Push Press", "Front Squat", "Trap Bar Deadlift", "Close-Grip Bench Press",
        "T-Bar Row", "Cable Row", "Goblet Squat", "Leg Press",
    },
    # Endomorph bonus exercises (high calorie burn, compound)
    "endomorph_high": {
        "Jump Squat", "Walking Lunge", "Jumping Lunge", "Barbell Squat",
        "Deadlift", "Pull-Up", "Bent-Over Barbell Row", "Dips",
        "Romanian Deadlift", "Barbell Lunge", "Push-Up",
    },
    # Ectomorph high benefit (heavy compound, mass builders)
    "ectomorph_high": {
        "Barbell Squat", "Deadlift", "Barbell Bench Press", "Military Press",
        "Bent-Over Barbell Row", "Overhead Press", "Front Squat",
        "Close-Grip Bench Press", "Romanian Deadlift", "Weighted Dip",
        "Chin-Up", "Trap Bar Deadlift",
    },
}

EXERCISE_TIPS = {
    "Chest - Pectoralis": "Keep shoulder blades retracted and chest up throughout the movement.",
    "Back - Latissimus Dorsi": "Drive elbows toward hips, not hands. Imagine pulling through your elbows.",
    "Back - Lat.Dorsi/Rhomboids": "Squeeze shoulder blades together at the top of each rep.",
    "Shoulders - Delts/Traps": "Avoid shrugging — keep traps relaxed and focus on the delts.",
    "Biceps": "Keep elbows pinned to your sides. Supinate wrists at the top for full contraction.",
    "Triceps": "Lock elbows in place and use only the elbow joint to extend. Control the negative.",
    "Legs - Quadriceps": "Drive through the heel, keep knees tracking over toes throughout.",
    "Legs - Hamstrings": "Maintain a neutral spine — hinge at the hip, not the lower back.",
    "Abdominals - Upper": "Exhale forcefully at the top of each crunch. Never pull on your neck.",
    "Abdominals - Lower": "Tilt your pelvis posteriorly before lifting. Avoid hip flexor dominance.",
    "Abdominals - Obliques": "Rotate the torso — don't just move the elbow.",
    "Abdominals - Total": "Brace your core as if bracing for a punch. Breathe steadily.",
    "Calves - Gastrocnemius": "Full range of motion — stretch at the bottom, squeeze at the top.",
    "Calves - Soleus": "Bend the knee slightly to shift focus to the soleus rather than gastrocnemius.",
    "Lower Back - Erector Spinae": "Neutral spine always. Hyperextension is fine but avoid compressing.",
    "Shoulders - Rotator Cuff": "Slow, controlled movement. This is injury prevention — no heavy loading.",
}


# ─────────────────────────────────────────────
#  4. TRAINING SPLIT TEMPLATES
# ─────────────────────────────────────────────

# Day split patterns: maps training days/week → day templates
# Each template lists (day_name, split_type, focus_label)
TRAINING_SPLITS = {
    3: [
        ("Monday",    "full_body", "Full Body A"),
        ("Tuesday",   "rest",      "Rest & Recovery"),
        ("Wednesday", "full_body", "Full Body B"),
        ("Thursday",  "rest",      "Rest & Recovery"),
        ("Friday",    "full_body", "Full Body C"),
        ("Saturday",  "rest",      "Rest & Recovery"),
        ("Sunday",    "rest",      "Rest & Recovery"),
    ],
    4: [
        ("Monday",    "push",      "Push (Chest, Shoulders, Triceps)"),
        ("Tuesday",   "pull",      "Pull (Back, Biceps)"),
        ("Wednesday", "rest",      "Rest & Recovery"),
        ("Thursday",  "legs",      "Legs (Quads, Hamstrings, Calves)"),
        ("Friday",    "push",      "Push (Chest, Shoulders, Triceps)"),
        ("Saturday",  "rest",      "Rest & Recovery"),
        ("Sunday",    "rest",      "Rest & Recovery"),
    ],
    5: [
        ("Monday",    "push",      "Push (Chest, Shoulders, Triceps)"),
        ("Tuesday",   "pull",      "Pull (Back, Biceps)"),
        ("Wednesday", "legs",      "Legs (Quads, Hamstrings, Calves)"),
        ("Thursday",  "push",      "Push + Core"),
        ("Friday",    "pull",      "Pull + Core"),
        ("Saturday",  "legs",      "Legs + Cardio"),
        ("Sunday",    "rest",      "Rest & Recovery"),
    ],
    6: [
        ("Monday",    "push",      "Push (Chest, Shoulders, Triceps)"),
        ("Tuesday",   "pull",      "Pull (Back, Biceps)"),
        ("Wednesday", "legs",      "Legs (Quads, Hamstrings, Calves)"),
        ("Thursday",  "push",      "Push (Chest, Shoulders, Triceps)"),
        ("Friday",    "pull",      "Pull (Back, Biceps)"),
        ("Saturday",  "legs",      "Legs + Core"),
        ("Sunday",    "rest",      "Rest & Recovery"),
    ],
}

# Fall-back for days not covered
def get_split_template(training_days):
    closest = min(TRAINING_SPLITS.keys(), key=lambda k: abs(k - training_days))
    return TRAINING_SPLITS[closest]


# ─────────────────────────────────────────────
#  5. EQUIPMENT FILTER
# ─────────────────────────────────────────────

def get_allowed_modalities(equipment):
    """Return modality codes (FW/C/M) that are available with given equipment."""
    if not equipment:
        return {"FW"}   # bodyweight default
    eq_lower = [e.lower() for e in equipment]
    if "gym" in eq_lower or "full gym" in eq_lower:
        return {"FW", "C", "M"}
    modalities = {"FW"}  # FW is always base (dumbbells, barbells, bodyweight)
    if any(e in eq_lower for e in ["cable", "cables", "cable machine"]):
        modalities.add("C")
    if any(e in eq_lower for e in ["machine", "machines", "gym machines"]):
        modalities.add("M")
    return modalities


# ─────────────────────────────────────────────
#  6. WARMUP / COOLDOWN TEMPLATES
# ─────────────────────────────────────────────

WARMUPS = {
    "push": "5 min light cardio + arm circles (20 each direction) + band pull-aparts (3×15) + empty bar bench press (2×10)",
    "pull": "5 min light cardio + shoulder dislocates with band + scapular pull-ups (2×10) + face pulls with light band (2×15)",
    "legs": "5 min bike/treadmill + leg swings (20 each) + bodyweight squats (2×15) + hip circles + ankle rotations",
    "full_body": "5 min light cardio + dynamic stretching (leg swings, arm circles) + joint mobility rotations",
    "core": "2 min light jog/jump rope + cat-cow stretch (10 reps) + dead bug (10 reps each side)",
    "rest": "15–20 min walk + full-body static stretching (hold 30s each muscle) or yoga",
}

COOLDOWNS = {
    "push": "Chest doorway stretch (30s each) + tricep overhead stretch (30s each) + shoulder cross-body stretch + 5 min walk",
    "pull": "Lat stretch at pull-up bar (30s) + bicep wall stretch (30s each) + thoracic rotation + 5 min walk",
    "legs": "Standing quad stretch (30s each) + lying hamstring stretch + pigeon pose (30s each side) + calf stretch",
    "full_body": "5 min walk + full-body static stretches covering all trained muscle groups (30s each hold)",
    "core": "Child pose (30s) + cobra stretch (20s) + supine spinal twist (30s each side)",
    "rest": "Deep breathing + foam rolling if available",
}


# ─────────────────────────────────────────────
#  7. PLAN SUMMARY TEMPLATES
# ─────────────────────────────────────────────

EXERCISE_PLAN_SUMMARIES = {
    "Endomorph": {
        "muscle_gain": "A high-frequency compound lifting program with short rest periods to maximise calorie burn while building lean muscle — designed for Endomorphs looking to recompose their body.",
        "fat_loss": "A metabolic conditioning program combining compound movements, supersets, and HIIT-style intervals — optimised to accelerate fat loss for your Endomorph metabolism.",
        "general_fitness": "A well-rounded program with moderate reps and compound focus, designed to improve cardiovascular fitness and muscle tone for the Endomorph body type.",
    },
    "Mesomorph": {
        "muscle_gain": "A progressive overload program built around compound lifts with isolation work — capitalising on the Mesomorph's natural muscle-building potential.",
        "fat_loss": "A body recomposition program balancing heavy compounds with moderate cardio — Mesomorphs respond excellently to this dual approach.",
        "general_fitness": "A balanced hypertrophy and strength program built for your Mesomorph genetics — expect consistent, steady results with this well-rounded plan.",
    },
    "Ectomorph": {
        "muscle_gain": "A strength-focused low-volume, high-intensity program emphasising heavy compound lifts — the proven approach for Ectomorphs to gain quality mass.",
        "fat_loss": "A strength maintenance program with minimal cardio — Ectomorphs rarely need fat loss emphasis, so this program preserves hard-earned muscle.",
        "general_fitness": "A compound-first program focused on building a solid strength foundation — ideal for Ectomorphs entering structured training.",
    },
    "Unknown": {
        "general_fitness": "A balanced full-body program with compound movements and moderate intensity — designed for general health and fitness improvement.",
        "muscle_gain": "A structured hypertrophy program with compound and isolation work — great starting point for building muscle.",
        "fat_loss": "A calorie-burning program combining compound lifts and conditioning — effective for fat loss while preserving muscle.",
    },
}

DIET_PLAN_SUMMARIES = {
    "Endomorph": {
        "muscle_gain": "A controlled surplus plan with lower carb ratios (35C/35P/30F) — enough fuel to build muscle without triggering the Endomorph tendency to store excess calories as fat.",
        "fat_loss": "A strategic calorie deficit with high protein and low simple carbs — designed to shrink fat stores while protecting muscle mass in Endomorphs.",
        "general_fitness": "A clean, structured eating plan with controlled carbs and high protein — helps Endomorphs stay lean while maintaining energy levels.",
    },
    "Mesomorph": {
        "muscle_gain": "A moderate surplus with balanced macros (40C/30P/30F) — perfectly aligned with the Mesomorph's efficient nutrient partitioning for muscle growth.",
        "fat_loss": "A mild deficit with high protein to preserve the Mesomorph's muscle while shedding fat — expect clean, consistent results.",
        "general_fitness": "A balanced nutritional plan matching the Mesomorph's adaptive metabolism — supports both performance and aesthetics.",
    },
    "Ectomorph": {
        "muscle_gain": "A high-calorie surplus with elevated carbs (50C/25P/25F) — Ectomorphs must eat more than they think to overcome their fast metabolism and build mass.",
        "fat_loss": "A maintenance plan for Ectomorphs who rarely need to cut — focus is on nutrient density and preventing muscle catabolism.",
        "general_fitness": "A calorie-sufficient plan emphasising frequent meals and calorie-dense whole foods to support the Ectomorph's fast metabolic rate.",
    },
    "Unknown": {
        "general_fitness": "A well-rounded nutritional plan with balanced macros — provides adequate fuel for training and recovery.",
        "muscle_gain": "A moderate calorie surplus with ample protein — supports muscle building for any body type.",
        "fat_loss": "A structured calorie deficit with high protein — effective for fat loss while preserving lean mass.",
    },
}

WEEKLY_EXERCISE_NOTES = {
    "Endomorph": "Stay active on rest days with walking (8,000–10,000 steps). Avoid skipping sessions — consistency is especially important for Endomorph metabolism. Monitor your rest periods; keeping them under 60 seconds amplifies the calorie-burning effect.",
    "Mesomorph": "Track progressive overload — aim to add 2.5–5kg or 1–2 reps per week on key lifts. Your body adapts quickly, so variation every 4–6 weeks prevents plateaus. Adequate sleep (7–9 hrs) is your biggest recovery tool.",
    "Ectomorph": "Never miss a meal — your biggest challenge is caloric surplus. On rest days, do light activity only (walking, stretching). Prioritise sleep (8–9 hrs) for maximum growth hormone release. Limit cardio to 1–2 light sessions per week max.",
    "Unknown": "Track your progress with photos and measurements every 2 weeks. Adjust calories and training intensity based on results. Consistency over 8–12 weeks will show clear results.",
}

WEEKLY_DIET_NOTES = {
    "Endomorph": "Stick to meal timing — Endomorphs benefit most from structured eating windows. Avoid processed carbs and late-night eating. Drink at least 3L of water daily. Green tea (2–3 cups) enhances fat metabolism via EGCG compounds.",
    "Mesomorph": "Carb cycle if desired: higher carbs on training days, lower on rest days. Include post-workout nutrition within 30 minutes (protein + fast carbs). Track macros at least 3 days/week to stay on course.",
    "Ectomorph": "Never skip meals — even one skipped meal can cost you gains. Add extra snacks or a protein shake if you feel you are under-eating. Prioritise sleep for recovery. Consider adding nut butter, ghee, or avocado to boost calories without bulk.",
    "Unknown": "Focus on food quality first — whole foods over processed ones. Aim for consistent meal timing. Track your progress and adjust if weight isn't moving in the right direction after 2–3 weeks.",
}


# ─────────────────────────────────────────────
#  HELPER FUNCTIONS
# ─────────────────────────────────────────────

def _primary_goal(goals):
    """Return the dominant goal string."""
    if not goals:
        return "general_fitness"
    for g in goals:
        if g in ("muscle_gain", "bulking", "gain_weight"):
            return "muscle_gain"
    for g in goals:
        if g in ("fat_loss", "weight_loss", "cutting", "lose_weight"):
            return "fat_loss"
    return "general_fitness"


def get_exercise_benefit(exercise, body_type, goals):
    """Return (rating, reason) for an exercise based on rules."""
    name = exercise["name"]
    mg   = exercise["muscle_group"]
    jt   = exercise["joint_type"]
    primary_goal = _primary_goal(goals)

    is_compound = jt == "M"
    is_key_compound = name in EXERCISE_BENEFIT_RULES["compound_exercises"]

    if body_type == "Endomorph":
        if name in EXERCISE_BENEFIT_RULES["endomorph_high"]:
            return "high", f"High calorie-burning compound movement — ideal for Endomorphs targeting {primary_goal.replace('_', ' ')}."
        if is_key_compound:
            return "high", f"Multi-joint compound lift stimulates multiple muscle groups and elevates metabolism — perfect for Endomorph {primary_goal.replace('_', ' ')}."
        if is_compound:
            return "medium", f"Compound movement that builds functional strength while burning calories — well-suited for Endomorphs."
        return "low", f"Isolation exercise — useful for detail work but lower metabolic return for Endomorphs."

    elif body_type == "Mesomorph":
        if is_key_compound:
            return "high", f"Key mass-builder and strength driver — Mesomorphs respond exceptionally well to heavy compound loading for {primary_goal.replace('_', ' ')}."
        if is_compound:
            return "high", f"Compound lift that drives progressive overload — the cornerstone of Mesomorph training for {primary_goal.replace('_', ' ')}."
        return "medium", f"Isolation exercise that refines and shapes muscle — complements the Mesomorph's compound foundation."

    elif body_type == "Ectomorph":
        if name in EXERCISE_BENEFIT_RULES["ectomorph_high"]:
            return "high", f"Heavy compound movement that maximally recruits motor units — the most efficient mass builder for Ectomorphs."
        if is_key_compound:
            return "high", f"Multi-joint compound lift — Ectomorphs must prioritise these over isolation for maximum hormonal and mass response."
        if is_compound:
            return "medium", f"Compound movement — good choice for Ectomorphs, though heavier compound alternatives are preferred."
        return "low", f"Isolation exercise — Ectomorphs should limit these and focus on heavy compound movements instead."

    # Unknown / default
    if is_compound:
        return "medium", f"Compound movement — effective for general fitness and body composition."
    return "low", f"Isolation exercise — useful supplement to a compound-based program."


def get_exercise_tip(muscle_group, body_type):
    """Return a form tip for the exercise."""
    base_tip = EXERCISE_TIPS.get(muscle_group, "Focus on full range of motion and controlled tempo.")
    bt_suffix = BODY_TYPE_EXERCISE_RULES.get(body_type, BODY_TYPE_EXERCISE_RULES["Unknown"])["tips_suffix"]
    return f"{base_tip} {bt_suffix}"


def get_estimated_duration(n_exercises, sets, rest_seconds, has_warmup_cooldown=True):
    """Estimate session duration in minutes."""
    avg_reps_time = 45  # seconds per set including reps
    per_exercise = sets * (avg_reps_time + rest_seconds)
    total_seconds = n_exercises * per_exercise
    if has_warmup_cooldown:
        total_seconds += 600  # 10 min for warmup + cooldown
    return max(30, min(90, round(total_seconds / 60)))


def get_rest_day_content(body_type):
    """Return rest day warmup (active recovery) suggestion."""
    tips = {
        "Endomorph": "20–30 min brisk walk (aim for 8,000 steps total) + full-body static stretching (20 min) + foam rolling if available.",
        "Mesomorph": "15–20 min light cycling or swimming + dynamic mobility drills (10 min) + targeted muscle stretching.",
        "Ectomorph": "10–15 min gentle walk only. Full static stretching session. Avoid any intense cardio — conserve calories for muscle building.",
        "Unknown": "20 min light activity (walk, cycling) + stretching routine covering all major muscle groups.",
    }
    return tips.get(body_type, tips["Unknown"])
