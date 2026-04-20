/* ═══════════════════════════════════════
   FitScan — Exercise Plan Page
   Features: rest timer, set logger, swap, workout summary, tweaks modal
   ═══════════════════════════════════════ */

let planData = EXISTING_PLAN;
let planId   = EXISTING_PLAN_ID;
let exerciseLog = {};   // { "Day::ExName": true/false }
let setLogs     = {};   // { "Day::ExName::set#": { weight, reps } }
let currentDay  = null;
const gifCache  = new Map();

// Rest timer state
let restTimerInterval = null;
let restTimerSeconds  = 0;

// ─────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────
if (planData) {
    renderPlan(planData);
    if (planId) {
        loadExerciseLog();
        loadSetLogs();
    }
}

// Inject rest timer overlay + workout summary modal + tweaks modal into DOM
document.addEventListener("DOMContentLoaded", () => {
    document.body.insertAdjacentHTML("beforeend", `
        <!-- Rest Timer Overlay -->
        <div class="rest-timer-overlay" id="restTimerOverlay">
            <div class="rest-timer-modal">
                <div class="rest-timer-label">Rest Period</div>
                <div class="rest-timer-countdown" id="restCountdown">45</div>
                <div class="rest-timer-exercise" id="restExerciseName"></div>
                <div class="rest-timer-actions">
                    <button class="rest-timer-btn skip" onclick="skipRestTimer()">Skip</button>
                    <button class="rest-timer-btn stop" onclick="stopRestTimer()">Stop</button>
                </div>
            </div>
        </div>

        <!-- Workout Summary Modal -->
        <div class="workout-summary-overlay" id="workoutSummaryOverlay">
            <div class="workout-summary-modal">
                <div class="summary-emoji">🏆</div>
                <div class="summary-title">Workout Complete!</div>
                <div class="summary-subtitle" id="summaryDay"></div>
                <div class="summary-stats">
                    <div class="summary-stat">
                        <div class="val" id="summaryExCount">0</div>
                        <div class="lbl">Exercises</div>
                    </div>
                    <div class="summary-stat">
                        <div class="val" id="summaryCal">0</div>
                        <div class="lbl">Est. kcal</div>
                    </div>
                    <div class="summary-stat">
                        <div class="val" id="summaryDur">0</div>
                        <div class="lbl">Minutes</div>
                    </div>
                </div>
                <button class="summary-close-btn" onclick="closeSummary()">Awesome! 💪</button>
            </div>
        </div>

        <!-- Regenerate Tweaks Modal -->
        <div class="tweak-modal-overlay" id="tweakModalOverlay">
            <div class="tweak-modal">
                <h3>🔧 Regenerate with Tweaks</h3>
                <div class="tweak-row">
                    <label>Training Days / Week</label>
                    <input type="number" id="twk_days" min="3" max="6" value="4" style="width:70px;">
                </div>
                <div class="tweak-row">
                    <label>Primary Goal</label>
                    <select id="twk_goal">
                        <option value="">Use Profile Default</option>
                        <option value="muscle_gain">Muscle Gain</option>
                        <option value="fat_loss">Fat Loss</option>
                        <option value="general_fitness">General Fitness</option>
                    </select>
                </div>
                <div class="tweak-row">
                    <label>Experience Level</label>
                    <select id="twk_exp">
                        <option value="">Use Profile Default</option>
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                    </select>
                </div>
                <div class="tweak-modal-actions">
                    <button class="btn btn-sm" style="flex:1; background:var(--bg-input); color:var(--text-muted);"
                            onclick="closeTweakModal()">Cancel</button>
                    <button class="btn" style="flex:2;" onclick="applyTweaks()">✨ Regenerate</button>
                </div>
            </div>
        </div>
    `);
});

