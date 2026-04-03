/* ═══════════════════════════════════════
   FitScan — SVG Muscle Overlay Interactions
   Precise body-part-shaped clickable zones
   ═══════════════════════════════════════ */

(function () {
    const scan = window.SCAN_DATA || {};
    const targetMuscles = window.TARGET_MUSCLES || [];
    const poseData = scan.pose_data || {};
    const symScores = poseData.symmetry_scores || {};
    const hmrData = scan.hmr_data || {};
    const meas = hmrData.measurements_cm || {};

    const endo = scan.endomorphy || 0;
    const meso = scan.mesomorphy || 0;
    const ecto = scan.ectomorphy || 0;

    /* ── Muscle data by group ── */
    function getScore(group) {
        switch (group) {
            case "chest":      return Math.min(99, Math.round(meso * 12 + 15));
            case "shoulders":  return Math.min(99, Math.round(meso * 11 + 18));
            case "arms":       return Math.min(99, Math.round(meso * 10 + 20));
            case "core":       return Math.min(99, Math.round((7 - endo) * 10 + 25));
            case "legs":       return Math.min(99, Math.round(meso * 11 + 14));
            case "calves":     return Math.min(99, Math.round(ecto * 8 + meso * 6 + 15));
            case "glutes":     return Math.min(99, Math.round(meso * 10 + 16));
            case "head":       return Math.min(99, Math.round((endo + meso + ecto) / 3 * 10 + 10));
            default:           return 50;
        }
    }

    function getMeasurement(group) {
        if (group === "chest" && meas.chest)         return { label: "Chest",         value: meas.chest };
        if (group === "shoulders" && meas.shoulder)   return { label: "Shoulder Width", value: meas.shoulder };
        if (group === "core" && meas.waist)           return { label: "Waist",          value: meas.waist };
        if (group === "arms" && meas.upper_arm)       return { label: "Upper Arm",      value: meas.upper_arm };
        if (group === "legs" && meas.thigh)           return { label: "Thigh",          value: meas.thigh };
        if (group === "calves" && meas.calf)          return { label: "Calf",           value: meas.calf };
        if (group === "glutes" && meas.hip)           return { label: "Hip",            value: meas.hip };
        return null;
    }

    function getSymmetry(group) {
        for (const [key, val] of Object.entries(symScores)) {
            const k = key.toLowerCase();
            if (k.includes(group) ||
                (group === "arms"  && (k.includes("arm") || k.includes("bicep"))) ||
                (group === "legs"  && (k.includes("leg") || k.includes("thigh"))) ||
                (group === "chest" && k.includes("shoulder")) ||
                (group === "core"  && k.includes("torso")))
                return val;
        }
        return null;
    }

    /* ── Init SVG zones ── */
    const zones = document.querySelectorAll(".muscle-zone");
    const tooltip = document.getElementById("bodyTooltip");
    const container = document.getElementById("avatarContainer");

    if (!zones.length || !tooltip || !container) return;

    let activeZone = null;

    // Set score badges
    const badgeChest = document.getElementById("badgeChest");
    const badgeCore  = document.getElementById("badgeCore");
    const badgeLegs  = document.getElementById("badgeLegs");
    if (badgeChest) badgeChest.textContent = getScore("chest");
    if (badgeCore)  badgeCore.textContent  = getScore("core");
    if (badgeLegs)  badgeLegs.textContent  = getScore("legs");

    // Mark target muscles
    zones.forEach(zone => {
        const group = zone.dataset.muscle;
        if (targetMuscles.includes(group)) {
            zone.classList.add("target");
        }
    });

    zones.forEach(zone => {
        const group = zone.dataset.muscle;
        const label = zone.dataset.label;
        const score = getScore(group);

        /* Hover */
        zone.addEventListener("mouseenter", () => {
            if (zone !== activeZone) zone.classList.add("hovered");
        });
        zone.addEventListener("mouseleave", () => {
            zone.classList.remove("hovered");
        });

        /* Click */
        zone.addEventListener("click", (e) => {
            e.stopPropagation();

            // Toggle off if already active
            if (activeZone === zone) {
                zone.classList.remove("active");
                tooltip.classList.remove("visible");
                activeZone = null;
                return;
            }

            // Deactivate previous
            if (activeZone) activeZone.classList.remove("active");
            activeZone = zone;
            zone.classList.add("active");

            // ── Build tooltip ──
            const measurement = getMeasurement(group);
            const symmetry = getSymmetry(group);

            let html = `<div class="bt-title">${label}</div>`;
            html += `<div class="bt-group">${group.charAt(0).toUpperCase() + group.slice(1)} group</div>`;
            html += `<div class="bt-score-row">
                        <span class="bt-score-label">Muscle Score</span>
                        <span class="bt-score-value">${score}<small>/100</small></span>
                      </div>`;

            if (targetMuscles.includes(group)) {
                html += `<div class="bt-badge target">\u{1F3AF} Target Muscle</div>`;
            }

            if (measurement) {
                html += `<div class="bt-stat">
                    <span class="bt-stat-label">${measurement.label}</span>
                    <span class="bt-stat-value">${measurement.value.toFixed(1)} cm</span>
                </div>`;
            }

            if (symmetry) {
                const ratio = symmetry.ratio || symmetry;
                const r = typeof ratio === "number" ? ratio : parseFloat(ratio);
                if (!isNaN(r)) {
                    const pct = (r * 100).toFixed(1);
                    const status = r > 0.95 && r < 1.05 ? "Balanced" : r > 0.9 ? "Slight imbalance" : "Imbalanced";
                    const cls = r > 0.95 && r < 1.05 ? "good" : r > 0.9 ? "warn" : "bad";
                    html += `<div class="bt-stat">
                        <span class="bt-stat-label">Symmetry</span>
                        <span class="bt-stat-value ${cls}">${pct}% \u2014 ${status}</span>
                    </div>`;
                }
            }

            if (!measurement && !symmetry && group !== "head") {
                html += `<div class="bt-no-data">Complete a detailed scan to unlock measurements</div>`;
            }

            // Somatotype context
            html += `<div class="bt-somatotype">
                <span>Endo <b>${endo.toFixed(1)}</b></span>
                <span>Meso <b>${meso.toFixed(1)}</b></span>
                <span>Ecto <b>${ecto.toFixed(1)}</b></span>
            </div>`;

            // Progress bar
            html += `<div class="bt-progress"><div class="bt-progress-bar" style="width:${score}%"></div></div>`;

            tooltip.innerHTML = html;
            tooltip.classList.add("visible");

            // Position tooltip relative to container
            const cRect = container.getBoundingClientRect();
            const bbox = zone.getBBox();
            const svg = zone.closest("svg");
            const pt = svg.createSVGPoint();
            pt.x = bbox.x + bbox.width / 2;
            pt.y = bbox.y;
            const screenPt = pt.matrixTransform(svg.getScreenCTM());

            const relX = screenPt.x - cRect.left;
            const relY = screenPt.y - cRect.top;

            // Show on opposite side of where the zone is
            if (relX > cRect.width / 2) {
                tooltip.style.left = "16px";
                tooltip.style.right = "auto";
            } else {
                tooltip.style.right = "16px";
                tooltip.style.left = "auto";
            }
            tooltip.style.top = Math.max(8, relY - 30) + "px";
        });
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".muscle-zone") && !e.target.closest(".body-tooltip")) {
            if (activeZone) {
                activeZone.classList.remove("active");
                activeZone = null;
                tooltip.classList.remove("visible");
            }
        }
    });
})();
