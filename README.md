# FitScan — AI Body Analysis & Fitness Planner

Full-stack web application that classifies body type (somatotype) from photos or video using a hybrid of local MediaPipe pose analysis and GPU-accelerated Human Mesh Recovery (HMR) on Google Colab. Generates personalised exercise and diet plans using a deterministic rule engine — no paid AI API required.

---

## Features

- **Somatotype classification** — Heath-Carter statistical model adapted with z-score normalisation; classifies into Endomorph / Mesomorph / Ectomorph and 13 hybrid types
- **Hybrid measurement pipeline** — MediaPipe (local CPU) for skeletal ratios; HMR on Colab GPU for circumference measurements; results merged before classification
- **Multi-view video** — upload a 360° rotation video; backend auto-extracts front, side, and 45° frames, runs HMR on all three, averages circumference measurements
- **18 joint angles** — knee, hip, elbow, shoulder, ankle, wrist, neck, Q-angle, foot arch, + structural angles (trunk lean, forward head posture, head tilt, shoulder/hip tilt)
- **270-exercise database** — rule-engine selects exercises by body type, goal, experience, equipment, gender, and target muscle group; supports in-session swaps
- **Diet planning** — macro targets via BMR/TDEE (Mifflin-St Jeor); Indian/international food options; phytonutrient recommendations
- **Progress tracking** — scan history, streak counter, weight trend charts (Plotly), water intake tracker
- **Gaussian Splatting** (optional) — forward video to a second Colab notebook for 3D NeRF-style body reconstruction
- **SQLite database** — local, zero-config, single-file persistence

---

## Architecture

```
Browser
  │
  ├─ GET/POST ──► Flask (app.py, port 5050)
  │                 │
  │                 ├─ /api/analyze          ──► pose_analyzer.py (MediaPipe, local CPU)
  │                 ├─ /api/analyze/video    ──► pose_analyzer.analyze_video() → 3-frame extraction
  │                 ├─ /api/hmr/classify     ──► Colab ngrok URL → HMR GPU inference
  │                 ├─ /api/exercise/generate ─► services/rule_engine.py
  │                 ├─ /api/diet/generate    ──► services/diet_service.py
  │                 └─ /api/gaussian/*       ──► Gaussian Splatting Colab (optional)
  │
  └─ Static JS/CSS (templates/, static/)

Google Colab (GPU)
  ├─ HMR notebook  → SMPL body mesh → circumference measurements → somatotype
  └─ Gaussian notebook (optional) → 3D reconstruction from video
```

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.10+ |
| Google Colab | Free tier (T4 GPU) or better |
| ngrok account | Free (for Colab tunnel) |
| Webcam / phone | For body scans |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/<your-username>/fitscan.git
cd fitscan

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create .env
cp .env.example .env
# Edit .env — paste your Colab ngrok URL after starting the Colab server

