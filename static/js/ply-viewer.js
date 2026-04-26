/* ═══════════════════════════════════════════════════════════
   FitScan — 3D Viewer
   • Gaussian Splatting PLY  →  /static/splat-viewer.html (iframe, WebGL2)
   • Local body_scan.ply     →  Three.js point cloud
   ═══════════════════════════════════════════════════════════ */

const LOCAL_PLY     = "/static/models/body_scan.ply";
const GS_PLY        = "/api/gaussian/output.ply";
const SPLAT_VIEWER  = "/static/splat-viewer.html";

const THREE = window.THREE;

let pcScene, pcCamera, pcRenderer, pcControls, pointCloud;
let fullScene, fullCamera, fullRenderer, fullControls;
let gsIframe      = null;
let isFullscreen  = false;
let animId        = null;
let fullAnimId    = null;
let currentSource  = "local";
let _pendingBuffer = null;   // waiting for iframe ready
let _storedBuffer  = null;   // kept for fullscreen re-use

// Listen for splatViewerReady from any splat iframe, send pending buffer
window.addEventListener("message", function (e) {
    if (e.data && e.data.type === "splatViewerReady" && _pendingBuffer) {
        // Find which iframe sent the signal by matching contentWindow
        const candidates = ["gsViewerIframe", "gsIframeFull"]
            .map(id => document.getElementById(id))
            .filter(Boolean);
        const iframe = candidates.find(f => f.contentWindow === e.source) || candidates[0];
        if (iframe && iframe.contentWindow) {
            // Clone so we keep _storedBuffer intact for fullscreen
            const copy = _pendingBuffer.slice(0);  // send copy, keep original
            iframe.contentWindow.postMessage(
                { type: "loadBuffer", buffer: copy },
                "*",
                [copy]   // transfer the copy, not the original
            );
            _storedBuffer = _pendingBuffer;  // keep for fullscreen
        }
        _pendingBuffer = null;
    }
});

// ── badge ──────────────────────────────────────────────────────────────────
function setBadge(source) {
    const b = document.getElementById("plySourceBadge");
    if (!b) return;
    if (source === "gaussian") {
        b.textContent = "Gaussian Splat";
        b.style.background = "rgba(99,102,241,0.15)";
        b.style.color = "#6366f1";
    } else {
        b.textContent = "Point Cloud";
        b.style.background = "rgba(6,182,212,0.12)";
        b.style.color = "#0891b2";
    }
}

// ── iframe helper ──────────────────────────────────────────────────────────
function getOrCreateIframe(parent, id) {
    let el = document.getElementById(id);
    if (!el) {
        el = document.createElement("iframe");
        el.id = id;
        el.style.cssText = "position:absolute;inset:0;width:100%;height:100%;border:none;border-radius:inherit;";
        el.setAttribute("allowfullscreen", "");
        parent.appendChild(el);
    }
    return el;
}

function showIframe(canvasEl, iframeEl, plyURL) {
    if (canvasEl) canvasEl.style.display = "none";
    iframeEl.src = SPLAT_VIEWER + "?url=" + encodeURIComponent(plyURL);
    iframeEl.style.display = "block";
}

function hideIframe(canvasEl, iframeEl) {
    if (canvasEl) canvasEl.style.display = "block";
    if (iframeEl) { iframeEl.style.display = "none"; iframeEl.src = ""; }
}

// ── Three.js helpers (local PLY only) ─────────────────────────────────────
function createPCScene(canvas, bgHex) {
    const s   = new THREE.Scene();
    s.background = new THREE.Color(bgHex);
    const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
    cam.position.set(0, 0, 2.5);
    const r   = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(window.devicePixelRatio);
    const ctrl = new THREE.OrbitControls(cam, canvas);
    ctrl.enableDamping  = true;
    ctrl.dampingFactor  = 0.08;
    ctrl.autoRotate     = true;
    ctrl.autoRotateSpeed = 1.5;
    ctrl.minDistance    = 0.5;
    ctrl.maxDistance    = 10;
    return { scene: s, camera: cam, renderer: r, controls: ctrl };
}