// ─────────────────────────────────────────
//  GENERATE PLAN
// ─────────────────────────────────────────
async function generatePlan(tweaks = {}) {
    const btn     = document.getElementById("btnGenerate");
    const loading = document.getElementById("exerciseLoading");
    const content = document.getElementById("planContent");
    const error   = document.getElementById("exerciseError");

    btn.disabled = true; btn.textContent = "⏳ Generating...";
    loading.classList.add("active");
    content.style.display = "none";
    error.classList.remove("active");

    try {
        const resp = await apiPost("/api/exercise/generate", tweaks);
        if (resp.error) throw new Error(resp.error);
        planData = resp.plan;
        planId   = resp.plan_id;
        exerciseLog = {};
        setLogs = {};
        renderPlan(planData);
    } catch (err) {
        error.textContent = "❌ " + err.message;
        error.classList.add("active");
    } finally {
        btn.disabled = false; btn.textContent = "✨ Generate Plan";
        loading.classList.remove("active");
    }
}

function openTweakModal() {
    document.getElementById("tweakModalOverlay").classList.add("active");
}
function closeTweakModal() {
    document.getElementById("tweakModalOverlay").classList.remove("active");
}
async function applyTweaks() {
    closeTweakModal();
    const tweaks = {};
    const days = document.getElementById("twk_days").value;
    const goal = document.getElementById("twk_goal").value;
    const exp  = document.getElementById("twk_exp").value;
    if (days) tweaks.training_days_override = parseInt(days);
    if (goal) tweaks.goal_override = goal;
    if (exp)  tweaks.experience_override = exp;
    await generatePlan(tweaks);
}

