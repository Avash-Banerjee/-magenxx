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
