/* ═══════════════════════════════════════
   FitScan — Body Scan Page Logic
   (Extracted from original local_app.py)
   ═══════════════════════════════════════ */

let timerInterval;

async function readJsonResponse(response, label) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
        return response.json();
    }

    const text = await response.text();
    const preview = text.replace(/\s+/g, " ").slice(0, 180);
    throw new Error(`${label} returned HTML/non-JSON (${response.status}). ${preview}`);
}

// ── Check Colab connection ──
async function checkStatus() {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");
    try {
        const r = await fetch("/api/hmr/status");
        const data = await readJsonResponse(r, "HMR status");
        if (data.available) {
            dot.className = "status-dot online";
            text.textContent = "Colab GPU connected";
        } else {
            throw new Error(data.reason || "HMR Colab is not reachable");
        }
    } catch (err) {
        dot.className = "status-dot offline";
        if (err && err.message) {
            text.textContent = err.message;
            return;
        }
        text.textContent = "Colab not reachable — is the server cell running?";
    }
}
checkStatus();

// ── Tab switching ──
let currentTab = "video";
function switchTab(tab) {
    currentTab = tab;
    ["cam", "upload", "video"].forEach(t => {
        const btn   = document.getElementById("tab" + t.charAt(0).toUpperCase() + t.slice(1));
        const panel = document.getElementById("panel" + t.charAt(0).toUpperCase() + t.slice(1));
        if (btn)   btn.classList.toggle("active", t === tab);
        if (panel) panel.style.display = (t === tab) ? "block" : "none";
    });
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

// ── Image file upload preview ──
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

// ── Video upload + frame extraction ──
let videoFile = null;
let videoFrameBlob = null;      // legacy single-frame fallback
let videoMultiviewResult = null; // {colab, pose, views, frames_sampled}

document.getElementById("videoInput").addEventListener("change", function(e) {
    videoFile = e.target.files[0];
    if (!videoFile) return;

    const zone = document.getElementById("videoDropZone");
    const icon = document.getElementById("videoDropIcon");
    const text = document.getElementById("videoDropText");
    if (icon) icon.textContent = "✅";
    if (text) text.innerHTML = `<strong>${videoFile.name}</strong><br><small style="color:var(--text-dim);">${(videoFile.size / 1024 / 1024).toFixed(1)} MB</small>`;
    if (zone) zone.style.borderColor = "var(--green, #10b981)";

    const player = document.getElementById("videoPlayer");
    player.src = URL.createObjectURL(videoFile);
    player.load();

    player.onloadedmetadata = function() {
        const dur = player.duration;
        document.getElementById("videoTotalTime").textContent = dur.toFixed(1) + " s";
        const scrubber = document.getElementById("frameScrubber");
        scrubber.max = dur;
        const autoTime = dur * 0.4;
        scrubber.value = autoTime;
        player.currentTime = autoTime;
    };

    document.getElementById("videoPreviewWrap").style.display = "block";
    document.getElementById("videoFrameCaptured").style.display = "none";
    document.getElementById("videoViewsExtracted").style.display = "none";
    document.getElementById("videoExtractProgress").style.display = "none";
    videoFrameBlob = null;
    videoMultiviewResult = null;
});

function scrubVideoFrame(val) {
    const player = document.getElementById("videoPlayer");
    if (player) {
        player.currentTime = parseFloat(val);
        const label = document.getElementById("frameTimeDisplay");
        if (label) label.textContent = parseFloat(val).toFixed(2) + " s";
    }
}

function captureVideoFrame() {
    const player = document.getElementById("videoPlayer");
    if (!player || !player.videoWidth) {
        alert("Video not loaded yet. Please wait.");
        return;
    }
    const canvas = document.createElement("canvas");
    canvas.width  = player.videoWidth;
    canvas.height = player.videoHeight;
    canvas.getContext("2d").drawImage(player, 0, 0);

    canvas.toBlob(blob => {
        videoFrameBlob = blob;
        videoMultiviewResult = null;
        const preview = document.getElementById("videoFramePreview");
        preview.src = URL.createObjectURL(blob);

        document.getElementById("videoPreviewWrap").style.display = "none";
        document.getElementById("videoFrameCaptured").style.display = "block";
        document.getElementById("videoViewsExtracted").style.display = "none";
    }, "image/jpeg", 0.93);
}

async function autoExtractViews() {
    if (!videoFile) { alert("Please upload a video first."); return; }
    const height = document.getElementById("heightInput").value;
    const weight = document.getElementById("weightInput").value;
    if (!height || !weight) { alert("Enter height and weight first."); return; }

    const btn = document.getElementById("btnAutoExtract");
    const progress = document.getElementById("videoExtractProgress");
    const msgEl = document.getElementById("videoExtractMsg");
    btn.disabled = true;
    progress.style.display = "block";
    msgEl.textContent = "⏳ Uploading video and extracting 3 views...";

    try {
        const fd = new FormData();
        fd.append("video", videoFile, videoFile.name);
        fd.append("height_cm", height);
        fd.append("weight_kg", weight);

        msgEl.textContent = "⏳ Running MediaPipe on all frames (~10–30s depending on video length)...";
        const resp = await fetch("/api/analyze/video", { method: "POST", body: fd });
        const data = await readJsonResponse(resp, "Video analysis");

        if (!resp.ok || data.error) {
            throw new Error(data.error || "Video analysis failed");
        }

        videoMultiviewResult = data;
        videoFrameBlob = null;

        // Show thumbnails
        if (data.views) {
            document.getElementById("thumbFront").src = data.views.front.frame_b64;
            document.getElementById("thumbSide").src  = data.views.side.frame_b64;
            document.getElementById("thumbDiag").src  = data.views.diagonal.frame_b64;
        }

        progress.style.display = "none";
        document.getElementById("videoPreviewWrap").style.display = "none";
        document.getElementById("videoViewsExtracted").style.display = "block";
        document.getElementById("videoFrameCaptured").style.display = "none";

        if (data.colab) {
            msgEl.textContent = `✅ 3-view HMR complete (${data.frames_sampled} frames sampled)`;
        } else {
            msgEl.textContent = `✅ Views extracted (${data.frames_sampled} frames). Colab not connected — HMR skipped.`;
        }
    } catch (err) {
        progress.style.display = "none";
        alert("View extraction failed: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

function resetVideoCapture() {
    videoFrameBlob = null;
    videoMultiviewResult = null;
    document.getElementById("videoFrameCaptured").style.display = "none";
    document.getElementById("videoViewsExtracted").style.display = "none";
    document.getElementById("videoExtractProgress").style.display = "none";
    document.getElementById("videoPreviewWrap").style.display = "block";
}

// ── Gaussian Splatting status UI helpers ──
function _gsCard()   { return document.getElementById("gsStatusCard"); }
function _gsIcon()   { return document.getElementById("gsStatusIcon"); }
function _gsBadge()  { return document.getElementById("gsStatusBadge"); }
function _gsMsg()    { return document.getElementById("gsStatusMsg"); }
function _gsBar()    { return document.getElementById("gsProgressBar"); }
function _gsFill()   { return document.getElementById("gsProgressFill"); }

const GS_STAGE_PCT = { queued:10, extracting:20, colmap:40, undistorting:60, training:75, exporting:92, done:100 };

function _gsSetState(icon, badge, badgeColor, msg, pct) {
    const card = _gsCard(); if (!card) return;
    card.style.display = "block";
    _gsIcon().textContent  = icon;
    _gsBadge().textContent = badge;
    _gsBadge().style.background = badgeColor + "22";
    _gsBadge().style.color      = badgeColor;
    _gsMsg().textContent   = msg;
    if (pct !== null) {
        _gsBar().style.display = "block";
        _gsFill().style.width  = pct + "%";
    }
}

let _gsPollTimer = null;
function _startGsPoll() {
    if (_gsPollTimer) clearInterval(_gsPollTimer);
    _gsPollTimer = setInterval(async () => {
        try {
            const r    = await fetch("/api/gaussian/status");
            const data = await r.json();
            const st   = data.status || "idle";
            const stage = data.stage || (data.data && data.data.stage) || st;
            const pct  = GS_STAGE_PCT[stage] || GS_STAGE_PCT[st] || 15;

            if ((st === "done" || data.available) && data.output_ready) {
                clearInterval(_gsPollTimer); _gsPollTimer = null;
                _gsSetState("✅", "Done", "#10b981",
                    "3D model ready! Open the Dashboard to view your Gaussian Splat.", 100);
            } else if (st === "error") {
                clearInterval(_gsPollTimer); _gsPollTimer = null;
                const errMsg = data.error || (data.data && data.data.error) || "Pipeline failed";
                _gsSetState("❌", "Error", "#ef4444", "GS error: " + errMsg, null);
            } else if (st === "processing") {
                const stageLabel = (stage || "processing").charAt(0).toUpperCase() + (stage || "processing").slice(1);
                _gsSetState("⚙️", stageLabel, "#6366f1",
                    "Pipeline running — stage: " + stageLabel + ". This takes ~10–15 min on T4 GPU.", pct);
            }
        } catch(e) { /* ignore poll errors */ }
    }, 12000); // poll every 12s
}

async function triggerGaussianColab(file) {
    if (!GAUSSIAN || !file) return;
    _gsSetState("⏫", "Sending...", "#6366f1", "Uploading video to Gaussian Splatting Colab...", 5);
    try {
        const fd = new FormData();
        fd.append("video", file, file.name || "scan.mp4");
        const r = await fetch("/api/gaussian/trigger", { method: "POST", body: fd });
        if (r.ok) {
            _gsSetState("⚙️", "Processing", "#6366f1",
                "Video received by Colab. Pipeline starting... (~10–15 min on T4 GPU)", 10);
            _startGsPoll();
        } else {
            _gsSetState("❌", "Failed", "#ef4444", "Could not send video to GS Colab. Check GAUSSIAN_COLAB_URL in .env.", null);
        }
    } catch(e) {
        _gsSetState("❌", "Failed", "#ef4444", "Network error: " + e.message, null);
    }
}

// ── Symmetry bars ──
function renderSymmetry(symmetry) {
    const container = document.getElementById("symmetryBars");
    container.innerHTML = "";
    for (const [label, data] of Object.entries(symmetry)) {
        const ratio = data.ratio;
        const assess = data.assessment;
        const cls = assess === "Good" ? "good" : (Math.abs(ratio - 1.0) < 0.15 ? "warn" : "bad");
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

// ── Joint & structural angles ──
function renderAngles(jointAngles, structuralAngles) {
    const card = document.getElementById("anglesCard");
    if (!card) return;
    card.style.display = "block";

    const JOINT_LABELS = {
        left_knee_angle:       ["Knee",          "Left"],
        right_knee_angle:      ["Knee",          "Right"],
        left_hip_angle:        ["Hip",           "Left"],
        right_hip_angle:       ["Hip",           "Right"],
        left_elbow_angle:      ["Elbow",         "Left"],
        right_elbow_angle:     ["Elbow",         "Right"],
        left_shoulder_angle:   ["Shoulder",      "Left"],
        right_shoulder_angle:  ["Shoulder",      "Right"],
        left_ankle_angle:      ["Ankle",         "Left"],
        right_ankle_angle:     ["Ankle",         "Right"],
        left_q_angle:          ["Q-Angle",       "Left"],
        right_q_angle:         ["Q-Angle",       "Right"],
        left_wrist_angle:      ["Wrist",         "Left"],
        right_wrist_angle:     ["Wrist",         "Right"],
        left_neck_angle:       ["Neck-Torso",    "Left"],
        right_neck_angle:      ["Neck-Torso",    "Right"],
        left_foot_arch_angle:  ["Foot Arch",     "Left"],
        right_foot_arch_angle: ["Foot Arch",     "Right"],
    };

    // Joint angles table
    if (jointAngles) {
        const tbody = document.querySelector("#jointAnglesTable tbody");
        tbody.innerHTML = "";
        for (const [key, deg] of Object.entries(jointAngles)) {
            const [joint, side] = JOINT_LABELS[key] || [key, "—"];
            const row = tbody.insertRow();
            row.insertCell().textContent = joint;
            row.insertCell().innerHTML = `<strong>${deg.toFixed(1)}°</strong>`;
            const sideCell = row.insertCell();
            sideCell.textContent = side;
            sideCell.style.color = side === "Left" ? "var(--blue,#60a5fa)" : "var(--orange,#fb923c)";
        }
    }

    // Structural angles table with posture notes
    if (structuralAngles) {
        const STRUCT_META = {
            shoulder_tilt_deg:  ["Shoulder Tilt",     v => Math.abs(v) < 3  ? "✅ Level"       : "⚠️ Uneven"],
            hip_tilt_deg:       ["Hip Tilt",          v => Math.abs(v) < 3  ? "✅ Level"       : "⚠️ Uneven"],
            trunk_lean_deg:     ["Trunk Lean",        v => Math.abs(v) < 5  ? "✅ Upright"     : "⚠️ Leaning"],
            head_tilt_deg:      ["Head Tilt",         v => Math.abs(v) < 5  ? "✅ Level"       : "⚠️ Tilted"],
            forward_head_deg:   ["Forward Head",      v => v < 10           ? "✅ Good posture" : v < 20 ? "⚠️ Mild FHP" : "❌ FHP"],
        };
        const tbody = document.querySelector("#structuralAnglesTable tbody");
        tbody.innerHTML = "";
        for (const [key, val] of Object.entries(structuralAngles)) {
            const meta = STRUCT_META[key];
            const label = meta ? meta[0] : key.replace(/_/g, " ");
            const note  = meta ? meta[1](val) : "—";
            const row = tbody.insertRow();
            row.insertCell().textContent = label;
            row.insertCell().innerHTML = `<strong>${val.toFixed(1)}°</strong>`;
            row.insertCell().innerHTML = `<span style="font-size:0.8rem;">${note}</span>`;
        }
    }
}

// ── Save scan results to DB ──
async function saveScanResults(poseData, colabData) {
    const scanData = {
        body_type: colabData.classification.body_type,
        classification: colabData.classification.classification,
        endomorphy: colabData.classification.components.endomorphy,
        mesomorphy: colabData.classification.components.mesomorphy,
        ectomorphy: colabData.classification.components.ectomorphy,
        somatotype_rating: colabData.classification.somatotype_rating,
        bmi: colabData.input.bmi,
        pose_data: {
            joint_lengths_cm: poseData.joint_lengths_cm,
            symmetry_scores: poseData.symmetry_scores,
            body_proportions: poseData.body_proportions,
            skeletal_ratios: poseData.skeletal_ratios,
            joint_angles_deg: poseData.joint_angles_deg,
            structural_angles_deg: poseData.structural_angles_deg,
            landmarks_detected: poseData.landmarks_detected,
            px_per_cm: poseData.px_per_cm,
        },
        hmr_data: {
            measurements_cm: colabData.measurements_cm,
            ratios: colabData.ratios,
            ratio_sources: colabData.ratio_sources,
        },
        annotated_image: poseData.annotated_image_base64 || "",
    };

    // Direct fetch w/ cache-bust + awaited error propagation.
    const resp = await fetch("/api/scan/save", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
        },
        cache: "no-store",
        body: JSON.stringify(scanData),
    });
    if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`Save failed (${resp.status}): ${txt.slice(0, 180)}`);
    }
    const out = await resp.json();
    try {
        sessionStorage.setItem("fitscan_new_scan", String(Date.now()));
        if (out && out.scan_id) sessionStorage.setItem("fitscan_last_scan_id", String(out.scan_id));
    } catch (_) {}
    return out;
}

// ── Form submit ──
document.getElementById("classifyForm").addEventListener("submit", async function(e) {
    e.preventDefault();

    if (currentTab === "cam"    && !capturedBlob)  { alert("Please capture a photo first."); return; }
    if (currentTab === "upload" && !document.getElementById("imageInput").files[0]) { alert("Please upload an image."); return; }
    if (currentTab === "video"  && !videoFrameBlob && !videoMultiviewResult) { alert("Please extract views from the video first (or capture a frame manually)."); return; }

    const btn = document.getElementById("submitBtn");
    const loading = document.getElementById("loadingSection");
    const results = document.getElementById("resultsSection");
    const errorBox = document.getElementById("errorBox");

    results.classList.remove("active");
    errorBox.classList.remove("active");
    btn.disabled = true;
    btn.textContent = "⏳ Processing...";
    loading.classList.add("active");

    document.getElementById("stepPose").className = "step active";
    document.getElementById("stepPose").textContent = "⏳ Step 1: MediaPipe Pose Analysis (local)...";
    document.getElementById("stepColab").className = "step";
    document.getElementById("stepColab").textContent = "⬜ Step 2: HMR Inference on Colab GPU...";

    let seconds = 0;
    const timerEl = document.getElementById("timer");
    timerInterval = setInterval(() => { seconds++; timerEl.textContent = seconds + "s"; }, 1000);

    try {
        let poseData, colabData;

        // ── Multi-view shortcut: auto-extract already ran Colab ──
        if (currentTab === "video" && videoMultiviewResult && videoMultiviewResult.colab) {
            poseData  = videoMultiviewResult.pose;
            colabData = videoMultiviewResult.colab;

            document.getElementById("stepPose").className = "step done";
            document.getElementById("stepPose").textContent = "✅ Step 1: Multi-view pose analysis complete";
            document.getElementById("stepColab").className = "step done";
            document.getElementById("stepColab").textContent =
                `✅ Step 2: HMR complete (3-view average, ${videoMultiviewResult.frames_sampled} frames sampled)`;

        } else {
            // ── Single-image path (webcam / upload / manual frame) ──

            // Build form data
            const formData = new FormData();
            if (currentTab === "cam") {
                formData.append("image", capturedBlob, "webcam.jpg");
            } else if (currentTab === "video") {
                formData.append("image", videoFrameBlob, "video_frame.jpg");
            } else {
                formData.append("image", document.getElementById("imageInput").files[0]);
            }
            formData.append("height_cm", document.getElementById("heightInput").value);
            formData.append("weight_kg", document.getElementById("weightInput").value);

            // ── STEP 1: Local pose analysis ──
            const poseResp = await fetch("/api/analyze", { method: "POST", body: formData });
            poseData = await readJsonResponse(poseResp, "Local pose analysis");
            if (!poseResp.ok || poseData.error) {
                throw new Error(poseData.error || "Local pose analysis failed");
            }

            document.getElementById("stepPose").className = "step done";
            document.getElementById("stepPose").textContent = "✅ Step 1: Pose analysis complete";
            document.getElementById("stepColab").className = "step active";
            document.getElementById("stepColab").textContent = "⏳ Step 2: HMR Inference on Colab GPU (~30s)...";

            // ── STEP 2: Colab HMR classification ──
            const formData2 = new FormData();
            if (currentTab === "cam") {
                formData2.append("image", capturedBlob, "webcam.jpg");
            } else if (currentTab === "video") {
                formData2.append("image", videoFrameBlob, "video_frame.jpg");
            } else {
                formData2.append("image", document.getElementById("imageInput").files[0]);
            }
            formData2.append("height_cm", document.getElementById("heightInput").value);
            formData2.append("weight_kg", document.getElementById("weightInput").value);

            if (poseData.skeletal_ratios) {
                formData2.append("mp_ratios", JSON.stringify(poseData.skeletal_ratios));
            }

            const colabResp = await fetch("/api/hmr/classify", { method: "POST", body: formData2 });
            colabData = await readJsonResponse(colabResp, "HMR classification");

            if (!colabResp.ok || colabData.error) {
                const details = colabData.body_preview ? ": " + colabData.body_preview : "";
                throw new Error((colabData.error || "Colab returned an error") + details);
            }

            document.getElementById("stepColab").className = "step done";
            document.getElementById("stepColab").textContent = "✅ Step 2: HMR classification complete";
        }

        // ════════════════════════════
        //   POPULATE RESULTS
        // ════════════════════════════

        // Somatotype header
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

        // ── Plotly Somatotype Charts ──
        renderSomatoCharts(comp);

        document.getElementById("interpBox").innerHTML =
            `<span class="dominant">${colabData.interpretation.dominant_type}</span> — ${colabData.interpretation.description}`;

        // Pose skeleton
        if (poseData.annotated_image_base64) {
            document.getElementById("poseImage").src = poseData.annotated_image_base64;
        }

        // Symmetry
        if (poseData.symmetry_scores) { renderSymmetry(poseData.symmetry_scores); }

        // Proportions
        if (poseData.body_proportions) {
            const propBody = document.querySelector("#proportionsTable tbody");
            propBody.innerHTML = "";
            for (const [k, v] of Object.entries(poseData.body_proportions)) {
                const row = propBody.insertRow();
                row.insertCell().textContent = k;
                row.insertCell().textContent = v.toFixed(3);
            }
        }

        // Joint & structural angles
        if (poseData.joint_angles_deg || poseData.structural_angles_deg) {
            renderAngles(poseData.joint_angles_deg, poseData.structural_angles_deg);
        }

        // Joint segments
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

        // HMR measurements
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

        // Ratios with source
        const ratBody = document.querySelector("#ratioTable tbody");
        ratBody.innerHTML = "";
        const rLabels = {
            WHtR: "Waist / Height", WHR: "Waist / Hip", SHR: "Shoulder / Height",
            UAG_H: "Upper Arm / Height", TG_H: "Thigh / Height",
            HWR: "Height / Weight^⅓", LL_H: "Leg Length / Height", TVR: "Torso Volume Ratio"
        };
        const mpKeys = new Set(Object.keys(poseData.skeletal_ratios || {}));
        const hmrOnlyKeys = new Set(["WHtR", "WHR", "TVR", "HWR"]);
        for (const [k, v] of Object.entries(colabData.ratios)) {
            if (k === "height" || k === "weight") continue;
            const row = ratBody.insertRow();
            row.insertCell().textContent = rLabels[k] || k;
            row.insertCell().textContent = typeof v === "number" ? v.toFixed(4) : v;
            const srcCell = row.insertCell();
            if (mpKeys.has(k)) {
                srcCell.innerHTML = '<span style="color:var(--green);font-size:0.8rem;font-weight:600;">📐 MediaPipe</span>';
            } else if (hmrOnlyKeys.has(k)) {
                srcCell.innerHTML = '<span style="color:var(--orange);font-size:0.8rem;font-weight:600;">🧠 HMR</span>';
            } else {
                srcCell.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;">📏 Input</span>';
            }
        }

        // Input summary
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

        // Save to DB — awaited so Dashboard sees the new scan
        try {
            await saveScanResults(poseData, colabData);
            const banner = document.createElement("div");
            banner.style.cssText = "margin-top:12px;padding:10px 14px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.35);border-radius:10px;color:#10b981;font-size:0.85rem;font-weight:600;";
            banner.textContent = "✅ Scan saved. Open Dashboard to view updated results.";
            results.appendChild(banner);
        } catch (saveErr) {
            errorBox.textContent = "⚠ Scan analysis succeeded but saving to DB failed: " + saveErr.message;
            errorBox.classList.add("active");
        }

        // Trigger Gaussian Splatting Colab in background (video tab only)
        if (currentTab === "video" && videoFile) {
            triggerGaussianColab(videoFile);
        }

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


// ═══════════════════════════════════════
//  Somatotype Plotly Charts
// ═══════════════════════════════════════
function renderSomatoCharts(comp) {
    const endo = comp.endomorphy;
    const meso = comp.mesomorphy;
    const ecto = comp.ectomorphy;

    const darkBg = "#1a1a2e";
    const fontCfg = { color: "#e0e0e0", family: "Segoe UI, system-ui, sans-serif" };

    // ── 1. Radar / Spider chart ──
    Plotly.newPlot("somatoRadar", [{
        type: "scatterpolar",
        r: [endo, meso, ecto, endo],  // close the shape
        theta: ["Endomorphy", "Mesomorphy", "Ectomorphy", "Endomorphy"],
        fill: "toself",
        fillcolor: "rgba(102, 126, 234, 0.25)",
        line: { color: "#667eea", width: 2.5 },
        marker: { size: 8, color: ["#e74c3c", "#27ae60", "#2980b9", "#e74c3c"] },
        text: [endo.toFixed(2), meso.toFixed(2), ecto.toFixed(2), ""],
        textposition: "top center",
        mode: "lines+markers+text",
        textfont: { color: "#e0e0e0", size: 13, family: "monospace" },
    }], {
        polar: {
            bgcolor: darkBg,
            radialaxis: {
                visible: true, color: "#555", gridcolor: "#333",
                range: [Math.min(endo, meso, ecto, -3) - 0.5, Math.max(endo, meso, ecto, 3) + 0.5],
            },
            angularaxis: { color: "#aaa", gridcolor: "#333" },
        },
        paper_bgcolor: darkBg,
        font: fontCfg,
        title: { text: "Component Radar", font: { size: 14, color: "#ccc" } },
        margin: { t: 50, b: 30, l: 50, r: 50 },
        showlegend: false,
    }, { displayModeBar: false, responsive: true });

    // ── 2. Horizontal bar chart — how much of each ──
    const names = ["Endomorphy", "Mesomorphy", "Ectomorphy"];
    const vals = [endo, meso, ecto];
    const colors = ["#e74c3c", "#27ae60", "#2980b9"];

    Plotly.newPlot("somatoBar", [{
        type: "bar",
        y: names,
        x: vals,
        orientation: "h",
        marker: {
            color: colors,
            line: { color: colors.map(c => c + "88"), width: 1 },
        },
        text: vals.map(v => (v >= 0 ? "+" : "") + v.toFixed(2)),
        textposition: "outside",
        textfont: { color: "#e0e0e0", size: 13, family: "monospace" },
        hovertemplate: "%{y}: %{x:.2f}<extra></extra>",
    }], {
        paper_bgcolor: darkBg,
        plot_bgcolor: darkBg,
        font: fontCfg,
        title: { text: "Component Scores (z-score)", font: { size: 14, color: "#ccc" } },
        xaxis: {
            gridcolor: "#333", zerolinecolor: "#555", zerolinewidth: 2,
            title: { text: "Score", font: { size: 11 } },
            range: [Math.min(...vals, -3) - 1, Math.max(...vals, 3) + 1],
        },
        yaxis: { gridcolor: "#333", automargin: true },
        margin: { t: 50, b: 50, l: 100, r: 60 },
        showlegend: false,
    }, { displayModeBar: false, responsive: true });
}