// ─────────────────────────────────────────
//  RENDER PLAN
// ─────────────────────────────────────────
function renderPlan(plan) {
    const content = document.getElementById("planContent");
    content.style.display = "block";

    if (plan.plan_summary) {
        const s = document.getElementById("planSummary");
        s.textContent = plan.plan_summary;
        s.style.display = "block";
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

    // Show PDF export button once plan is rendered
    const pdfBtn = document.getElementById("btnPdfExport");
    if (pdfBtn) pdfBtn.style.display = "inline-flex";
}

// ─────────────────────────────────────────
//  SELECT DAY
// ─────────────────────────────────────────
function selectDay(index) {
    currentDay = index;
    const days = planData.weekly_plan || [];
    const day  = days[index];

    document.querySelectorAll(".day-tab").forEach((t, i) =>
        t.classList.toggle("active", i === index));

    const container = document.getElementById("dayContent");

    if (day.is_rest_day) {
        container.innerHTML = `
            <div class="card" style="text-align:center; padding:40px;">
                <h2 style="margin-bottom:8px;">😴 ${day.day} — Rest Day</h2>
                <p style="color:var(--text-muted);">${day.warmup || "Take it easy. Light stretching or a walk."}</p>
            </div>`;
        return;
    }

    // Determine split category for swap
    const focusLower = (day.focus || "").toLowerCase();
    const splitCat = focusLower.includes("push") ? "push"
                   : focusLower.includes("pull") ? "pull"
                   : focusLower.includes("leg")  ? "legs"
                   : "full_body";

    let html = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; flex-wrap:wrap; gap:10px;">
                <div>
                    <h2 style="margin-bottom:4px;">${day.day} — ${day.focus || ''}</h2>
                    <p style="color:var(--text-muted); font-size:0.82rem;">
                        ⏱️ ~${day.estimated_duration_min || 45} min &bull;
                        ${day.exercises ? day.exercises.length : 0} exercises
                    </p>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div id="dayProgress_${index}" style="font-size:1.1rem; font-weight:700; color:var(--green);">0%</div>
                </div>
            </div>`;

    if (day.warmup) {
        html += `<div style="background:rgba(39,174,96,0.1); padding:10px 14px; border-radius:8px; margin-bottom:14px; font-size:0.85rem; color:var(--green);">
            🏃 Warmup: ${day.warmup}
        </div>`;
    }

    (day.exercises || []).forEach((ex, ei) => {
        const logKey   = `${day.day}::${ex.name}`;
        const isCompleted = exerciseLog[logKey] || false;
        const bColor = ex.benefit_rating === "high" ? "var(--green)"
                     : ex.benefit_rating === "medium" ? "var(--orange)"
                     : "var(--blue)";
        const bLabel = ex.benefit_rating === "high" ? "High Impact"
                     : ex.benefit_rating === "medium" ? "Moderate" : "Low Impact";

        const safeExName = ex.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        // Double-quotes must be &quot; inside onclick="..." attributes so the HTML
        // parser doesn't prematurely close the attribute. The browser auto-decodes
        // &quot; → " before executing JS, so JSON.parse inside openExercise3D works fine.
        const safeMuscles = JSON.stringify(ex.muscle_groups || []).replace(/'/g, "\\'").replace(/"/g, '&quot;');

        // Build set rows for logger
        const nSets = ex.sets || 3;
        let setRows = "";
        for (let s = 1; s <= nSets; s++) {
            const setKey = `${day.day}::${ex.name}::${s}`;
            const saved  = setLogs[setKey] || {};
            setRows += `
            <div class="set-row" id="setRow_${index}_${ei}_${s}">
                <span class="set-label">Set ${s}</span>
                <input type="number" id="weight_${index}_${ei}_${s}" placeholder="kg"
                       value="${saved.weight_kg || ''}" min="0" step="0.5"
                       onchange="saveSet(${index}, ${ei}, ${s}, '${day.day}', '${safeExName}')">
                <span class="set-unit">kg</span>
                <input type="number" id="reps_${index}_${ei}_${s}" placeholder="reps"
                       value="${saved.reps_done || ''}" min="0"
                       onchange="saveSet(${index}, ${ei}, ${s}, '${day.day}', '${safeExName}')">
                <span class="set-unit">reps</span>
                <span class="set-saved" id="setSaved_${index}_${ei}_${s}">✓ saved</span>
            </div>`;
        }

        html += `
        <div class="exercise-card ${isCompleted ? 'completed' : ''}" id="exCard_${index}_${ei}">
            <input type="checkbox" class="exercise-check" ${isCompleted ? 'checked' : ''}
                   onchange="toggleExercise('${day.day}', '${safeExName}', this.checked, ${index}, ${ei}, ${ex.rest_seconds || 60})">
            <div class="exercise-gif-container" id="gif_${index}_${ei}"
                 onclick="openExercise3D('${safeExName}', '${safeMuscles}')" title="Click to view 3D animation"
                 style="cursor:pointer; position:relative;">
                <div class="gif-loading-shimmer"></div>
            </div>
            <div class="exercise-info">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div class="exercise-name">${ex.name}</div>
                    ${ex.benefit_rating ? `<span class="benefit-badge" style="background:${bColor}22; color:${bColor};">${bLabel}</span>` : ''}
                    <button class="swap-btn" onclick="swapExercise(${index}, ${ei}, '${day.day}', '${safeExName}', '${splitCat}')" title="Swap this exercise">
                        🔄 Swap
                    </button>
                </div>
                <div class="exercise-detail">${ex.sets} sets × ${ex.reps} reps &bull; ${ex.rest_seconds}s rest</div>
                <div class="exercise-muscles">
                    ${(ex.muscle_groups || []).map(m => `<span class="muscle-tag">${m}</span>`).join('')}
                </div>
                <button class="exercise-3d-btn" onclick="openExercise3D('${safeExName}', '${safeMuscles}')">
                    &#x1F4FA; View 3D
                </button>
                ${ex.benefit_reason ? `<div class="exercise-benefit">💡 ${ex.benefit_reason}</div>` : ''}
                ${ex.tips ? `
                <div class="exercise-expand visible" onclick="this.nextElementSibling.classList.toggle('open'); this.textContent = this.nextElementSibling.classList.contains('open') ? '▲ Hide tips' : '▼ Show tips';">
                    ▼ Show tips
                </div>
                <div class="exercise-tips">${ex.tips}</div>` : ''}

                <!-- Set Logger -->
                <div class="set-logger-toggle" onclick="toggleSetLogger(${index}, ${ei})">
                    📊 Log Weight & Reps
                </div>
                <div class="set-logger" id="setLogger_${index}_${ei}">
                    <div class="set-logger-title">Set Logger</div>
                    <div class="set-logger-rows">${setRows}</div>
                </div>
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

    // Load exercise images
    (day.exercises || []).forEach((ex, ei) => {
        const searchName = ex.search_name || ex.name;
        fetchExerciseImage(searchName).then(url => {
            const gifEl = document.getElementById(`gif_${index}_${ei}`);
            if (!gifEl) return;
            gifEl.innerHTML = url
                ? `<img src="${url}" alt="${ex.name}" class="exercise-gif-img" onerror="this.parentElement.innerHTML='<div class=\\'gif-placeholder\\'>🏋️</div>'">`
                : `<div class="gif-placeholder">🏋️</div>`;
        });
    });
}

// ─────────────────────────────────────────
//  SET LOGGER
// ─────────────────────────────────────────
function toggleSetLogger(dayIdx, exIdx) {
    const logger = document.getElementById(`setLogger_${dayIdx}_${exIdx}`);
    if (logger) logger.classList.toggle("open");
}

async function saveSet(dayIdx, exIdx, setNum, dayName, exerciseName) {
    if (!planId) return;
    const w = parseFloat(document.getElementById(`weight_${dayIdx}_${exIdx}_${setNum}`)?.value) || null;
    const r = parseInt(document.getElementById(`reps_${dayIdx}_${exIdx}_${setNum}`)?.value) || null;
    const setKey = `${dayName}::${exerciseName}::${setNum}`;
    setLogs[setKey] = { weight_kg: w, reps_done: r };

    try {
        await apiPost("/api/exercise/log-set", {
            plan_id: planId,
            day_name: dayName,
            exercise_name: exerciseName,
            set_number: setNum,
            weight_kg: w,
            reps_done: r,
        });
        const savedEl = document.getElementById(`setSaved_${dayIdx}_${exIdx}_${setNum}`);
        if (savedEl) {
            savedEl.style.display = "inline";
            setTimeout(() => savedEl.style.display = "none", 2000);
        }
    } catch (e) { console.error("Set save failed:", e); }
}

async function loadSetLogs() {
    if (!planId) return;
    try {
        const logs = await apiGet(`/api/exercise/set-logs/${planId}`);
        logs.forEach(log => {
            const key = `${log.day_name}::${log.exercise_name}::${log.set_number}`;
            setLogs[key] = { weight_kg: log.weight_kg, reps_done: log.reps_done };
        });
        // Re-render current day to populate inputs
        if (currentDay !== null) selectDay(currentDay);
    } catch (e) { console.error("Set log load failed:", e); }
}

// ─────────────────────────────────────────
//  SWAP EXERCISE
// ─────────────────────────────────────────
async function swapExercise(dayIdx, exIdx, dayName, exerciseName, splitCat) {
    const btn = document.querySelector(`#exCard_${dayIdx}_${exIdx} .swap-btn`);
    if (btn) { btn.disabled = true; btn.textContent = "⏳"; }

    try {
        const resp = await apiGet(
            `/api/exercise/swap?day_name=${encodeURIComponent(dayName)}&exercise_name=${encodeURIComponent(exerciseName)}&split_cat=${splitCat}`
        );
        if (resp.error) throw new Error(resp.error);

        // Patch plan data
        const day = planData.weekly_plan[dayIdx];
        const exercises = day.exercises || [];
        if (exercises[exIdx]) {
            exercises[exIdx] = {
                ...exercises[exIdx],
                name: resp.name,
                search_name: resp.search_name,
                sets: resp.sets,
                reps: resp.reps,
                rest_seconds: resp.rest_seconds,
                muscle_groups: resp.muscle_groups,
                benefit_rating: resp.benefit_rating,
                benefit_reason: resp.benefit_reason,
                tips: resp.tips,
            };
        }

        // Re-render the day
        selectDay(dayIdx);
    } catch (err) {
        alert("Swap failed: " + err.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "🔄 Swap"; }
    }
}

// ─────────────────────────────────────────
//  REST TIMER
// ─────────────────────────────────────────
function startRestTimer(seconds, exerciseName) {
    stopRestTimer();
    restTimerSeconds = seconds;
    document.getElementById("restCountdown").textContent = restTimerSeconds;
    document.getElementById("restExerciseName").textContent = `After: ${exerciseName}`;
    document.getElementById("restTimerOverlay").classList.add("active");

    restTimerInterval = setInterval(() => {
        restTimerSeconds--;
        document.getElementById("restCountdown").textContent = restTimerSeconds;
        if (restTimerSeconds <= 0) {
            clearInterval(restTimerInterval);
            document.getElementById("restTimerOverlay").classList.remove("active");
            // Play a beep
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const osc = ctx.createOscillator();
                osc.connect(ctx.destination);
                osc.frequency.value = 880;
                osc.start();
                setTimeout(() => { osc.stop(); ctx.close(); }, 400);
            } catch(e) {}
        }
    }, 1000);
}

