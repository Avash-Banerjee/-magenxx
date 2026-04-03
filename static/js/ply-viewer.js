/* ═══════════════════════════════════════
   FitScan — 3D Point Cloud Viewer
   Renders a PLY body scan in the dashboard
   with expand-to-fullscreen support.
   ═══════════════════════════════════════ */

(function () {
    const PLY_URL = "/static/models/body_scan.ply";

    let scene, camera, renderer, controls, pointCloud;
    let fullScene, fullCamera, fullRenderer, fullControls;
    let isFullscreen = false;
    let animId = null, fullAnimId = null;

    function createScene(canvas, bg) {
        const s = new THREE.Scene();
        s.background = new THREE.Color(bg);

        const cam = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
        cam.position.set(0, 0, 2.5);

        const r = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        r.setPixelRatio(window.devicePixelRatio);

        const ctrl = new THREE.OrbitControls(cam, canvas);
        ctrl.enableDamping = true;
        ctrl.dampingFactor = 0.08;
        ctrl.autoRotate = true;
        ctrl.autoRotateSpeed = 1.5;
        ctrl.minDistance = 0.5;
        ctrl.maxDistance = 10;

        return { scene: s, camera: cam, renderer: r, controls: ctrl };
    }

    function fitCameraToPoints(geometry, cam, ctrl) {
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const center = geometry.boundingSphere.center;
        const radius = geometry.boundingSphere.radius;

        ctrl.target.copy(center);
        cam.position.set(center.x, center.y, center.z + radius * 2.5);
        ctrl.update();
    }

    function resizeRenderer(r, cam, container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w === 0 || h === 0) return;
        r.setSize(w, h);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
    }

    function init() {
        const canvas = document.getElementById("plyScanCanvas");
        const container = document.getElementById("plyScanPreview");
        const loading = document.getElementById("plyScanLoading");
        const expandBtn = document.getElementById("plyScanExpand");
        const modal = document.getElementById("plyScanModal");
        const fullCanvas = document.getElementById("plyScanCanvasFull");
        const closeBtn = document.getElementById("plyScanClose");

        if (!canvas || !container) return;

        // Setup small preview
        const p = createScene(canvas, 0xf0f9ff);
        scene = p.scene; camera = p.camera; renderer = p.renderer; controls = p.controls;
        resizeRenderer(renderer, camera, container);

        // Load PLY
        const loader = new THREE.PLYLoader();
        loader.load(
            PLY_URL,
            function (geometry) {
                loading.style.display = "none";

                // Point cloud material
                const material = new THREE.PointsMaterial({
                    size: 0.005,
                    vertexColors: true,
                    sizeAttenuation: true,
                });

                pointCloud = new THREE.Points(geometry, material);
                scene.add(pointCloud);

                fitCameraToPoints(geometry, camera, controls);

                // Start animation
                animatePreview();
            },
            function (xhr) {
                if (xhr.lengthComputable) {
                    const pct = Math.round((xhr.loaded / xhr.total) * 100);
                    loading.querySelector("p").textContent = "Loading 3D Scan... " + pct + "%";
                }
            },
            function (error) {
                console.error("PLY load error:", error);
                loading.innerHTML = '<div style="text-align:center; color:var(--text-muted);"><p>Could not load 3D scan</p></div>';
            }
        );

        // Expand button
        expandBtn.addEventListener("click", function () {
            openFullscreen(modal, fullCanvas);
        });

        // Close fullscreen
        closeBtn.addEventListener("click", function () {
            closeFullscreen(modal);
        });
        modal.addEventListener("click", function (e) {
            if (e.target === modal) closeFullscreen(modal);
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && isFullscreen) closeFullscreen(modal);
        });

        // Handle resize
        window.addEventListener("resize", function () {
            resizeRenderer(renderer, camera, container);
            if (isFullscreen && fullRenderer) {
                resizeRenderer(fullRenderer, fullCamera, modal);
            }
        });
    }

    function openFullscreen(modal, fullCanvas) {
        if (!pointCloud) return;
        isFullscreen = true;
        modal.style.display = "block";
        document.body.style.overflow = "hidden";

        // Setup fullscreen scene
        const f = createScene(fullCanvas, 0x111111);
        fullScene = f.scene; fullCamera = f.camera; fullRenderer = f.renderer; fullControls = f.controls;
        fullControls.autoRotateSpeed = 1.0;

        // Clone point cloud for fullscreen with bigger points
        const fullMaterial = new THREE.PointsMaterial({
            size: 0.004,
            vertexColors: true,
            sizeAttenuation: true,
        });
        const fullPoints = new THREE.Points(pointCloud.geometry, fullMaterial);
        fullScene.add(fullPoints);

        resizeRenderer(fullRenderer, fullCamera, modal);
        fitCameraToPoints(pointCloud.geometry, fullCamera, fullControls);

        animateFullscreen();
    }

    function closeFullscreen(modal) {
        isFullscreen = false;
        modal.style.display = "none";
        document.body.style.overflow = "";

        if (fullAnimId) {
            cancelAnimationFrame(fullAnimId);
            fullAnimId = null;
        }
        if (fullRenderer) {
            fullRenderer.dispose();
            fullRenderer = null;
        }
    }

    function animatePreview() {
        animId = requestAnimationFrame(animatePreview);
        controls.update();
        renderer.render(scene, camera);
    }

    function animateFullscreen() {
        if (!isFullscreen) return;
        fullAnimId = requestAnimationFrame(animateFullscreen);
        fullControls.update();
        fullRenderer.render(fullScene, fullCamera);
    }

    // Init on DOM ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        // Scripts loaded after DOM, use a small delay to ensure Three.js is ready
        setTimeout(init, 100);
    }
})();
