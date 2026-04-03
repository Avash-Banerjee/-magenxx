"""
LOCAL FLASK UI — Run this on your PC.
  pip install flask requests mediapipe opencv-python
  python local_app.py

Then open http://localhost:5050 in your browser.

Features:
  - Webcam capture with 5s countdown OR file upload
  - Local MediaPipe pose analysis (joint ratios, symmetry, annotated skeleton)
  - Colab GPU HMR inference (somatotype classification)
"""

import os
import io
import requests
from flask import Flask, render_template_string, request, jsonify
from pose_analyzer import PoseAnalyzer

# ─────────────────────────────────────────────
#  PASTE YOUR NGROK URL HERE (from Colab output)
# ─────────────────────────────────────────────
COLAB_URL = "https://adducent-merrie-dissipative.ngrok-free.dev/"
# ─────────────────────────────────────────────

app = Flask(__name__)

# Initialize pose analyzer once (loads MediaPipe model)
pose_analyzer = PoseAnalyzer()
print("✅ MediaPipe PoseAnalyzer loaded")

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Body Type Classifier</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            background: #0f0f1a;
            color: #e0e0e0;
            min-height: 100vh;
        }
        .container { max-width: 1100px; margin: 0 auto; padding: 30px 20px; }
        h1 {
            text-align: center;
            font-size: 2rem;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle { text-align: center; color: #888; margin-bottom: 30px; font-size: 0.9rem; }
        .card {
            background: #1a1a2e;
            border-radius: 16px;
            padding: 30px;
            margin-bottom: 24px;
            border: 1px solid #2a2a4a;
        }
        .card h2 { color: #667eea; margin-bottom: 20px; font-size: 1.2rem; }
        .form-group { margin-bottom: 18px; }
        .form-group label {
            display: block; margin-bottom: 6px; font-weight: 600;
            color: #aaa; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .form-group input[type="number"] {
            width: 100%; padding: 12px 16px; background: #16162b;
            border: 1px solid #333; border-radius: 10px; color: #fff; font-size: 1rem;
            transition: border-color 0.2s;
        }
        .form-group input:focus { outline: none; border-color: #667eea; }
        .form-row { display: flex; gap: 16px; }
        .form-row .form-group { flex: 1; }

        /* Camera */
        .cam-box {
            background: #16162b; border-radius: 12px; overflow: hidden;
            position: relative; text-align: center;
        }
        #videoEl { width: 100%; max-height: 340px; display: none; border-radius: 12px; transform: scaleX(-1); }
        #capturedImg { width: 100%; max-height: 340px; display: none; border-radius: 12px; }
        .cam-placeholder { padding: 50px 20px; color: #555; }
        .cam-placeholder .icon { font-size: 3rem; margin-bottom: 10px; }
        .cam-placeholder .text { font-size: 0.9rem; }
        .cam-controls { display: flex; gap: 10px; margin-top: 14px; }
        .cam-controls button {
            flex: 1; padding: 11px; border: none; border-radius: 10px;
            font-size: 0.95rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s;
        }
        .cam-controls button:hover { opacity: 0.85; }
        #btnStartCam  { background: #27ae60; color: #fff; }
        #btnRetake    { background: #e67e22; color: #fff; display: none; }
        .countdown-ring {
            display: none; position: absolute; top: 50%; left: 50%;
            transform: translate(-50%, -50%); font-size: 5rem; font-weight: 900;
            color: #fff; text-shadow: 0 0 20px rgba(0,0,0,0.8); pointer-events: none;
        }
        .capture-flash {
            display: none; position: absolute; inset: 0; background: white;
            border-radius: 12px; pointer-events: none;
        }

        /* Tabs */
        .photo-tab-row { display: flex; gap: 10px; margin-bottom: 14px; }
        .photo-tab {
            flex: 1; padding: 9px; background: #16162b; border: 1px solid #333;
            border-radius: 8px; color: #aaa; font-size: 0.85rem; font-weight: 600;
            cursor: pointer; text-align: center; transition: all 0.2s;
        }
        .photo-tab.active { background: #667eea; border-color: #667eea; color: #fff; }
        .upload-zone {
            border: 2px dashed #333; border-radius: 12px; padding: 30px;
            text-align: center; cursor: pointer; transition: all 0.3s; display: none;
        }
        .upload-zone.shown { display: block; }
        .upload-zone:hover { border-color: #667eea; background: rgba(102,126,234,0.05); }
        .upload-zone input { display: none; }
        .upload-zone .icon { font-size: 2rem; margin-bottom: 8px; }
        .upload-zone .text { color: #888; font-size: 0.9rem; }
        .upload-zone .filename { color: #667eea; font-weight: 600; margin-top: 8px; }
        .preview-img { max-width: 200px; max-height: 280px; border-radius: 10px; margin-top: 12px; }

        /* Button */
        .btn {
            width: 100%; padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white; border: none; border-radius: 12px; font-size: 1.1rem;
            font-weight: 700; cursor: pointer; transition: opacity 0.2s, transform 0.1s;
            letter-spacing: 0.5px;
        }
        .btn:hover { opacity: 0.9; }
        .btn:active { transform: scale(0.98); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }

        /* Loading */
        .loading { display: none; text-align: center; padding: 40px; }
        .loading.active { display: block; }
        .spinner {
            width: 50px; height: 50px; border: 4px solid #2a2a4a; border-top: 4px solid #667eea;
            border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .loading p { color: #888; }
        .loading .timer { font-size: 1.5rem; color: #667eea; font-weight: 700; margin-top: 8px; }
        .step-status { margin-top: 16px; text-align: left; display: inline-block; }
        .step-status .step {
            padding: 4px 0; font-size: 0.9rem; color: #555;
            transition: color 0.3s;
        }
        .step-status .step.active { color: #667eea; }
        .step-status .step.done { color: #27ae60; }

        /* Results */
        .results { display: none; }
        .results.active { display: block; }
        .result-header {
            text-align: center; padding: 20px;
            background: linear-gradient(135deg, rgba(102,126,234,0.15), rgba(118,75,162,0.15));
            border-radius: 12px; margin-bottom: 20px;
        }
        .body-type-label {
            font-size: 1.8rem; font-weight: 800;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        }
        .classification-label { color: #aaa; font-size: 1rem; margin-top: 4px; }
        .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
        .stat-card { background: #16162b; border-radius: 10px; padding: 16px; text-align: center; }
        .stat-card .value { font-size: 1.4rem; font-weight: 700; }
        .stat-card .label { font-size: 0.75rem; color: #888; margin-top: 4px; text-transform: uppercase; }
        .stat-card.endo .value { color: #e74c3c; }
        .stat-card.meso .value { color: #27ae60; }
        .stat-card.ecto .value { color: #2980b9; }

        .bar-chart { margin-bottom: 20px; }
        .bar-row { display: flex; align-items: center; margin-bottom: 10px; }
        .bar-label { width: 110px; font-size: 0.85rem; color: #aaa; }
        .bar-track { flex: 1; height: 28px; background: #16162b; border-radius: 14px; overflow: hidden; position: relative; }
        .bar-fill {
            height: 100%; border-radius: 14px; transition: width 1s ease;
            display: flex; align-items: center; justify-content: flex-end;
            padding-right: 10px; font-size: 0.75rem; font-weight: 700; color: white; min-width: 40px;
        }
        .bar-fill.endo { background: linear-gradient(90deg, #e74c3c, #c0392b); }
        .bar-fill.meso { background: linear-gradient(90deg, #27ae60, #1e8449); }
        .bar-fill.ecto { background: linear-gradient(90deg, #2980b9, #2471a3); }

        .measurements-table { width: 100%; border-collapse: collapse; }
        .measurements-table th {
            text-align: left; padding: 8px 12px; color: #667eea;
            font-size: 0.8rem; text-transform: uppercase; border-bottom: 1px solid #2a2a4a;
        }
        .measurements-table td {
            padding: 8px 12px; font-size: 0.9rem; border-bottom: 1px solid #1a1a2e;
        }
        .interpretation-box {
            background: rgba(102,126,234,0.1); border-left: 3px solid #667eea;
            padding: 16px 20px; border-radius: 0 10px 10px 0; margin-top: 16px;
        }
        .interpretation-box .dominant { font-weight: 700; color: #667eea; }
        .error-box {
            display: none; background: rgba(231,76,60,0.1);
            border: 1px solid rgba(231,76,60,0.3); border-radius: 10px;
            padding: 20px; text-align: center; color: #e74c3c;
        }
        .error-box.active { display: block; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
        .status-dot.online { background: #27ae60; }
        .status-dot.offline { background: #e74c3c; }
        .status-bar { text-align: center; font-size: 0.8rem; color: #666; margin-bottom: 20px; }

        /* Two-column layout for results */
        .results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        @media (max-width: 800px) { .results-grid { grid-template-columns: 1fr; } }

        /* Pose overlay card */
        .pose-card { text-align: center; }
        .pose-card img { max-width: 100%; border-radius: 12px; margin-bottom: 16px; }

        /* Symmetry bars */
        .sym-row { display: flex; align-items: center; margin-bottom: 8px; gap: 10px; }
        .sym-label { width: 140px; font-size: 0.82rem; color: #aaa; text-align: right; }
        .sym-track { flex: 1; height: 22px; background: #16162b; border-radius: 11px; overflow: hidden; position: relative; }
        .sym-mid {
            position: absolute; left: 50%; top: 0; bottom: 0; width: 2px;
            background: rgba(255,255,255,0.15); z-index: 1;
        }
        .sym-fill {
            height: 100%; border-radius: 11px; transition: width 0.8s ease;
            display: flex; align-items: center; justify-content: flex-end;
            padding-right: 6px; font-size: 0.7rem; font-weight: 700; color: white;
        }
        .sym-fill.good { background: linear-gradient(90deg, #27ae60, #2ecc71); }
        .sym-fill.warn { background: linear-gradient(90deg, #e67e22, #f39c12); }
        .sym-fill.bad  { background: linear-gradient(90deg, #e74c3c, #c0392b); }
        .sym-badge { width: 60px; font-size: 0.75rem; font-weight: 600; }
        .sym-badge.good { color: #27ae60; }
        .sym-badge.warn { color: #e67e22; }
        .sym-badge.bad  { color: #e74c3c; }

        .section-divider {
            text-align: center; color: #444; font-size: 0.8rem; margin: 16px 0;
            display: flex; align-items: center; gap: 12px;
        }
        .section-divider::before, .section-divider::after {
            content: ''; flex: 1; height: 1px; background: #2a2a4a;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏋️ Body Type Classifier</h1>
        <p class="subtitle">Webcam → MediaPipe Pose (local) + HMR Somatotype (Colab GPU)</p>
        <div class="status-bar">
            <span class="status-dot" id="statusDot"></span>
            <span id="statusText">Checking Colab connection...</span>
        </div>

        <!-- INPUT FORM -->
        <form id="classifyForm" enctype="multipart/form-data">
            <div class="card">
                <h2>📸 Photo</h2>
                <div class="photo-tab-row">
                    <div class="photo-tab active" id="tabCam" onclick="switchTab('cam')">📷 Webcam</div>
                    <div class="photo-tab" id="tabUpload" onclick="switchTab('upload')">📁 Upload File</div>
                </div>

                <!-- Webcam panel -->
                <div id="panelCam">
                    <div class="cam-box">
                        <div class="cam-placeholder" id="camPlaceholder">
                            <div class="icon">📷</div>
                            <div class="text">Click "Start Camera" — photo taken in 5 seconds</div>
                        </div>
                        <video id="videoEl" autoplay playsinline></video>
                        <img id="capturedImg" alt="Captured photo">
                        <div class="countdown-ring" id="countdownRing"></div>
                        <div class="capture-flash" id="captureFlash"></div>
                    </div>
                    <div class="cam-controls">
                        <button type="button" id="btnStartCam" onclick="startCamera()">▶ Start Camera</button>
                        <button type="button" id="btnRetake"   onclick="retakePhoto()">↩ Retake</button>
                    </div>
                </div>

                <!-- Upload panel -->
                <div id="panelUpload" style="display:none">
                    <div class="upload-zone shown" onclick="document.getElementById('imageInput').click()">
                        <input type="file" id="imageInput" accept="image/*">
                        <div class="icon">📁</div>
                        <div class="text">Click to upload a full-body front-facing photo</div>
                        <div class="filename" id="fileName"></div>
                        <img class="preview-img" id="imagePreview" style="display:none">
                    </div>
                </div>
            </div>

            <div class="card">
                <h2>📏 Your Measurements</h2>
                <div class="form-row">
                    <div class="form-group">
                        <label>Height (cm)</label>
                        <input type="number" id="heightInput" name="height_cm"
                               placeholder="e.g. 175" step="0.1" min="100" max="250" required>
                    </div>
                    <div class="form-group">
                        <label>Weight (kg)</label>
                        <input type="number" id="weightInput" name="weight_kg"
                               placeholder="e.g. 70" step="0.1" min="30" max="300" required>
                    </div>
                </div>
            </div>

            <button type="submit" class="btn" id="submitBtn">🔬 Analyze Body Type</button>
        </form>

        <!-- LOADING -->
        <div class="loading" id="loadingSection">
            <div class="spinner"></div>
            <p>Analyzing your body type...</p>
            <div class="step-status" id="stepStatus">
                <div class="step active" id="stepPose">⏳ Step 1: MediaPipe Pose Analysis (local)...</div>
                <div class="step" id="stepColab">⬜ Step 2: HMR Inference on Colab GPU...</div>
            </div>
            <div class="timer" id="timer">0s</div>
        </div>

        <!-- ERROR -->
        <div class="error-box" id="errorBox"></div>

        <!-- RESULTS -->
        <div class="results" id="resultsSection">

            <!-- Somatotype header -->
            <div class="card">
                <div class="result-header">
                    <div class="body-type-label" id="bodyTypeLabel"></div>
                    <div class="classification-label" id="classLabel"></div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card endo">
                        <div class="value" id="endoVal"></div>
                        <div class="label">Endomorphy</div>
                    </div>
                    <div class="stat-card meso">
                        <div class="value" id="mesoVal"></div>
                        <div class="label">Mesomorphy</div>
                    </div>
                    <div class="stat-card ecto">
                        <div class="value" id="ectoVal"></div>
                        <div class="label">Ectomorphy</div>
                    </div>
                </div>

                <div class="bar-chart">
                    <div class="bar-row">
                        <span class="bar-label">Endomorphy</span>
                        <div class="bar-track"><div class="bar-fill endo" id="endoBar"></div></div>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">Mesomorphy</span>
                        <div class="bar-track"><div class="bar-fill meso" id="mesoBar"></div></div>
                    </div>
                    <div class="bar-row">
                        <span class="bar-label">Ectomorphy</span>
                        <div class="bar-track"><div class="bar-fill ecto" id="ectoBar"></div></div>
                    </div>
                </div>

                <div class="interpretation-box" id="interpBox"></div>
            </div>

            <!-- Two-column: Pose skeleton + Symmetry -->
            <div class="results-grid">
                <div class="card pose-card">
                    <h2>🦴 MediaPipe Pose Skeleton</h2>
                    <img id="poseImage" alt="Annotated pose">
                    <p style="color:#666; font-size:0.8rem; margin-top:8px;">
                        33 landmarks detected via MediaPipe (local CPU)
                    </p>
                </div>

                <div class="card">
                    <h2>⚖️ Body Symmetry</h2>
                    <p style="color:#666; font-size:0.8rem; margin-bottom:16px;">
                        Left/Right ratios — 1.00 = perfect symmetry
                    </p>
                    <div id="symmetryBars"></div>

                    <div class="section-divider">Body Proportions</div>
                    <table class="measurements-table" id="proportionsTable">
                        <thead><tr><th>Proportion</th><th>Ratio</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <!-- Segment lengths -->
            <div class="card">
                <h2>📏 Joint Segment Lengths</h2>
                <p style="color:#666; font-size:0.8rem; margin-bottom:12px;">
                    Measured via MediaPipe landmarks. CM values derived from your height.
                </p>
                <table class="measurements-table" id="segmentsTable">
                    <thead><tr><th>Segment</th><th>Pixels</th><th>Estimated CM</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>

            <!-- HMR measurements & ratios -->
            <div class="results-grid">
                <div class="card">
                    <h2>📐 HMR Measurements (cm)</h2>
                    <p style="color:#666; font-size:0.8rem; margin-bottom:12px;">From Colab HMR model</p>
                    <table class="measurements-table" id="measTable">
                        <thead><tr><th>Part</th><th>Value (cm)</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>

                <div class="card">
                    <h2>📊 Computed Ratios (Hybrid)</h2>
                    <p style="color:#666; font-size:0.8rem; margin-bottom:12px;">Used for somatotype classification</p>
                    <table class="measurements-table" id="ratioTable">
                        <thead><tr><th>Ratio</th><th>Value</th><th>Source</th></tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <h2>ℹ️ Input Summary</h2>
                <table class="measurements-table" id="inputTable">
                    <thead><tr><th>Field</th><th>Value</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        const COLAB = "{{ colab_url }}";
        let timerInterval;

        // ── Check Colab connection ──
        async function checkStatus() {
            const dot = document.getElementById("statusDot");
            const text = document.getElementById("statusText");
            try {
                const r = await fetch(COLAB + "/", {
                    headers: { "ngrok-skip-browser-warning": "true" }
                });
                if (r.ok) {
                    dot.className = "status-dot online";
                    text.textContent = "Colab GPU connected";
                } else throw new Error();
            } catch {
                dot.className = "status-dot offline";
                text.textContent = "Colab not reachable — is the server cell running?";
            }
        }
        checkStatus();

        // ── Tab switching ──
        let currentTab = "cam";
        function switchTab(tab) {
            currentTab = tab;
            document.getElementById("tabCam").classList.toggle("active", tab === "cam");
            document.getElementById("tabUpload").classList.toggle("active", tab === "upload");
            document.getElementById("panelCam").style.display    = tab === "cam"    ? "block" : "none";
            document.getElementById("panelUpload").style.display = tab === "upload" ? "block" : "none";
        }

        // ── Webcam ──
        let stream = null;
        let capturedBlob = null;

        async function startCamera() {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
                const video = document.getElementById("videoEl");
                video.srcObject = stream;
                video.style.display = "block";
                document.getElementById("camPlaceholder").style.display = "none";
                document.getElementById("btnStartCam").disabled = true;
                document.getElementById("btnStartCam").textContent = "⏳ Get ready...";
                runCountdown(5);
            } catch(err) {
                alert("Camera access denied or unavailable: " + err.message);
            }
        }

        function runCountdown(secs) {
            const ring = document.getElementById("countdownRing");
            ring.style.display = "block";
            ring.textContent = secs;
            if (secs === 0) {
                ring.style.display = "none";
                capturePhoto();
                return;
            }
            setTimeout(() => runCountdown(secs - 1), 1000);
        }

        function capturePhoto() {
            const video  = document.getElementById("videoEl");
            const canvas = document.createElement("canvas");
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0);

            // Flash
            const flash = document.getElementById("captureFlash");
            flash.style.display = "block";
            flash.style.opacity = "1";
            setTimeout(() => { flash.style.transition = "opacity 0.4s"; flash.style.opacity = "0"; }, 50);
            setTimeout(() => { flash.style.display = "none"; flash.style.transition = ""; }, 500);

            canvas.toBlob(blob => {
                capturedBlob = blob;
                const url = URL.createObjectURL(blob);
                const img = document.getElementById("capturedImg");
                img.src = url;
                img.style.display = "block";
                video.style.display = "none";
                if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
                document.getElementById("btnStartCam").style.display = "none";
                document.getElementById("btnRetake").style.display = "block";
            }, "image/jpeg", 0.92);
        }

        function retakePhoto() {
            capturedBlob = null;
            document.getElementById("capturedImg").style.display = "none";
            document.getElementById("camPlaceholder").style.display = "block";
            document.getElementById("btnStartCam").style.display = "block";
            document.getElementById("btnStartCam").disabled = false;
            document.getElementById("btnStartCam").textContent = "▶ Start Camera";
            document.getElementById("btnRetake").style.display = "none";
        }

        // ── File upload preview ──
        document.getElementById("imageInput").addEventListener("change", function(e) {
            const file = e.target.files[0];
            if (!file) return;
            document.getElementById("fileName").textContent = file.name;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const img = document.getElementById("imagePreview");
                img.src = ev.target.result;
                img.style.display = "block";
            };
            reader.readAsDataURL(file);
        });

        // ── Helper: build symmetry bars ──
        function renderSymmetry(symmetry) {
            const container = document.getElementById("symmetryBars");
            container.innerHTML = "";
            for (const [label, data] of Object.entries(symmetry)) {
                const ratio = data.ratio;
                const assess = data.assessment;
                const cls = assess === "Good" ? "good" : (Math.abs(ratio - 1.0) < 0.15 ? "warn" : "bad");
                // Map ratio to bar width: 0.7-1.3 range → 0-100%
                const pct = Math.min(100, Math.max(5, ((ratio - 0.7) / 0.6) * 100));

                container.innerHTML += `
                    <div class="sym-row">
                        <span class="sym-label">${label}</span>
                        <div class="sym-track">
                            <div class="sym-mid"></div>
                            <div class="sym-fill ${cls}" style="width:${pct}%">${ratio.toFixed(3)}</div>
                        </div>
                        <span class="sym-badge ${cls}">${assess}</span>
                    </div>`;
            }
        }

        // ── Form submit ──
        document.getElementById("classifyForm").addEventListener("submit", async function(e) {
            e.preventDefault();

            const usingCam = currentTab === "cam";
            if (usingCam && !capturedBlob) { alert("Please capture a photo first."); return; }
            if (!usingCam && !document.getElementById("imageInput").files[0]) { alert("Please upload an image."); return; }

            const btn = document.getElementById("submitBtn");
            const loading = document.getElementById("loadingSection");
            const results = document.getElementById("resultsSection");
            const errorBox = document.getElementById("errorBox");

            results.classList.remove("active");
            errorBox.classList.remove("active");
            btn.disabled = true;
            btn.textContent = "⏳ Processing...";
            loading.classList.add("active");

            // Reset step indicators
            document.getElementById("stepPose").className = "step active";
            document.getElementById("stepPose").textContent = "⏳ Step 1: MediaPipe Pose Analysis (local)...";
            document.getElementById("stepColab").className = "step";
            document.getElementById("stepColab").textContent = "⬜ Step 2: HMR Inference on Colab GPU...";

            let seconds = 0;
            const timerEl = document.getElementById("timer");
            timerInterval = setInterval(() => { seconds++; timerEl.textContent = seconds + "s"; }, 1000);

            try {
                // Build form data
                const formData = new FormData();
                if (usingCam) {
                    formData.append("image", capturedBlob, "webcam.jpg");
                } else {
                    formData.append("image", document.getElementById("imageInput").files[0]);
                }
                formData.append("height_cm", document.getElementById("heightInput").value);
                formData.append("weight_kg", document.getElementById("weightInput").value);

                // ── STEP 1: Local pose analysis ──
                const poseResp = await fetch("/analyze", {
                    method: "POST",
                    body: formData
                });
                const poseData = await poseResp.json();

                document.getElementById("stepPose").className = "step done";
                document.getElementById("stepPose").textContent = "✅ Step 1: Pose analysis complete";
                document.getElementById("stepColab").className = "step active";
                document.getElementById("stepColab").textContent = "⏳ Step 2: HMR Inference on Colab GPU (~30s)...";

                // ── STEP 2: Colab HMR classification ──
                // Re-build formData (can't reuse after reading)
                const formData2 = new FormData();
                if (usingCam) {
                    formData2.append("image", capturedBlob, "webcam.jpg");
                } else {
                    formData2.append("image", document.getElementById("imageInput").files[0]);
                }
                formData2.append("height_cm", document.getElementById("heightInput").value);
                formData2.append("weight_kg", document.getElementById("weightInput").value);

                // Send MediaPipe skeletal ratios so Colab can use them (hybrid approach)
                if (poseData.skeletal_ratios) {
                    formData2.append("mp_ratios", JSON.stringify(poseData.skeletal_ratios));
                }

                const colabResp = await fetch(COLAB + "/classify", {
                    method: "POST",
                    body: formData2,
                    headers: { "ngrok-skip-browser-warning": "true" }
                });
                const colabData = await colabResp.json();

                if (!colabResp.ok || colabData.error) {
                    throw new Error(colabData.error || "Colab returned an error");
                }

                document.getElementById("stepColab").className = "step done";
                document.getElementById("stepColab").textContent = "✅ Step 2: HMR classification complete";

                // ════════════════════════════════════
                //   POPULATE ALL RESULTS
                // ════════════════════════════════════

                // ── Somatotype header ──
                const comp = colabData.classification.components;
                document.getElementById("bodyTypeLabel").textContent = colabData.classification.body_type;
                document.getElementById("classLabel").textContent = colabData.classification.classification;
                document.getElementById("endoVal").textContent = comp.endomorphy.toFixed(2);
                document.getElementById("mesoVal").textContent = comp.mesomorphy.toFixed(2);
                document.getElementById("ectoVal").textContent = comp.ectomorphy.toFixed(2);

                const allVals = [comp.endomorphy, comp.mesomorphy, comp.ectomorphy];
                const minV = Math.min(...allVals, -3);
                const maxV = Math.max(...allVals, 3);
                const range = maxV - minV;
                function pct(v) { return Math.max(5, ((v - minV) / range) * 100); }
                setTimeout(() => {
                    document.getElementById("endoBar").style.width = pct(comp.endomorphy) + "%";
                    document.getElementById("endoBar").textContent = comp.endomorphy.toFixed(2);
                    document.getElementById("mesoBar").style.width = pct(comp.mesomorphy) + "%";
                    document.getElementById("mesoBar").textContent = comp.mesomorphy.toFixed(2);
                    document.getElementById("ectoBar").style.width = pct(comp.ectomorphy) + "%";
                    document.getElementById("ectoBar").textContent = comp.ectomorphy.toFixed(2);
                }, 100);

                document.getElementById("interpBox").innerHTML =
                    `<span class="dominant">${colabData.interpretation.dominant_type}</span> — ${colabData.interpretation.description}`;

                // ── Pose skeleton image ──
                if (poseData.annotated_image_base64) {
                    document.getElementById("poseImage").src = poseData.annotated_image_base64;
                }

                // ── Symmetry bars ──
                if (poseData.symmetry_scores) {
                    renderSymmetry(poseData.symmetry_scores);
                }

                // ── Body proportions ──
                if (poseData.body_proportions) {
                    const propBody = document.querySelector("#proportionsTable tbody");
                    propBody.innerHTML = "";
                    for (const [k, v] of Object.entries(poseData.body_proportions)) {
                        const row = propBody.insertRow();
                        row.insertCell().textContent = k;
                        row.insertCell().textContent = v.toFixed(3);
                    }
                }

                // ── Joint segment lengths ──
                if (poseData.joint_lengths_px) {
                    const segBody = document.querySelector("#segmentsTable tbody");
                    segBody.innerHTML = "";
                    const cmData = poseData.joint_lengths_cm || {};
                    const niceNames = {
                        left_upper_arm: "Left Upper Arm", right_upper_arm: "Right Upper Arm",
                        left_forearm: "Left Forearm", right_forearm: "Right Forearm",
                        left_torso: "Left Torso", right_torso: "Right Torso",
                        left_thigh: "Left Thigh", right_thigh: "Right Thigh",
                        left_shin: "Left Shin", right_shin: "Right Shin",
                        shoulder_width: "Shoulder Width", hip_width: "Hip Width",
                    };
                    for (const [k, v] of Object.entries(poseData.joint_lengths_px)) {
                        const row = segBody.insertRow();
                        row.insertCell().textContent = niceNames[k] || k;
                        row.insertCell().textContent = v.toFixed(1);
                        row.insertCell().textContent = cmData[k] ? cmData[k].toFixed(1) + " cm" : "—";
                    }
                }

                // ── HMR measurements ──
                const measBody = document.querySelector("#measTable tbody");
                measBody.innerHTML = "";
                const mLabels = {
                    chest: "Chest", waist: "Waist", hip: "Hip", shoulder: "Shoulder Width",
                    upper_arm: "Arm Length", thigh: "Thigh", belly: "Belly", inseam: "Inseam (est.)"
                };
                for (const [k, v] of Object.entries(colabData.measurements_cm)) {
                    const row = measBody.insertRow();
                    row.insertCell().textContent = mLabels[k] || k;
                    row.insertCell().textContent = v.toFixed(2);
                }

                // ── Ratios (with source indicator) ──
                const ratBody = document.querySelector("#ratioTable tbody");
                ratBody.innerHTML = "";
                const rLabels = {
                    WHtR: "Waist / Height", WHR: "Waist / Hip", SHR: "Shoulder / Height",
                    UAG_H: "Upper Arm / Height", TG_H: "Thigh / Height",
                    HWR: "Height / Weight^⅓", LL_H: "Leg Length / Height", TVR: "Torso Volume Ratio"
                };
                // Ratios that MediaPipe can provide (skeletal proportions)
                const mpKeys = new Set(Object.keys(poseData.skeletal_ratios || {}));
                const hmrOnlyKeys = new Set(["WHtR", "WHR", "TVR", "HWR"]);
                for (const [k, v] of Object.entries(colabData.ratios)) {
                    if (k === "height" || k === "weight") continue;
                    const row = ratBody.insertRow();
                    row.insertCell().textContent = rLabels[k] || k;
                    row.insertCell().textContent = typeof v === "number" ? v.toFixed(4) : v;
                    const srcCell = row.insertCell();
                    if (mpKeys.has(k)) {
                        srcCell.innerHTML = '<span style="color:#27ae60;font-size:0.8rem;font-weight:600;">📐 MediaPipe</span>';
                    } else if (hmrOnlyKeys.has(k)) {
                        srcCell.innerHTML = '<span style="color:#e67e22;font-size:0.8rem;font-weight:600;">🧠 HMR</span>';
                    } else {
                        srcCell.innerHTML = '<span style="color:#888;font-size:0.8rem;">📏 Input</span>';
                    }
                }

                // ── Input summary ──
                const inpBody = document.querySelector("#inputTable tbody");
                inpBody.innerHTML = "";
                for (const [k, v] of Object.entries(colabData.input)) {
                    const row = inpBody.insertRow();
                    row.insertCell().textContent = k.replace(/_/g, " ").toUpperCase();
                    row.insertCell().textContent = v;
                }
                let row = inpBody.insertRow();
                row.insertCell().textContent = "SOMATOTYPE RATING";
                row.insertCell().textContent = colabData.classification.somatotype_rating;
                row = inpBody.insertRow();
                row.insertCell().textContent = "SOMATOCHART (X, Y)";
                row.insertCell().textContent = `(${colabData.classification.coordinates.x}, ${colabData.classification.coordinates.y})`;

                results.classList.add("active");

            } catch (err) {
                errorBox.textContent = "❌ " + err.message;
                errorBox.classList.add("active");
            } finally {
                clearInterval(timerInterval);
                loading.classList.remove("active");
                btn.disabled = false;
                btn.textContent = "🔬 Analyze Body Type";
            }
        });
    </script>
</body>
</html>
"""


@app.route("/")
def index():
    return render_template_string(HTML_TEMPLATE, colab_url=COLAB_URL.rstrip("/"))


@app.route("/analyze", methods=["POST"])
def analyze_pose():
    """
    Local endpoint — runs MediaPipe pose analysis on the uploaded image.
    Expects multipart/form-data with: image, height_cm
    Returns JSON with joint lengths, symmetry, proportions, annotated image.
    """
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    height_cm = request.form.get("height_cm", type=float)

    image_file = request.files["image"]
    image_bytes = image_file.read()

    result = pose_analyzer.analyze_image(image_bytes, height_cm=height_cm)

    if "error" in result:
        return jsonify(result), 422

    return jsonify(result)


if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"🖥️  Local UI running at: http://localhost:5050")
    print(f"📡  Colab API target:    {COLAB_URL}")
    print(f"{'='*50}\n")
    app.run(host="0.0.0.0", port=5050, debug=True)
