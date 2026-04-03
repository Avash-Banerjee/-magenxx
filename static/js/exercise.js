/* ═══════════════════════════════════════
   FitScan — Exercise Plan Page + GIFs
   ═══════════════════════════════════════ */

let planData = EXISTING_PLAN;
let planId = EXISTING_PLAN_ID;
let exerciseLog = {};
let currentDay = null;

// GIF cache
const gifCache = new Map();

// ── Open 3D FBX viewer for an exercise ──
function openExercise3D(exerciseName, muscleGroups) {
    if (typeof FBXViewer !== "undefined" && FBXViewer.open) {
        // muscleGroups can be a JSON string or an array
        let muscles = muscleGroups;
        if (typeof muscles === "string") {
            try { muscles = JSON.parse(muscles); } catch (e) { muscles = []; }
        }
        FBXViewer.open(exerciseName, muscles || []);
    }
}

// ── Load existing plan on page load ──
if (planData) {
    renderPlan(planData);
    if (planId) loadExerciseLog();
}

// ── Generate new plan ──
async function generatePlan() {
    const btn = document.getElementById("btnGenerate");
    const loading = document.getElementById("exerciseLoading");
    const content = document.getElementById("planContent");
    const error = document.getElementById("exerciseError");

    btn.disabled = true;
    btn.textContent = "⏳ Generating...";
    loading.classList.add("active");
    content.style.display = "none";
    error.classList.remove("active");

    try {
        const resp = await apiPost("/api/exercise/generate", {});
        if (resp.error) throw new Error(resp.error);

        planData = resp.plan;
        planId = resp.plan_id;
        renderPlan(planData);
    } catch (err) {
        error.textContent = "❌ " + err.message;
        error.classList.add("active");
    } finally {
        btn.disabled = false;
        btn.textContent = "✨ Generate Plan";
        loading.classList.remove("active");
    }
}

// ── Fetch exercise image via backend proxy (avoids CORS, uses multi-source) ──
async function fetchExerciseImage(searchName) {
    if (gifCache.has(searchName)) return gifCache.get(searchName);

    try {
        const resp = await fetch(`/api/exercise/image?q=${encodeURIComponent(searchName)}`);
        const data = await resp.json();
        const url = data.url || null;
        gifCache.set(searchName, url);
        return url;
    } catch (err) {
        console.error("Exercise image fetch error:", err);
        gifCache.set(searchName, null);
        return null;
    }
}

// ── Render the full plan ──
function renderPlan(plan) {
    const content = document.getElementById("planContent");
    content.style.display = "block";

    if (plan.plan_summary) {
        const summary = document.getElementById("planSummary");
        summary.textContent = plan.plan_summary;
        summary.style.display = "block";
    }

    const tabsContainer = document.getElementById("dayTabs");
    tabsContainer.innerHTML = "";
    const days = plan.weekly_plan || [];

    days.forEach((day, i) => {
        const tab = document.createElement("div");
        tab.className = "day-tab" + (day.is_rest_day ? " rest" : "") + (i === 0 ? " active" : "");
        tab.textContent = day.day.substring(0, 3);
        tab.onclick = () => selectDay(i);
        tabsContainer.appendChild(tab);
    });

    if (days.length > 0) selectDay(0);
    updateWeeklyProgress();
}

