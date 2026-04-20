/* ═══════════════════════════════════════
   FitScan — Common JS utilities
   ═══════════════════════════════════════ */

/**
 * Safely parse a fetch response as JSON; throw a clear error if it's HTML.
 */
async function parseJsonResponse(resp) {
    const ct = resp.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
        if (resp.status === 401 || resp.status === 302) {
            throw new Error("Session expired — please refresh and log in again.");
        }
        const text = await resp.text();
        throw new Error(`Server returned non-JSON (${resp.status}). Check terminal for errors.`);
    }
    const json = await resp.json();
    if (!resp.ok && json.error) throw new Error(json.error);
    return json;
}

/**
 * POST JSON to an API endpoint and return parsed response.
 */
async function apiPost(url, data) {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return await parseJsonResponse(resp);
}

/**
 * POST FormData to an API endpoint and return parsed response.
 */
async function apiPostForm(url, formData, extraHeaders = {}) {
    const resp = await fetch(url, {
        method: "POST",
        body: formData,
        headers: extraHeaders,
    });
    return await parseJsonResponse(resp);
}

/**
 * GET JSON from an API endpoint.
 */
async function apiGet(url) {
    const resp = await fetch(url);
    return await parseJsonResponse(resp);
}

/**
 * Show/hide element by selector.
 */
function show(sel) { document.querySelector(sel).style.display = "block"; }
function hide(sel) { document.querySelector(sel).style.display = "none"; }

/**
 * Format number to fixed decimals.
 */
function fmt(val, decimals = 2) {
    return typeof val === "number" ? val.toFixed(decimals) : val;
}

/**
 * Plotly light theme layout defaults.
 */
const PLOTLY_LAYOUT = {
    paper_bgcolor: "rgba(255,255,255,0)",
    plot_bgcolor: "rgba(255,255,255,0)",
    font: { color: "#475569", family: "Inter, Segoe UI, system-ui, sans-serif" },
    margin: { t: 40, b: 40, l: 50, r: 20 },
    colorway: ["#ef4444", "#10b981", "#3b82f6", "#06b6d4", "#f59e0b", "#8b5cf6"],
};

const PLOTLY_CONFIG = { displayModeBar: false, responsive: true };

/* ── Dark Mode ── */
function toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark');
    localStorage.setItem('fitscan_theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('darkModeToggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
}

// Apply saved theme on load
(function applyTheme() {
    const saved = localStorage.getItem('fitscan_theme');
    if (saved === 'dark') {
        document.body.classList.add('dark');
        const btn = document.getElementById('darkModeToggle');
        if (btn) btn.textContent = '☀️';
    }
})();

/* ── Workout Reminder Banner ── */
(function checkWorkoutReminder() {
    const banner = document.getElementById('reminderBanner');
    if (!banner) return;
    const dismissed = sessionStorage.getItem('reminder_dismissed');
    if (dismissed) return;

    const hour = new Date().getHours();
    // preferred_time is stored in profile — we approximate from meta tag if present
    const prefTime = document.querySelector('meta[name="preferred_time"]');
    const pref = prefTime ? prefTime.content : null;

    let shouldShow = false;
    let msg = "It's your workout window — time to train!";

    if (pref === 'morning' && hour >= 5 && hour < 10) {
        shouldShow = true;
        msg = "🌅 Good morning! Your morning workout window is now — let's go!";
    } else if (pref === 'afternoon' && hour >= 12 && hour < 16) {
        shouldShow = true;
        msg = "☀️ It's your afternoon training window — ready to work?";
    } else if (pref === 'evening' && hour >= 17 && hour < 21) {
        shouldShow = true;
        msg = "🌆 Evening session time! Your workout is waiting.";
    } else if (!pref && hour >= 7 && hour < 21) {
        // No preference set — show once daily around midday
        const today = new Date().toDateString();
        const shownOn = localStorage.getItem('reminder_last_shown');
        if (shownOn !== today && hour >= 12 && hour < 13) {
            shouldShow = true;
            msg = "🏋️ Don't forget your workout today!";
            localStorage.setItem('reminder_last_shown', today);
        }
    }

    if (shouldShow) {
        const txt = document.getElementById('reminderText');
        if (txt) txt.textContent = msg;
        banner.classList.add('show');
        // Auto-dismiss after 8 seconds
        setTimeout(() => {
            banner.classList.remove('show');
            sessionStorage.setItem('reminder_dismissed', '1');
        }, 8000);
    }
})();
