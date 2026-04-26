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
    'LEFT_PINKY': 17,
    'RIGHT_PINKY': 18,
    'LEFT_INDEX': 19,
    'RIGHT_INDEX': 20,
    'LEFT_THUMB': 21,
    'RIGHT_THUMB': 22,
    'LEFT_HIP': 23,
    'RIGHT_HIP': 24,
    'LEFT_KNEE': 25,
    'RIGHT_KNEE': 26,
    'LEFT_ANKLE': 27,
    'RIGHT_ANKLE': 28,
    'LEFT_EAR': 7,
    'RIGHT_EAR': 8,
    'LEFT_HEEL': 29,
    'RIGHT_HEEL': 30,
    'LEFT_FOOT_INDEX': 31,
    'RIGHT_FOOT_INDEX': 32,
}

# Segment definitions
SEGMENTS = {
    # Arms
    'left_upper_arm':   ('LEFT_SHOULDER',   'LEFT_ELBOW'),
    'left_forearm':     ('LEFT_ELBOW',      'LEFT_WRIST'),
    'right_upper_arm':  ('RIGHT_SHOULDER',  'RIGHT_ELBOW'),
    'right_forearm':    ('RIGHT_ELBOW',     'RIGHT_WRIST'),
    # Arm total (straight-line shoulder→wrist; slightly underestimates bent arms)
    'left_arm_total':   ('LEFT_SHOULDER',   'LEFT_WRIST'),
    'right_arm_total':  ('RIGHT_SHOULDER',  'RIGHT_WRIST'),
    # Torso sides
    'left_torso':       ('LEFT_SHOULDER',   'LEFT_HIP'),
    'right_torso':      ('RIGHT_SHOULDER',  'RIGHT_HIP'),
    # Legs
    'left_thigh':       ('LEFT_HIP',        'LEFT_KNEE'),
    'left_shin':        ('LEFT_KNEE',       'LEFT_ANKLE'),
    'right_thigh':      ('RIGHT_HIP',       'RIGHT_KNEE'),
    'right_shin':       ('RIGHT_KNEE',      'RIGHT_ANKLE'),
    # Inseam proxy (hip → ankle straight line)
    'left_inseam':      ('LEFT_HIP',        'LEFT_ANKLE'),
    'right_inseam':     ('RIGHT_HIP',       'RIGHT_ANKLE'),
    # Foot (heel → toe)
    'left_foot':        ('LEFT_HEEL',       'LEFT_FOOT_INDEX'),
    'right_foot':       ('RIGHT_HEEL',      'RIGHT_FOOT_INDEX'),
    # Hand width (pinky MCP → index MCP proxy)
    'left_hand_width':  ('LEFT_PINKY',      'LEFT_INDEX'),
    'right_hand_width': ('RIGHT_PINKY',     'RIGHT_INDEX'),
    # Hand span (thumb tip → pinky tip)
    'left_hand_span':   ('LEFT_THUMB',      'LEFT_PINKY'),
    'right_hand_span':  ('RIGHT_THUMB',     'RIGHT_PINKY'),
    # Arm span (bilateral wrist-to-wrist)
    'arm_span':         ('LEFT_WRIST',      'RIGHT_WRIST'),
    # Head width (ear to ear)
    'head_width':       ('LEFT_EAR',        'RIGHT_EAR'),
    # Bony widths
    'ankle_width':      ('LEFT_ANKLE',      'RIGHT_ANKLE'),
    'knee_width':       ('LEFT_KNEE',       'RIGHT_KNEE'),
    # Widths
    'shoulder_width':   ('LEFT_SHOULDER',   'RIGHT_SHOULDER'),
    'hip_width':        ('LEFT_HIP',        'RIGHT_HIP'),
}

SYMMETRY_PAIRS = [
    ('left_upper_arm',  'right_upper_arm',  'Upper Arm Symmetry'),
    ('left_forearm',    'right_forearm',     'Forearm Symmetry'),
    ('left_torso',      'right_torso',       'Torso Symmetry'),
    ('left_thigh',      'right_thigh',       'Thigh Symmetry'),
    ('left_shin',       'right_shin',        'Shin Symmetry'),
    ('left_arm_total',  'right_arm_total',   'Full Arm Symmetry'),
    ('left_inseam',     'right_inseam',      'Inseam Symmetry'),
    ('left_foot',       'right_foot',        'Foot Length Symmetry'),
]

