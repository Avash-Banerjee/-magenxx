/* ═══════════════════════════════════════
   FitScan — Onboarding Wizard Logic (6 Steps)
   ═══════════════════════════════════════ */

let currentStep = 1;
const TOTAL_STEPS = 6;

// Data store
const formData = {
    name: "",
    age: null,
    gender: null,
    height_cm: null,
    weight_kg: null,
    target_weight: null,
    experience_level: null,
    training_days_per_week: null,
    minutes_per_session: null,
    preferred_time: null,
    goals: [],
    target_muscles: [],
    equipment: [],
    diet_type: "non_veg",
    indianize: false,
};

const stepLabels = [
    "Physical Profile",
    "Your Objectives",
    "Fitness Background",
    "Target Muscles",
    "Equipment",
    "Diet Preferences",
];

// ── Navigation ──

function goStep(step) {
    if (step > currentStep && !validateStep(currentStep)) return;

    document.querySelectorAll(".step-panel").forEach(el => el.classList.add("hidden"));
    document.getElementById(`step${step}`).classList.remove("hidden");

    document.querySelectorAll(".progress-step").forEach(el => {
        const s = parseInt(el.dataset.step);
        el.classList.remove("active", "done");
        if (s < step) el.classList.add("done");
        if (s === step) el.classList.add("active");
    });

    document.getElementById("stepLabel").textContent =
        `Step ${step} of ${TOTAL_STEPS} — ${stepLabels[step - 1]}`;

    currentStep = step;
}

function validateStep(step) {
    if (step === 1) {
        const name = document.getElementById("inputName").value.trim();
        const height = document.getElementById("inputHeight").value;
        const weight = document.getElementById("inputWeight").value;
        if (!name) { alert("Please enter your name."); return false; }
        if (!formData.gender) { alert("Please select your gender."); return false; }
        if (!height || !weight) { alert("Please fill in height and weight."); return false; }
        return true;
    }
    if (step === 2) {
        if (formData.goals.length === 0) { alert("Please select at least one objective."); return false; }
        return true;
    }
    if (step === 3) {
        if (!formData.experience_level) { alert("Please select your fitness level."); return false; }
        if (!formData.training_days_per_week) { alert("Please select training days per week."); return false; }
        if (!formData.minutes_per_session) { alert("Please select minutes per session."); return false; }
        return true;
    }
    if (step === 4) {
        if (formData.target_muscles.length === 0) { alert("Please select at least one muscle group."); return false; }
        return true;
    }
    return true;
}

// ── Card Selection ──

function selectSingle(el) {
    const field = el.dataset.field;
    el.parentElement.querySelectorAll(`.select-card[data-field="${field}"]`).forEach(c => c.classList.remove("selected"));
    el.classList.add("selected");

    const value = el.dataset.value;
    if (field === "gender") formData.gender = value;
    else if (field === "experience") formData.experience_level = value;
    else if (field === "days") formData.training_days_per_week = parseInt(value);
    else if (field === "minutes") formData.minutes_per_session = parseInt(value);
    else if (field === "time") formData.preferred_time = value;
    else if (field === "diet") formData.diet_type = value;
}

function toggleMulti(el) {
    el.classList.toggle("selected");
    const field = el.dataset.field;
    const value = el.dataset.value;
    const isSelected = el.classList.contains("selected");

    let arr;
    if (field === "goals") arr = formData.goals;
    else if (field === "muscles") arr = formData.target_muscles;
    else if (field === "equipment") arr = formData.equipment;
    else return;

    if (isSelected && !arr.includes(value)) arr.push(value);
    else if (!isSelected) {
        const idx = arr.indexOf(value);
        if (idx !== -1) arr.splice(idx, 1);
    }
}

// ── Submit Full Profile (Step 6) ──

async function submitProfile() {
    if (!validateStep(6)) return;

    // Collect all input values
    formData.name = document.getElementById("inputName").value.trim();
    formData.age = parseInt(document.getElementById("inputAge").value) || null;
    formData.height_cm = parseFloat(document.getElementById("inputHeight").value);
    formData.weight_kg = parseFloat(document.getElementById("inputWeight").value);
    formData.indianize = document.getElementById("indianizeToggle").checked;

    const targetWeight = document.getElementById("inputTargetWeight").value;
    formData.target_weight = targetWeight ? parseFloat(targetWeight) : null;

    // Show loading
    document.querySelectorAll(".step-panel").forEach(el => el.classList.add("hidden"));
    document.getElementById("onboardingLoading").classList.add("active");

    try {
        const resp = await apiPost("/api/profile", formData);
        if (resp.error) {
            alert(resp.error);
            document.getElementById("onboardingLoading").classList.remove("active");
            document.getElementById("step6").classList.remove("hidden");
            return;
        }

        window.location.href = resp.redirect || "/scan";
    } catch (err) {
        alert("Error saving profile: " + err.message);
        document.getElementById("onboardingLoading").classList.remove("active");
        document.getElementById("step6").classList.remove("hidden");
    }
}