// ── Select a day tab ──
function selectDay(index) {
    currentDay = index;
    const days = planData.weekly_plan || [];
    const day = days[index];

    document.querySelectorAll(".day-tab").forEach((t, i) => {
        t.classList.toggle("active", i === index);
    });

    const container = document.getElementById("dayContent");

    if (day.is_rest_day) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:40px;">
                <h2 style="margin-bottom:8px;">😴 ${day.day} — Rest Day</h2>
                <p style="color:var(--text-muted);">${day.warmup || "Take it easy. Light stretching or a walk."}</p>
            </div>`;
        return;
    }

    let html = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <div>
                    <h2 style="margin-bottom:4px;">${day.day} — ${day.focus || ''}</h2>
                    <p style="color:var(--text-muted); font-size:0.82rem;">
                        ⏱️ ~${day.estimated_duration_min || 45} min &bull;
                        ${day.exercises ? day.exercises.length : 0} exercises
                    </p>
                </div>
                <div id="dayProgress_${index}" style="font-size:1.2rem; font-weight:700; color:var(--green);">0%</div>
            </div>`;

    if (day.warmup) {
        html += `<div style="background:rgba(39,174,96,0.1); padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:0.85rem; color:var(--green);">
            🏃 Warmup: ${day.warmup}
        </div>`;
    }

    (day.exercises || []).forEach((ex, ei) => {
        const logKey = `${day.day}::${ex.name}`;
        const isCompleted = exerciseLog[logKey] || false;
        const benefitColor = ex.benefit_rating === "high" ? "var(--green)" : ex.benefit_rating === "medium" ? "var(--orange)" : "var(--blue)";
        const benefitLabel = ex.benefit_rating === "high" ? "High Impact" : ex.benefit_rating === "medium" ? "Moderate" : "Low Impact";

        const safeExName = ex.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const safeMuscles = JSON.stringify(ex.muscle_groups || []).replace(/'/g, "\\'").replace(/"/g, '&quot;');

        html += `
        <div class="exercise-card ${isCompleted ? 'completed' : ''}" id="exCard_${index}_${ei}">
            <input type="checkbox" class="exercise-check" ${isCompleted ? 'checked' : ''}
                   onchange="toggleExercise('${day.day}', '${safeExName}', this.checked, ${index}, ${ei})">
            <div class="exercise-gif-container" id="gif_${index}_${ei}"
                 onclick="openExercise3D('${safeExName}', '${safeMuscles}')" title="Click to view 3D animation"
                 style="cursor:pointer; position:relative;">
                <div class="gif-loading-shimmer"></div>
            </div>
            <div class="exercise-info">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div class="exercise-name">${ex.name}</div>
                    ${ex.benefit_rating ? `<span class="benefit-badge" style="background:${benefitColor}22; color:${benefitColor};">${benefitLabel}</span>` : ''}
                </div>
                <div class="exercise-detail">${ex.sets} sets × ${ex.reps} reps &bull; ${ex.rest_seconds}s rest</div>
                <div class="exercise-muscles">
                    ${(ex.muscle_groups || []).map(m => `<span class="muscle-tag">${m}</span>`).join('')}
                </div>
                <button class="exercise-3d-btn" onclick="openExercise3D('${safeExName}', '${safeMuscles}')" title="View 3D Animation">
                    &#x1F4FA; View 3D
                </button>
                ${ex.benefit_reason ? `
                <div class="exercise-benefit">\u{1F4A1} ${ex.benefit_reason}</div>
                ` : ''}
                ${ex.tips ? `
                <div class="exercise-expand visible" onclick="this.nextElementSibling.classList.toggle('open'); this.textContent = this.nextElementSibling.classList.contains('open') ? '\u25B2 Hide tips' : '\u25BC Show tips';">
                    \u25BC Show tips
                </div>
                <div class="exercise-tips">${ex.tips}</div>
                ` : ''}
            </div>
        </div>`;
    });

    if (day.cooldown) {
        html += `<div style="background:rgba(41,128,185,0.1); padding:10px 14px; border-radius:8px; margin-top:14px; font-size:0.85rem; color:var(--blue);">
            🧘 Cooldown: ${day.cooldown}
        </div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
    updateDayProgress(index);

    // Fetch images for each exercise (via backend proxy)
    (day.exercises || []).forEach((ex, ei) => {
        const searchName = ex.search_name || ex.name;
        fetchExerciseImage(searchName).then(url => {
            const gifEl = document.getElementById(`gif_${index}_${ei}`);
            if (!gifEl) return;
            if (url) {
                gifEl.innerHTML = `<img src="${url}" alt="${ex.name}" class="exercise-gif-img" onerror="this.parentElement.innerHTML='<div class=\\'gif-placeholder\\'>🏋️</div>'">`;
            } else {
                gifEl.innerHTML = `<div class="gif-placeholder">🏋️</div>`;
            }
        });
    });
}

// ── Toggle exercise completion ──
async function toggleExercise(dayName, exerciseName, completed, dayIndex, exIndex) {
    const logKey = `${dayName}::${exerciseName}`;
    exerciseLog[logKey] = completed;

    const card = document.getElementById(`exCard_${dayIndex}_${exIndex}`);
    card.classList.toggle("completed", completed);

    updateDayProgress(dayIndex);
    updateWeeklyProgress();

    if (planId) {
        try {
            await apiPost("/api/exercise/log", {
                plan_id: planId,
                day_name: dayName,
                exercise_name: exerciseName,
                completed: completed,
            });
        } catch (err) {
            console.error("Failed to log exercise:", err);
        }
    }
}

// ── Load exercise log from server ──
async function loadExerciseLog() {
    if (!planId) return;
    try {
        const logs = await apiGet(`/api/exercise/log/${planId}`);
        logs.forEach(log => {
            if (log.completed) {
                exerciseLog[`${log.day_name}::${log.exercise_name}`] = true;
            }
        });
        if (currentDay !== null) selectDay(currentDay);
        updateWeeklyProgress();
    } catch (err) {
        console.error("Failed to load exercise log:", err);
    }
}

// ── Progress calculations ──
function updateDayProgress(dayIndex) {
    const day = (planData.weekly_plan || [])[dayIndex];
    if (!day || day.is_rest_day) return;

    const exercises = day.exercises || [];
    const total = exercises.length;
    if (total === 0) return;

    const done = exercises.filter(ex => exerciseLog[`${day.day}::${ex.name}`]).length;
    const pct = Math.round((done / total) * 100);

    const el = document.getElementById(`dayProgress_${dayIndex}`);
    if (el) el.textContent = `${pct}%`;
}

function updateWeeklyProgress() {
    const days = planData ? planData.weekly_plan || [] : [];
    let totalExercises = 0;
    let completedExercises = 0;

    const dayNames = [];
    const dayPcts = [];

    days.forEach(day => {
        if (day.is_rest_day) return;
        const exercises = day.exercises || [];
        const total = exercises.length;
        const done = exercises.filter(ex => exerciseLog[`${day.day}::${ex.name}`]).length;
        totalExercises += total;
        completedExercises += done;
        dayNames.push(day.day.substring(0, 3));
        dayPcts.push(total > 0 ? Math.round((done / total) * 100) : 0);
    });

    const weeklyPct = totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;

    const circle = document.getElementById("weeklyProgress");
    const pctLabel = document.getElementById("weeklyPct");
    if (circle) circle.style.setProperty("--pct", weeklyPct + "%");
    if (pctLabel) pctLabel.textContent = weeklyPct + "%";

    if (dayNames.length > 0) {
        const trace = {
            x: dayNames,
            y: dayPcts,
            type: "bar",
            marker: { color: dayPcts.map(p => p === 100 ? "#10b981" : p > 0 ? "#06b6d4" : "rgba(6,182,212,0.2)") },
            text: dayPcts.map(p => p + "%"),
            textposition: "outside",
            textfont: { color: "#475569", size: 11 },
        };
        const layout = {
            ...PLOTLY_LAYOUT,
            height: 200,
            margin: { t: 20, b: 30, l: 30, r: 10 },
            yaxis: { range: [0, 110], gridcolor: "rgba(0,0,0,0.05)" },
            xaxis: { fixedrange: true },
        };
        Plotly.newPlot("chartWeeklyProgress", [trace], layout, PLOTLY_CONFIG);
    }
}
