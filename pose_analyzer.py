"""
Local MediaPipe Pose Analyzer — uses the new Tasks API (0.10.14+).
Runs on CPU, no GPU needed.

Usage:
    from pose_analyzer import PoseAnalyzer
    analyzer = PoseAnalyzer()
    result = analyzer.analyze_image("photo.jpg", height_cm=175)
"""

import os
import cv2
import numpy as np
import math
import base64
import urllib.request

import mediapipe as mp
from mediapipe.tasks import python as mp_tasks
from mediapipe.tasks.python import vision

# ── Model download ──
MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "pose_landmarker_heavy.task")


def ensure_model():
    """Download the pose landmarker model if not present."""
    if not os.path.exists(MODEL_PATH):
        print(f"⬇️  Downloading pose model (~30 MB) ...")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)
        print(f"✅ Model saved to {MODEL_PATH}")


# Landmark indices (same order as MediaPipe PoseLandmarker output)
# https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker
LM = {
    'NOSE': 0,
    'LEFT_EYE': 2,
    'RIGHT_EYE': 5,
    'LEFT_SHOULDER': 11,
    'RIGHT_SHOULDER': 12,
    'LEFT_ELBOW': 13,
    'RIGHT_ELBOW': 14,
    'LEFT_WRIST': 15,
    'RIGHT_WRIST': 16,
    'LEFT_HIP': 23,
    'RIGHT_HIP': 24,
    'LEFT_KNEE': 25,
    'RIGHT_KNEE': 26,
    'LEFT_ANKLE': 27,
    'RIGHT_ANKLE': 28,
}

# Segment definitions
SEGMENTS = {
    'left_upper_arm':  ('LEFT_SHOULDER',  'LEFT_ELBOW'),
    'left_forearm':    ('LEFT_ELBOW',     'LEFT_WRIST'),
    'right_upper_arm': ('RIGHT_SHOULDER', 'RIGHT_ELBOW'),
    'right_forearm':   ('RIGHT_ELBOW',    'RIGHT_WRIST'),
    'left_torso':      ('LEFT_SHOULDER',  'LEFT_HIP'),
    'right_torso':     ('RIGHT_SHOULDER', 'RIGHT_HIP'),
    'left_thigh':      ('LEFT_HIP',       'LEFT_KNEE'),
    'left_shin':       ('LEFT_KNEE',      'LEFT_ANKLE'),
    'right_thigh':     ('RIGHT_HIP',      'RIGHT_KNEE'),
    'right_shin':      ('RIGHT_KNEE',     'RIGHT_ANKLE'),
    'shoulder_width':  ('LEFT_SHOULDER',  'RIGHT_SHOULDER'),
    'hip_width':       ('LEFT_HIP',       'RIGHT_HIP'),
}

SYMMETRY_PAIRS = [
    ('left_upper_arm',  'right_upper_arm',  'Upper Arm Symmetry'),
    ('left_forearm',    'right_forearm',     'Forearm Symmetry'),
    ('left_torso',      'right_torso',       'Torso Symmetry'),
    ('left_thigh',      'right_thigh',       'Thigh Symmetry'),
    ('left_shin',       'right_shin',        'Shin Symmetry'),
]

PROPORTION_PAIRS = [
    ('left_torso',     'left_thigh',    'Torso / Thigh'),
    ('left_upper_arm', 'left_forearm',  'Upper Arm / Forearm'),
    ('left_thigh',     'left_shin',     'Thigh / Shin'),
    ('shoulder_width', 'hip_width',     'Shoulder / Hip Width'),
]

# Pose connection pairs for drawing (landmark index pairs)
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),  # arms
    (11, 23), (12, 24), (23, 24),                        # torso
    (23, 25), (25, 27), (24, 26), (26, 28),              # legs
    (0, 11), (0, 12),                                     # nose to shoulders (approx)
]


