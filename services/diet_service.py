"""
Diet plan generation — pure rule engine, no Gemini.

Uses:
  - Mifflin-St Jeor BMR + TDEE calculation
  - Body type macro ratios from ISSN / Diet and Nutrition.xlsx
  - Somatotype portion adjustments (Diet and Nutrition.xlsx)
  - Phytonutrient recommendations per body type (Diet and Nutrition.xlsx)
  - Food database with macros (food_data.py)
  - 7-day meal plan with reason + analogy explanations (rule-based)
"""

import math
import random
from services.food_data import (
    FOOD_DB, PHYTONUTRIENTS, SOMATOTYPE_PORTION_RULES,
    MEAL_TEMPLATES, MEAL_REASONS, MEAL_ANALOGIES,
)
from services.rule_engine import (
    calculate_bmr, calculate_tdee, apply_goal_adjustment,
    get_macro_targets, DIET_PLAN_SUMMARIES, WEEKLY_DIET_NOTES,
    _primary_goal,
)

DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ─────────────────────────────────────────────
#  MAIN ENTRY POINT
# ─────────────────────────────────────────────

def generate_diet_plan(user_data, indianize=False):
    """
    Generate a 7-day diet plan using the rule engine.
    Returns JSON-serialisable dict matching the UI's expected structure.
    """
    profile    = user_data.get("profile", {}) or {}
    scan       = user_data.get("latest_scan", {}) or {}
    goals      = user_data.get("goals", []) or []
    diet_prefs = user_data.get("diet_preferences", {}) or {}

    body_type  = scan.get("body_type", "Unknown")
    weight_kg  = float(profile.get("weight_kg", 70) or 70)
    height_cm  = float(profile.get("height_cm", 170) or 170)
    age        = int(profile.get("age", 25) or 25)
    gender     = profile.get("gender", "male") or "male"
    diet_type  = diet_prefs.get("diet_type", "non_veg") or "non_veg"
    if indianize is None:
        indianize = diet_prefs.get("indianize", False) or False

    primary_goal = _primary_goal(goals)
    gender_key   = "female" if gender.lower() in ("female", "f") else "male"

    # ── Calorie calculation ──
    bmr          = calculate_bmr(weight_kg, height_cm, age, gender)
    tdee         = calculate_tdee(bmr)
    daily_cal    = apply_goal_adjustment(tdee, goals)
    # Pass gender so macro ratios reflect female fat-oxidation preference
    macro_split  = get_macro_targets(daily_cal, body_type, goals, weight_kg, gender)

    # ── Somatotype portion rules ──
    portion_rules = SOMATOTYPE_PORTION_RULES.get(body_type, SOMATOTYPE_PORTION_RULES["Mesomorph"])
    carb_mult     = portion_rules["carb_multiplier"]
    fat_mult      = portion_rules["fat_multiplier"]
    # Females: reduce portion multiplier slightly (smaller average lean body mass)
    gender_portion_scale = 0.90 if gender_key == "female" else 1.0

    # ── Build food pool ──
    food_pool = _build_food_pool(diet_type, indianize, gender_key)

    # ── 7-day meal plan ──
    days = []
    for day_num, day_name in enumerate(DAYS_OF_WEEK, start=1):
        day_meals = _build_day_meals(
            day_name, day_num, daily_cal, macro_split,
            body_type, food_pool, carb_mult, fat_mult, day_num,
            gender_portion_scale
        )
        total_day_cal = sum(m["total_calories"] for m in day_meals)
        days.append({
            "day":            day_name,
            "day_number":     day_num,
            "total_calories": total_day_cal,
            "meals":          day_meals,
        })

    # ── Grocery list ──
    grocery_list = _build_grocery_list(days, diet_type, indianize)

    # ── Phytonutrient note ──
    phyto_tip = _get_phytonutrient_note(body_type)

    # ── Plan summary ──
    plan_summary = (
        DIET_PLAN_SUMMARIES
        .get(body_type, DIET_PLAN_SUMMARIES["Unknown"])
        .get(primary_goal, DIET_PLAN_SUMMARIES["Unknown"]["general_fitness"])
    )
    weekly_notes = WEEKLY_DIET_NOTES.get(body_type, WEEKLY_DIET_NOTES["Unknown"])
    if phyto_tip:
        weekly_notes += f" | Phytonutrient tip: {phyto_tip}"

    return {
        "plan_summary":    plan_summary,
        "daily_calories":  daily_cal,
        "macro_split":     macro_split,
        "protein_per_kg":  macro_split["protein_per_kg"],
        "days":            days,
        "grocery_list":    grocery_list,
        "weekly_notes":    weekly_notes,
        "portion_guidance": {
            "body_type":   body_type,
            "description": portion_rules["description"],
            "notes":       portion_rules["notes"],
            "meal_timing": portion_rules["meal_timing"],
            "preferred_carbs": portion_rules["preferred_carbs"],
            "avoid":       portion_rules["avoid"],
        },
    }


