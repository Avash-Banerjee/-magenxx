/* ═══════════════════════════════════════
   FitScan — Diet Plan Page (Enhanced)
   ═══════════════════════════════════════ */

let dietPlan = EXISTING_DIET_PLAN;
let dietPlanId = EXISTING_DIET_PLAN_ID;
let currentDietDay = null;
let indianize = !!EXISTING_INDIANIZED;

// ── Meal type styling (must be before init) ──
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
}

// ── Generate / Regenerate ──
async function generateDietPlan() {
    const btn = document.getElementById("btnGenerate");
    const loading = document.getElementById("dietLoading");
    const content = document.getElementById("dietPlanContent");
    const error = document.getElementById("dietError");

    btn.disabled = true;
    btn.textContent = "⏳ Generating...";
    loading.classList.add("active");
    content.style.display = "none";
    error.classList.remove("active");

    try {
        const resp = await apiPost("/api/diet/generate", { indianize });
        if (resp.error) throw new Error(resp.error);

        dietPlan = resp.plan;
        dietPlanId = resp.plan_id;
        renderDietPlan(dietPlan);
    } catch (err) {
        error.textContent = "❌ " + err.message;
        error.classList.add("active");
    } finally {
        btn.disabled = false;
        btn.textContent = "✨ Generate Plan";
        loading.classList.remove("active");
    }
}

function handleIndianizeToggle(checked) {
    indianize = checked;
    if (dietPlan) {
        generateDietPlan();
    }
}

// ── Render full diet plan ──
function renderDietPlan(plan) {
    const content = document.getElementById("dietPlanContent");
    content.style.display = "block";

    if (plan.plan_summary) {
        const summary = document.getElementById("dietSummary");
        summary.textContent = plan.plan_summary;
        summary.style.display = "block";
    }

    renderMacroOverview(plan);
    renderDailyCalorieChart(plan);

    const tabsContainer = document.getElementById("dietDayTabs");
    tabsContainer.innerHTML = "";
    const days = plan.days || [];

    days.forEach((day, i) => {
        const tab = document.createElement("div");
        tab.className = "day-tab" + (i === 0 ? " active" : "");
        tab.textContent = day.day.substring(0, 3);
        tab.onclick = () => selectDietDay(i);
        tabsContainer.appendChild(tab);
    });

    if (days.length > 0) selectDietDay(0);

    renderGroceryList(plan.grocery_list);

    if (plan.weekly_notes) {
        document.getElementById("weeklyNotes").textContent = plan.weekly_notes;
        document.getElementById("weeklyNotesSection").style.display = "block";
    }
}

// ── Macro overview ──
function renderMacroOverview(plan) {
    const macro = plan.macro_split || {};
    const cal = plan.daily_calories || 0;

    document.getElementById("statCalories").textContent = cal.toLocaleString();
    document.getElementById("statProtein").textContent = macro.protein_g || "—";
    document.getElementById("statCarbs").textContent = macro.carbs_g || "—";
    document.getElementById("statFats").textContent = macro.fats_g || "—";

    if (plan.protein_per_kg) {
        document.getElementById("proteinPerKg").textContent = `${plan.protein_per_kg}g protein per kg body weight`;
    }

    const trace = {
        values: [macro.protein_g || 0, macro.carbs_g || 0, macro.fats_g || 0],
        labels: ["Protein", "Carbs", "Fats"],
        type: "pie",
        hole: 0.55,
        marker: { colors: ["#e74c3c", "#667eea", "#e67e22"] },
        textinfo: "label+percent",
        textfont: { color: "#e0e0e0", size: 11 },
        hovertemplate: "%{label}: %{value}g (%{percent})<extra></extra>",
    };
    const layout = {
        ...PLOTLY_LAYOUT,
        height: 220,
        width: 220,
        margin: { t: 10, b: 10, l: 10, r: 10 },
        showlegend: false,
        annotations: [{
            text: `${cal}<br><span style="font-size:10px">kcal</span>`,
            showarrow: false,
            font: { size: 16, color: "#e0e0e0" },
        }],
    };
    Plotly.newPlot("chartMacroDonut", [trace], layout, PLOTLY_CONFIG);
}

// ── Daily calorie stacked bar ──
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
            const meals = d.meals || [];
            const meal = meals.find(m => m.meal_name && m.meal_name.toLowerCase().includes(mealName.toLowerCase().split(" ")[0]));
            return meal ? (meal.total_calories || 0) : 0;
        }),
        type: "bar",
        marker: { color: mealColors[mi] },
    }));

    const layout = {
        ...PLOTLY_LAYOUT,
        height: 260,
        barmode: "stack",
        margin: { t: 20, b: 35, l: 45, r: 10 },
        yaxis: { title: "Calories", gridcolor: "rgba(255,255,255,0.05)" },
        xaxis: { fixedrange: true },
        legend: { orientation: "h", y: -0.18, font: { size: 10 } },
    };
    Plotly.newPlot("chartDailyCalories", traces, layout, PLOTLY_CONFIG);
}

