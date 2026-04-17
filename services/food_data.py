"""
Food database for the rule-engine diet planner.

Data sourced from:
- USDA FoodData Central
- Diet and Nutrition.xlsx (phytonutrients, somatotype portion adjustments, regional alternatives)
- International Society of Sports Nutrition (ISSN) guidelines

Structure per food item:
  name, calories, protein_g, carbs_g, fats_g, portion (description),
  category (protein/grain/vegetable/fruit/dairy/fat/snack/beverage),
  tags: list of [veg, non_veg, indian, high_fiber, anti_inflammatory, ...]
"""

# ─────────────────────────────────────────────
#  FOOD DATABASE
# ─────────────────────────────────────────────

FOOD_DB = {
    # ── PROTEINS ──
    "proteins": [
        # Non-veg
        {"name": "Chicken Breast (grilled)", "calories": 165, "protein_g": 31, "carbs_g": 0,  "fats_g": 3.6, "portion": "100g", "tags": ["non_veg"]},
        {"name": "Chicken Thigh (skinless)", "calories": 177, "protein_g": 25, "carbs_g": 0,  "fats_g": 8,   "portion": "100g", "tags": ["non_veg"]},
        {"name": "Tuna (canned in water)",   "calories": 116, "protein_g": 26, "carbs_g": 0,  "fats_g": 1,   "portion": "100g", "tags": ["non_veg"]},
        {"name": "Salmon (baked)",           "calories": 206, "protein_g": 28, "carbs_g": 0,  "fats_g": 10,  "portion": "100g", "tags": ["non_veg", "anti_inflammatory"]},
        {"name": "Egg (whole)",              "calories": 155, "protein_g": 13, "carbs_g": 1,  "fats_g": 11,  "portion": "2 eggs (100g)", "tags": ["non_veg", "veg_ovo"]},
        {"name": "Egg Whites",               "calories": 52,  "protein_g": 11, "carbs_g": 0.7,"fats_g": 0.2, "portion": "3 egg whites (100g)", "tags": ["non_veg", "veg_ovo"]},
        {"name": "Turkey Breast (lean)",     "calories": 157, "protein_g": 30, "carbs_g": 0,  "fats_g": 3.5, "portion": "100g", "tags": ["non_veg"]},
        {"name": "Lean Beef Mince",          "calories": 218, "protein_g": 26, "carbs_g": 0,  "fats_g": 12,  "portion": "100g", "tags": ["non_veg"]},
        {"name": "Prawns / Shrimp",          "calories": 99,  "protein_g": 24, "carbs_g": 0.2,"fats_g": 0.3, "portion": "100g", "tags": ["non_veg"]},
        {"name": "Fish (Rohu/Catla/Indian fish)", "calories": 97, "protein_g": 20, "carbs_g": 0, "fats_g": 2.4, "portion": "100g", "tags": ["non_veg", "indian"]},
        {"name": "Chicken Curry (Indian)",   "calories": 210, "protein_g": 25, "carbs_g": 5,  "fats_g": 10,  "portion": "1 bowl (200g)", "tags": ["non_veg", "indian"]},
        # Veg proteins
        {"name": "Paneer",                   "calories": 265, "protein_g": 18, "carbs_g": 3,  "fats_g": 20,  "portion": "100g", "tags": ["veg", "indian"]},
        {"name": "Paneer (low-fat)",         "calories": 160, "protein_g": 19, "carbs_g": 4,  "fats_g": 8,   "portion": "100g", "tags": ["veg", "indian"]},
        {"name": "Tofu (firm)",              "calories": 76,  "protein_g": 8,  "carbs_g": 2,  "fats_g": 4,   "portion": "100g", "tags": ["veg"]},
        {"name": "Moong Dal (cooked)",       "calories": 105, "protein_g": 7,  "carbs_g": 18, "fats_g": 0.4, "portion": "1 katori / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Masoor Dal (cooked)",      "calories": 116, "protein_g": 9,  "carbs_g": 20, "fats_g": 0.4, "portion": "1 katori / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Toor Dal (cooked)",        "calories": 120, "protein_g": 8,  "carbs_g": 22, "fats_g": 0.5, "portion": "1 katori / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Rajma (cooked)",           "calories": 127, "protein_g": 9,  "carbs_g": 22, "fats_g": 0.5, "portion": "1 katori / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Chole / Chickpeas",        "calories": 164, "protein_g": 9,  "carbs_g": 27, "fats_g": 2.6, "portion": "1 katori / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Black Beans (cooked)",     "calories": 132, "protein_g": 9,  "carbs_g": 24, "fats_g": 0.5, "portion": "150g", "tags": ["veg", "high_fiber"]},
        {"name": "Lentils (cooked)",         "calories": 116, "protein_g": 9,  "carbs_g": 20, "fats_g": 0.4, "portion": "150g", "tags": ["veg", "high_fiber"]},
        {"name": "Greek Yogurt",             "calories": 100, "protein_g": 17, "carbs_g": 6,  "fats_g": 0.7, "portion": "170g / 3/4 cup", "tags": ["veg", "veg_lacto"]},
        {"name": "Cottage Cheese (low-fat)", "calories": 72,  "protein_g": 12, "carbs_g": 3,  "fats_g": 1,   "portion": "100g", "tags": ["veg", "veg_lacto"]},
        {"name": "Whey Protein Shake",       "calories": 120, "protein_g": 25, "carbs_g": 3,  "fats_g": 1.5, "portion": "1 scoop (30g) in water", "tags": ["veg", "non_veg"]},
        {"name": "Sprouts (moong)",          "calories": 30,  "protein_g": 3,  "carbs_g": 5,  "fats_g": 0.2, "portion": "1/2 cup / 50g", "tags": ["veg", "indian", "anti_inflammatory"]},
        {"name": "Soy Chunks (cooked)",      "calories": 175, "protein_g": 18, "carbs_g": 20, "fats_g": 0.5, "portion": "100g", "tags": ["veg"]},
        {"name": "Edamame",                  "calories": 122, "protein_g": 11, "carbs_g": 10, "fats_g": 5,   "portion": "100g", "tags": ["veg"]},
        {"name": "Tempeh",                   "calories": 193, "protein_g": 19, "carbs_g": 9,  "fats_g": 11,  "portion": "100g", "tags": ["veg"]},
    ],

    # ── GRAINS / CARBS ──
    "grains": [
        {"name": "Oats (cooked)",            "calories": 150, "protein_g": 5,  "carbs_g": 27, "fats_g": 2.5, "portion": "1 cup / 240ml cooked", "tags": ["veg", "high_fiber", "anti_inflammatory"]},
        {"name": "Brown Rice (cooked)",      "calories": 216, "protein_g": 5,  "carbs_g": 45, "fats_g": 1.8, "portion": "1 cup / 195g", "tags": ["veg"]},
        {"name": "White Rice (cooked)",      "calories": 206, "protein_g": 4,  "carbs_g": 45, "fats_g": 0.4, "portion": "1 cup / 186g", "tags": ["veg", "indian"]},
        {"name": "Basmati Rice (cooked)",    "calories": 200, "protein_g": 4,  "carbs_g": 43, "fats_g": 0.4, "portion": "1 cup / 180g", "tags": ["veg", "indian"]},
        {"name": "Roti / Chapati (whole wheat)", "calories": 104, "protein_g": 3, "carbs_g": 18, "fats_g": 3, "portion": "1 medium roti (40g)", "tags": ["veg", "indian"]},
        {"name": "Roti (multigrain)",        "calories": 98,  "protein_g": 4,  "carbs_g": 17, "fats_g": 2.5, "portion": "1 roti (40g)", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Whole Wheat Bread",        "calories": 138, "protein_g": 5,  "carbs_g": 26, "fats_g": 2,   "portion": "2 slices (70g)", "tags": ["veg", "high_fiber"]},
        {"name": "Sweet Potato (baked)",     "calories": 103, "protein_g": 2,  "carbs_g": 24, "fats_g": 0.1, "portion": "1 medium (130g)", "tags": ["veg", "high_fiber", "anti_inflammatory"]},
        {"name": "Idli (steamed)",           "calories": 58,  "protein_g": 2,  "carbs_g": 11, "fats_g": 0.3, "portion": "2 idlis (100g)", "tags": ["veg", "indian"]},
        {"name": "Dosa (plain)",             "calories": 168, "protein_g": 4,  "carbs_g": 30, "fats_g": 4,   "portion": "1 medium dosa (100g)", "tags": ["veg", "indian"]},
        {"name": "Poha (cooked)",            "calories": 158, "protein_g": 3,  "carbs_g": 30, "fats_g": 3.5, "portion": "1 bowl / 150g", "tags": ["veg", "indian"]},
        {"name": "Upma (cooked)",            "calories": 180, "protein_g": 5,  "carbs_g": 28, "fats_g": 5,   "portion": "1 bowl / 200g", "tags": ["veg", "indian"]},
        {"name": "Quinoa (cooked)",          "calories": 222, "protein_g": 8,  "carbs_g": 39, "fats_g": 3.5, "portion": "1 cup / 185g", "tags": ["veg", "high_fiber"]},
        {"name": "Millet (bajra, cooked)",   "calories": 207, "protein_g": 6,  "carbs_g": 41, "fats_g": 2.2, "portion": "1 cup / 180g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Besan Chilla",             "calories": 180, "protein_g": 10, "carbs_g": 22, "fats_g": 5,   "portion": "2 medium pancakes (120g)", "tags": ["veg", "indian"]},
        {"name": "Pasta (whole wheat, cooked)", "calories": 174, "protein_g": 7, "carbs_g": 37, "fats_g": 0.8, "portion": "1 cup / 140g", "tags": ["veg", "high_fiber"]},
        {"name": "Buckwheat (cooked)",       "calories": 155, "protein_g": 6,  "carbs_g": 34, "fats_g": 1,   "portion": "1 cup / 168g", "tags": ["veg", "high_fiber"]},
    ],

    # ── VEGETABLES ──
    "vegetables": [
        {"name": "Broccoli (steamed)",       "calories": 55,  "protein_g": 4,  "carbs_g": 11, "fats_g": 0.6, "portion": "1 cup / 156g", "tags": ["veg", "high_fiber", "anti_inflammatory"]},
        {"name": "Spinach (raw/cooked)",     "calories": 23,  "protein_g": 3,  "carbs_g": 3,  "fats_g": 0.4, "portion": "1 cup / 90g", "tags": ["veg", "anti_inflammatory", "high_fiber"]},
        {"name": "Mixed Green Salad",        "calories": 20,  "protein_g": 1,  "carbs_g": 4,  "fats_g": 0.3, "portion": "Large bowl (150g)", "tags": ["veg"]},
        {"name": "Bell Pepper (mixed)",      "calories": 31,  "protein_g": 1,  "carbs_g": 7,  "fats_g": 0.3, "portion": "1 medium (120g)", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Cucumber",                 "calories": 16,  "protein_g": 0.7,"carbs_g": 4,  "fats_g": 0.1, "portion": "1 cup / 119g", "tags": ["veg"]},
        {"name": "Tomato",                   "calories": 22,  "protein_g": 1,  "carbs_g": 5,  "fats_g": 0.2, "portion": "1 medium (123g)", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Sabzi (mixed vegetable curry)", "calories": 95, "protein_g": 3, "carbs_g": 12, "fats_g": 4, "portion": "1 katori / 150g", "tags": ["veg", "indian"]},
        {"name": "Raita (cucumber/boondi)",  "calories": 60,  "protein_g": 3,  "carbs_g": 7,  "fats_g": 2,   "portion": "1 small bowl / 100g", "tags": ["veg", "indian"]},
        {"name": "Sambhar (lentil curry)",   "calories": 80,  "protein_g": 5,  "carbs_g": 12, "fats_g": 1.5, "portion": "1 bowl / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Mushrooms (sautéed)",      "calories": 44,  "protein_g": 3,  "carbs_g": 6,  "fats_g": 0.5, "portion": "1 cup / 156g", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Kale (steamed)",           "calories": 36,  "protein_g": 2.5,"carbs_g": 7,  "fats_g": 0.5, "portion": "1 cup / 130g", "tags": ["veg", "anti_inflammatory", "high_fiber"]},
        {"name": "Amaranth leaves (saag)",   "calories": 23,  "protein_g": 2.5,"carbs_g": 4,  "fats_g": 0.2, "portion": "1 cup / 100g", "tags": ["veg", "indian", "anti_inflammatory"]},
        {"name": "Beetroot",                 "calories": 43,  "protein_g": 1.6,"carbs_g": 10, "fats_g": 0.2, "portion": "1 medium / 82g", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Onion + Garlic (base)",    "calories": 40,  "protein_g": 1,  "carbs_g": 9,  "fats_g": 0.1, "portion": "50g", "tags": ["veg", "indian", "anti_inflammatory"]},
        {"name": "Palak Paneer",             "calories": 220, "protein_g": 14, "carbs_g": 8,  "fats_g": 14,  "portion": "1 bowl / 200g", "tags": ["veg", "indian"]},
    ],

    # ── FRUITS ──
    "fruits": [
        {"name": "Banana",                   "calories": 105, "protein_g": 1.3,"carbs_g": 27, "fats_g": 0.4, "portion": "1 medium (118g)", "tags": ["veg"]},
        {"name": "Apple",                    "calories": 95,  "protein_g": 0.5,"carbs_g": 25, "fats_g": 0.3, "portion": "1 medium (182g)", "tags": ["veg", "high_fiber"]},
        {"name": "Blueberries",              "calories": 84,  "protein_g": 1,  "carbs_g": 21, "fats_g": 0.5, "portion": "1 cup / 148g", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Mango",                    "calories": 99,  "protein_g": 1.4,"carbs_g": 25, "fats_g": 0.6, "portion": "1 cup / 165g", "tags": ["veg", "indian"]},
        {"name": "Papaya",                   "calories": 55,  "protein_g": 0.9,"carbs_g": 14, "fats_g": 0.4, "portion": "1 cup / 145g", "tags": ["veg", "indian", "anti_inflammatory"]},
        {"name": "Orange",                   "calories": 62,  "protein_g": 1.2,"carbs_g": 15, "fats_g": 0.2, "portion": "1 medium (131g)", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Strawberries",             "calories": 49,  "protein_g": 1,  "carbs_g": 12, "fats_g": 0.5, "portion": "1 cup / 152g", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Jamun / Black plum",       "calories": 60,  "protein_g": 0.7,"carbs_g": 14, "fats_g": 0.2, "portion": "1 cup / 120g", "tags": ["veg", "indian", "anti_inflammatory"]},
        {"name": "Pomegranate",              "calories": 83,  "protein_g": 1.7,"carbs_g": 19, "fats_g": 1.2, "portion": "1/2 cup / 87g", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Watermelon",               "calories": 46,  "protein_g": 0.9,"carbs_g": 11, "fats_g": 0.2, "portion": "1 cup / 154g", "tags": ["veg"]},
        {"name": "Pineapple",                "calories": 82,  "protein_g": 0.9,"carbs_g": 22, "fats_g": 0.2, "portion": "1 cup / 165g", "tags": ["veg", "anti_inflammatory"]},
    ],

    # ── DAIRY ──
    "dairy": [
        {"name": "Milk (whole)",             "calories": 149, "protein_g": 8,  "carbs_g": 12, "fats_g": 8,   "portion": "1 cup / 244ml", "tags": ["veg", "veg_lacto"]},
        {"name": "Milk (skimmed/low-fat)",   "calories": 90,  "protein_g": 9,  "carbs_g": 12, "fats_g": 0.5, "portion": "1 cup / 244ml", "tags": ["veg", "veg_lacto", "indian"]},
        {"name": "Curd / Yogurt (plain)",    "calories": 98,  "protein_g": 6,  "carbs_g": 7,  "fats_g": 5,   "portion": "1 katori / 150g", "tags": ["veg", "veg_lacto", "indian"]},
        {"name": "Lassi (plain)",            "calories": 120, "protein_g": 5,  "carbs_g": 13, "fats_g": 5,   "portion": "1 glass / 250ml", "tags": ["veg", "indian"]},
        {"name": "Buttermilk (chaas)",       "calories": 40,  "protein_g": 3,  "carbs_g": 5,  "fats_g": 1,   "portion": "1 glass / 250ml", "tags": ["veg", "indian"]},
        {"name": "Cheese (low-fat)",         "calories": 75,  "protein_g": 10, "carbs_g": 1,  "fats_g": 3,   "portion": "30g / 1 slice", "tags": ["veg", "veg_lacto"]},
        {"name": "Paneer (Indian cottage cheese)", "calories": 265, "protein_g": 18, "carbs_g": 3, "fats_g": 20, "portion": "100g", "tags": ["veg", "indian"]},
    ],

    # ── FATS & NUTS ──
    "fats_and_nuts": [
        {"name": "Almonds",                  "calories": 164, "protein_g": 6,  "carbs_g": 6,  "fats_g": 14,  "portion": "28g / ~23 almonds", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Walnuts",                  "calories": 185, "protein_g": 4,  "carbs_g": 4,  "fats_g": 18,  "portion": "28g / ~14 halves", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Peanut Butter",            "calories": 188, "protein_g": 8,  "carbs_g": 6,  "fats_g": 16,  "portion": "2 tbsp / 32g", "tags": ["veg"]},
        {"name": "Olive Oil",                "calories": 119, "protein_g": 0,  "carbs_g": 0,  "fats_g": 14,  "portion": "1 tbsp / 14g", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Ghee",                     "calories": 130, "protein_g": 0,  "carbs_g": 0,  "fats_g": 15,  "portion": "1 tsp / 10g", "tags": ["veg", "indian"]},
        {"name": "Coconut Oil",              "calories": 117, "protein_g": 0,  "carbs_g": 0,  "fats_g": 14,  "portion": "1 tbsp / 14g", "tags": ["veg", "indian"]},
        {"name": "Mixed Dry Fruits",         "calories": 160, "protein_g": 4,  "carbs_g": 20, "fats_g": 8,   "portion": "30g", "tags": ["veg", "indian"]},
        {"name": "Cashews",                  "calories": 157, "protein_g": 5,  "carbs_g": 9,  "fats_g": 12,  "portion": "28g / ~18 nuts", "tags": ["veg"]},
        {"name": "Avocado",                  "calories": 160, "protein_g": 2,  "carbs_g": 9,  "fats_g": 15,  "portion": "100g / ~1/2 avocado", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Flaxseeds",                "calories": 55,  "protein_g": 2,  "carbs_g": 3,  "fats_g": 4,   "portion": "1 tbsp / 10g", "tags": ["veg", "anti_inflammatory", "high_fiber"]},
        {"name": "Chia Seeds",               "calories": 58,  "protein_g": 2,  "carbs_g": 5,  "fats_g": 3.5, "portion": "1 tbsp / 10g", "tags": ["veg", "anti_inflammatory", "high_fiber"]},
    ],

    # ── SNACKS ──
    "snacks": [
        {"name": "Roasted Chana",            "calories": 164, "protein_g": 9,  "carbs_g": 27, "fats_g": 2.6, "portion": "40g / small bowl", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Makhana (fox nuts)",       "calories": 94,  "protein_g": 3,  "carbs_g": 20, "fats_g": 0.1, "portion": "30g / 1 cup", "tags": ["veg", "indian"]},
        {"name": "Rice Cakes",               "calories": 70,  "protein_g": 1.5,"carbs_g": 15, "fats_g": 0.5, "portion": "2 cakes / 18g", "tags": ["veg"]},
        {"name": "Protein Bar (homemade/commercial)", "calories": 200, "protein_g": 15, "carbs_g": 22, "fats_g": 7, "portion": "1 bar / 60g", "tags": ["veg", "non_veg"]},
        {"name": "Sprout Chaat",             "calories": 120, "protein_g": 8,  "carbs_g": 18, "fats_g": 2,   "portion": "1 bowl / 150g", "tags": ["veg", "indian", "high_fiber"]},
        {"name": "Fruit Bowl (mixed)",       "calories": 90,  "protein_g": 1,  "carbs_g": 22, "fats_g": 0.3, "portion": "1 bowl / 150g", "tags": ["veg"]},
        {"name": "Boiled Eggs (2)",          "calories": 155, "protein_g": 13, "carbs_g": 1,  "fats_g": 11,  "portion": "2 eggs / 100g", "tags": ["non_veg", "veg_ovo"]},
        {"name": "Hummus with veggies",      "calories": 165, "protein_g": 6,  "carbs_g": 18, "fats_g": 8,   "portion": "50g hummus + 80g veggies", "tags": ["veg"]},
        {"name": "Peanuts (roasted)",        "calories": 166, "protein_g": 7,  "carbs_g": 6,  "fats_g": 14,  "portion": "28g", "tags": ["veg", "indian"]},
    ],

    # ── BEVERAGES ──
    "beverages": [
        {"name": "Green Tea",                "calories": 0,   "protein_g": 0,  "carbs_g": 0,  "fats_g": 0,   "portion": "1 cup / 240ml", "tags": ["veg", "anti_inflammatory"]},
        {"name": "Black Coffee (no sugar)",  "calories": 2,   "protein_g": 0.3,"carbs_g": 0,  "fats_g": 0,   "portion": "1 cup / 240ml", "tags": ["veg"]},
        {"name": "Turmeric Milk (haldi doodh)", "calories": 120, "protein_g": 5, "carbs_g": 12, "fats_g": 5,  "portion": "1 glass / 240ml", "tags": ["veg", "indian", "anti_inflammatory"]},
        {"name": "Coconut Water",            "calories": 46,  "protein_g": 1.7,"carbs_g": 9,  "fats_g": 0.5, "portion": "1 cup / 240ml", "tags": ["veg", "indian"]},
        {"name": "Lemon Water",              "calories": 11,  "protein_g": 0.2,"carbs_g": 3,  "fats_g": 0,   "portion": "1 glass / 240ml + lemon", "tags": ["veg"]},
        {"name": "Protein Shake (milk)",     "calories": 240, "protein_g": 32, "carbs_g": 16, "fats_g": 5,   "portion": "1 scoop + 250ml milk", "tags": ["veg", "non_veg"]},
    ],
}

# ─────────────────────────────────────────────
#  PHYTONUTRIENT RECOMMENDATIONS
#  Source: Diet and Nutrition.xlsx — Food List and Alternative sheet
#  Relevant to somatotype + muscle/bone physiology
# ─────────────────────────────────────────────

PHYTONUTRIENTS = {
    "Endomorph": [
        {"compound": "EGCG (Green Tea)",          "benefit": "Improves fat metabolism and mitochondrial function", "source": "Green tea daily (2-3 cups)", "effective_intake": "200–400 mg/day"},
        {"compound": "Curcumin (Turmeric)",        "benefit": "Anti-inflammatory via NF-κB inhibition, supports fat loss", "source": "Turmeric powder in cooking or milk", "effective_intake": "500–1500 mg/day"},
        {"compound": "Fucoxanthin (Seaweed)",      "benefit": "Stimulates fat oxidation via UCP1 pathways", "source": "Edible seaweed powders / algal supplements", "effective_intake": "2–4 mg/day"},
        {"compound": "Resveratrol (Grapes)",       "benefit": "Activates SIRT1 longevity pathway, metabolic health", "source": "Black grapes, red wine (moderate)", "effective_intake": "150–500 mg/day"},
        {"compound": "Chlorogenic Acid (Coffee)",  "benefit": "Improves glucose metabolism, reduces fat absorption", "source": "Green coffee / black coffee", "effective_intake": "200–400 mg/day"},
        {"compound": "Quercetin (Onion)",          "benefit": "Activates mitochondrial biogenesis (AMPK pathway)", "source": "Red onion, apples", "effective_intake": "500–1000 mg/day"},
        {"compound": "Naringenin (Citrus)",        "benefit": "Improves lipid metabolism", "source": "Oranges, mosambi", "effective_intake": "100–200 mg/day"},
        {"compound": "Allicin (Garlic)",           "benefit": "Anti-inflammatory, cardiovascular support", "source": "Raw or cooked garlic", "effective_intake": "~5 mg/day"},
    ],
    "Mesomorph": [
        {"compound": "Kaempferol (Broccoli)",      "benefit": "Anti-inflammatory and bone protection", "source": "Broccoli, mustard greens", "effective_intake": "10–50 mg/day"},
        {"compound": "Curcumin (Turmeric)",        "benefit": "Reduces post-workout inflammation via NF-κB", "source": "Turmeric, haldi milk", "effective_intake": "500–1500 mg/day"},
        {"compound": "Gingerol (Ginger)",          "benefit": "Reduces muscle soreness after exercise", "source": "Fresh ginger root in tea or food", "effective_intake": "10–20 mg/day"},
        {"compound": "Sulforaphane (Broccoli)",    "benefit": "Stimulates antioxidant enzymes (Nrf2 pathway)", "source": "Broccoli sprouts, mustard sprouts", "effective_intake": "20–40 mg/day"},
        {"compound": "Anthocyanins (Berries)",     "benefit": "Improves vascular flow and muscle recovery", "source": "Jamun, black rice, berries", "effective_intake": "100–300 mg/day"},
        {"compound": "Hesperidin (Citrus peel)",   "benefit": "Improves vascular function and recovery", "source": "Sweet lime, citrus peel", "effective_intake": "100–300 mg/day"},
        {"compound": "Boswellic Acids (Salai)",    "benefit": "Anti-inflammatory joint protection", "source": "Salai guggul, frankincense supplements", "effective_intake": "100–250 mg/day"},
        {"compound": "Genistein (Soy/Fermented)",  "benefit": "Supports bone density via estrogen receptor", "source": "Fermented soy, edamame", "effective_intake": "40–60 mg/day"},
    ],
    "Ectomorph": [
        {"compound": "Quercetin (Onion/Apple)",    "benefit": "Activates AMPK mitochondrial biogenesis", "source": "Red onion, apples", "effective_intake": "500–1000 mg/day"},
        {"compound": "Lutein (Spinach)",           "benefit": "Antioxidant protection of muscle mitochondria", "source": "Amaranth leaves, spinach", "effective_intake": "10–20 mg/day"},
        {"compound": "Betalains (Beetroot)",       "benefit": "Antioxidant support for endurance", "source": "Beetroot juice or cooked beets", "effective_intake": "~100 mg/day"},
        {"compound": "Anthocyanins (Berries)",     "benefit": "Improves vascular flow for muscle growth", "source": "Jamun, blueberries, dark berries", "effective_intake": "100–300 mg/day"},
        {"compound": "Apigenin (Parsley)",         "benefit": "Improves mitochondrial efficiency", "source": "Coriander leaves, parsley", "effective_intake": "~50 mg/day"},
        {"compound": "Myricetin (Tea/Berries)",    "benefit": "Antioxidant activity in muscle cells", "source": "Tea leaves, berries", "effective_intake": "~100 mg/day"},
        {"compound": "Astaxanthin (Microalgae)",   "benefit": "Reduces exercise-induced oxidative damage", "source": "Algal supplements", "effective_intake": "4–12 mg/day"},
        {"compound": "Puerarin (Kudzu root)",      "benefit": "Improves circulation and muscle recovery", "source": "Herbal extracts, kudzu root", "effective_intake": "~50 mg/day"},
    ],
}

# ─────────────────────────────────────────────
#  PORTION ADJUSTMENT BY SOMATOTYPE
#  Source: ISSN sports nutrition guidelines (Diet and Nutrition.xlsx)
# ─────────────────────────────────────────────

SOMATOTYPE_PORTION_RULES = {
    "Endomorph": {
        "description": "Reduce carb portions by 20–25%, increase vegetable volume, moderate protein portions",
        "carb_multiplier": 0.80,
        "protein_multiplier": 1.0,
        "fat_multiplier": 0.90,
        "notes": "Emphasise complex carbs with low glycaemic index. Avoid simple sugars and processed foods.",
        "meal_timing": "3 main meals + 1 snack. Avoid carb-heavy meals after 7 PM.",
        "preferred_carbs": ["Oats", "Sweet potato", "Brown rice", "Quinoa", "Moong dal"],
        "avoid": ["White rice in excess", "Fruit juice", "Maida", "Fried snacks"],
    },
    "Mesomorph": {
        "description": "Balanced portions following target macro split. Moderate carb cycling.",
        "carb_multiplier": 1.0,
        "protein_multiplier": 1.0,
        "fat_multiplier": 1.0,
        "notes": "Well-rounded intake. Post-workout nutrition is especially important for recovery.",
        "meal_timing": "3 main meals + 2 snacks. Increase carbs on training days.",
        "preferred_carbs": ["Brown rice", "Oats", "Roti", "Quinoa", "Sweet potato"],
        "avoid": ["Trans fats", "Highly processed food"],
    },
    "Ectomorph": {
        "description": "Increase carb and overall calorie portions by 15–20%. Calorie-dense foods are key.",
        "carb_multiplier": 1.20,
        "protein_multiplier": 1.0,
        "fat_multiplier": 1.15,
        "notes": "Frequent meals essential. Never skip meals. Prioritise calorie-dense whole foods.",
        "meal_timing": "5–6 small to medium meals throughout the day. Pre/post workout meals critical.",
        "preferred_carbs": ["White rice", "Banana", "Oats", "Roti", "Potatoes", "Pasta"],
        "avoid": ["Excessive cardio without caloric compensation"],
    },
}

# ─────────────────────────────────────────────
#  MEAL TEMPLATES (role → what each meal provides)
# ─────────────────────────────────────────────

MEAL_TEMPLATES = [
    {
        "meal_name": "Breakfast",
        "time": "7:30 AM",
        "role": "Break overnight fast. Provide energy for the morning.",
        "macro_share": 0.25,   # 25% of daily calories
        "carb_share": 0.30,
        "protein_share": 0.25,
    },
    {
        "meal_name": "Mid-Morning Snack",
        "time": "10:30 AM",
        "role": "Maintain energy between meals. Prevent overeating at lunch.",
        "macro_share": 0.10,
        "carb_share": 0.10,
        "protein_share": 0.10,
    },
    {
        "meal_name": "Lunch",
        "time": "1:00 PM",
        "role": "Largest meal. Fuel afternoon activity and training.",
        "macro_share": 0.30,
        "carb_share": 0.30,
        "protein_share": 0.30,
    },
    {
        "meal_name": "Evening Snack",
        "time": "4:30 PM",
        "role": "Pre-workout fuel or afternoon energy boost.",
        "macro_share": 0.15,
        "carb_share": 0.15,
        "protein_share": 0.15,
    },
    {
        "meal_name": "Dinner",
        "time": "7:30 PM",
        "role": "Recovery meal. Prioritise protein for overnight muscle repair.",
        "macro_share": 0.20,
        "carb_share": 0.15,
        "protein_share": 0.20,
    },
]

# ─────────────────────────────────────────────
#  MEAL REASON TEMPLATES (rule-based explanations)
# ─────────────────────────────────────────────

MEAL_REASONS = {
    "Breakfast": {
        "Endomorph": "Starting with a low-GI, protein-rich breakfast stabilises blood sugar and prevents fat storage hormones from spiking. For Endomorphs, this is the most important meal to control.",
        "Mesomorph": "A balanced breakfast fuels your natural anabolic potential. Complex carbs with protein is the ideal combo to kickstart muscle protein synthesis.",
        "Ectomorph": "Ectomorphs have fast metabolisms — a calorie-dense breakfast prevents muscle catabolism and gives your engine the fuel it needs right from the start.",
    },
    "Mid-Morning Snack": {
        "Endomorph": "A small, protein-focused snack keeps metabolism active without overloading carbs. Think of it as stoking a slow-burning fire.",
        "Mesomorph": "Bridge meal that keeps nitrogen balance positive and prevents the catabolic window between breakfast and lunch.",
        "Ectomorph": "Critical for Ectomorphs to maintain caloric surplus. A snack here can be the difference between maintaining and losing weight.",
    },
    "Lunch": {
        "Endomorph": "Largest meal of the day but carb-moderated. Load up on protein and fibre-rich vegetables to feel full without insulin spikes.",
        "Mesomorph": "Your body is primed for nutrients at midday. This is your highest carb window — use it to fuel afternoon performance.",
        "Ectomorph": "Maximum calorie opportunity. Eat a hearty, calorie-dense lunch with plenty of complex carbs and quality protein.",
    },
    "Evening Snack": {
        "Endomorph": "Pre-workout snack should be light and low-GI. Avoid carb loading here — use protein to fuel the session.",
        "Mesomorph": "Pre-training carbs power your session. A moderate carb + protein snack 60–90 min before training optimises performance.",
        "Ectomorph": "Pre-workout fuelling is essential. Ectomorphs need carbs before training to have energy without burning muscle.",
    },
    "Dinner": {
        "Endomorph": "Dinner is protein-dominant and carb-light for Endomorphs. Your body will use protein for overnight recovery without storing excess carbs.",
        "Mesomorph": "Recovery-focused dinner. The protein here drives overnight muscle protein synthesis while you sleep.",
        "Ectomorph": "Keep dinner calorie-dense with both protein and complex carbs. Ectomorphs benefit from a casein-like slow release through dinner.",
    },
}

MEAL_ANALOGIES = {
    "Breakfast": {
        "Endomorph": "Like lighting a campfire with dry wood — burns cleanly, steadily, and doesn't produce smoke (fat).",
        "Mesomorph": "Think of it as a high-quality engine warm-up: slow fuel in, clean burn out.",
        "Ectomorph": "Your metabolism is like a sports car with a huge engine — fill the tank fully at the start or it'll sputter before noon.",
    },
    "Mid-Morning Snack": {
        "Endomorph": "A small log on the metabolic fire — keeps it going without overfeeding the flame.",
        "Mesomorph": "A maintenance pit stop — topping up the tank before it runs empty.",
        "Ectomorph": "Extra fuel at the petrol station — you burn through it fast, so never miss a top-up.",
    },
    "Lunch": {
        "Endomorph": "The main reactor — powerful but controlled. Quality fuel burns longer than junk.",
        "Mesomorph": "The main performance meal — your body is at peak nutrient absorption now.",
        "Ectomorph": "The big opportunity — like a freight train getting coal, load up for the long haul.",
    },
    "Evening Snack": {
        "Endomorph": "Pre-flight check before your workout — light, efficient, no excess baggage.",
        "Mesomorph": "Rocket fuel before launch — clean carbs + protein for peak training output.",
        "Ectomorph": "The pre-game warm-up meal — prime your muscle fibres with glycogen before the session.",
    },
    "Dinner": {
        "Endomorph": "Nighttime construction crew: protein repairs, not carbs. Less traffic on the metabolic highway at night.",
        "Mesomorph": "Overnight rebuild: the protein in this meal is the bricklayer working while you sleep.",
        "Ectomorph": "Slow-release overnight fuel — your muscles need building material even while sleeping.",
    },
}

# ─────────────────────────────────────────────
#  GROCERY LIST CATEGORIES
# ─────────────────────────────────────────────

GROCERY_CATEGORIES = ["proteins", "grains", "vegetables", "fruits", "dairy", "fats_and_nuts", "others"]
