/* ═══════════════════════════════════════
   FitScan — Diet Plan Page (Enhanced)
   Features: meal check-off, live macro ring, grocery quantities, PDF export
   ═══════════════════════════════════════ */

let dietPlan   = EXISTING_DIET_PLAN;
let dietPlanId = EXISTING_DIET_PLAN_ID;
let currentDietDay = null;
let indianize  = !!EXISTING_INDIANIZED;
let mealLog    = {};  // { "Day::MealName": true/false }

// Meal macro accumulator for today's live ring
let todayConsumed = { protein: 0, carbs: 0, fats: 0, calories: 0 };

const mealStyles = {
    breakfast: { color: "#e67e22", icon: "🌅", border: "#e67e22" },
    lunch:     { color: "#667eea", icon: "🌞", border: "#667eea" },
    dinner:    { color: "#764ba2", icon: "🌙", border: "#764ba2" },
    snack:     { color: "#27ae60", icon: "🍎", border: "#27ae60" },
};

function getMealStyle(mealName) {
    const key = (mealName || "").toLowerCase();
    for (const [type, style] of Object.entries(mealStyles)) {
        if (key.includes(type)) return style;
    }
    return { color: "#667eea", icon: "🍽️", border: "#667eea" };
}

// ── Init ──
if (indianize) {
    const toggle = document.getElementById("toggleIndianize");
    if (toggle) toggle.checked = true;
}
if (dietPlan) {
    renderDietPlan(dietPlan);
    if (dietPlanId) loadMealLogs();
}

// ── Generate / Regenerate ──
async function generateDietPlan() {
    const btn     = document.getElementById("btnGenerate");
    const loading = document.getElementById("dietLoading");
    const content = document.getElementById("dietPlanContent");
    const error   = document.getElementById("dietError");

    btn.disabled = true; btn.textContent = "⏳ Generating...";
    loading.classList.add("active");
    content.style.display = "none";
    error.classList.remove("active");

    try {
        const resp = await apiPost("/api/diet/generate", { indianize });
        if (resp.error) throw new Error(resp.error);
        dietPlan   = resp.plan;
        dietPlanId = resp.plan_id;
        mealLog    = {};
        renderDietPlan(dietPlan);
    } catch (err) {
        error.textContent = "❌ " + err.message;
        error.classList.add("active");
    } finally {
        btn.disabled = false; btn.textContent = "✨ Generate Plan";
        loading.classList.remove("active");
    }
}

function handleIndianizeToggle(checked) {
    indianize = checked;
    if (dietPlan) generateDietPlan();
}

// ── Render full plan ──
function renderDietPlan(plan) {
    const content = document.getElementById("dietPlanContent");
    content.style.display = "block";

    if (plan.plan_summary) {
        const s = document.getElementById("dietSummary");
        s.textContent = plan.plan_summary;
        s.style.display = "block";
    }

    renderMacroOverview(plan);
    renderDailyCalorieChart(plan);
    renderMacroProgressRing(plan);

    const tabsContainer = document.getElementById("dietDayTabs");
    tabsContainer.innerHTML = "";
    (plan.days || []).forEach((day, i) => {
        const tab = document.createElement("div");
        tab.className = "day-tab" + (i === 0 ? " active" : "");
        tab.textContent = day.day.substring(0, 3);
        tab.onclick = () => selectDietDay(i);
        tabsContainer.appendChild(tab);
    });

    if ((plan.days || []).length > 0) selectDietDay(0);

    renderGroceryList(plan.grocery_list, plan);

    if (plan.weekly_notes) {
        document.getElementById("weeklyNotes").textContent = plan.weekly_notes;
        document.getElementById("weeklyNotesSection").style.display = "block";
    }

    // Show PDF button
    const pdfBtn = document.getElementById("btnDietPdf");
    if (pdfBtn) pdfBtn.style.display = "inline-flex";
}

