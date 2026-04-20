/* ═══════════════════════════════════════
   FitScan — Dashboard Charts (Plotly) + Body Model
   Light Theme
   ═══════════════════════════════════════ */

const scan = SCAN_DATA;

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

// ── Water Intake (persisted via API) ──
window._waterGlasses = 0;

async function changeWater(delta) {
    window._waterGlasses = Math.max(0, Math.min(8, window._waterGlasses + delta));
    updateWaterUI(window._waterGlasses);
    try {
        await apiPost('/api/water/update', { glasses: window._waterGlasses });
    } catch(e) { /* silent */ }
}

function updateWaterUI(g) {
    document.getElementById('waterGlasses').textContent = g;
    document.getElementById('waterMl').textContent = (g * 250) + ' ml';
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

// Load today's water from API
(async function loadWater() {
    try {
        const resp = await apiGet('/api/water/today');
        window._waterGlasses = resp.glasses || 0;
        updateWaterUI(window._waterGlasses);
    } catch(e) {
        updateWaterUI(0);
    }
})();

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

// ── Workout Streak Days (real data from API) ──
(async function initStreak() {
    const wrap        = document.getElementById('streakDays');
    const countEl     = document.getElementById('streakCount');
    const bestEl      = document.getElementById('streakBest');
    if (!wrap) return;

    const dayLetters = ['M','T','W','T','F','S','S'];
    let streakData   = { current_streak: 0, best_streak: 0, last_7_days: [false,false,false,false,false,false,false] };

    try {
        streakData = await apiGet('/api/progress/streak');
    } catch(e) { /* use defaults */ }

    if (countEl) countEl.textContent = streakData.current_streak || 0;
    if (bestEl)  bestEl.textContent  = streakData.best_streak || 0;

    const done = streakData.last_7_days || [];
    wrap.innerHTML = '';
    done.forEach((worked, i) => {
        const el = document.createElement('div');
        const isToday = i === 6;
        el.className = 'streak-day' + (worked ? (isToday ? ' today' : ' done') : '');
        el.textContent = dayLetters[i];
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

// ── Today's Focus Widget ──
(async function initTodaysFocus() {
    const focusEl = document.getElementById('todaysFocusContainer');
    if (!focusEl) return;

    try {
        const resp = await apiGet('/api/exercise/plan/latest');
        if (resp.error || !resp.weekly_plan) return;

        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
        const todayPlan = resp.weekly_plan.find(d => d.day === todayName);
        if (!todayPlan) return;

        if (todayPlan.is_rest_day) {
            focusEl.innerHTML = `
                <div class="todays-focus-card" style="background:linear-gradient(135deg,#475569,#334155);">
                    <div class="focus-left">
                        <h3>Today's Session</h3>
                        <div class="focus-title">😴 Rest Day</div>
                        <div class="focus-sub">${todayPlan.warmup || 'Light stretching + recovery'}</div>
                    </div>
                </div>`;
            return;
        }

        const exercises = todayPlan.exercises || [];
        const firstThree = exercises.slice(0, 3).map(e => e.name).join(', ');
        const pillsHtml = exercises.slice(0, 3).map(e =>
            `<span class="focus-ex-pill">${e.name}</span>`).join('');

        focusEl.innerHTML = `
            <div class="todays-focus-card">
                <div class="focus-left">
                    <h3>Today's Session — ${todayName}</h3>
                    <div class="focus-title">${todayPlan.focus || 'Workout'}</div>
                    <div class="focus-sub">⏱ ~${todayPlan.estimated_duration_min || 45} min &bull; ${exercises.length} exercises</div>
                    <div class="focus-exercises" style="margin-top:8px;">${pillsHtml}</div>
                </div>
                <a href="/exercise" class="focus-start-btn">Start Workout →</a>
            </div>`;
    } catch(e) { /* silent — no plan yet */ }
})();

// ── Progress Charts — History Tab ──
(async function initProgressCharts() {
    const historyTab = document.getElementById('tab-history');
    if (!historyTab) return;

    try {
        const scans = await apiGet('/api/progress/history');
        if (!scans || scans.length < 1) return;

        // Build chart container in history tab
        const chartHtml = `
        <div class="card progress-chart-section" style="margin-bottom:16px;">
            <h2>📈 Body Type Score Over Time</h2>
            <div id="chartProgressSoma" class="chart-container"></div>
        </div>
        <div class="card progress-chart-section" style="margin-bottom:16px;">
            <h2>⚖️ BMI Trend</h2>
            <div id="chartProgressBMI" class="chart-container"></div>
        </div>
        ${scans.length >= 2 ? `
        <div class="card" style="margin-bottom:16px;">
            <h2>🔍 Scan Comparison</h2>
            <div style="display:flex; gap:12px; align-items:center; margin-bottom:16px; flex-wrap:wrap;">
                <div>
                    <label style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">SCAN A</label>
                    <select id="cmpScanA" style="display:block; margin-top:4px; padding:7px 12px; border:1.5px solid var(--border-light); border-radius:8px; background:var(--bg-input); color:var(--text-primary);">
                        ${scans.map((s,i) => `<option value="${i}">${s.scanned_at ? s.scanned_at.slice(0,10) : 'Scan ' + (i+1)} — ${s.body_type || '?'}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.78rem; color:var(--text-muted); font-weight:600;">SCAN B</label>
                    <select id="cmpScanB" style="display:block; margin-top:4px; padding:7px 12px; border:1.5px solid var(--border-light); border-radius:8px; background:var(--bg-input); color:var(--text-primary);">
                        ${scans.map((s,i) => `<option value="${i}" ${i === scans.length-1 ? '' : (i === 0 ? 'selected' : '')}>${s.scanned_at ? s.scanned_at.slice(0,10) : 'Scan ' + (i+1)} — ${s.body_type || '?'}</option>`).join('')}
                    </select>
                </div>
                <button class="btn btn-sm" onclick="renderComparison()" style="align-self:flex-end;">Compare</button>
            </div>
            <div id="comparisonResult" class="scan-compare-grid"></div>
        </div>` : ''}`;

        // Replace the "history coming soon" content
        historyTab.innerHTML = chartHtml;

        // Render somatotype trend
        const dates  = scans.map(s => s.scanned_at ? s.scanned_at.slice(0,10) : '');
        const endos  = scans.map(s => s.endomorphy  || 0);
        const mesos  = scans.map(s => s.mesomorphy  || 0);
        const ectos  = scans.map(s => s.ectomorphy  || 0);

        Plotly.newPlot('chartProgressSoma', [
            { x: dates, y: endos, name: 'Endomorphy', type: 'scatter', mode: 'lines+markers',
              line: { color: '#ef4444', width: 2 }, marker: { size: 7 } },
            { x: dates, y: mesos, name: 'Mesomorphy', type: 'scatter', mode: 'lines+markers',
              line: { color: '#10b981', width: 2 }, marker: { size: 7 } },
            { x: dates, y: ectos, name: 'Ectomorphy', type: 'scatter', mode: 'lines+markers',
              line: { color: '#3b82f6', width: 2 }, marker: { size: 7 } },
        ], {
            ...PLOTLY_LAYOUT,
            height: 260,
            yaxis: { range: [0, 7], gridcolor: 'rgba(0,0,0,0.05)' },
            xaxis: { fixedrange: true },
            margin: { t: 20, b: 40, l: 40, r: 20 },
        }, PLOTLY_CONFIG);

        // Render BMI trend
        const bmis = scans.map(s => s.bmi || 0);
        Plotly.newPlot('chartProgressBMI', [
            { x: dates, y: bmis, name: 'BMI', type: 'scatter', mode: 'lines+markers+text',
              text: bmis.map(v => v.toFixed(1)),
              textposition: 'top center',
              line: { color: '#06b6d4', width: 2 }, marker: { size: 8, color: '#06b6d4' } },
        ], {
            ...PLOTLY_LAYOUT,
            height: 220,
            shapes: [
                { type: 'rect', x0: dates[0], x1: dates[dates.length-1], y0: 18.5, y1: 24.9,
                  fillcolor: 'rgba(16,185,129,0.08)', line: { width: 0 } },
            ],
            yaxis: { gridcolor: 'rgba(0,0,0,0.05)' },
            xaxis: { fixedrange: true },
            margin: { t: 20, b: 40, l: 40, r: 20 },
        }, PLOTLY_CONFIG);

        // Expose scans for comparison
        window._scanHistory = scans;
        if (scans.length >= 2) {
            // Default: compare first and last
            document.getElementById('cmpScanA').value = 0;
            document.getElementById('cmpScanB').value = scans.length - 1;
            renderComparison();
        }

    } catch(e) { console.error('Progress history load failed:', e); }
})();

function renderComparison() {
    const scans = window._scanHistory || [];
    const aIdx  = parseInt(document.getElementById('cmpScanA')?.value || 0);
    const bIdx  = parseInt(document.getElementById('cmpScanB')?.value || 1);
    const a = scans[aIdx], b = scans[bIdx];
    if (!a || !b) return;

    function delta(valA, valB, decimals = 1) {
        const d = (valB - valA);
        const sign = d > 0 ? '+' : '';
        const color = d > 0 ? 'var(--green)' : d < 0 ? 'var(--red)' : 'var(--text-dim)';
        return `<span style="color:${color}; font-size:0.78rem;">${sign}${d.toFixed(decimals)}</span>`;
    }

    const result = document.getElementById('comparisonResult');
    if (!result) return;
    result.innerHTML = `
        <div class="card" style="padding:20px;">
            <h4 style="margin-bottom:12px; color:var(--text-muted);">${a.scanned_at?.slice(0,10) || 'Scan A'}</h4>
            <div style="font-size:0.88rem;">
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Body Type</span><strong>${a.body_type || '—'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Endomorphy</span><strong>${(a.endomorphy||0).toFixed(1)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Mesomorphy</span><strong>${(a.mesomorphy||0).toFixed(1)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Ectomorphy</span><strong>${(a.ectomorphy||0).toFixed(1)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0;">
                    <span>BMI</span><strong>${(a.bmi||0).toFixed(1)}</strong>
                </div>
            </div>
        </div>
        <div class="card" style="padding:20px;">
            <h4 style="margin-bottom:12px; color:var(--text-muted);">${b.scanned_at?.slice(0,10) || 'Scan B'}</h4>
            <div style="font-size:0.88rem;">
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Body Type</span><strong>${b.body_type || '—'}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Endomorphy</span><strong>${(b.endomorphy||0).toFixed(1)} ${delta(a.endomorphy||0, b.endomorphy||0)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Mesomorphy</span><strong>${(b.mesomorphy||0).toFixed(1)} ${delta(a.mesomorphy||0, b.mesomorphy||0)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-light);">
                    <span>Ectomorphy</span><strong>${(b.ectomorphy||0).toFixed(1)} ${delta(a.ectomorphy||0, b.ectomorphy||0)}</strong>
                </div>
                <div style="display:flex; justify-content:space-between; padding:6px 0;">
                    <span>BMI</span><strong>${(b.bmi||0).toFixed(1)} ${delta(a.bmi||0, b.bmi||0, 2)}</strong>
                </div>
            </div>
        </div>`;
}

// ── Body Type Education Modal ──
(function initBodyTypeEdu() {
    const edu = {
        Endomorph: {
            color: '#ef4444',
            desc: 'Endomorphs tend to have a rounder, softer physique with a naturally higher body fat percentage and slower metabolism.',
            rows: [
                { icon: '💪', text: 'Build muscle easily but also gain fat quickly — diet control is key.' },
                { icon: '🔥', text: 'Respond best to high-rep training with short rest periods to burn more calories.' },
                { icon: '🥗', text: 'Carb intake should be lower and timed around workouts. Avoid simple sugars.' },
                { icon: '🏃', text: 'Cardio and HIIT are important to boost metabolism and burn fat.' },
                { icon: '⏱️', text: 'Consistency matters most — never skip sessions, as metabolism slows quickly.' },
            ],
        },
        Mesomorph: {
            color: '#10b981',
            desc: 'Mesomorphs have a naturally athletic, muscular build with efficient nutrient partitioning and quick adaptation to training.',
            rows: [
                { icon: '💪', text: 'Gain muscle and lose fat efficiently — most responsive to training.' },
                { icon: '🏋️', text: 'Moderate rep ranges (8-12) with progressive overload drives best results.' },
                { icon: '🥗', text: 'Balanced macros work well. Carb-cycle: higher carbs on training days.' },
                { icon: '⚡', text: 'Plateaus can happen — vary training every 4-6 weeks to keep adapting.' },
                { icon: '😴', text: 'Sleep is your biggest recovery tool — aim for 7-9 hours consistently.' },
            ],
        },
        Ectomorph: {
            color: '#3b82f6',
            desc: 'Ectomorphs have a lean, narrow build with a fast metabolism that burns calories quickly, making muscle gain challenging.',
            rows: [
                { icon: '🍽️', text: 'Eating enough is the #1 challenge — caloric surplus is essential every day.' },
                { icon: '🏋️', text: 'Heavy compound lifts (squats, deadlifts, bench) are the most effective exercises.' },
                { icon: '🚫', text: 'Avoid excessive cardio — it burns precious calories needed for muscle growth.' },
                { icon: '🛌', text: 'Sleep 8-9 hours for maximum growth hormone release and recovery.' },
                { icon: '📅', text: 'Never skip meals — even one missed meal can set back your progress.' },
            ],
        },
    };

    const bodyType = (scan.body_type || 'Mesomorph');
    const info = edu[bodyType] || edu['Mesomorph'];

    // Inject modal
    document.body.insertAdjacentHTML('beforeend', `
        <div class="bt-edu-modal" id="btEduModal">
            <div class="bt-edu-content">
                <h2>About ${bodyType}</h2>
                <span class="bt-badge" style="background:${info.color}22; color:${info.color};">${bodyType}</span>
                <p style="font-size:0.88rem; color:var(--text-muted); margin-bottom:16px;">${info.desc}</p>
                ${info.rows.map(r => `
                    <div class="bt-edu-row">
                        <span class="bt-edu-icon">${r.icon}</span>
                        <span class="bt-edu-text">${r.text}</span>
                    </div>`).join('')}
                <button class="bt-edu-close" onclick="document.getElementById('btEduModal').classList.remove('active')">Got it ✓</button>
            </div>
        </div>`);

    // Make the body type badge in the AI stat card clickable
    const badge = document.querySelector('.ai-stat-card .ai-stat-header .name');
    if (badge) {
        badge.style.cursor = 'pointer';
        badge.title = 'Click to learn about your body type';
        badge.onclick = () => document.getElementById('btEduModal').classList.add('active');
    }

    // Also add a learn more button in advice card
    const adviceCard = document.querySelector('.advice-card');
    if (adviceCard) {
        const learnBtn = document.createElement('button');
        learnBtn.textContent = '🎓 Learn About ' + bodyType;
        learnBtn.style.cssText = 'margin-top:12px; width:100%; padding:10px; border-radius:10px; border:1.5px solid var(--border-light); background:var(--bg-input); cursor:pointer; font-weight:600; font-size:0.85rem; color:var(--text-primary);';
        learnBtn.onclick = () => document.getElementById('btEduModal').classList.add('active');
        adviceCard.appendChild(learnBtn);
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