function skipRestTimer() {
    clearInterval(restTimerInterval);
    document.getElementById("restTimerOverlay").classList.remove("active");
}

function stopRestTimer() {
    clearInterval(restTimerInterval);
    document.getElementById("restTimerOverlay")?.classList.remove("active");
}

// ─────────────────────────────────────────
//  WORKOUT SUMMARY
// ─────────────────────────────────────────
function showWorkoutSummary(dayIndex) {
    const day = (planData.weekly_plan || [])[dayIndex];
    if (!day || day.is_rest_day) return;

    const exercises = day.exercises || [];
    const done = exercises.filter(ex => exerciseLog[`${day.day}::${ex.name}`]).length;
    const totalSets = exercises.reduce((s, ex) => s + (ex.sets || 0), 0);
    const estCal = Math.round(totalSets * 8); // rough estimate
    const estDur = day.estimated_duration_min || Math.round(exercises.length * 4);

    document.getElementById("summaryDay").textContent = `${day.day} — ${day.focus || "Workout"}`;
    document.getElementById("summaryExCount").textContent = done;
    document.getElementById("summaryCal").textContent = estCal;
    document.getElementById("summaryDur").textContent = estDur;
    document.getElementById("workoutSummaryOverlay").classList.add("active");
}

function closeSummary() {
    document.getElementById("workoutSummaryOverlay").classList.remove("active");
}

