"""
Gemini API wrapper — handles model initialization and structured JSON calls.
"""

import os
import json
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

_model = None

def get_model():
    """Get or initialize the Gemini model."""
    global _model
    if _model is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY not set in .env file")
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel("gemini-2.5-flash")
    return _model


def generate_json(prompt, max_retries=2):
    """
    Call Gemini with a prompt and parse the response as JSON.
    Retries once if JSON parsing fails.
    """
    model = get_model()

    for attempt in range(max_retries):
        try:
            response = model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.7,
                ),
            )
            text = response.text.strip()
            return json.loads(text)
        except json.JSONDecodeError as e:
            if attempt < max_retries - 1:
                print(f"⚠️ Gemini JSON parse failed (attempt {attempt+1}), retrying...")
                continue
            raise ValueError(f"Gemini returned invalid JSON after {max_retries} attempts: {e}")
        except Exception as e:
            raise ValueError(f"Gemini API error: {e}")