// ── Select a day (enhanced) ──
function selectDietDay(index) {
    currentDietDay = index;
    const days = dietPlan.days || [];
    const day = days[index];

    document.querySelectorAll("#dietDayTabs .day-tab").forEach((t, i) => {
        t.classList.toggle("active", i === index);
    });

    const container = document.getElementById("dietDayContent");

    const totalDayCal = day.total_calories || (day.meals || []).reduce((s, m) => s + (m.total_calories || 0), 0);

    let html = `
        <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <div>
                    <h2 style="margin-bottom:4px;">${day.day}</h2>
                    <p style="color:var(--text-muted); font-size:0.82rem;">
                        🔥 ${totalDayCal} kcal &bull; ${(day.meals || []).length} meals
                    </p>
                </div>
            </div>

            <!-- Meal Timeline -->
            <div class="meal-timeline">`;

    (day.meals || []).forEach((meal, mi) => {
        const style = getMealStyle(meal.meal_name);
        const totalCal = meal.total_calories || meal.items?.reduce((s, it) => s + (it.calories || 0), 0) || 0;
        const totalP = meal.items?.reduce((s, it) => s + (it.protein_g || 0), 0) || 0;
        const totalC = meal.items?.reduce((s, it) => s + (it.carbs_g || 0), 0) || 0;
        const totalF = meal.items?.reduce((s, it) => s + (it.fats_g || 0), 0) || 0;
        const isLast = mi === (day.meals || []).length - 1;

        html += `
            <div class="timeline-item">
                <div class="timeline-line-container">
                    <div class="timeline-dot" style="background:${style.color};"></div>
                    ${!isLast ? `<div class="timeline-line" style="background:${style.color}33;"></div>` : ''}
                </div>
                <div class="meal-card-enhanced" style="border-left:3px solid ${style.border};">
                    <div class="meal-header">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:1.4rem;">${style.icon}</span>
                            <div>
                                <strong style="font-size:0.95rem;">${meal.meal_name}</strong>
                                ${meal.time ? `<span style="color:var(--text-dim); font-size:0.78rem; margin-left:8px;">⏰ ${meal.time}</span>` : ""}
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700; color:${style.color}; font-size:1.1rem;">${totalCal}</div>
                            <div style="font-size:0.7rem; color:var(--text-dim);">kcal</div>
                        </div>
                    </div>

                    <!-- Macro bars -->
                    <div class="macro-mini-bars">
                        <div class="macro-bar">
                            <span style="color:#e74c3c;">P ${totalP}g</span>
                            <div class="macro-track"><div class="macro-fill" style="width:${Math.min(totalP / 2, 100)}%; background:#e74c3c;"></div></div>
                        </div>
                        <div class="macro-bar">
                            <span style="color:#667eea;">C ${totalC}g</span>
                            <div class="macro-track"><div class="macro-fill" style="width:${Math.min(totalC / 3, 100)}%; background:#667eea;"></div></div>
                        </div>
                        <div class="macro-bar">
                            <span style="color:#e67e22;">F ${totalF}g</span>
                            <div class="macro-track"><div class="macro-fill" style="width:${Math.min(totalF / 1.5, 100)}%; background:#e67e22;"></div></div>
                        </div>
                    </div>

                    <!-- Food items -->
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

        // Expandable reason
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

        html += `
                </div>
            </div>`;
    });

    html += `</div></div>`;
    container.innerHTML = html;
}

// ── Grocery list ──
function renderGroceryList(grocery) {
    if (!grocery || Object.keys(grocery).length === 0) {
        document.getElementById("grocerySection").style.display = "none";
        return;
    }

    document.getElementById("grocerySection").style.display = "block";
    const container = document.getElementById("groceryList");

    const categoryIcons = {
        proteins: "🥩", grains: "🌾", vegetables: "🥬", fruits: "🍎",
        dairy: "🥛", fats_and_nuts: "🥜", others: "🧂",
    };

    let html = "";
    for (const [category, items] of Object.entries(grocery)) {
        if (!items || items.length === 0) continue;
        const icon = categoryIcons[category] || "📦";
        const label = category.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

        html += `
        <div class="grocery-category">
            <h3>${icon} ${label}</h3>
            <div class="grocery-items">
                ${items.map(item => `<span class="grocery-item">${item}</span>`).join("")}
            </div>
        </div>`;
    }

    container.innerHTML = html;
}