PROPORTION_PAIRS = [
    ('left_torso',     'left_thigh',    'Torso / Thigh'),
    ('left_upper_arm', 'left_forearm',  'Upper Arm / Forearm'),
    ('left_thigh',     'left_shin',     'Thigh / Shin'),
    ('shoulder_width', 'hip_width',     'Shoulder / Hip Width'),
    ('left_foot',      'left_shin',     'Foot / Shin'),
]

# Joint angle definitions: (proximal_landmark, vertex_landmark, distal_landmark)
# Angle is computed at the vertex point.
ANGLE_DEFINITIONS = {
    'left_knee_angle':      ('LEFT_HIP',       'LEFT_KNEE',      'LEFT_ANKLE'),
    'right_knee_angle':     ('RIGHT_HIP',      'RIGHT_KNEE',     'RIGHT_ANKLE'),
    'left_hip_angle':       ('LEFT_SHOULDER',  'LEFT_HIP',       'LEFT_KNEE'),
    'right_hip_angle':      ('RIGHT_SHOULDER', 'RIGHT_HIP',      'RIGHT_KNEE'),
    'left_elbow_angle':     ('LEFT_SHOULDER',  'LEFT_ELBOW',     'LEFT_WRIST'),
    'right_elbow_angle':    ('RIGHT_SHOULDER', 'RIGHT_ELBOW',    'RIGHT_WRIST'),
    'left_shoulder_angle':  ('LEFT_HIP',       'LEFT_SHOULDER',  'LEFT_ELBOW'),
    'right_shoulder_angle': ('RIGHT_HIP',      'RIGHT_SHOULDER', 'RIGHT_ELBOW'),
    'left_ankle_angle':     ('LEFT_KNEE',      'LEFT_ANKLE',     'LEFT_FOOT_INDEX'),
    'right_ankle_angle':    ('RIGHT_KNEE',     'RIGHT_ANKLE',    'RIGHT_FOOT_INDEX'),
    # Q-angle: hip→knee→foot — knee alignment / injury-risk metric
    'left_q_angle':         ('LEFT_HIP',       'LEFT_KNEE',      'LEFT_FOOT_INDEX'),
    'right_q_angle':        ('RIGHT_HIP',      'RIGHT_KNEE',     'RIGHT_FOOT_INDEX'),
    # Wrist flexion/extension (elbow→wrist→index MCP)
    'left_wrist_angle':     ('LEFT_ELBOW',     'LEFT_WRIST',     'LEFT_INDEX'),
    'right_wrist_angle':    ('RIGHT_ELBOW',    'RIGHT_WRIST',    'RIGHT_INDEX'),
    # Neck-to-torso angle (ear→shoulder→hip) — forward head posture / cervical alignment
    'left_neck_angle':      ('LEFT_EAR',       'LEFT_SHOULDER',  'LEFT_HIP'),
    'right_neck_angle':     ('RIGHT_EAR',      'RIGHT_SHOULDER', 'RIGHT_HIP'),
    # Foot arch proxy (heel→ankle→foot_index) — medial arch estimation
    'left_foot_arch_angle': ('LEFT_HEEL',      'LEFT_ANKLE',     'LEFT_FOOT_INDEX'),
    'right_foot_arch_angle':('RIGHT_HEEL',     'RIGHT_ANKLE',    'RIGHT_FOOT_INDEX'),
}