function fitCamera(geometry, cam, ctrl) {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const c = geometry.boundingSphere.center;
    const rv = geometry.boundingSphere.radius;
    ctrl.target.copy(c);
    cam.position.set(c.x, c.y, c.z + rv * 2.5);
    ctrl.update();
}

function resizeRenderer(r, cam, el) {
    const w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    r.setSize(w, h);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
}

// ── main init ──────────────────────────────────────────────────────────────
function init() {
    const canvas     = document.getElementById("plyScanCanvas");
    const container  = document.getElementById("plyScanPreview");
    const loading    = document.getElementById("plyScanLoading");
    const expandBtn  = document.getElementById("plyScanExpand");
    const modal      = document.getElementById("plyScanModal");
    const fullCanvas = document.getElementById("plyScanCanvasFull");
    const closeBtn   = document.getElementById("plyScanClose");
    const refreshBtn = document.getElementById("plyRefreshBtn");

    if (!canvas || !container) return;

    const p = createPCScene(canvas, 0xf0f9ff);
    pcScene = p.scene; pcCamera = p.camera; pcRenderer = p.renderer; pcControls = p.controls;
    resizeRenderer(pcRenderer, pcCamera, container);

    const gsIframeEl = getOrCreateIframe(container, "gsViewerIframe");
    gsIframeEl.style.display = "none";

    // ── load Gaussian Splat via iframe ─────────────────────────────────────
    async function tryGaussian() {
        loading.style.display = "flex";
        loading.innerHTML = `<div style="text-align:center;"><div class="fbx-loading-spinner"></div><p style="margin-top:8px;font-size:0.82rem;">Loading Gaussian Splat...</p></div>`;

        try {
            const r    = await fetch("/api/gaussian/status");
            const data = await r.json();
            if (!data.available) { tryLocal(); return; }
        } catch (_) { tryLocal(); return; }

        if (animId) { cancelAnimationFrame(animId); animId = null; }
        // Verify PLY is actually fetchable before showing iframe
        try {
            const test = await fetch(GS_PLY, { method: "HEAD" });
            if (!test.ok) { tryLocal(); return; }
        } catch (_) { tryLocal(); return; }

        currentSource = "gaussian";
        setBadge("gaussian");
        loading.style.display = "none";
        showIframe(canvas, gsIframeEl, GS_PLY);
    }

    // ── load local point cloud ─────────────────────────────────────────────
    function tryLocal() {
        currentSource = "local";
        setBadge("local");
        hideIframe(canvas, gsIframeEl);

        if (!THREE) return;
        const loader = new THREE.PLYLoader();
        loader.load(LOCAL_PLY,
            geometry => {
                loading.style.display = "none";
                const mat = new THREE.PointsMaterial({
                    size: 0.005,
                    vertexColors: geometry.hasAttribute("color"),
                    color: geometry.hasAttribute("color") ? undefined : 0x06b6d4,
                    sizeAttenuation: true,
                });
                pointCloud = new THREE.Points(geometry, mat);
                pcScene.add(pointCloud);
                fitCamera(geometry, pcCamera, pcControls);
                animatePC();
            },
            null,
            () => {
                loading.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);"><p style="font-size:1.8rem;">&#x1F4E6;</p><p>No 3D scan yet</p><p style="font-size:0.75rem;margin-top:4px;">Upload a video and run a scan.</p></div>`;
            }
        );
    }

    // ── boot ──────────────────────────────────────────────────────────────
    const GAUSSIAN = (typeof GAUSSIAN_URL === "string" && GAUSSIAN_URL) ? GAUSSIAN_URL : "";
    if (GAUSSIAN) { tryGaussian(); } else { tryLocal(); }

    // ── refresh from Colab ─────────────────────────────────────────────────
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            if (pointCloud) {
                pcScene.remove(pointCloud);
                pointCloud.geometry.dispose();
                pointCloud.material.dispose();
                pointCloud = null;
            }
            tryGaussian();
        });
    }

    // ── manual PLY upload ──────────────────────────────────────────────────
    const plyUploadBtn = document.getElementById("plyUploadBtn");
    const plyFileInput = document.getElementById("plyFileInput");

    if (plyUploadBtn && plyFileInput) {
        plyUploadBtn.addEventListener("click", () => plyFileInput.click());

        plyFileInput.addEventListener("change", function () {
            const file = this.files[0];
            if (!file) return;

            if (animId) { cancelAnimationFrame(animId); animId = null; }
            if (pointCloud) {
                pcScene.remove(pointCloud);
                pointCloud.geometry.dispose();
                pointCloud.material.dispose();
                pointCloud = null;
            }

            // Read as ArrayBuffer — blob URLs can't cross iframe boundaries
            const reader = new FileReader();
            reader.onload = function (ev) {
                _pendingBuffer = ev.target.result;

                currentSource = "gaussian";
                setBadge("gaussian");
                loading.style.display = "none";

                // Load blank splat-viewer — it will postMessage 'splatViewerReady'
                // then our window.message handler above sends _pendingBuffer
                canvas.style.display = "none";
                gsIframeEl.style.display = "block";
                gsIframeEl.src = SPLAT_VIEWER + "?t=" + Date.now(); // bust cache
            };
            reader.readAsArrayBuffer(file);

            plyUploadBtn.style.background = "rgba(99,102,241,0.75)";
            plyUploadBtn.innerHTML = "&#x1F4C2; " + file.name.substring(0, 14) + (file.name.length > 14 ? "…" : "");
            this.value = "";
        });
    }

    // ── fullscreen ─────────────────────────────────────────────────────────
    expandBtn.addEventListener("click",  () => openFullscreen(modal, fullCanvas));
    closeBtn.addEventListener("click",   () => closeFullscreen(modal));
    modal.addEventListener("click",      e => { if (e.target === modal) closeFullscreen(modal); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && isFullscreen) closeFullscreen(modal); });

    window.addEventListener("resize", () => {
        resizeRenderer(pcRenderer, pcCamera, container);
    });
}

