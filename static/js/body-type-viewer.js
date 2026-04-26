/* ═══════════════════════════════════════
   FitScan — Body Type 3D Viewer (Modal)
   Anatomy teardown: click to peel layers
   ═══════════════════════════════════════ */

(function () {
    if (window.__btViewerInit) return;
    window.__btViewerInit = true;

    const MODELS = {
        Ectomorph: { folder: 'ectomorph', fbx: 'Flat Pelvis.fbx' },
        Mesomorph: { folder: 'mesomorph', fbx: 'Medium Pelvis.fbx' },
        Endomorph: { folder: 'endomorph', fbx: 'Tilted Pelvis.fbx' },
        Unknown:   { folder: 'mesomorph', fbx: 'Medium Pelvis.fbx' },
    };

    const LABELS = {
        Ectomorph: 'Ectomorph — Lean Build',
        Mesomorph: 'Mesomorph — Athletic Build',
        Endomorph: 'Endomorph — Full Build',
        Unknown:   'Musculoskeletal Reference',
    };

    // Teardown layers: outermost → innermost
    // Meshes matched by name keywords; unmatched go to layer 0
    const LAYER_DEFS = [
        {
            name: 'Skin & Surface',
            icon: '🧍',
            re: /skin|body|hair|eye|face|head|pant|cloth|shirt|shoe|nail|lip|ear|nose|brow/i,
        },
        {
            name: 'Muscles',
            icon: '💪',
            re: /muscle|bicep|tricep|pec|quad|hamstring|calf|deltoid|trap|lat|glut|abdom|core|oblique|forearm|delt|gastro|soleus|tibial|fibula_m|sartor|gracil|adduc|tensor|vastus|rectus|semimem|semiten|iliop|psoas|erect|rhomboid|serratus|subscap|supraspina|infraspina|teres/i,
        },
        {
            name: 'Tendons & Organs',
            icon: '🫀',
            re: /tendon|ligament|cartilage|fascia|organ|liver|lung|heart|intestin|stomach|kidney|spleen|bladder|pancrea|diaphragm|aorta|vein|artery|nerve|circulat|digest|respirat|urin|lymph|adrenal/i,
        },
        {
            name: 'Skeleton',
            icon: '🦴',
            re: /bone|spine|rib|pelvis|skull|mandible|femur|tibia|fibula|humerus|radius|ulna|vertebr|sternum|clavicle|scapula|skeleton|patella|metatars|metacarp|phalange|calcaneus|talus|navicular|cuneiform|cuboid|sacrum|coccyx|ilium|ischium|pubis|atlas|axis/i,
        },
    ];

    const MODEL_BASE = '/static/models/body_types/';
    const bodyType   = (window.SCAN_DATA && window.SCAN_DATA.body_type) || 'Unknown';
    const modelDef   = MODELS[bodyType] || MODELS.Unknown;

    // ── Styles ──
    const style = document.createElement('style');
    style.textContent = `
        #btModal {
            display: none; position: fixed; inset: 0;
            z-index: 9999; background: rgba(0,0,0,0.78);
            align-items: center; justify-content: center;
        }
        #btModal.open { display: flex; }
        #btViewport {
            position: relative;
            width: min(580px, 92vw); height: min(660px, 88vh);
            background: #f0f9ff; border-radius: 18px;
            overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.45);
            display: flex; flex-direction: column;
        }
        #btCanvas { display: block; width: 100%; flex: 1; min-height: 0; }
        #btModalClose {
            position: absolute; top: 12px; right: 14px;
            background: rgba(0,0,0,0.45); border: none; color: #fff;
            font-size: 1.2rem; width: 34px; height: 34px;
            border-radius: 50%; cursor: pointer; z-index: 20;
            line-height: 34px; text-align: center; padding: 0;
        }
        #btModalHint {
            position: absolute; top: 14px; left: 50%;
            transform: translateX(-50%);
            background: rgba(0,0,0,0.38); color: #e2e8f0;
            font-size: 0.68rem; padding: 3px 12px;
            border-radius: 12px; white-space: nowrap;
            z-index: 10; pointer-events: none;
        }
        /* ── Layer status bar (bottom) ── */
        #btLayerBar {
            flex-shrink: 0;
            background: rgba(15,23,42,0.92);
            padding: 10px 16px;
            display: flex; align-items: center; gap: 12px;
            z-index: 15;
        }
        #btLayerIcon { font-size: 1.3rem; flex-shrink: 0; }
        #btLayerInfo { flex: 1; min-width: 0; }
        #btLayerName {
            color: #e2e8f0; font-size: 0.8rem; font-weight: 700;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        #btLayerSub {
            color: #64748b; font-size: 0.66rem; margin-top: 1px;
        }
        #btLayerDots { display: flex; gap: 5px; flex-shrink: 0; }
        .bt-dot {
            width: 8px; height: 8px; border-radius: 50%;
            background: #334155; transition: background 0.3s;
        }
        .bt-dot.active { background: #06b6d4; }
        .bt-dot.done   { background: #1e3a4a; }
        #btResetBtn {
            padding: 4px 12px; background: rgba(6,182,212,0.18);
            color: #06b6d4; border: 1px solid rgba(6,182,212,0.4);
            border-radius: 8px; font-size: 0.7rem; font-weight: 700;
            cursor: pointer; flex-shrink: 0; white-space: nowrap;
        }
        #btResetBtn:hover { background: rgba(6,182,212,0.3); }
        /* ── Loading overlay ── */
        #btModalLoading {
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            background: rgba(240,249,255,0.96); z-index: 18;
        }
        @keyframes btSpin { to { transform: rotate(360deg); } }
        .bt-spinner {
            width: 44px; height: 44px;
            border: 3px solid #e2e8f0; border-top-color: #06b6d4;
            border-radius: 50%; animation: btSpin 0.9s linear infinite;
        }
        .bt-progress-track {
            width: 180px; height: 4px; background: #e2e8f0;
            border-radius: 4px; margin-top: 14px; overflow: hidden;
        }
        .bt-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #06b6d4, #3b82f6);
            border-radius: 4px; width: 0%; transition: width 0.2s;
        }
        /* ── Fade-out flash ring on click ── */
        #btClickRing {
            position: absolute; pointer-events: none; z-index: 12;
            width: 60px; height: 60px; border-radius: 50%;
            border: 2px solid #06b6d4; opacity: 0;
            transform: translate(-50%, -50%) scale(0.5);
            transition: opacity 0.4s, transform 0.4s;
        }
        #btClickRing.flash {
            opacity: 1; transform: translate(-50%, -50%) scale(1.5);
        }
    `;
    document.head.appendChild(style);

    const modal = document.createElement('div');
    modal.id = 'btModal';
    modal.innerHTML = `
        <div id="btViewport">
            <canvas id="btCanvas"></canvas>
            <div id="btModalLoading">
                <div class="bt-spinner"></div>
                <p style="margin-top:12px;font-size:0.84rem;color:#0891b2;font-weight:700;">
                    Loading ${bodyType} model…</p>
                <p style="margin-top:4px;font-size:0.72rem;color:#64748b;" id="btLoadPct">Preparing…</p>
                <div class="bt-progress-track">
                    <div class="bt-progress-bar" id="btProgressBar"></div>
                </div>
            </div>
            <button id="btModalClose">✕</button>
            <div id="btModalHint">Drag to rotate · Scroll to zoom · Click model to peel layer</div>
            <div id="btClickRing"></div>
            <div id="btLayerBar">
                <div id="btLayerIcon">🧍</div>
                <div id="btLayerInfo">
                    <div id="btLayerName">Full Body</div>
                    <div id="btLayerSub">Click model to remove outer layer</div>
                </div>
                <div id="btLayerDots"></div>
                <button id="btResetBtn">↺ Reset</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // ── Three.js state ──
    let scene, camera, renderer, mixer, clock, animId, controls;
    let isLoaded = false, isLoading = false, isOpen = false;

    // ── Teardown state ──
    let teardownLayers  = [];   // [{ name, icon, meshes[] }]
    let currentLayer    = 0;    // next layer to remove
    let isFading        = false;

    const canvas     = document.getElementById('btCanvas');
    const viewport   = document.getElementById('btViewport');
    const loadingEl  = document.getElementById('btModalLoading');
    const hintEl     = document.getElementById('btModalHint');
    const layerNameEl = document.getElementById('btLayerName');
    const layerSubEl  = document.getElementById('btLayerSub');
    const layerIconEl = document.getElementById('btLayerIcon');
    const dotsEl      = document.getElementById('btLayerDots');
    const clickRing   = document.getElementById('btClickRing');

    // ── Build teardown layers from loaded FBX ──
    function buildTeardownLayers(root) {
        const allMeshes = [];
        root.traverse(ch => { if (ch.isMesh) allMeshes.push(ch); });

        // Enable transparency on every mesh material up front
        allMeshes.forEach(m => {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach(mat => {
                if (mat) { mat.transparent = true; mat.opacity = 1; mat.needsUpdate = true; }
            });
        });

        // Assign each mesh to a layer bucket
        const buckets = LAYER_DEFS.map(def => ({ name: def.name, icon: def.icon, meshes: [] }));
        const unmatched = [];

        allMeshes.forEach(mesh => {
            const key = (mesh.name + ' ' + (
                Array.isArray(mesh.material)
                    ? mesh.material.map(m => m && m.name || '').join(' ')
                    : (mesh.material && mesh.material.name || '')
            )).toLowerCase();

            let placed = false;
            for (let i = 0; i < LAYER_DEFS.length; i++) {
                if (LAYER_DEFS[i].re.test(key)) {
                    buckets[i].meshes.push(mesh);
                    placed = true;
                    break;
                }
            }
            if (!placed) unmatched.push(mesh);
        });

        // Unmatched → skin layer (index 0, outermost)
        buckets[0].meshes.push(...unmatched);

        // Filter empty buckets
        const layers = buckets.filter(b => b.meshes.length > 0);
        console.log('[BTViewer] Teardown layers:', layers.map(l => `${l.name}(${l.meshes.length})`).join(', '));
        return layers;
    }

    // ── Fade a layer's meshes in or out ──
    function fadeLayer(meshes, show, onDone) {
        const DURATION = 550;
        const startTime = performance.now();
        const from = show ? 0 : 1;
        const to   = show ? 1 : 0;

        if (show) meshes.forEach(m => { m.visible = true; });

        function tick(now) {
            const t    = Math.min((now - startTime) / DURATION, 1);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            const val  = from + (to - from) * ease;

            meshes.forEach(m => {
                const mats = Array.isArray(m.material) ? m.material : [m.material];
                mats.forEach(mat => { if (mat) { mat.opacity = val; mat.needsUpdate = true; } });
            });

            if (t < 1) {
                requestAnimationFrame(tick);
            } else {
                if (!show) meshes.forEach(m => { m.visible = false; });
                if (onDone) onDone();
            }
        }
        requestAnimationFrame(tick);
    }

    // ── Build dot indicators ──
    function buildDots() {
        dotsEl.innerHTML = '';
        teardownLayers.forEach((_, i) => {
            const d = document.createElement('div');
            d.className = 'bt-dot' + (i === 0 ? ' active' : '');
            d.dataset.i = i;
            dotsEl.appendChild(d);
        });
    }

    function updateUI() {
        const dots = dotsEl.querySelectorAll('.bt-dot');
        dots.forEach((d, i) => {
            d.className = 'bt-dot' +
                (i < currentLayer  ? ' done'   : '') +
                (i === currentLayer && currentLayer < teardownLayers.length ? ' active' : '');
        });

        if (currentLayer === 0) {
            layerIconEl.textContent = '🧍';
            layerNameEl.textContent = 'Full Body';
            layerSubEl.textContent  = 'Click model to remove outer layer';
        } else if (currentLayer >= teardownLayers.length) {
            const last = teardownLayers[teardownLayers.length - 1];
            layerIconEl.textContent = last.icon;
            layerNameEl.textContent = last.name + ' revealed';
            layerSubEl.textContent  = 'Click model to rebuild · or ↺ Reset';
        } else {
            const removed = teardownLayers[currentLayer - 1];
            const showing = teardownLayers[currentLayer];
            layerIconEl.textContent = showing.icon;
            layerNameEl.textContent = showing.name + ' layer';
            layerSubEl.textContent  = `Removed: ${removed.name} · Click to peel next`;
        }
    }

    // ── Advance teardown on click ──
    function advanceTeardown(clickX, clickY) {
        if (isFading || !teardownLayers.length) return;

        // Flash ring at click position
        clickRing.style.left = clickX + 'px';
        clickRing.style.top  = clickY + 'px';
        clickRing.classList.add('flash');
        setTimeout(() => clickRing.classList.remove('flash'), 420);

        if (currentLayer >= teardownLayers.length) {
            // Reset: restore all layers
            isFading = true;
            let pending = teardownLayers.filter(l => !l.meshes[0]?.visible).length;
            if (pending === 0) { currentLayer = 0; isFading = false; updateUI(); return; }
            teardownLayers.forEach(layer => {
                if (!layer.meshes[0]?.visible) {
                    fadeLayer(layer.meshes, true, () => {
                        pending--;
                        if (pending === 0) { currentLayer = 0; isFading = false; updateUI(); }
                    });
                }
            });
            return;
        }

        isFading = true;
        const layer = teardownLayers[currentLayer];
        fadeLayer(layer.meshes, false, () => {
            currentLayer++;
            isFading = false;
            updateUI();
        });
        updateUI();
    }

    // ── Canvas click — distinguish from OrbitControls drag ──
    let _md = { x: 0, y: 0 }, _isDrag = false;
    canvas.addEventListener('mousedown', e => {
        _md.x = e.clientX; _md.y = e.clientY; _isDrag = false;
    });
    canvas.addEventListener('mousemove', e => {
        if (Math.abs(e.clientX - _md.x) > 5 || Math.abs(e.clientY - _md.y) > 5) _isDrag = true;
    });
    canvas.addEventListener('click', e => {
        if (_isDrag) return;
        const rect = canvas.getBoundingClientRect();
        advanceTeardown(e.clientX - rect.left, e.clientY - rect.top);
    });

    document.getElementById('btResetBtn').addEventListener('click', () => {
        if (isFading) return;
        currentLayer = teardownLayers.length; // trigger full reset
        advanceTeardown(viewport.clientWidth / 2, viewport.clientHeight / 2);
    });

    // ── Three.js init ──
    function initThree() {
        clock  = new THREE.Clock();
        scene  = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f9ff);

        const w = viewport.clientWidth  || 580;
        const h = (viewport.clientHeight || 660) - 56; // minus layer bar

        camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 5000);
        camera.position.set(0, 120, 380);
        camera.lookAt(0, 100, 0);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
        renderer.outputEncoding    = THREE.sRGBEncoding;

        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(150, 300, 200); sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024); scene.add(sun);
        const fill = new THREE.DirectionalLight(0xaaddff, 0.5);
        fill.position.set(-150, 120, -100); scene.add(fill);
        const rim = new THREE.DirectionalLight(0x22d3ee, 0.3);
        rim.position.set(0, 60, -250); scene.add(rim);

        const gnd = new THREE.Mesh(
            new THREE.CircleGeometry(250, 64),
            new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.9 })
        );
        gnd.rotation.x = -Math.PI / 2; gnd.receiveShadow = true; scene.add(gnd);

        const grid = new THREE.GridHelper(500, 30, 0x06b6d4, 0xbae6fd);
        grid.position.y = 0.3; grid.material.opacity = 0.18;
        grid.material.transparent = true; scene.add(grid);

        if (typeof THREE.OrbitControls !== 'undefined') {
            controls = new THREE.OrbitControls(camera, canvas);
            controls.target.set(0, 100, 0);
            controls.enableDamping = true; controls.dampingFactor = 0.07;
            controls.minDistance = 60; controls.maxDistance = 1200;
            controls.maxPolarAngle = Math.PI / 1.8; controls.update();
        }
    }

    function resizeRenderer() {
        if (!renderer) return;
        const w = viewport.clientWidth  || 580;
        const h = Math.max((viewport.clientHeight || 660) - 56, 100);
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function loadModel() {
        if (isLoading || isLoaded) { if (isLoaded) startLoop(); return; }
        isLoading = true;
        loadingEl.style.display = 'flex';

        if (!scene) {
            try { initThree(); }
            catch (e) {
                isLoading = false;
                loadingEl.innerHTML = `<p style="color:#dc2626;font-weight:700;">Renderer failed: ${e.message}</p>`;
                return;
            }
        }

        if (typeof THREE.FBXLoader === 'undefined') {
            isLoading = false;
            loadingEl.innerHTML = `<p style="color:#dc2626;font-weight:700;">FBXLoader not found.</p>`;
            return;
        }

        const folderUrl = MODEL_BASE + encodeURIComponent(modelDef.folder) + '/';
        const fbxUrl    = folderUrl + encodeURIComponent(modelDef.fbx);
        const fbmFolder = modelDef.fbx.replace(/\.fbx$/i, '') + '.fbm';
        const fbmUrl    = folderUrl + encodeURIComponent(fbmFolder) + '/';

        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
            if (url.startsWith('data:') || url.startsWith('blob:')) return url;
            const normalized = url.replace(/\\/g, '/');
            const filename   = normalized.split('/').pop();
            if (!filename) return url;
            const ext = filename.split('.').pop().toLowerCase();
            if (ext === 'tx') return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElETkSuQmCC';
            if (['jpg','jpeg','png','tga','bmp'].includes(ext)) {
                if (normalized.includes('/static/models/body_types/') && normalized.includes('.fbm/')) return url;
                return fbmUrl + encodeURIComponent(filename);
            }
            return url;
        });

        const loader = new THREE.FBXLoader(manager);
        const pctEl  = document.getElementById('btLoadPct');
        const barEl  = document.getElementById('btProgressBar');

        loader.load(
            fbxUrl,
            (root) => {
                isLoading = false; isLoaded = true;
                loadingEl.style.display = 'none';
                addModelToScene(root);
                startLoop();
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    const pct = Math.round(xhr.loaded / xhr.total * 100);
                    if (pctEl) pctEl.textContent = pct + '% downloaded';
                    if (barEl) barEl.style.width = pct + '%';
                } else {
                    if (pctEl) pctEl.textContent = (xhr.loaded / 1048576).toFixed(1) + ' MB…';
                }
            },
            (err) => {
                isLoading = false;
                loadingEl.innerHTML = `<p style="color:#dc2626;font-weight:700;text-align:center;">
                    Failed to load model.<br>
                    <span style="font-size:0.75rem;color:#64748b;">${err && err.message ? err.message : err}</span></p>`;
                console.error('[BTViewer] Load error:', err, fbxUrl);
            }
        );
    }

    function addModelToScene(root) {
        const box    = new THREE.Box3().setFromObject(root);
        const size   = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale  = maxDim > 0.001 ? 170 / maxDim : 1;

        root.scale.setScalar(scale);
        const center = box.getCenter(new THREE.Vector3());
        root.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        root.traverse(child => {
            if (!child.isMesh) return;
            child.castShadow = child.receiveShadow = true;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
                if (!m) return;
                m.side = THREE.DoubleSide;
                if (!m.map) m.color = new THREE.Color(0xe2e8f0);
                m.needsUpdate = true;
            });
        });

        scene.add(root);

        if (root.animations && root.animations.length > 0) {
            mixer = new THREE.AnimationMixer(root);
            mixer.clipAction(root.animations[0]).setEffectiveTimeScale(0.4).play();
        }

        const h = size.y * scale;
        camera.position.set(0, h * 0.5, h * 1.9);
        camera.lookAt(0, h * 0.4, 0);
        if (controls) { controls.target.set(0, h * 0.4, 0); controls.update(); }

        // Build teardown layers after model is in scene
        teardownLayers = buildTeardownLayers(root);
        currentLayer   = 0;
        buildDots();
        updateUI();

        console.log('[BTViewer] Ready. Scale:', scale.toFixed(4));
    }

    function startLoop() {
        if (animId) return;
        function loop() {
            if (!isOpen) { animId = null; return; }
            animId = requestAnimationFrame(loop);
            const dt = clock.getDelta();
            if (mixer)    mixer.update(dt);
            if (controls) controls.update();
            renderer.render(scene, camera);
        }
        loop();
    }

    function openModal() {
        isOpen = true;
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        window.addEventListener('resize', resizeRenderer);
        resizeRenderer();
        loadModel();
    }

    function closeModal() {
        isOpen = false;
        modal.classList.remove('open');
        document.body.style.overflow = '';
        window.removeEventListener('resize', resizeRenderer);
        animId = null;
    }

    document.getElementById('btModalClose').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closeModal(); });

    // ── "View 3D" button on dashboard card ──
    const container = document.getElementById('avatarContainer');
    if (container) {
        const cardParent = container.closest('.body-scan-card') || container.parentElement;
        if (cardParent) {
            const btn = document.createElement('button');
            btn.id = 'btOpenBtn';
            btn.textContent = '🦴 View 3D Anatomy · Teardown Mode';
            btn.style.cssText = [
                'display:block', 'margin:10px auto 0',
                'padding:8px 22px',
                'background:linear-gradient(135deg,#06b6d4,#3b82f6)',
                'color:#fff', 'border:none', 'border-radius:10px',
                'font-size:0.82rem', 'font-weight:700',
                'cursor:pointer', 'letter-spacing:0.03em',
                'box-shadow:0 2px 8px rgba(6,182,212,0.35)',
                'transition:opacity 0.2s',
            ].join(';');
            btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
            btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
            btn.addEventListener('click', openModal);
            cardParent.appendChild(btn);
        }
    }

    // Silent preload
    if ('requestIdleCallback' in window) {
        requestIdleCallback(() => loadModel(), { timeout: 5000 });
    } else {
        setTimeout(() => loadModel(), 3000);
    }

})();
