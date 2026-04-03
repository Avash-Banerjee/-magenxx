/* ═══════════════════════════════════════
   FitScan — Body Scan Page Logic
   (Extracted from original local_app.py)
   ═══════════════════════════════════════ */

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
        },
        hmr_data: {
            measurements_cm: colabData.measurements_cm,
            ratios: colabData.ratios,
            ratio_sources: colabData.ratio_sources,
        },
        annotated_image: poseData.annotated_image_base64 || "",
    };

    try {
        await apiPost("/api/scan/save", scanData);
    } catch (err) {
        console.error("Failed to save scan:", err);
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
        const poseResp = await fetch("/api/analyze", {
            method: "POST",
            body: formData
        });
        const poseData = await poseResp.json();

        document.getElementById("stepPose").className = "step done";
        document.getElementById("stepPose").textContent = "✅ Step 1: Pose analysis complete";
        document.getElementById("stepColab").className = "step active";
        document.getElementById("stepColab").textContent = "⏳ Step 2: HMR Inference on Colab GPU (~30s)...";

        // ── STEP 2: Colab HMR classification ──
        const formData2 = new FormData();
        if (usingCam) {
            formData2.append("image", capturedBlob, "webcam.jpg");
        } else {
            formData2.append("image", document.getElementById("imageInput").files[0]);
        }
        formData2.append("height_cm", document.getElementById("heightInput").value);
        formData2.append("weight_kg", document.getElementById("weightInput").value);

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

        // Save to DB
        saveScanResults(poseData, colabData);

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