class PoseAnalyzer:
    def __init__(self):
        ensure_model()

        base_options = mp_tasks.BaseOptions(model_asset_path=MODEL_PATH)
        options = vision.PoseLandmarkerOptions(
            base_options=base_options,
            output_segmentation_masks=False,
            num_poses=1,
        )
        self.landmarker = vision.PoseLandmarker.create_from_options(options)
        print("✅ PoseLandmarker ready (Tasks API)")

    def _dist_px(self, lm1, lm2, w, h):
        """Euclidean distance between two landmarks in pixels."""
        return math.sqrt((lm1.x * w - lm2.x * w) ** 2 +
                         (lm1.y * h - lm2.y * h) ** 2)

    def _draw_landmarks(self, frame, landmarks, w, h):
        """Draw landmarks and connections on the frame."""
        annotated = frame.copy()

        # Draw connections
        for i1, i2 in POSE_CONNECTIONS:
            if i1 < len(landmarks) and i2 < len(landmarks):
                pt1 = (int(landmarks[i1].x * w), int(landmarks[i1].y * h))
                pt2 = (int(landmarks[i2].x * w), int(landmarks[i2].y * h))
                cv2.line(annotated, pt1, pt2, (255, 0, 0), 2)

        # Draw landmark dots
        for idx in LM.values():
            if idx < len(landmarks):
                lm = landmarks[idx]
                cx, cy = int(lm.x * w), int(lm.y * h)
                cv2.circle(annotated, (cx, cy), 5, (0, 255, 0), -1)
                cv2.circle(annotated, (cx, cy), 5, (0, 200, 0), 2)

        return annotated

    def analyze_image(self, image_input, height_cm=None):
        """
        Analyze a single image for pose landmarks and joint ratios.

        Args:
            image_input: file path (str), numpy array (BGR), or bytes
            height_cm: optional — if given, pixel lengths are also converted to cm

        Returns:
            dict with analysis results, or {"error": ...} on failure
        """
        # ── Load image ──
        if isinstance(image_input, str):
            frame = cv2.imread(image_input)
        elif isinstance(image_input, bytes):
            arr = np.frombuffer(image_input, np.uint8)
            frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        elif isinstance(image_input, np.ndarray):
            frame = image_input
        else:
            return {"error": "Unsupported image_input type"}

        if frame is None:
            return {"error": "Could not decode image"}

        h, w, _ = frame.shape

        # ── Convert to MediaPipe Image ──
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        # ── Detect pose ──
        result = self.landmarker.detect(mp_image)

        if not result.pose_landmarks or len(result.pose_landmarks) == 0:
            return {"error": "No pose detected in image — ensure full body is visible"}

        landmarks = result.pose_landmarks[0]  # first (only) person
        landmark_count = len(landmarks)

        # ── Compute segment lengths (pixels) ──
        lengths_px = {}
        for seg_name, (start_name, end_name) in SEGMENTS.items():
            i1 = LM[start_name]
            i2 = LM[end_name]
            if i1 < landmark_count and i2 < landmark_count:
                lengths_px[seg_name] = round(self._dist_px(landmarks[i1], landmarks[i2], w, h), 1)

        # ── Pixel-to-cm scale (if height given) ──
        lengths_cm = {}
        px_per_cm = None
        if height_cm and LM['NOSE'] < landmark_count and LM['LEFT_ANKLE'] < landmark_count:
            nose = landmarks[LM['NOSE']]
            l_ankle = landmarks[LM['LEFT_ANKLE']]
            r_ankle = landmarks[LM['RIGHT_ANKLE']]
            mid_ankle_y = (l_ankle.y + r_ankle.y) / 2
            body_height_px = abs(mid_ankle_y - nose.y) * h
            body_height_px *= 1.10  # +10% for top of head above nose
            if body_height_px > 0:
                px_per_cm = body_height_px / height_cm
                for seg_name, px_val in lengths_px.items():
                    lengths_cm[seg_name] = round(px_val / px_per_cm, 2)

        # ── Symmetry scores ──
        symmetry = {}
        for left, right, label in SYMMETRY_PAIRS:
            l_val = lengths_px.get(left, 0)
            r_val = lengths_px.get(right, 0)
            if l_val > 0 and r_val > 0:
                ratio = l_val / r_val
                symmetry[label] = {
                    "ratio": round(ratio, 3),
                    "assessment": "Good" if 0.92 <= ratio <= 1.08 else "Asymmetric",
                }
            else:
                symmetry[label] = {"ratio": 0, "assessment": "N/A"}

        # ── Body proportion ratios ──
        proportions = {}
        for num, den, label in PROPORTION_PAIRS:
            n_val = lengths_px.get(num, 0)
            d_val = lengths_px.get(den, 0)
            if n_val > 0 and d_val > 0:
                proportions[label] = round(n_val / d_val, 3)

        # ── Skeletal ratios for somatotype classifier (hybrid) ──
        # These replace the HMR-based SHR, TG_H, LL_H, UAG_H with real
        # skeletal proportions from MediaPipe landmarks.
        skeletal_ratios = {}
        if height_cm and lengths_cm:
            # SHR — Shoulder Width / Height (skeletal biacromial breadth)
            if 'shoulder_width' in lengths_cm:
                skeletal_ratios['SHR'] = round(lengths_cm['shoulder_width'] / height_cm, 4)

            # UAG_H — Upper Arm Length / Height
            ua_vals = [lengths_cm[k] for k in ('left_upper_arm', 'right_upper_arm') if k in lengths_cm]
            if ua_vals:
                skeletal_ratios['UAG_H'] = round((sum(ua_vals) / len(ua_vals)) / height_cm, 4)

            # TG_H — Thigh Length / Height
            th_vals = [lengths_cm[k] for k in ('left_thigh', 'right_thigh') if k in lengths_cm]
            if th_vals:
                skeletal_ratios['TG_H'] = round((sum(th_vals) / len(th_vals)) / height_cm, 4)

            # LL_H — Full Leg Length / Height  (thigh + shin)
            left_leg = None
            right_leg = None
            if 'left_thigh' in lengths_cm and 'left_shin' in lengths_cm:
                left_leg = lengths_cm['left_thigh'] + lengths_cm['left_shin']
            if 'right_thigh' in lengths_cm and 'right_shin' in lengths_cm:
                right_leg = lengths_cm['right_thigh'] + lengths_cm['right_shin']
            leg_vals = [v for v in (left_leg, right_leg) if v is not None]
            if leg_vals:
                skeletal_ratios['LL_H'] = round((sum(leg_vals) / len(leg_vals)) / height_cm, 4)

        # ── Draw annotated image ──
        annotated = self._draw_landmarks(frame, landmarks, w, h)
        _, buf = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 85])
        b64 = base64.b64encode(buf).decode('utf-8')
        annotated_b64 = f"data:image/jpeg;base64,{b64}"

        return {
            "landmarks_detected": landmark_count,
            "joint_lengths_px": lengths_px,
            "joint_lengths_cm": lengths_cm if lengths_cm else None,
            "px_per_cm": round(px_per_cm, 2) if px_per_cm else None,
            "symmetry_scores": symmetry,
            "body_proportions": proportions,
            "skeletal_ratios": skeletal_ratios if skeletal_ratios else None,
            "annotated_image_base64": annotated_b64,
        }


# ── Quick self-test ──
if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 2:
        print("Usage: python pose_analyzer.py <image_path> [height_cm]")
        sys.exit(1)

    analyzer = PoseAnalyzer()
    result = analyzer.analyze_image(sys.argv[1], height_cm=float(sys.argv[2]) if len(sys.argv) > 2 else None)

    printable = {k: v for k, v in result.items() if k != "annotated_image_base64"}
    print(json.dumps(printable, indent=2))