// ─────────────────────────────────────────
//  TOGGLE EXERCISE (enhanced)
// ─────────────────────────────────────────
async function toggleExercise(dayName, exerciseName, completed, dayIndex, exIndex, restSecs) {
    const logKey = `${dayName}::${exerciseName}`;
    exerciseLog[logKey] = completed;

    const card = document.getElementById(`exCard_${dayIndex}_${exIndex}`);
    card.classList.toggle("completed", completed);

    updateDayProgress(dayIndex);
    updateWeeklyProgress();

    // Start rest timer when marking complete
    if (completed) {
        startRestTimer(restSecs || 60, exerciseName);
    }

    if (planId) {
        try {
            await apiPost("/api/exercise/log", {
                plan_id: planId,
                day_name: dayName,
                exercise_name: exerciseName,
                completed: completed,
            });
        } catch (err) { console.error("Log failed:", err); }
    }

    // Check if all exercises in the day are done
    const day = (planData.weekly_plan || [])[dayIndex];
    if (day && !day.is_rest_day && completed) {
        const exercises = day.exercises || [];
        const allDone = exercises.every(ex => exerciseLog[`${day.day}::${ex.name}`]);
        if (allDone) {
            stopRestTimer(); // stop timer if still running
            setTimeout(() => showWorkoutSummary(dayIndex), 500);
        }
    }
}

// ─────────────────────────────────────────
//  LOAD EXERCISE LOG
// ─────────────────────────────────────────
async function loadExerciseLog() {
    if (!planId) return;
    try {
        const logs = await apiGet(`/api/exercise/log/${planId}`);
        logs.forEach(log => {
            if (log.completed) exerciseLog[`${log.day_name}::${log.exercise_name}`] = true;
        });
        if (currentDay !== null) selectDay(currentDay);
        updateWeeklyProgress();
    } catch (err) { console.error("Exercise log load failed:", err); }
}

// ─────────────────────────────────────────
//  IMAGE FETCH
// ─────────────────────────────────────────
async function fetchExerciseImage(searchName) {
    if (gifCache.has(searchName)) return gifCache.get(searchName);
    try {
        const resp = await fetch(`/api/exercise/image?q=${encodeURIComponent(searchName)}`);
        const data = await resp.json();
        const url = data.url || null;
        gifCache.set(searchName, url);
        return url;
    } catch (err) {
        gifCache.set(searchName, null);
        return null;
    }
}