// ── Macro Overview (target) ──
function renderMacroOverview(plan) {
    const macro = plan.macro_split || {};
    const cal   = plan.daily_calories || 0;

    document.getElementById("statCalories").textContent = cal.toLocaleString();
    document.getElementById("statProtein").textContent  = macro.protein_g || "—";
    document.getElementById("statCarbs").textContent    = macro.carbs_g || "—";
    document.getElementById("statFats").textContent     = macro.fats_g || "—";

    if (plan.protein_per_kg || macro.protein_per_kg) {
        const pkg = plan.protein_per_kg || macro.protein_per_kg;
        document.getElementById("proteinPerKg").textContent = `${pkg}g protein per kg body weight`;
    }

    const trace = {
        values: [macro.protein_g || 0, macro.carbs_g || 0, macro.fats_g || 0],
        labels: ["Protein", "Carbs", "Fats"],
        type: "pie", hole: 0.55,
        marker: { colors: ["#e74c3c", "#667eea", "#e67e22"] },
        textinfo: "label+percent",
        textfont: { color: "#475569", size: 11 },
        hovertemplate: "%{label}: %{value}g (%{percent})<extra></extra>",
    };
    const layout = {
        ...PLOTLY_LAYOUT,
        height: 220, width: 220,
        margin: { t: 10, b: 10, l: 10, r: 10 },
        showlegend: false,
        annotations: [{
            text: `${cal}<br><span style="font-size:10px">kcal</span>`,
            showarrow: false,
            font: { size: 16, color: "#475569" },
        }],
    };
    Plotly.newPlot("chartMacroDonut", [trace], layout, PLOTLY_CONFIG);
}

// ── Live Macro Progress Ring ──
function renderMacroProgressRing(plan) {
    // Inject container if not already present
    let ringCard = document.getElementById("macroProgressCard");
    if (!ringCard) {
        const dietPlanContent = document.getElementById("dietPlanContent");
        const firstCard = dietPlanContent.querySelector(".card");
        if (firstCard) {
            const div = document.createElement("div");
            div.className = "macro-progress-card";
            div.id = "macroProgressCard";
            div.innerHTML = `
                <h3>Today's Intake vs Target</h3>
                <div class="macro-progress-bars" id="macroProgressBars">
                    <div class="macro-prog-row">
                        <span class="mp-label" style="color:#e74c3c;">Protein</span>
                        <div class="mp-track"><div class="mp-fill" id="mpProtein" style="background:#e74c3c; width:0%"></div></div>
                        <span class="mp-val" id="mpProteinVal">0 / 0g</span>
                    </div>
                    <div class="macro-prog-row">
                        <span class="mp-label" style="color:#667eea;">Carbs</span>
                        <div class="mp-track"><div class="mp-fill" id="mpCarbs" style="background:#667eea; width:0%"></div></div>
                        <span class="mp-val" id="mpCarbsVal">0 / 0g</span>
                    </div>
                    <div class="macro-prog-row">
                        <span class="mp-label" style="color:#e67e22;">Fats</span>
                        <div class="mp-track"><div class="mp-fill" id="mpFats" style="background:#e67e22; width:0%"></div></div>
                        <span class="mp-val" id="mpFatsVal">0 / 0g</span>
                    </div>
                    <div class="macro-prog-row">
                        <span class="mp-label" style="color:var(--accent-1);">Calories</span>
                        <div class="mp-track"><div class="mp-fill" id="mpCal" style="background:var(--accent-1); width:0%"></div></div>
                        <span class="mp-val" id="mpCalVal">0 / 0 kcal</span>
                    </div>
                </div>`;
            firstCard.after(div);
        }
    }
    updateMacroProgressRing(plan);
}