# 4. Run
python app.py
# → http://localhost:5050
```

**`.env` file:**
```
COLAB_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app
SECRET_KEY=change-me-in-production
# Optional:
GAUSSIAN_COLAB_URL=https://yyyy-yy-yy-yy-yy.ngrok-free.app
```

---

## Colab Setup (HMR Server)

1. Open `BodyType_CV_Classification_FIXED.ipynb` in Google Colab
2. Run cells 1–8 (installs HMR, clones CV repo, loads model, defines functions)
3. In cell 10, replace `NGROK_TOKEN` with your ngrok authtoken
4. Run cell 10 — copy the printed ngrok URL
5. Paste into `.env` as `COLAB_URL`
6. Restart Flask

The Colab server stays alive while the notebook is open. Free Colab sessions last ~12 hours.

---

## Usage

### Body Scan

1. Go to `/scan`
2. Choose input method:
   - **Webcam** — auto-capture after 5-second countdown
   - **Image** — upload a full-body front-facing photo
   - **Video** — upload a 360° rotation video, click **Auto-Extract 3 Views**
3. Enter height (cm) and weight (kg)
4. Click **Analyze Body Type**

**What happens:**
1. MediaPipe detects 33 pose landmarks locally (CPU, ~0.5s)
2. Skeletal ratios (SHR, UAG_H, TG_H, LL_H) sent to Colab as MediaPipe overrides
3. HMR model infers SMPL body mesh → circumference measurements
4. BMI correction applied to SHR for subjects with BMI > 30
5. Heath-Carter classifier produces Endomorphy / Mesomorphy / Ectomorphy z-scores
6. Results saved to database; Dashboard updates

### Exercise & Diet Plans

After completing a scan, navigate to `/exercise` or `/diet` to generate plans. The rule engine uses your body type, goals, experience level, available equipment, and gender to select and order exercises.

---

## Measurement Pipeline

### MediaPipe Skeletal Ratios

| Ratio | Formula | Source |
|---|---|---|
| SHR | shoulder_width / hip_width | Claessens et al. 1990 |
| UAG_H | upper_arm_length / height | Martin & Saller 1957 |
| TG_H | thigh_length / height | Heath & Carter 1967 |
| LL_H | (thigh + shin) / height | Drillis & Contini 1966 |
| FL_H | foot_length / height | Claessens et al. 1990 |
| ASR | arm_span / height | Da Vinci / Vitruvian Man |
| AII | (shoulder_width − hip_width) / height | V-taper index |
| CI | spine_length / height | Cormic Index proxy |

### HMR Circumference Corrections

| Correction | Applied when | Method |
|---|---|---|
| Inch → cm | Always | × 2.54 |
| BMI circumference correction | BMI > 25 | 2% per BMI unit above 25 |
| SHR BMI correction | BMI > 30 | 1% per BMI unit above 25 (capped at BMI 45) |
| SHR confidence | BMI > 35 → low, > 30 → medium, else high | — |

### Estimated Measurements (from ratios)

| Measurement | Formula | Source |
|---|---|---|
| Neck | chest × 0.37 | Behnke 1959 |
| Forearm | upper_arm × 0.75 | Standard anthropometry |
| Calf | thigh × 0.66 | Standard anthropometry |
| Wrist | height × 0.175 | Martin & Saller 1957 |
| Ankle | height × 0.21 | Claessens et al. 1990 |
| Head circumference | height × 0.345 | Rollnick 1984 |

---

## Joint Angles Reference

### Angle Definitions (at vertex landmark)

| Angle | Proximal → Vertex → Distal | Clinical use |
|---|---|---|
| knee | hip → knee → ankle | Knee flexion / hyperextension |
| hip | shoulder → hip → knee | Hip flexion ROM |
| elbow | shoulder → elbow → wrist | Elbow flexion |
| shoulder | hip → shoulder → elbow | Shoulder abduction |
| ankle | knee → ankle → foot_index | Dorsiflexion assessment |
| Q-angle | hip → knee → foot_index | Knee valgus / varus risk |
| wrist | elbow → wrist → index | Wrist flexion / extension |
| neck | ear → shoulder → hip | Cervical-torso alignment |
| foot arch | heel → ankle → foot_index | Medial arch estimation |

### Structural Alignment Angles

| Angle | Description | Normal range |
|---|---|---|
| shoulder_tilt_deg | Shoulder line from horizontal | ±3° |
| hip_tilt_deg | Hip line from horizontal | ±3° |
| trunk_lean_deg | Spine (mid-hip → mid-shoulder) from vertical | ±5° |
| head_tilt_deg | Ear-to-ear line from horizontal | ±5° |
| forward_head_deg | Ear → shoulder from vertical | < 10° ideal |

---

## Project Structure

```
fitscan/
├── app.py                     # Flask app, all API routes
├── pose_analyzer.py           # MediaPipe pose analysis + angle computation
├── local_app.py               # Standalone local test server (no auth)
├── colab_server.py            # Reference — Colab cell 10 (ngrok API server)
├── gaussian_server.py         # Gaussian Splatting Colab server reference
├── requirements.txt
├── .env.example
│
├── services/
│   ├── db_service.py          # SQLite CRUD
│   ├── rule_engine.py         # BMR/TDEE, macro targets, exercise selection rules
│   ├── exercise_service.py    # Plan generator (calls rule engine)
│   ├── diet_service.py        # Diet plan generator
│   ├── exercise_data.py       # 270-exercise database
│   └── food_data.py           # Food + phytonutrient database
│
├── templates/
│   ├── base.html
│   ├── scan.html              # Body scan page (webcam / image / video)
│   ├── dashboard.html
│   ├── exercise.html
│   ├── diet.html
│   ├── onboarding.html
│   ├── settings.html
│   ├── login.html
│   └── register.html
│
└── static/
    ├── js/scan.js             # Scan page logic (pose → Colab → results)
    ├── models/                # 3D anatomy FBX models + textures
    └── splat-viewer.html      # Gaussian Splat viewer
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/analyze` | MediaPipe pose on single image |
| POST | `/api/analyze/video` | Multi-view extraction + HMR on 3 frames |
| POST | `/api/hmr/classify` | Proxy single image to Colab HMR |
| GET | `/api/hmr/status` | Check Colab connectivity |
| POST | `/api/exercise/generate` | Generate exercise plan |
| POST | `/api/diet/generate` | Generate diet plan |
| GET | `/api/scan-results/latest` | Latest scan result |
| GET | `/api/progress/history` | All scans for history charts |
| POST | `/api/gaussian/trigger` | Send video to Gaussian Splatting Colab |

---

## Somatotype Classification

Uses a z-score statistical model adapted from the Heath-Carter anthropometric method.

```
Endomorphy  = z((WHtR - μ) / σ)   # fat distribution
Mesomorphy  = z((SHR, TG_H, UAG_H combined) - μ) / σ)   # musculoskeletal
Ectomorphy  = z((HWR - μ) / σ)   # linearity / leanness
```

Z-scores are clamped to ±3 to prevent measurement error propagation. Final classification maps (endo, meso, ecto) coordinates to 13 named somatotypes on the Heath-Carter somatochart.

---

## Notes

- The HMR model (Kanazawa et al. CVPR 2018) outputs measurements in inches; the server converts to cm before returning
- Free ngrok URLs change each Colab session — update `COLAB_URL` in `.env` and restart Flask
- MediaPipe model (`pose_landmarker_heavy.task`, ~30 MB) is downloaded automatically on first run
- All user data stored locally in `fitscan.db` (SQLite) — no external database required

---

## License

MIT