function openFullscreen(modal, fullCanvas) {
    isFullscreen = true;
    modal.style.display = "block";
    document.body.style.overflow = "hidden";

    if (currentSource === "gaussian") {
        fullCanvas.style.display = "none";
        const fsIframe = getOrCreateIframe(modal, "gsIframeFull");

        if (_storedBuffer) {
            // File was uploaded — send buffer via postMessage after iframe loads
            fsIframe.style.display = "block";
            fsIframe.src = SPLAT_VIEWER + "?t=" + Date.now();
            // _pendingBuffer will be sent when iframe fires splatViewerReady
            _pendingBuffer = _storedBuffer.slice(0);
        } else {
            // Colab PLY — load by URL
            showIframe(null, fsIframe, GS_PLY);
        }
    } else if (pointCloud) {
        fullCanvas.style.display = "block";
        const fsIframe = document.getElementById("gsIframeFull");
        if (fsIframe) { fsIframe.style.display = "none"; fsIframe.src = ""; }

        const f = createPCScene(fullCanvas, 0x0f172a);
        fullScene = f.scene; fullCamera = f.camera;
        fullRenderer = f.renderer; fullControls = f.controls;
        fullControls.autoRotateSpeed = 1.0;

        const mat = new THREE.PointsMaterial({
            size: 0.004,
            vertexColors: pointCloud.material.vertexColors,
            sizeAttenuation: true,
        });
        fullScene.add(new THREE.Points(pointCloud.geometry, mat));
        resizeRenderer(fullRenderer, fullCamera, modal);
        fitCamera(pointCloud.geometry, fullCamera, fullControls);
        animateFullPC();
    }
}

function closeFullscreen(modal) {
    isFullscreen = false;
    modal.style.display = "none";
    document.body.style.overflow = "";
    if (fullAnimId) { cancelAnimationFrame(fullAnimId); fullAnimId = null; }
    if (fullRenderer) { fullRenderer.dispose(); fullRenderer = null; }
    const fsIframe = document.getElementById("gsIframeFull");
    if (fsIframe) { fsIframe.style.display = "none"; fsIframe.src = ""; }
}

function animatePC() {
    animId = requestAnimationFrame(animatePC);
    pcControls.update();
    pcRenderer.render(pcScene, pcCamera);
}

function animateFullPC() {
    if (!isFullscreen) return;
    fullAnimId = requestAnimationFrame(animateFullPC);
    fullControls.update();
    fullRenderer.render(fullScene, fullCamera);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    setTimeout(init, 100);
}