function updateMacroProgressRing(plan) {
    plan = plan || dietPlan;
    if (!plan) return;
    const macro = plan.macro_split || {};
    const targets = {
        protein: macro.protein_g || 0,
        carbs:   macro.carbs_g || 0,
        fats:    macro.fats_g || 0,
        calories: plan.daily_calories || 0,
    };

    // Compute consumed from checked meals on today
    const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const todayData = (plan.days || []).find(d => d.day === today);
    let consumed = { protein: 0, carbs: 0, fats: 0, calories: 0 };
    if (todayData) {
        (todayData.meals || []).forEach(meal => {
            const key = `${today}::${meal.meal_name}`;
            if (mealLog[key]) {
                consumed.calories += meal.total_calories || 0;
                (meal.items || []).forEach(item => {
                    consumed.protein += item.protein_g || 0;
                    consumed.carbs   += item.carbs_g || 0;
                    consumed.fats    += item.fats_g || 0;
                });
            }
        });
    }

    const setBar = (id, valId, consumed, target, unit) => {
        const pct = target > 0 ? Math.min(100, Math.round((consumed / target) * 100)) : 0;
        const el  = document.getElementById(id);
        const vel = document.getElementById(valId);
        if (el)  el.style.width = pct + "%";
        if (vel) vel.textContent = `${Math.round(consumed)} / ${Math.round(target)}${unit}`;
    };
    setBar("mpProtein", "mpProteinVal", consumed.protein, targets.protein, "g");
    setBar("mpCarbs",   "mpCarbsVal",   consumed.carbs,   targets.carbs,   "g");
    setBar("mpFats",    "mpFatsVal",    consumed.fats,    targets.fats,    "g");
    setBar("mpCal",     "mpCalVal",     consumed.calories, targets.calories, " kcal");
}

// ── Daily calorie chart ──
function renderDailyCalorieChart(plan) {
    const days = plan.days || [];
    if (days.length === 0) return;

    const dayLabels = days.map(d => d.day.substring(0, 3));
    const mealNames = ["Breakfast", "Mid-Morning Snack", "Lunch", "Evening Snack", "Dinner"];
    const mealColors = ["#e74c3c", "#e67e22", "#667eea", "#27ae60", "#764ba2"];

    const traces = mealNames.map((mealName, mi) => ({
        name: mealName,
        x: dayLabels,
        y: days.map(d => {
            const meal = (d.meals || []).find(m =>
                m.meal_name && m.meal_name.toLowerCase().includes(mealName.toLowerCase().split(" ")[0]));
            return meal ? (meal.total_calories || 0) : 0;
        }),
        type: "bar",
        marker: { color: mealColors[mi] },
    }));

    const layout = {
        ...PLOTLY_LAYOUT,
        height: 260, barmode: "stack",
        margin: { t: 20, b: 35, l: 45, r: 10 },
        yaxis: { title: "Calories", gridcolor: "rgba(0,0,0,0.05)" },
        xaxis: { fixedrange: true },
        legend: { orientation: "h", y: -0.18, font: { size: 10 } },
    };
    Plotly.newPlot("chartDailyCalories", traces, layout, PLOTLY_CONFIG);
}

