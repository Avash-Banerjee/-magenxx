/* ═══════════════════════════════════════
   FitScan — Interactive Canvas Body Model
   Glowing muscle groups with click-to-inspect
   ═══════════════════════════════════════ */

function initBodyModel(canvasId, scanData, targetMuscles) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width;
    const H = canvas.height;

    const tooltip = document.getElementById("muscleTooltip");
    let hoveredMuscle = null;
    let selectedMuscle = null;
    let glowPhase = 0;

    // Muscle region polygons (front view, normalized to canvas)
    const muscleRegions = {
        chest:      { path: [[155,155],[245,155],[255,210],[200,225],[145,210]], color: "#e74c3c", label: "Chest" },
        shoulders:  { path: [[110,130],[155,130],[155,170],[120,175],[100,155]], color: "#e67e22", label: "L Shoulder" },
        shoulders_r:{ path: [[245,130],[290,130],[300,155],[280,175],[245,170]], color: "#e67e22", label: "R Shoulder" },
        core:       { path: [[160,215],[240,215],[245,310],[200,320],[155,310]], color: "#f39c12", label: "Core" },
        biceps_l:   { path: [[95,170],[120,170],[125,250],[100,255],[85,230]], color: "#27ae60", label: "L Bicep" },
        biceps_r:   { path: [[280,170],[305,170],[315,230],[300,255],[275,250]], color: "#27ae60", label: "R Bicep" },
        forearm_l:  { path: [[85,250],[105,250],[110,330],[90,335],[75,310]], color: "#2ecc71", label: "L Forearm" },
        forearm_r:  { path: [[295,250],[315,250],[325,310],[310,335],[290,330]], color: "#2ecc71", label: "R Forearm" },
        quads_l:    { path: [[155,320],[195,320],[190,430],[150,430]], color: "#2980b9", label: "L Quad" },
        quads_r:    { path: [[205,320],[245,320],[250,430],[210,430]], color: "#2980b9", label: "R Quad" },
        calves_l:   { path: [[150,440],[190,440],[185,545],[155,545]], color: "#3498db", label: "L Calf" },
        calves_r:   { path: [[210,440],[250,440],[245,545],[215,545]], color: "#3498db", label: "R Calf" },
        glutes:     { path: [[155,300],[245,300],[250,340],[200,350],[150,340]], color: "#764ba2", label: "Glutes" },
    };

    // Map display muscle keys to user-facing groups
    const muscleGroupMap = {
        chest: "chest",
        shoulders: "shoulders", shoulders_r: "shoulders",
        core: "core",
        biceps_l: "arms", biceps_r: "arms",
        forearm_l: "arms", forearm_r: "arms",
        quads_l: "legs", quads_r: "legs",
        calves_l: "legs", calves_r: "legs",
        glutes: "glutes",
    };

    // Get scan data for a muscle region
    function getMuscleData(key) {
        const poseData = scanData.pose_data || {};
        const symScores = poseData.symmetry_scores || {};
        const hmrData = scanData.hmr_data || {};
        const meas = hmrData.measurements_cm || {};

        const group = muscleGroupMap[key];
        const isTarget = targetMuscles.includes(group);

        const info = { group, isTarget, symmetry: null, measurement: null };

        // Find matching symmetry data
        for (const [symKey, symVal] of Object.entries(symScores)) {
            const lower = symKey.toLowerCase();
            if (lower.includes(group) || (group === "arms" && (lower.includes("arm") || lower.includes("bicep"))) ||
                (group === "legs" && (lower.includes("leg") || lower.includes("thigh"))) ||
                (group === "chest" && lower.includes("shoulder")) ||
                (group === "core" && lower.includes("torso"))) {
                info.symmetry = symVal;
                break;
            }
        }

        // Find matching measurement
        if (group === "chest" && meas.chest) info.measurement = { label: "Chest", value: meas.chest };
        else if (group === "shoulders" && meas.shoulder) info.measurement = { label: "Shoulder", value: meas.shoulder };
        else if (group === "core" && meas.waist) info.measurement = { label: "Waist", value: meas.waist };
        else if (group === "arms" && meas.upper_arm) info.measurement = { label: "Arm", value: meas.upper_arm };
        else if (group === "legs" && meas.thigh) info.measurement = { label: "Thigh", value: meas.thigh };
        else if (group === "glutes" && meas.hip) info.measurement = { label: "Hip", value: meas.hip };

        return info;
    }

    function isTarget(key) {
        const group = muscleGroupMap[key];
        return targetMuscles.includes(group);
    }

    function drawMuscle(key, region, glow) {
        const pts = region.path;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();

        const targeted = isTarget(key);
        const isHovered = hoveredMuscle === key;
        const isSelected = selectedMuscle === key;

        // Fill
        const alpha = targeted ? 0.35 + glow * 0.15 : 0.15;
        ctx.fillStyle = region.color + Math.round(alpha * 255).toString(16).padStart(2, "0");
        ctx.fill();

        // Glow effect
        if (targeted || isHovered || isSelected) {
            ctx.save();
            ctx.shadowColor = region.color;
            ctx.shadowBlur = isSelected ? 25 : isHovered ? 20 : 10 + glow * 8;
            ctx.strokeStyle = region.color;
            ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.strokeStyle = region.color + "66";
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function drawBody() {
        // Head
        ctx.beginPath();
        ctx.ellipse(200, 80, 30, 35, 0, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(6,182,212,0.5)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = "rgba(6,182,212,0.05)";
        ctx.fill();

        // Neck
        ctx.beginPath();
        ctx.moveTo(185, 115);
        ctx.lineTo(215, 115);
        ctx.lineTo(215, 130);
        ctx.lineTo(185, 130);
        ctx.closePath();
        ctx.fillStyle = "rgba(6,182,212,0.05)";
        ctx.fill();
        ctx.strokeStyle = "rgba(6,182,212,0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Body outline (subtle)
        ctx.beginPath();
        ctx.moveTo(155, 130);
        ctx.lineTo(110, 130);
        ctx.lineTo(85, 170);
        ctx.lineTo(75, 310);
        ctx.lineTo(90, 340);
        ctx.moveTo(155, 130);
        ctx.lineTo(155, 320);
        ctx.lineTo(150, 430);
        ctx.lineTo(150, 550);
        ctx.moveTo(245, 130);
        ctx.lineTo(290, 130);
        ctx.lineTo(315, 170);
        ctx.lineTo(325, 310);
        ctx.lineTo(310, 340);
        ctx.moveTo(245, 130);
        ctx.lineTo(245, 320);
        ctx.lineTo(250, 430);
        ctx.lineTo(250, 550);
        ctx.strokeStyle = "rgba(6,182,212,0.12)";
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    function render() {
        glowPhase += 0.03;
        const glow = (Math.sin(glowPhase) + 1) / 2; // 0-1 pulse

        ctx.clearRect(0, 0, W, H);

        // Background gradient
        const grad = ctx.createRadialGradient(W/2, H/2, 50, W/2, H/2, H/2);
        grad.addColorStop(0, "rgba(6,182,212,0.04)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        drawBody();

        // Draw all muscle regions
        for (const [key, region] of Object.entries(muscleRegions)) {
            drawMuscle(key, region, glow);
        }

        // BMI badge at bottom
        if (scanData.bmi) {
            ctx.save();
            ctx.fillStyle = "rgba(6,182,212,0.15)";
            ctx.strokeStyle = "#06b6d4";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(150, 565, 100, 28, 14);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = "#06b6d4";
            ctx.font = "bold 12px 'Inter', 'Segoe UI', system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`BMI: ${scanData.bmi.toFixed(1)}`, 200, 584);
            ctx.restore();
        }

        requestAnimationFrame(render);
    }

    // Hit test
    function pointInPolygon(x, y, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i][0], yi = polygon[i][1];
            const xj = polygon[j][0], yj = polygon[j][1];
            const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = W / rect.width;
        const scaleY = H / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }

    function findMuscleAt(x, y) {
        for (const [key, region] of Object.entries(muscleRegions)) {
            if (pointInPolygon(x, y, region.path)) return key;
        }
        return null;
    }

    canvas.addEventListener("mousemove", (e) => {
        const { x, y } = getMousePos(e);
        const muscle = findMuscleAt(x, y);
        hoveredMuscle = muscle;
        canvas.style.cursor = muscle ? "pointer" : "default";
    });

    canvas.addEventListener("click", (e) => {
        const { x, y } = getMousePos(e);
        const muscle = findMuscleAt(x, y);

        if (!muscle) {
            selectedMuscle = null;
            if (tooltip) tooltip.classList.add("hidden");
            return;
        }

        selectedMuscle = muscle;
        const region = muscleRegions[muscle];
        const data = getMuscleData(muscle);

        if (tooltip) {
            let html = `<div class="tooltip-title" style="color:${region.color};">${region.label}</div>`;
            html += `<div class="tooltip-group">${data.group.charAt(0).toUpperCase() + data.group.slice(1)} group</div>`;

            if (data.isTarget) {
                html += `<div class="tooltip-badge target">Target Muscle</div>`;
            }

            if (data.measurement) {
                html += `<div class="tooltip-stat">${data.measurement.label}: <strong>${data.measurement.value.toFixed(1)} cm</strong></div>`;
            }

            if (data.symmetry) {
                const ratio = data.symmetry.ratio || data.symmetry;
                const r = typeof ratio === "number" ? ratio : parseFloat(ratio);
                if (!isNaN(r)) {
                    const pct = (r * 100).toFixed(1);
                    const status = r > 0.95 && r < 1.05 ? "Balanced" : r > 0.9 ? "Slight imbalance" : "Imbalanced";
                    const statusColor = r > 0.95 && r < 1.05 ? "#27ae60" : r > 0.9 ? "#e67e22" : "#e74c3c";
                    html += `<div class="tooltip-stat">Symmetry: <strong style="color:${statusColor}">${pct}% — ${status}</strong></div>`;
                }
            }

            if (!data.measurement && !data.symmetry) {
                html += `<div class="tooltip-stat" style="color:var(--text-dim);">No scan data available</div>`;
            }

            tooltip.innerHTML = html;
            tooltip.classList.remove("hidden");

            // Position tooltip near the click
            const rect = canvas.getBoundingClientRect();
            const tooltipX = e.clientX - rect.left + 15;
            const tooltipY = e.clientY - rect.top - 10;
            tooltip.style.left = tooltipX + "px";
            tooltip.style.top = tooltipY + "px";
        }
    });

    canvas.addEventListener("mouseleave", () => {
        hoveredMuscle = null;
    });

    render();
}
