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

// ── NEW WIDGETS JS ──

// ── ECG Heart Rate Animation ──
(function initHeartRate() {
    const svg = document.getElementById('ecgSvg');
    const line = document.getElementById('ecgLine');
    if (!svg || !line) return;

    const W = 260, H = 60, mid = H / 2;
    let offset = 0;

    function ecgPoint(x) {
        // ECG shape: flat → small bump → spike up → spike down → bump → flat
        const cycle = W / 2;
        const pos = ((x + offset) % cycle) / cycle; // 0 to 1
        if (pos < 0.3) return mid;
        if (pos < 0.38) return mid - (pos - 0.3) / 0.08 * 6;
        if (pos < 0.43) return mid + (pos - 0.38) / 0.05 * 6;
        if (pos < 0.47) return mid - (pos - 0.43) / 0.04 * 36;
        if (pos < 0.52) return mid + (pos - 0.47) / 0.05 * 18;
        if (pos < 0.57) return mid - (pos - 0.52) / 0.05 * 8;
        if (pos < 0.65) return mid + (pos - 0.57) / 0.08 * 8;
        if (pos < 0.72) return mid - (pos - 0.65) / 0.07 * 8;
        if (pos < 0.78) return mid + (pos - 0.72) / 0.06 * 8;
        return mid;
    }

    function drawECG() {
        let pts = '';
        for (let x = 0; x <= W; x += 2) {
            pts += `${x},${ecgPoint(x).toFixed(1)} `;
        }
        line.setAttribute('points', pts.trim());
        offset = (offset + 1.8) % (W / 2);
        requestAnimationFrame(drawECG);
    }
    drawECG();
})();

// ── Water Intake ──
window._waterGlasses = 4;
function changeWater(delta) {
    window._waterGlasses = Math.max(0, Math.min(8, window._waterGlasses + delta));
    const g = window._waterGlasses;
    document.getElementById('waterGlasses').textContent = g;
    document.getElementById('waterMl').textContent = (g * 250) + ' ml';
    // Animate bottle fill
    const fill = document.getElementById('waterFill');
    if (fill) {
        const pct = g / 8;
        const bottleTop = 35, bottleBottom = 122;
        const fillHeight = (bottleBottom - bottleTop) * pct;
        const yPos = bottleBottom - fillHeight;
        fill.setAttribute('y', yPos);
        fill.setAttribute('height', fillHeight);
    }
}
// Init bottle fill
changeWater(0);

// ── SpO2 Arc Animation ──
(function initSpO2() {
    const arc = document.getElementById('spo2Arc');
    if (!arc) return;
    const totalLen = Math.PI * 50; // half circle r=50
    const pct = 0.98; // 98%
    setTimeout(() => {
        arc.style.transition = 'stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)';
        arc.style.strokeDasharray = `${totalLen * pct} 999`;
    }, 600);
})();

// ── Goal Ring ──
(function initGoalRing() {
    const ring = document.getElementById('goalRingFill');
    if (!ring) return;
    const pct = 0.38;
    const circumference = 2 * Math.PI * 48; // r=48
    setTimeout(() => {
        ring.style.strokeDasharray = `${circumference * pct} ${circumference}`;
    }, 700);
})();

// ── Calories Balance Rings ──
(function initCalBalance() {
    const calIn = document.getElementById('calInArc');
    const calOut = document.getElementById('calOutArc');
    if (!calIn || !calOut) return;
    const outerCirc = 2 * Math.PI * 56; // r=56
    const innerCirc = 2 * Math.PI * 40; // r=40
    const consumed = 1840, goal = 2500, burned = 2080;
    const pctIn = Math.min(consumed / goal, 1);
    const pctOut = Math.min(burned / goal, 1);
    setTimeout(() => {
        calIn.style.transition = 'stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)';
        calOut.style.transition = 'stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)';
        calIn.style.strokeDasharray = `${outerCirc * pctIn} ${outerCirc}`;
        calOut.style.strokeDasharray = `${innerCirc * pctOut} ${innerCirc}`;
    }, 800);
    const bal = consumed - burned;
    const balEl = document.getElementById('calBalNum');
    if (balEl) balEl.textContent = (bal >= 0 ? '+' : '') + bal;
    document.querySelector('.calbal-svg text:last-of-type').textContent = bal < 0 ? 'kcal deficit' : 'kcal surplus';
})();

// ── Workout Streak Days ──
(function initStreak() {
    const wrap = document.getElementById('streakDays');
    if (!wrap) return;
    const days = ['M','T','W','T','F','S','S'];
    const done = [true, true, true, true, true, true, true]; // last 7 days
    const today = new Date().getDay(); // 0=Sun
    days.forEach((d, i) => {
        const el = document.createElement('div');
        const isToday = i === 6;
        el.className = 'streak-day' + (done[i] ? (isToday ? ' today' : ' done') : '');
        el.textContent = d;
        wrap.appendChild(el);
    });
})();

// ── Activity Heatmap ──
(function initHeatmap() {
    const grid = document.getElementById('heatmapGrid');
    if (!grid) return;
    const weeks = 12, days = 7;
    const levels = ['', 'l1', 'l2', 'l3', 'l4'];
    for (let w = 0; w < weeks; w++) {
        const col = document.createElement('div');
        col.className = 'heatmap-col';
        for (let d = 0; d < days; d++) {
            const cell = document.createElement('div');
            // Simulate some activity data
            const rand = Math.random();
            let lvl = '';
            if (rand > 0.35) lvl = rand > 0.7 ? (rand > 0.85 ? (rand > 0.95 ? 'l4' : 'l3') : 'l2') : 'l1';
            cell.className = 'heatmap-cell ' + lvl;
            col.appendChild(cell);
        }
        grid.appendChild(col);
    }
})();

// ── Muscle Recovery Tooltip ──
(function initRecovery() {
    const zones = document.querySelectorAll('.recovery-zone');
    const tooltip = document.getElementById('recoveryTooltip');
    if (!tooltip) return;
    zones.forEach(zone => {
        zone.addEventListener('mouseenter', () => {
            const muscle = zone.dataset.muscle;
            const status = zone.dataset.status;
            const icons = { fresh: '✅', recovering: '⏳', fatigued: '🔴' };
            tooltip.textContent = `${muscle}: ${status.charAt(0).toUpperCase() + status.slice(1)} ${icons[status] || ''}`;
            tooltip.style.display = 'block';
        });
        zone.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
    });
})();