// ── Select day with meal check-off ──
function selectDietDay(index) {
    currentDietDay = index;
    const days = dietPlan.days || [];
    const day  = days[index];

    document.querySelectorAll("#dietDayTabs .day-tab").forEach((t, i) =>
        t.classList.toggle("active", i === index));

    const container = document.getElementById("dietDayContent");
    const totalDayCal = day.total_calories || (day.meals || []).reduce((s, m) => s + (m.total_calories || 0), 0);

    let html = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                <div>
                    <h2 style="margin-bottom:4px;">${day.day}</h2>
                    <p style="color:var(--text-muted); font-size:0.82rem;">
                        🔥 ${totalDayCal} kcal &bull; ${(day.meals || []).length} meals
                    </p>
                </div>
                <div id="dayMealProgress_${index}" style="font-size:0.9rem; font-weight:700; color:var(--green);">0 / ${(day.meals || []).length} eaten</div>
            </div>

            <div class="meal-timeline">`;

    (day.meals || []).forEach((meal, mi) => {
        const style    = getMealStyle(meal.meal_name);
        const totalCal = meal.total_calories || (meal.items || []).reduce((s, it) => s + (it.calories || 0), 0) || 0;
        const totalP   = (meal.items || []).reduce((s, it) => s + (it.protein_g || 0), 0) || 0;
        const totalC   = (meal.items || []).reduce((s, it) => s + (it.carbs_g || 0), 0) || 0;
        const totalF   = (meal.items || []).reduce((s, it) => s + (it.fats_g || 0), 0) || 0;
        const isLast   = mi === (day.meals || []).length - 1;
        const mealKey  = `${day.day}::${meal.meal_name}`;
        const isEaten  = mealLog[mealKey] || false;

        const safeMealName = meal.meal_name.replace(/'/g, "\\'");
        const safeDayName  = day.day.replace(/'/g, "\\'");

        html += `
            <div class="timeline-item">
                <div class="timeline-line-container">
                    <div class="timeline-dot" style="background:${isEaten ? 'var(--green)' : style.color};"></div>
                    ${!isLast ? `<div class="timeline-line" style="background:${style.color}33;"></div>` : ''}
                </div>
                <div class="meal-card-enhanced ${isEaten ? 'meal-eaten' : ''}" style="border-left:3px solid ${isEaten ? 'var(--green)' : style.border};">
                    <div class="meal-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.4rem;">${isEaten ? '✅' : style.icon}</span>
                            <div>
                                <strong style="font-size:0.95rem;">${meal.meal_name}</strong>
                                ${meal.time ? `<span style="color:var(--text-dim); font-size:0.78rem; margin-left:8px;">⏰ ${meal.time}</span>` : ""}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div style="text-align:right;">
                                <div style="font-weight:700; color:${style.color}; font-size:1.1rem;">${totalCal}</div>
                                <div style="font-size:0.7rem; color:var(--text-dim);">kcal</div>
                            </div>
                            <button class="meal-check-btn ${isEaten ? 'done' : ''}" id="mealBtn_${index}_${mi}"
                                    onclick="toggleMeal('${safeDayName}', '${safeMealName}', ${index}, ${mi})">
                                ${isEaten ? '✓ Eaten' : 'Mark Eaten'}
                            </button>
                        </div>
                    </div>

                    <div class="macro-mini-bars">
                        <div class="macro-bar">
                            <span style="color:#e74c3c;">P ${totalP.toFixed(1)}g</span>
                            <div class="macro-track"><div class="macro-fill" style="width:${Math.min(totalP / 2, 100)}%; background:#e74c3c;"></div></div>
                        </div>
                        <div class="macro-bar">
                            <span style="color:#667eea;">C ${totalC.toFixed(1)}g</span>
                            <div class="macro-track"><div class="macro-fill" style="width:${Math.min(totalC / 3, 100)}%; background:#667eea;"></div></div>
                        </div>
                        <div class="macro-bar">
                            <span style="color:#e67e22;">F ${totalF.toFixed(1)}g</span>
                            <div class="macro-track"><div class="macro-fill" style="width:${Math.min(totalF / 1.5, 100)}%; background:#e67e22;"></div></div>
                        </div>
                    </div>

                    <div class="meal-items-enhanced">`;

        (meal.items || []).forEach(item => {
            html += `
                <div class="meal-item-row">
                    <div class="meal-item-food">${item.food}</div>
                    <div class="meal-item-meta">
                        <span class="meal-item-portion">${item.portion}</span>
                        <span class="meal-item-cal">${item.calories} cal</span>
                    </div>
                </div>`;
        });

        html += `</div>`;

        if (meal.reason) {
            html += `
                <div class="meal-reason-toggle" onclick="this.nextElementSibling.classList.toggle('open'); this.textContent = this.nextElementSibling.classList.contains('open') ? '▲ Hide reasoning' : '▼ Why this meal?';">
                    ▼ Why this meal?
                </div>
                <div class="meal-reason-content">
                    <p style="margin-bottom:4px;"><strong>💡 Why:</strong> ${meal.reason}</p>
                    ${meal.analogy ? `<p style="color:var(--text-dim); font-style:italic;">🔗 ${meal.analogy}</p>` : ""}
                </div>`;
        }

        html += `</div></div>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
    updateDayMealProgress(index);
}

