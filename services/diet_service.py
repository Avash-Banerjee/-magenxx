"""
Diet plan generation using Gemini API.
Builds a personalized 7-day meal plan based on user profile + body scan.
"""

from services.gemini_service import generate_json


def generate_diet_plan(user_data, indianize=False):
    """
    Generate a 7-day diet plan.
    user_data comes from db_service.get_full_user_data().
    Returns the parsed JSON plan.
    """
    profile = user_data.get("profile", {}) or {}
    scan = user_data.get("latest_scan", {}) or {}
    goals = user_data.get("goals", [])
    diet_prefs = user_data.get("diet_preferences", {}) or {}

    body_type = scan.get("body_type", "Unknown")
    endo = scan.get("endomorphy", 0)
    meso = scan.get("mesomorphy", 0)
    ecto = scan.get("ectomorphy", 0)
    bmi = scan.get("bmi", 0)

    weight = profile.get("weight_kg", 70)
    height = profile.get("height_cm", 170)
    age = profile.get("age", 25)
    gender = profile.get("gender", "male")
    diet_type = diet_prefs.get("diet_type", "non_veg")

    goal_str = ', '.join(goals) if goals else 'general fitness'

    indian_instruction = ""
    if indianize:
        indian_instruction = """
IMPORTANT: Use INDIAN food options throughout the plan:
- Breakfast: poha, upma, idli, dosa, paratha, besan chilla, oats with jaggery, sprout salad
- Lunch/Dinner: dal (moong, masoor, toor), roti/chapati, brown rice, rajma, chole, paneer, chicken curry, fish curry
- Snacks: roasted chana, makhana, fruits, lassi, buttermilk, dry fruits
- Use ghee, coconut oil, mustard oil as healthy fats
- Include raita, sabzi, sambhar as sides
- Measure portions in Indian units where appropriate (katori, roti count, etc.)
"""

    prompt = f"""You are a certified nutritionist and sports dietitian.
Generate a detailed 7-day meal plan as JSON.

USER PROFILE:
- Body type: {body_type} (Endomorphy: {endo:.2f}, Mesomorphy: {meso:.2f}, Ectomorphy: {ecto:.2f})
- BMI: {bmi}, Age: {age}, Gender: {gender}
- Height: {height} cm, Weight: {weight} kg
- Goals: {goal_str}
- Diet preference: {diet_type}
{indian_instruction}

CALORIE GUIDELINES:
- Calculate BMR using Mifflin-St Jeor equation
- Apply activity multiplier (1.55 for moderate activity)
- For muscle gain: TDEE + 300-500 cal surplus
- For fat loss: TDEE - 400-600 cal deficit
- For general fitness: maintenance TDEE

BODY TYPE NUTRITION:
- Endomorph: Lower carb ratio (35C/35P/30F), focus on complex carbs, avoid simple sugars
- Mesomorph: Balanced macros (40C/30P/30F), moderate carb intake
- Ectomorph: Higher carb ratio (50C/25P/25F), calorie-dense foods, frequent meals

Return JSON with EXACTLY this structure:
{{
  "plan_summary": "Brief overview of the nutritional approach",
  "daily_calories": 2400,
  "macro_split": {{
    "protein_g": 180,
    "carbs_g": 260,
    "fats_g": 70,
    "protein_pct": 30,
    "carbs_pct": 43,
    "fats_pct": 27
  }},
  "protein_per_kg": 2.0,
  "days": [
    {{
      "day": "Monday",
      "day_number": 1,
      "total_calories": 2400,
      "meals": [
        {{
          "meal_name": "Breakfast",
          "time": "7:30 AM",
          "items": [
            {{
              "food": "Oats with banana and almonds",
              "portion": "1 cup oats + 1 banana + 10 almonds",
              "calories": 420,
              "protein_g": 14,
              "carbs_g": 65,
              "fats_g": 12
            }}
          ],
          "total_calories": 420,
          "reason": "Complex carbs provide sustained morning energy. Banana adds potassium for muscle function.",
          "analogy": "Think of this as slow-burning fuel that keeps your engine running smoothly until lunch."
        }}
      ]
    }}
  ],
  "grocery_list": {{
    "proteins": ["chicken breast 2kg", "eggs 30", "paneer 500g"],
    "grains": ["brown rice 2kg", "oats 1kg", "whole wheat atta 2kg"],
    "vegetables": ["broccoli", "spinach", "bell peppers"],
    "fruits": ["bananas 12", "apples 7", "blueberries 500g"],
    "dairy": ["milk 2L", "yogurt 1kg", "cheese 200g"],
    "fats_and_nuts": ["almonds 250g", "peanut butter 500g", "olive oil 500ml"],
    "others": ["honey", "green tea", "spices"]
  }},
  "weekly_notes": "Additional tips for the week"
}}

Each day MUST have exactly 5 meals: Breakfast, Mid-Morning Snack, Lunch, Evening Snack, Dinner.
Each meal must have 2-4 food items with detailed portions.
Include a "reason" explaining WHY each meal was chosen and an "analogy" to make it relatable.
Ensure total daily calories match the target within 50 cal.
"""

    return generate_json(prompt)