# Pose connection pairs for drawing (landmark index pairs)
POSE_CONNECTIONS = [
    (11, 12), (11, 13), (13, 15), (12, 14), (14, 16),  # arms
    (11, 23), (12, 24), (23, 24),                        # torso
    (23, 25), (25, 27), (24, 26), (26, 28),              # legs
    (27, 29), (29, 31), (28, 30), (30, 32),              # ankle→heel→toe
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

    def _angle_deg(self, a, b, c, w, h):
        """Angle in degrees at vertex b, formed by rays b→a and b→c."""
        ax = a.x * w - b.x * w
        ay = a.y * h - b.y * h
        cx = c.x * w - b.x * w
        cy = c.y * h - b.y * h
        dot = ax * cx + ay * cy
        mag_a = math.sqrt(ax ** 2 + ay ** 2)
        mag_c = math.sqrt(cx ** 2 + cy ** 2)
        if mag_a == 0 or mag_c == 0:
            return None
        cos_val = max(-1.0, min(1.0, dot / (mag_a * mag_c)))
        return round(math.degrees(math.acos(cos_val)), 1)

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
            height_cm: full standing height in cm (crown of head to floor) — if given, pixel lengths are also converted to cm

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

        # ── Computed segments needing midpoints ──
        lsho_i, rsho_i = LM['LEFT_SHOULDER'], LM['RIGHT_SHOULDER']
        lhip_i, rhip_i = LM['LEFT_HIP'],      LM['RIGHT_HIP']
        lank_i, rank_i = LM['LEFT_ANKLE'],    LM['RIGHT_ANKLE']

        if all(i < landmark_count for i in [lsho_i, rsho_i, lhip_i, rhip_i]):
            lsho = landmarks[lsho_i]; rsho = landmarks[rsho_i]
            lhip = landmarks[lhip_i]; rhip = landmarks[rhip_i]
            msx = (lsho.x + rsho.x) / 2;  msy = (lsho.y + rsho.y) / 2
            mhx = (lhip.x + rhip.x) / 2;  mhy = (lhip.y + rhip.y) / 2
            # Spine proxy: shoulder midpoint → hip midpoint
            lengths_px['spine_length'] = round(
                math.sqrt((msx - mhx) ** 2 * w ** 2 + (msy - mhy) ** 2 * h ** 2), 1)

        nose_i = LM['NOSE']
        if all(i < landmark_count for i in [nose_i, lsho_i, rsho_i]):
            nose = landmarks[nose_i]
            lsho = landmarks[lsho_i]; rsho = landmarks[rsho_i]
            msx = (lsho.x + rsho.x) / 2;  msy = (lsho.y + rsho.y) / 2
            # Neck height: nose → shoulder midpoint
            lengths_px['neck_height'] = round(
                math.sqrt((nose.x - msx) ** 2 * w ** 2 + (nose.y - msy) ** 2 * h ** 2), 1)

        if all(i < landmark_count for i in [nose_i, lhip_i, rhip_i]):
            nose = landmarks[nose_i]
            lhip = landmarks[lhip_i]; rhip = landmarks[rhip_i]
            mid_hip_y = (lhip.y + rhip.y) / 2
            # Upper body: nose Y → hip midpoint Y (sitting height proxy)
            lengths_px['upper_body'] = round(abs(nose.y - mid_hip_y) * h, 1)

        if all(i < landmark_count for i in [lhip_i, rhip_i, lank_i, rank_i]):
            lhip = landmarks[lhip_i]; rhip = landmarks[rhip_i]
            lank = landmarks[lank_i]; rank = landmarks[rank_i]
            mid_hip_y  = (lhip.y + rhip.y) / 2
            mid_ank_y  = (lank.y + rank.y) / 2
            # Crotch height: hip midpoint Y → ankle level Y (vertical only)
            lengths_px['crotch_height'] = round(abs(mid_hip_y - mid_ank_y) * h, 1)

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

        # ── Joint angles ──
        joint_angles = {}
        for angle_name, (prox, vert, dist) in ANGLE_DEFINITIONS.items():
            i_p = LM.get(prox)
            i_v = LM.get(vert)
            i_d = LM.get(dist)
            if (i_p is not None and i_v is not None and i_d is not None and
                    i_p < landmark_count and i_v < landmark_count and i_d < landmark_count):
                deg = self._angle_deg(landmarks[i_p], landmarks[i_v], landmarks[i_d], w, h)
                if deg is not None:
                    joint_angles[angle_name] = deg

        # ── Structural / alignment angles ──
        # All use image coords (y increases downward). Angles in degrees.
        structural_angles = {}

        i_ls, i_rs = LM['LEFT_SHOULDER'], LM['RIGHT_SHOULDER']
        i_lh, i_rh = LM['LEFT_HIP'], LM['RIGHT_HIP']

        if all(i < landmark_count for i in (i_ls, i_rs, i_lh, i_rh)):
            ls, rs = landmarks[i_ls], landmarks[i_rs]
            lh, rh = landmarks[i_lh], landmarks[i_rh]

            # Shoulder level: angle of shoulder line from horizontal (°)
            # 0 = perfectly level; +ve = right shoulder lower in frame
            structural_angles['shoulder_tilt_deg'] = round(
                math.degrees(math.atan2((rs.y - ls.y) * h, (rs.x - ls.x) * w)), 1)

            # Hip level: angle of hip line from horizontal (°)
            structural_angles['hip_tilt_deg'] = round(
                math.degrees(math.atan2((rh.y - lh.y) * h, (rh.x - lh.x) * w)), 1)

            # Trunk lean: angle of spine (mid-hip → mid-shoulder) from vertical (°)
            # 0 = perfectly upright; +ve = leaning right, -ve = leaning left
            mid_hip_x = (lh.x + rh.x) / 2 * w
            mid_hip_y = (lh.y + rh.y) / 2 * h
            mid_sho_x = (ls.x + rs.x) / 2 * w
            mid_sho_y = (ls.y + rs.y) / 2 * h
            dx = mid_sho_x - mid_hip_x
            dy = mid_sho_y - mid_hip_y  # negative = upward (y inverted in image)
            structural_angles['trunk_lean_deg'] = round(
                math.degrees(math.atan2(dx, -dy)), 1)

        # Head tilt + forward head posture (require ear landmarks)
        i_le, i_re = LM.get('LEFT_EAR'), LM.get('RIGHT_EAR')
        i_ls2, i_rs2 = LM['LEFT_SHOULDER'], LM['RIGHT_SHOULDER']
        if (i_le is not None and i_re is not None and
                i_le < landmark_count and i_re < landmark_count and
                i_ls2 < landmark_count and i_rs2 < landmark_count):
            le = landmarks[i_le]
            re = landmarks[i_re]
            ls2 = landmarks[i_ls2]

            # Head tilt: angle of ear-to-ear line from horizontal (°)
            # 0 = level head; +ve = right ear lower; -ve = left ear lower
            structural_angles['head_tilt_deg'] = round(
                math.degrees(math.atan2((re.y - le.y) * h, (re.x - le.x) * w)), 1)

            # Forward head posture: angle of left ear→left shoulder vector from vertical (°)
            # 0 = ear directly above shoulder (ideal); +ve = head forward; -ve = head behind shoulder
            fhp_dx = (le.x - ls2.x) * w
            fhp_dy = (le.y - ls2.y) * h  # negative = ear above shoulder
            structural_angles['forward_head_deg'] = round(
                math.degrees(math.atan2(fhp_dx, -fhp_dy)), 1)

        # ── Skeletal ratios for somatotype classifier (hybrid) ──
        # These replace the HMR-based SHR, TG_H, LL_H, UAG_H with real
        # skeletal proportions from MediaPipe landmarks.
        # height_cm in all ratios below = full standing height (crown of head to floor).
        skeletal_ratios = {}
        if height_cm and lengths_cm:
            # SHR — Shoulder Width / Hip Width (classifier expects ratio ~1.3–1.5, not /height)
            if 'shoulder_width' in lengths_cm and 'hip_width' in lengths_cm:
                skeletal_ratios['SHR'] = round(lengths_cm['shoulder_width'] / lengths_cm['hip_width'], 4)
            elif 'shoulder_width' in lengths_cm:
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

            # FL_H — Foot Length / Height (Claessens 1990)
            foot_vals = [lengths_cm[k] for k in ('left_foot', 'right_foot') if k in lengths_cm]
            if foot_vals:
                skeletal_ratios['FL_H'] = round((sum(foot_vals) / len(foot_vals)) / height_cm, 4)

            # AT_H — Full Arm Length / Height
            arm_vals = [lengths_cm[k] for k in ('left_arm_total', 'right_arm_total') if k in lengths_cm]
            if arm_vals:
                skeletal_ratios['AT_H'] = round((sum(arm_vals) / len(arm_vals)) / height_cm, 4)

            # CI — Cormic Index proxy (spine_length / height)
            if 'spine_length' in lengths_cm:
                skeletal_ratios['CI'] = round(lengths_cm['spine_length'] / height_cm, 4)

            # HWR — Hip Width / Height
            if 'hip_width' in lengths_cm:
                skeletal_ratios['HWR'] = round(lengths_cm['hip_width'] / height_cm, 4)

            # ASR — Arm Span / Height (Da Vinci ratio; ecto > 1.05)
            if 'arm_span' in lengths_cm:
                skeletal_ratios['ASR'] = round(lengths_cm['arm_span'] / height_cm, 4)

            # ULR — Upper Body / Lower Body (sitting height ratio proxy)
            upper = lengths_cm.get('upper_body')
            lower = lengths_cm.get('crotch_height')
            if upper and lower and lower > 0:
                skeletal_ratios['ULR'] = round(upper / lower, 4)

            # LBR — Leg (inseam) / Height
            inseam_vals = [lengths_cm[k] for k in ('left_inseam', 'right_inseam') if k in lengths_cm]
            if inseam_vals:
                skeletal_ratios['LBR'] = round((sum(inseam_vals) / len(inseam_vals)) / height_cm, 4)

            # TLR — Trunk / Leg ratio (spine_length / inseam)
            if 'spine_length' in lengths_cm and inseam_vals:
                avg_inseam = sum(inseam_vals) / len(inseam_vals)
                skeletal_ratios['TLR'] = round(lengths_cm['spine_length'] / avg_inseam, 4)

            # HSR — Head Width / Shoulder Width (frame size index)
            if 'head_width' in lengths_cm and 'shoulder_width' in lengths_cm:
                skeletal_ratios['HSR'] = round(lengths_cm['head_width'] / lengths_cm['shoulder_width'], 4)

            # AII — Acromio-Iliac Index: (shoulder_width - hip_width) / height (V-taper index)
            if 'shoulder_width' in lengths_cm and 'hip_width' in lengths_cm:
                skeletal_ratios['AII'] = round(
                    (lengths_cm['shoulder_width'] - lengths_cm['hip_width']) / height_cm, 4)

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
            "joint_angles_deg": joint_angles if joint_angles else None,
            "structural_angles_deg": structural_angles if structural_angles else None,
            "skeletal_ratios": skeletal_ratios if skeletal_ratios else None,
            "annotated_image_base64": annotated_b64,
        }


    def analyze_video(self, video_path, height_cm=None, sample_interval_s=0.3):
        """
        Extract front, side, and 45-degree frames from a rotation video.

        Args:
            video_path: path to video file
            height_cm: full standing height (crown to floor) — passed to analyze_image
            sample_interval_s: seconds between sampled frames (default 0.3)

        Returns:
            dict with keys 'front', 'side', 'diagonal', each containing
            'frame_jpg' (bytes), 'pose' (analyze_image result),
            'shoulder_width_px'; plus 'frames_sampled', 'error' on failure.

        Frame selection heuristic (shoulder_width_px as rotation proxy):
            front    = max shoulder_width_px (facing camera)
            side     = min shoulder_width_px (90° to camera)
            diagonal = frame closest to 65% of max (≈45° angle)
        """
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {"error": f"Could not open video: {video_path}"}

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        sample_every = max(1, int(fps * sample_interval_s))

        candidates = []
        frame_idx = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % sample_every == 0:
                result = self.analyze_image(frame, height_cm)
                if "error" not in result:
                    sw = (result.get("joint_lengths_px") or {}).get("shoulder_width", 0)
                    candidates.append({
                        "shoulder_width_px": sw,
                        "pose": result,
                        "frame": frame,
                    })
            frame_idx += 1

        cap.release()

        if not candidates:
            return {"error": "No poses detected in video — ensure full body is visible throughout"}

        max_sw = max(c["shoulder_width_px"] for c in candidates)
        target_45 = max_sw * 0.65

        front = max(candidates, key=lambda c: c["shoulder_width_px"])
        side  = min(candidates, key=lambda c: c["shoulder_width_px"])
        diag  = min(candidates, key=lambda c: abs(c["shoulder_width_px"] - target_45))

        def _to_jpg(f):
            _, buf = cv2.imencode(".jpg", f, [cv2.IMWRITE_JPEG_QUALITY, 90])
            return buf.tobytes()

        return {
            "front": {
                "frame_jpg": _to_jpg(front["frame"]),
                "pose": front["pose"],
                "shoulder_width_px": front["shoulder_width_px"],
            },
            "side": {
                "frame_jpg": _to_jpg(side["frame"]),
                "pose": side["pose"],
                "shoulder_width_px": side["shoulder_width_px"],
            },
            "diagonal": {
                "frame_jpg": _to_jpg(diag["frame"]),
                "pose": diag["pose"],
                "shoulder_width_px": diag["shoulder_width_px"],
            },
            "frames_sampled": len(candidates),
            "max_shoulder_width_px": max_sw,
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