# ─────────────────────────────────────────────
#  FOOD POOL BUILDER
# ─────────────────────────────────────────────

# Foods high in iron, calcium, and folate — prioritised for female plans
# (to offset menstrual iron loss and support bone density)
FEMALE_PRIORITY_TAGS = {"iron_rich", "calcium_rich", "folate_rich"}

# Female-specific foods to inject at the top of their categories when not already present
FEMALE_BOOST_FOODS = {
    "proteins":   ["Chicken Liver", "Lentils", "Tofu", "Egg"],
    "vegetables": ["Spinach", "Broccoli", "Kale", "Edamame"],
    "grains":     ["Quinoa", "Oats", "Fortified Cereal"],
    "dairy":      ["Low-fat Milk", "Greek Yogurt", "Paneer"],
    "fruits":     ["Dates", "Pomegranate", "Orange"],
}


def _build_food_pool(diet_type, indianize, gender_key="male"):
    """
    Build a categorised pool of food items filtered by diet type and indian flag.
    For females: sort iron-rich / calcium-rich / folate-rich items to the front.
    """
    pool = {}
    is_veg = diet_type in ("veg", "vegetarian", "vegan")

    for category, items in FOOD_DB.items():
        filtered = []
        for item in items:
            tags = item.get("tags", [])
            # Veg filter
            if is_veg and "non_veg" in tags and "veg_ovo" not in tags and "veg_lacto" not in tags:
                continue
            filtered.append(item)

        if gender_key == "female":
            # Bubble iron/calcium/folate-rich items to the front so the greedy
            # selector picks them first for female meal plans
            priority = [it for it in filtered if FEMALE_PRIORITY_TAGS & set(it.get("tags", []))]
            rest     = [it for it in filtered if it not in priority]
            filtered = priority + rest

        pool[category] = filtered

    return pool


# ─────────────────────────────────────────────
#  DAY MEAL BUILDER
# ─────────────────────────────────────────────

def _build_day_meals(day_name, day_num, daily_cal, macro_split,
                     body_type, food_pool, carb_mult, fat_mult, day_seed,
                     gender_portion_scale=1.0):
    """Build 5 meals for one day."""
    meals = []
    # Use day_seed to vary food choices across the week
    rng = random.Random(day_seed * 7 + hash(body_type) % 100)

    for template in MEAL_TEMPLATES:
        meal_name   = template["meal_name"]
        meal_time   = template["time"]
        cal_target  = round(daily_cal * template["macro_share"])

        # Per-meal macro targets
        protein_target = round(macro_split["protein_g"] * template["protein_share"])
        carb_target    = round(macro_split["carbs_g"]   * template["carb_share"] * carb_mult)
        fat_target     = round(macro_split["fats_g"]    * template["protein_share"] * fat_mult)

        # Select food items for this meal
        items = _select_meal_items(
            meal_name, cal_target, protein_target, carb_target, fat_target,
            food_pool, body_type, rng, gender_portion_scale
        )

        total_cal = sum(i["calories"] for i in items)

        reason  = MEAL_REASONS.get(meal_name, {}).get(body_type, template["role"])
        analogy = MEAL_ANALOGIES.get(meal_name, {}).get(body_type, "")

        meals.append({
            "meal_name":      meal_name,
            "time":           meal_time,
            "items":          items,
            "total_calories": total_cal,
            "reason":         reason,
            "analogy":        analogy,
        })

    return meals


# ─────────────────────────────────────────────
#  MEAL ITEM SELECTOR
# ─────────────────────────────────────────────

# Map meal names → food categories to draw from
MEAL_CATEGORY_WEIGHTS = {
    "Breakfast":          ["grains", "proteins", "fruits", "dairy", "beverages"],
    "Mid-Morning Snack":  ["snacks", "fruits", "proteins"],
    "Lunch":              ["proteins", "grains", "vegetables", "dairy"],
    "Evening Snack":      ["snacks", "fruits", "beverages", "proteins"],
    "Dinner":             ["proteins", "grains", "vegetables", "fats_and_nuts"],
}

# How many items per meal (min, max)
MEAL_ITEM_COUNT = {
    "Breakfast":         (3, 4),
    "Mid-Morning Snack": (1, 2),
    "Lunch":             (3, 4),
    "Evening Snack":     (1, 2),
    "Dinner":            (3, 4),
}