// ─────────────────────────────────────────
//  3D VIEWER
// ─────────────────────────────────────────
function openExercise3D(exerciseName, muscleGroups) {
    if (typeof FBXViewer !== "undefined" && FBXViewer.open) {
        let muscles = muscleGroups;
        if (typeof muscles === "string") {
            try { muscles = JSON.parse(muscles); } catch (e) { muscles = []; }
        }
        FBXViewer.open(exerciseName, muscles || []);
    }
}

// ─────────────────────────────────────────
//  PROGRESS
// ─────────────────────────────────────────
function updateDayProgress(dayIndex) {
    const day = (planData.weekly_plan || [])[dayIndex];
    if (!day || day.is_rest_day) return;

    const exercises = day.exercises || [];
    const total = exercises.length;
    if (total === 0) return;

    const done = exercises.filter(ex => exerciseLog[`${day.day}::${ex.name}`]).length;
    const pct  = Math.round((done / total) * 100);
    const el   = document.getElementById(`dayProgress_${dayIndex}`);
    if (el) el.textContent = `${pct}%`;
}

function updateWeeklyProgress() {
    const days = planData ? planData.weekly_plan || [] : [];
    let totalExercises = 0, completedExercises = 0;
    const dayNames = [], dayPcts = [];

    days.forEach(day => {
        if (day.is_rest_day) return;
        const exercises = day.exercises || [];
        const total = exercises.length;
        const done  = exercises.filter(ex => exerciseLog[`${day.day}::${ex.name}`]).length;
        totalExercises += total;
        completedExercises += done;
        dayNames.push(day.day.substring(0, 3));
        dayPcts.push(total > 0 ? Math.round((done / total) * 100) : 0);
    });

    const weeklyPct = totalExercises > 0 ? Math.round((completedExercises / totalExercises) * 100) : 0;
    const circle  = document.getElementById("weeklyProgress");
    const pctLabel = document.getElementById("weeklyPct");
    if (circle)   circle.style.setProperty("--pct", weeklyPct + "%");
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

// ─────────────────────────────────────────
//  MUSCLE FILTER (from ?muscle= URL param)
// ─────────────────────────────────────────
const _muscleKeywords = {
    chest:     ['chest', 'pec'],
    shoulders: ['shoulder', 'delt'],
    arms:      ['bicep', 'tricep', 'arm', 'forearm'],
    core:      ['core', 'abs', 'abdominal', 'oblique'],
    legs:      ['quad', 'hamstring', 'glute', 'leg', 'hip'],
    calves:    ['calf', 'calves', 'gastrocnemius'],
    back:      ['back', 'lat', 'trap', 'rhomboid'],
};

function applyMuscleFilter() {
    const f = window._muscleFilter;
    if (!f || !planData) return;
    const days = planData.weekly_plan || [];
    const day = days[currentDay];
    if (!day) return;
    (day.exercises || []).forEach((ex, ei) => {
        const card = document.getElementById(`exCard_${currentDay}_${ei}`);
        if (!card) return;
        card.classList.remove('muscle-match', 'muscle-dim');
        const groups = (ex.muscle_groups || []).map(g => g.toLowerCase());
        const matches = f.keywords.some(kw => groups.some(g => g.includes(kw)));
        card.classList.add(matches ? 'muscle-match' : 'muscle-dim');
    });
}

(function initMuscleFilter() {
    const params = new URLSearchParams(window.location.search);
    const muscle = params.get('muscle');
    if (!muscle || !planData) return;

    const keywords = _muscleKeywords[muscle] || [muscle.toLowerCase()];
    window._muscleFilter = { muscle, keywords };

    // Patch selectDay to re-apply highlighting after each render
    const _origSelectDay = window.selectDay;
    window.selectDay = function(index) {
        _origSelectDay(index);
        applyMuscleFilter();
    };

    // Show filter banner and apply initial highlight
    const planContent = document.getElementById('planContent');
    if (planContent) {
        const banner = document.createElement('div');
        banner.className = 'muscle-filter-banner';
        const label = muscle.charAt(0).toUpperCase() + muscle.slice(1);
        banner.innerHTML = `<span>Showing exercises for: <strong>${label}</strong></span><a href="/exercise" class="muscle-filter-clear">✕ Clear</a>`;
        planContent.prepend(banner);
    }
    applyMuscleFilter();
})();