// ── Toggle meal eaten state ──
async function toggleMeal(dayName, mealName, dayIndex, mealIndex) {
    const key     = `${dayName}::${mealName}`;
    const wasEaten = mealLog[key] || false;
    mealLog[key]  = !wasEaten;
    const isEaten = mealLog[key];

    const btn = document.getElementById(`mealBtn_${dayIndex}_${mealIndex}`);
    if (btn) {
        btn.classList.toggle("done", isEaten);
        btn.textContent = isEaten ? "✓ Eaten" : "Mark Eaten";
    }

    updateDayMealProgress(dayIndex);
    updateMacroProgressRing();

    if (dietPlanId) {
        try {
            await apiPost("/api/diet/log-meal", {
                plan_id: dietPlanId,
                day_name: dayName,
                meal_name: mealName,
                completed: isEaten,
            });
        } catch (e) { console.error("Meal log failed:", e); }
    }
}

function updateDayMealProgress(dayIndex) {
    const day = (dietPlan.days || [])[dayIndex];
    if (!day) return;
    const meals = day.meals || [];
    const done  = meals.filter(m => mealLog[`${day.day}::${m.meal_name}`]).length;
    const el    = document.getElementById(`dayMealProgress_${dayIndex}`);
    if (el) el.textContent = `${done} / ${meals.length} eaten`;
}

async function loadMealLogs() {
    if (!dietPlanId) return;
    try {
        const logs = await apiGet(`/api/diet/meal-logs/${dietPlanId}`);
        logs.forEach(log => {
            if (log.completed) mealLog[`${log.day_name}::${log.meal_name}`] = true;
        });
        if (currentDietDay !== null) selectDietDay(currentDietDay);
        updateMacroProgressRing();
    } catch (e) { console.error("Meal log load failed:", e); }
}

// ── Grocery list with quantities ──
function renderGroceryList(grocery, plan) {
    if (!grocery || Object.keys(grocery).length === 0) {
        document.getElementById("grocerySection").style.display = "none";
        return;
    }
    document.getElementById("grocerySection").style.display = "block";
    const container = document.getElementById("groceryList");

    // Build quantity map from all 7 days
    const quantityMap = {};
    if (plan) {
        (plan.days || []).forEach(day => {
            (day.meals || []).forEach(meal => {
                (meal.items || []).forEach(item => {
                    const food = item.food;
                    if (!quantityMap[food]) quantityMap[food] = { cal: 0, count: 0, portion: item.portion };
                    quantityMap[food].cal   += item.calories || 0;
                    quantityMap[food].count += 1;
                });
            });
        });
    }

    const categoryIcons = {
        proteins: "🥩", grains: "🌾", vegetables: "🥬", fruits: "🍎",
        dairy: "🥛", fats_and_nuts: "🥜", others: "🧂",
    };

    let html = "";
    for (const [category, items] of Object.entries(grocery)) {
        if (!items || items.length === 0) continue;
        const icon  = categoryIcons[category] || "📦";
        const label = category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

        html += `
        <div class="grocery-category">
            <h3>${icon} ${label}</h3>
            <div class="grocery-items">`;

        items.forEach(item => {
            const qty = quantityMap[item];
            const qtyTag = qty && qty.count > 0
                ? `<span style="font-size:0.7rem; color:var(--text-dim); margin-left:4px;">(×${qty.count} servings)</span>`
                : "";
            html += `<span class="grocery-item">${item}${qtyTag}</span>`;
        });

        html += `</div></div>`;
    }

    container.innerHTML = html;
}
