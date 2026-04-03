"""
Exercise plan generation using Gemini API.
Builds a personalized weekly workout plan based on user profile + body scan.
"""

from services.gemini_service import generate_json


def generate_exercise_plan(user_data):
    """
    Generate a weekly exercise plan.
    user_data comes from db_service.get_full_user_data().
    Returns the parsed JSON plan.
    """
    profile = user_data.get("profile", {}) or {}
    scan = user_data.get("latest_scan", {}) or {}
    goals = user_data.get("goals", [])
    muscles = user_data.get("target_muscles", [])

    body_type = scan.get("body_type", "Unknown")
    endo = scan.get("endomorphy", 0)
    meso = scan.get("mesomorphy", 0)
    ecto = scan.get("ectomorphy", 0)
    bmi = scan.get("bmi", 0)

    experience = profile.get("experience_level", "beginner")
    days = profile.get("training_days_per_week", 4)
    time_pref = profile.get("preferred_time", "morning")
    equipment = profile.get("equipment", [])
    weight = profile.get("weight_kg", 70)
    height = profile.get("height_cm", 170)

    prompt = f"""You are a certified personal trainer and exercise scientist.
Generate a detailed {days}-day weekly workout plan as JSON.

USER PROFILE:
- Body type: {body_type} (Endomorphy: {endo:.2f}, Mesomorphy: {meso:.2f}, Ectomorphy: {ecto:.2f})
- BMI: {bmi}
- Height: {height} cm, Weight: {weight} kg
- Goals: {', '.join(goals) if goals else 'general fitness'}
- Experience level: {experience}
- Available equipment: {', '.join(equipment) if equipment else 'bodyweight only'}
- Target muscle groups: {', '.join(muscles) if muscles else 'full body'}
- Preferred time: {time_pref}

BODY TYPE GUIDELINES:
- Endomorph (high endo): Focus on higher reps, supersets, include HIIT cardio, compound movements for calorie burn
- Mesomorph (high meso): Moderate reps, progressive overload, mix of compound and isolation
- Ectomorph (high ecto): Lower reps, heavier weight, longer rest, compound lifts, minimize cardio

Return JSON with EXACTLY this structure:
{{
  "plan_summary": "Brief 1-2 sentence overview of the plan approach",
  "weekly_plan": [
    {{
      "day": "Monday",
      "day_number": 1,
      "is_rest_day": false,
      "focus": "Push (Chest, Shoulders, Triceps)",
      "warmup": "5 min light cardio + dynamic stretching",
      "exercises": [
        {{
          "name": "Barbell Bench Press",
          "search_name": "bench press",
          "sets": 4,
          "reps": "8-10",
          "rest_seconds": 90,
          "muscle_groups": ["chest", "triceps"],
          "tips": "Keep shoulder blades retracted, arch slightly in lower back",
          "benefit_rating": "high",
          "benefit_reason": "Compound push movement, builds chest mass and overall upper body strength"
        }}
      ],
      "cooldown": "5 min static stretching",
      "estimated_duration_min": 55
    }}
  ],
  "weekly_notes": "Any additional weekly tips based on body type"
}}

Include ALL 7 days (Mon-Sun). Mark rest days with is_rest_day: true and empty exercises array.
For rest days, set focus to "Rest & Recovery" and include active recovery suggestions in warmup field.
Ensure exercises match the available equipment.
Each training day should have 5-8 exercises.
For each exercise include:
- "search_name": a short, common name for searching exercise databases (e.g. "bench press", "squat", "deadlift")
- "benefit_rating": "high", "medium", or "low" based on how beneficial this exercise is for the user's specific goals and body type
- "benefit_reason": a brief explanation of why this exercise is beneficial
"""

    return generate_json(prompt)


