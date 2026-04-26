"""
COLAB API SERVER — Paste this entire cell into Colab AFTER running all setup cells (1-8).
All functions (run_inference, parse_measurements_from_output, compute_ratios,
SomatotypeClassifier, cm_to_inches) must already be in memory.

Instructions:
  1. Run all setup cells (install deps, clone repo, load classifier, define functions)
  2. Paste this cell and run it
  3. Copy the ngrok URL printed at the bottom
  4. Paste it into your local app's COLAB_URL variable
"""

# ── Install Flask + ngrok ──
!pip install flask pyngrok -q

import os
import uuid
import shutil
from flask import Flask, request, jsonify
from pyngrok import ngrok

# ─────────────────────────────────────────────
#  PUT YOUR NGROK AUTHTOKEN HERE
# ─────────────────────────────────────────────
NGROK_TOKEN = "3Az9UffNLvPvkNpZ25EzrCJDIHQ_2tYT4GwAftRkmhXowtkGb"
# ─────────────────────────────────────────────

ngrok.set_auth_token(NGROK_TOKEN)

app = Flask(__name__)

# Health check
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "BodyType API is running on Colab!"})


@app.route("/classify", methods=["POST"])
def classify():
    """
    Expects multipart/form-data:
      - image: file (jpg/png)
      - height_cm: float
      - weight_kg: float
    Returns JSON with measurements, ratios, and classification.
    """
    try:
        # ── Validate inputs ──
        if "image" not in request.files:
            return jsonify({"error": "No image file provided"}), 400

        height_cm = request.form.get("height_cm", type=float)
        weight_kg = request.form.get("weight_kg", type=float)

        if not height_cm or not weight_kg:
            return jsonify({"error": "height_cm and weight_kg are required"}), 400

        # ── Save uploaded image to temp path ──
        image_file = request.files["image"]
        uid = uuid.uuid4().hex[:8]
        save_dir = "/content/Human-Body-Measurements-using-Computer-Vision"
        image_path = os.path.join(save_dir, f"upload_{uid}.jpg")
        image_file.save(image_path)

        height_inches = cm_to_inches(height_cm)

        # ── Run HMR inference (this is the ~30s part) ──
        print(f"🔄 Running inference for h={height_cm}cm, w={weight_kg}kg ...")
        raw_output = run_inference(image_path, height_inches)
        print(f"📋 Raw output:\n{raw_output}")

        # ── Parse measurements ──
        measurements = parse_measurements_from_output(raw_output)

        if not measurements:
            # Clean up
            os.remove(image_path)
            return jsonify({
                "error": "Could not parse measurements from model output",
                "raw_output": raw_output
            }), 422

        # ── Convert inches → cm (inference outputs inches) ──
        INCH_TO_CM = 2.54
        for key in ['waist', 'hip', 'chest', 'shoulder', 'upper_arm', 'thigh', 'inseam', 'belly']:
            if key in measurements:
                measurements[key] = round(measurements[key] * INCH_TO_CM, 2)

        # ── Compute ratios ──
        ratios = compute_ratios(measurements, height_cm, weight_kg)

        # ── Classify somatotype ──
        classifier = SomatotypeClassifier()
        results = classifier.classify(ratios)

        # ── BMI ──
        bmi = round(weight_kg / (height_cm / 100) ** 2, 1)

        # ── Build response ──
        response = {
            "success": True,
            "input": {
                "height_cm": height_cm,
                "weight_kg": weight_kg,
                "bmi": bmi
            },
            "measurements_cm": measurements,
            "ratios": ratios,
            "classification": {
                "components": results["components"],
                "somatotype_rating": f"{results['components']['endomorphy']} - {results['components']['mesomorphy']} - {results['components']['ectomorphy']}",
                "coordinates": {"x": results["coordinates"][0], "y": results["coordinates"][1]},
                "classification": results["classification"],
                "body_type": results["hybrid_type"]
            }
        }

        # ── Interpretation ──
        comp = results["components"]
        dominant = max(
            [("Endomorph", comp["endomorphy"]),
             ("Mesomorph", comp["mesomorphy"]),
             ("Ectomorph", comp["ectomorphy"])],
            key=lambda x: x[1]
        )
        interp = {
            "Endomorph": "Body tends to store fat easily. Focus on cardio and caloric control.",
            "Mesomorph": "Body responds well to training. Builds muscle efficiently.",
            "Ectomorph": "Body is lean and linear. May find it harder to gain mass."
        }
        response["interpretation"] = {
            "dominant_type": dominant[0],
            "description": interp[dominant[0]]
        }

        # Clean up uploaded image
        os.remove(image_path)

        return jsonify(response)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# ── Start server with ngrok tunnel ──
port = 5000
public_url = ngrok.connect(port)
print("\n" + "=" * 60)
print("🚀  COLAB API SERVER IS LIVE!")
print(f"📡  Public URL: {public_url}")
print(f"📡  Classify endpoint: {public_url}/classify")
print("=" * 60)
print("\n👉 Copy the URL above and paste it into your local app.\n")

app.run(port=port)