def _select_meal_items(meal_name, cal_target, protein_target, carb_target,
                        fat_target, food_pool, body_type, rng,
                        gender_portion_scale=1.0):
    """
    Greedily select food items for a meal that come close to macro targets.
    Uses the category priority list and body-type + gender preferences.
    """
    categories = MEAL_CATEGORY_WEIGHTS.get(meal_name, ["proteins", "grains", "vegetables"])
    min_items, max_items = MEAL_ITEM_COUNT.get(meal_name, (2, 3))

    # Combined multiplier: body-type base × gender scale
    bt_multiplier = {"Endomorph": 0.90, "Mesomorph": 1.0, "Ectomorph": 1.15}.get(body_type, 1.0)
    scale = bt_multiplier * gender_portion_scale

    selected = []
    used_names = set()
    remaining_cal = cal_target

    for cat in categories:
        if len(selected) >= max_items:
            break
        items = food_pool.get(cat, [])
        if not items:
            continue
        # For females the pool is already sorted priority-first; for males shuffle for variety
        shuffled = items[:]
        rng.shuffle(shuffled)

        for item in shuffled:
            if item["name"] in used_names:
                continue
            item_cal = round(item["calories"] * scale)

            if len(selected) < min_items or (item_cal <= remaining_cal * 1.3):
                portion_note = _scale_portion(item["portion"], scale)
                selected.append({
                    "food":       item["name"],
                    "portion":    portion_note,
                    "calories":   item_cal,
                    "protein_g":  round(item["protein_g"] * scale, 1),
                    "carbs_g":    round(item["carbs_g"]   * scale, 1),
                    "fats_g":     round(item["fats_g"]    * scale, 1),
                })
                used_names.add(item["name"])
                remaining_cal -= item_cal
                break  # one item per category

    # Fill to min_items if needed with anything available
    if len(selected) < min_items:
        all_items = []
        for cat in food_pool:
            all_items.extend(food_pool[cat])
        rng.shuffle(all_items)
        for item in all_items:
            if len(selected) >= min_items:
                break
            if item["name"] not in used_names:
                selected.append({
                    "food":      item["name"],
                    "portion":   _scale_portion(item["portion"], scale),
                    "calories":  round(item["calories"] * scale),
                    "protein_g": round(item["protein_g"] * scale, 1),
                    "carbs_g":   round(item["carbs_g"]   * scale, 1),
                    "fats_g":    round(item["fats_g"]    * scale, 1),
                })
                used_names.add(item["name"])

    return selected


def _scale_portion(portion_str, scale):
    """Return a portion note that indicates relative scaling."""
    if abs(scale - 1.0) < 0.05:
        return portion_str
    if scale <= 0.85:
        return f"{portion_str} (reduced — Endomorph female portion)"
    if scale < 0.95:
        return f"{portion_str} (slightly reduced)"
    if scale >= 1.15:
        return f"{portion_str} (larger — Ectomorph portion)"
    if scale > 1.05:
        return f"{portion_str} (slightly larger)"
    return portion_str


# ─────────────────────────────────────────────
#  GROCERY LIST BUILDER
# ─────────────────────────────────────────────

def _build_grocery_list(days, diet_type, indianize):
    """Extract unique foods from the week's plan and categorise for a grocery list."""
    food_category_map = {}
    for cat, items in FOOD_DB.items():
        for item in items:
            food_category_map[item["name"]] = cat

    weekly_foods = set()
    for day in days:
        for meal in day["meals"]:
            for item in meal["items"]:
                weekly_foods.add(item["food"])

    grocery = {
        "proteins":     [],
        "grains":       [],
        "vegetables":   [],
        "fruits":       [],
        "dairy":        [],
        "fats_and_nuts":[],
        "others":       [],
    }

    for food in sorted(weekly_foods):
        cat = food_category_map.get(food, "others")
        mapped = {
            "proteins":      "proteins",
            "grains":        "grains",
            "vegetables":    "vegetables",
            "fruits":        "fruits",
            "dairy":         "dairy",
            "fats_and_nuts": "fats_and_nuts",
            "snacks":        "others",
            "beverages":     "others",
        }.get(cat, "others")
        grocery[mapped].append(food)

    # Add essentials always
    grocery["others"].extend(["Turmeric powder", "Ginger", "Garlic", "Green tea bags"])
    if indianize:
        grocery["others"].extend(["Cumin seeds", "Coriander powder", "Mustard seeds"])
    grocery["others"] = list(set(grocery["others"]))

    return grocery


# ─────────────────────────────────────────────
#  PHYTONUTRIENT TIP
# ─────────────────────────────────────────────

def _get_phytonutrient_note(body_type):
    """Return a top phytonutrient recommendation for the body type."""
    compounds = PHYTONUTRIENTS.get(body_type, [])
    if not compounds:
        return ""
    top = compounds[0]
    return (
        f"{top['compound']} — {top['benefit']}. "
        f"Source: {top['source']} ({top['effective_intake']})."
    )
