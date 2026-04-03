/* ═══════════════════════════════════════
   FitScan — Dashboard Charts (Plotly) + Body Model
   Light Theme
   ═══════════════════════════════════════ */

const scan = SCAN_DATA;

// ── 1. Somatotype Component Bar Chart ──
(function renderComponentChart() {
    const vals = [scan.endomorphy || 0, scan.mesomorphy || 0, scan.ectomorphy || 0];
    const trace = {
        x: ["Endomorphy", "Mesomorphy", "Ectomorphy"],
        y: vals,
        type: "bar",
        marker: {
            color: ["#ef4444", "#10b981", "#3b82f6"],
            line: { color: "rgba(0,0,0,0.05)", width: 1 }
        },
        text: vals.map(v => v.toFixed(2)),
        textposition: "outside",
        textfont: { color: "#475569", size: 14, family: "Inter, Segoe UI" },
    };

    const layout = {
        ...PLOTLY_LAYOUT,
        yaxis: { gridcolor: "rgba(0,0,0,0.05)", zeroline: true, zerolinecolor: "rgba(0,0,0,0.1)" },
        xaxis: { fixedrange: true },
        height: 280,
        margin: { t: 20, b: 40, l: 40, r: 20 },
    };

    Plotly.newPlot("chartComponents", [trace], layout, PLOTLY_CONFIG);
})();

// ── 2. Symmetry Radar Chart ──
(function renderSymmetryChart() {
    const poseData = scan.pose_data || {};
    const symScores = poseData.symmetry_scores || {};
    const labels = Object.keys(symScores);
    const values = labels.map(k => symScores[k].ratio || 0);

    if (labels.length === 0) {
        document.getElementById("chartSymmetry").innerHTML =
            '<p style="color:var(--text-muted); text-align:center; padding:40px;">No symmetry data</p>';
        return;
    }

    const rLabels = [...labels, labels[0]];
    const rValues = [...values, values[0]];

    const trace = {
        type: "scatterpolar",
        r: rValues,
        theta: rLabels,
        fill: "toself",
        fillcolor: "rgba(6,182,212,0.15)",
        line: { color: "#06b6d4", width: 2 },
        marker: { color: "#06b6d4", size: 6 },
    };

    const perfect = {
        type: "scatterpolar",
        r: Array(rLabels.length).fill(1.0),
        theta: rLabels,
        line: { color: "rgba(16,185,129,0.3)", width: 1, dash: "dot" },
        marker: { size: 0 },
        showlegend: false,
    };

    const layout = {
        ...PLOTLY_LAYOUT,
        polar: {
            bgcolor: "rgba(255,255,255,0)",
            radialaxis: {
                visible: true,
                range: [0.7, 1.3],
                gridcolor: "rgba(0,0,0,0.06)",
                color: "#94a3b8",
            },
            angularaxis: { gridcolor: "rgba(0,0,0,0.06)", color: "#64748b" },
        },
        height: 300,
        margin: { t: 30, b: 30, l: 60, r: 60 },
        showlegend: false,
    };

    Plotly.newPlot("chartSymmetry", [perfect, trace], layout, PLOTLY_CONFIG);
})();

// ── 3. Body Proportions Chart ──
(function renderProportionsChart() {
    const poseData = scan.pose_data || {};
    const props = poseData.body_proportions || {};
    const hmrData = scan.hmr_data || {};
    const ratios = hmrData.ratios || {};

    const labels = {
        "Torso / Thigh": props["Torso / Thigh"],
        "Shoulder / Hip Width": props["Shoulder / Hip Width"],
        "Upper Arm / Forearm": props["Upper Arm / Forearm"],
        "Waist / Hip (HMR)": ratios["WHR"],
        "Waist / Height (HMR)": ratios["WHtR"],
    };

    const names = [];
    const vals = [];
    for (const [k, v] of Object.entries(labels)) {
        if (v !== undefined && v !== null) {
            names.push(k);
            vals.push(v);
        }
    }

    if (names.length === 0) {
        document.getElementById("chartProportions").innerHTML =
            '<p style="color:var(--text-muted); text-align:center; padding:40px;">No proportion data</p>';
        return;
    }

    const trace = {
        type: "bar",
        x: vals,
        y: names,
        orientation: "h",
        marker: {
            color: vals.map((_, i) => PLOTLY_LAYOUT.colorway[i % PLOTLY_LAYOUT.colorway.length]),
        },
        text: vals.map(v => v.toFixed(3)),
        textposition: "outside",
        textfont: { color: "#475569", size: 12 },
    };

    const layout = {
        ...PLOTLY_LAYOUT,
        height: 250,
        margin: { t: 10, b: 30, l: 160, r: 60 },
        xaxis: { gridcolor: "rgba(0,0,0,0.05)" },
        yaxis: { automargin: true },
    };

    Plotly.newPlot("chartProportions", [trace], layout, PLOTLY_CONFIG);
})();

// ── 4. Interactive Body Model ──
(function () {
    if (typeof initBodyModel === "function") {
        initBodyModel("bodyCanvas", scan, TARGET_MUSCLES || []);
    }
})();

// ── 5. Calories Speedometer Animation ──
(function initSpeedometer() {
    const arc = document.getElementById("speedoArc");
    const needle = document.getElementById("speedoNeedle");
    const numEl = document.getElementById("speedoNumber");
    if (!arc || !needle) return;

    // Arc total length: semi-circle-ish path (240° of a circle with r=76)
    // Arc length = (240/360) * 2 * π * 76 ≈ 318.4
    const arcLength = arc.getTotalLength ? arc.getTotalLength() : 318;

    // Get calorie data from the DOM
    const calBurned = parseInt(numEl?.textContent || "0", 10);
    const calGoal = 500;
    const pct = Math.min(calBurned / calGoal, 1);

    // Set arc stroke dasharray
    const fillLen = pct * arcLength;
    // Start from 0 and animate
    arc.style.strokeDasharray = `0 ${arcLength}`;

    // Needle: rotate from -120° (start) to +120° (end) based on pct
    // 0% = -120°, 100% = +120°
    const needleAngle = -120 + pct * 240;

    // Animate after a short delay
    setTimeout(() => {
        arc.style.strokeDasharray = `${fillLen} ${arcLength}`;
        needle.style.transform = `rotate(${needleAngle}deg)`;
    }, 300);

    // Count-up animation for the number
    if (numEl && calBurned > 0) {
        let current = 0;
        const step = Math.ceil(calBurned / 40);
        const timer = setInterval(() => {
            current += step;
            if (current >= calBurned) {
                current = calBurned;
                clearInterval(timer);
            }
            numEl.textContent = current;
        }, 30);
    }

    // Auto-refresh every 60s from API
    setInterval(async () => {
        try {
            const resp = await fetch("/api/exercise/today-stats");
            if (!resp.ok) return;
            const data = await resp.json();
            const newCal = data.calories_burned || 0;
            const newPct = Math.min(newCal / calGoal, 1);
            const newFill = newPct * arcLength;
            const newAngle = -120 + newPct * 240;

            arc.style.strokeDasharray = `${newFill} ${arcLength}`;
            needle.style.transform = `rotate(${newAngle}deg)`;
            if (numEl) numEl.textContent = newCal;

            // Update exercise count
            const exEl = document.querySelector(".speedo-ex-count");
            if (exEl) exEl.textContent = `${data.total_completed || 0}/${data.total_plan_today || 0}`;
        } catch (e) { /* silent */ }
    }, 60000);
})();
