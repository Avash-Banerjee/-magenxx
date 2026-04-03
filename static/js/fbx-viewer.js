/* ═══════════════════════════════════════
   FitScan — 3D Exercise Animation Viewer
   Uses local FBX muscle-anatomy animations
   mapped by exercise muscle groups.
   ═══════════════════════════════════════ */

const FBXViewer = (function () {
    let scene, camera, renderer, mixer, clock, animationId;
    let modal, canvas3d, titleEl, closeBtn, loadingEl;
    let isOpen = false;

    // ── Animation catalog: folder → FBX file + muscle keywords ──
    const ANIM_BASE = "/static/models/animations/";
    const ANIMATIONS = [
        { folder: "abdominal",      fbx: "Abdomain excercise.fbx",                          keywords: ["abs", "abdominal", "core", "crunch", "sit-up", "sit up", "plank", "oblique"] },
        { folder: "back_row",       fbx: "Bent-Over Reverse-Grip Barbell Row muscle.fbx",   keywords: ["back", "lat", "lats", "latissimus", "row", "pull-up", "pullup", "pull up", "chin-up", "chin up"] },
        { folder: "back_single_arm",fbx: "Bent_Over_Single_Arm_Long_Barbell_Raw_muscles.fbx",keywords: ["single arm", "dumbbell row", "one arm"] },
        { folder: "bicep",          fbx: "Bicep.fbx",                                       keywords: ["bicep", "biceps", "curl", "arm curl", "preacher", "hammer curl"] },
        { folder: "hamstring",      fbx: "Hamstring excercise.fbx",                          keywords: ["hamstring", "hamstrings", "leg curl", "deadlift", "romanian", "glute-ham", "hip hinge"] },
        { folder: "calves",         fbx: "Male_Anatomy_Calves.fbx",                          keywords: ["calves", "calf", "calf raise", "gastrocnemius", "soleus"] },
        { folder: "deltoid",        fbx: "Male_Anatomy_Deltoid.fbx",                         keywords: ["deltoid", "deltoids", "shoulder", "shoulders", "lateral raise", "overhead press", "military press", "front raise", "rear delt"] },
        { folder: "pectoral",       fbx: "Male_Anatomy_Pectorial.fbx",                       keywords: ["chest", "pectoral", "pectorals", "pec", "bench press", "bench", "push-up", "push up", "pushup", "fly", "flye", "dumbbell press"] },
        { folder: "quadriceps",     fbx: "Male_Anatomy_Quadruceps Animation.fbx",             keywords: ["quadriceps", "quads", "quad", "squat", "leg press", "lunge", "lunges", "leg extension", "front squat", "goblet"] },
        { folder: "trapezius",      fbx: "TrapiziusMuscle.fbx",                               keywords: ["trapezius", "traps", "trap", "shrug", "shrugs", "upper back", "upright row"] },
    ];

    // Default animation when no muscle group match is found
    const DEFAULT_ANIM = ANIMATIONS.find(a => a.folder === "pectoral");

    /**
     * Find the best matching animation given an exercise name and its muscle groups.
     */
    function findAnimation(exerciseName, muscleGroups) {
        const name = (exerciseName || "").toLowerCase();
        const muscles = (muscleGroups || []).map(m => m.toLowerCase());

        let bestMatch = null;
        let bestScore = 0;

        for (const anim of ANIMATIONS) {
            let score = 0;
            for (const kw of anim.keywords) {
                // Check exercise name
                if (name.includes(kw)) score += 3;
                // Check muscle groups
                for (const m of muscles) {
                    if (m.includes(kw) || kw.includes(m)) score += 2;
                }
            }
            if (score > bestScore) {
                bestScore = score;
                bestMatch = anim;
            }
        }

        return bestMatch || DEFAULT_ANIM;
    }

    function init() {
        modal     = document.getElementById("fbxModal");
        canvas3d  = document.getElementById("fbxCanvas");
        titleEl   = document.getElementById("fbxTitle");
        closeBtn  = document.getElementById("fbxClose");
        loadingEl = document.getElementById("fbxLoading");

        if (!modal || !canvas3d) return;

        closeBtn.addEventListener("click", close);
        modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) close(); });

        clock = new THREE.Clock();
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f9ff);

        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
        camera.position.set(0, 100, 250);
        camera.lookAt(0, 80, 0);

        renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.outputEncoding = THREE.sRGBEncoding;

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(100, 200, 150);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(1024, 1024);
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.camera.left = -200;
        dirLight.shadow.camera.right = 200;
        dirLight.shadow.camera.top = 200;
        dirLight.shadow.camera.bottom = -200;
        scene.add(dirLight);

        const fill = new THREE.DirectionalLight(0x88ccff, 0.4);
        fill.position.set(-100, 100, -50);
        scene.add(fill);

        const rim = new THREE.DirectionalLight(0x22d3ee, 0.3);
        rim.position.set(0, 50, -150);
        scene.add(rim);

        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(150, 64),
            new THREE.MeshStandardMaterial({ color: 0xe0f2fe, roughness: 0.8 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        scene.add(ground);

        const grid = new THREE.GridHelper(300, 20, 0x06b6d4, 0xbae6fd);
        grid.position.y = 0.1;
        grid.material.opacity = 0.3;
        grid.material.transparent = true;
        scene.add(grid);

        if (typeof THREE.OrbitControls !== "undefined") {
            const controls = new THREE.OrbitControls(camera, canvas3d);
            controls.target.set(0, 80, 0);
            controls.enableDamping = true;
            controls.dampingFactor = 0.08;
            controls.minDistance = 50;
            controls.maxDistance = 800;
            controls.maxPolarAngle = Math.PI / 2;
            controls.update();
            FBXViewer._controls = controls;
        }
    }

    function open(exerciseName, muscleGroups) {
        if (!modal) return;
        isOpen = true;
        modal.classList.add("open");
        titleEl.textContent = exerciseName;
        loadingEl.style.display = "flex";
        loadingEl.innerHTML = `
            <div class="fbx-loading-spinner"></div>
            <p>Loading 3D Animation...</p>
            <div class="fbx-progress-track">
                <div class="fbx-progress-bar" id="fbxProgress"></div>
            </div>`;
        document.body.style.overflow = "hidden";

        resizeRenderer();
        window.addEventListener("resize", resizeRenderer);

        // Find and load the matching animation
        const anim = findAnimation(exerciseName, muscleGroups);
        loadModel(anim);
        animate();
    }

    function close() {
        isOpen = false;
        modal.classList.remove("open");
        document.body.style.overflow = "";
        window.removeEventListener("resize", resizeRenderer);
        if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
        clearModel();
    }

    function clearModel() {
        const toRemove = [];
        scene.children.forEach(child => {
            if (child.type === "Group" || child.type === "Scene") toRemove.push(child);
        });
        toRemove.forEach(obj => scene.remove(obj));
        mixer = null;
    }

    function addModelToScene(root, animations) {
        loadingEl.style.display = "none";

        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = maxDim > 0 ? 150 / maxDim : 1;
        root.scale.setScalar(scale);

        const center = box.getCenter(new THREE.Vector3());
        root.position.x = -center.x * scale;
        root.position.y = -box.min.y * scale;
        root.position.z = -center.z * scale;

        root.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        scene.add(root);

        if (animations && animations.length > 0) {
            mixer = new THREE.AnimationMixer(root);
            // Play all animation clips (some FBX files have multiple clips)
            for (const clip of animations) {
                mixer.clipAction(clip).play();
            }
        }

        const h = size.y * scale;
        camera.position.set(0, h * 0.6, h * 1.8);
        camera.lookAt(0, h * 0.4, 0);
        if (FBXViewer._controls) {
            FBXViewer._controls.target.set(0, h * 0.4, 0);
            FBXViewer._controls.update();
        }
    }

    /**
     * After the FBX loads, manually apply diffuse textures from the .fbm folder
     * to meshes whose materials have no diffuse map (because the FBX only
     * referenced .tx bump files that don't exist on disk).
     */
    function applyDiffuseTextures(root, folderUrl, fbmFolder) {
        // Known diffuse texture files that ship in the .fbm folders.
        // We map a body-part keyword → texture filename so we can match
        // meshes/materials by name.
        const TEXTURE_MAP = [
            { keywords: ["arm", "bicep", "tricep", "forearm", "hand", "wrist", "deltoid"],  file: "Muscles_Arms_Dif.jpg" },
            { keywords: ["torso", "chest", "pec", "abdom", "oblique", "core", "trunk", "trap", "lat"],  file: "Muscles_Torso_Dif.jpg" },
            { keywords: ["leg", "quad", "hamstring", "calf", "calves", "glut", "thigh", "knee", "shin", "foot"], file: "Muscles_Legs_Dif.jpg" },
            { keywords: ["head", "face", "neck", "jaw", "skull"],  file: "Muscles_Head_Dif.jpg" },
            { keywords: ["diaphragm"],  file: "Muscles_Diaphragm_Dif.jpg" },
            { keywords: ["eye"],        file: "Nervous_Eye_Ball_Dif.png" },
            { keywords: ["skin", "body", "pant", "male_body", "human"],  file: "texture_with_pant_2048.png" },
        ];

        const fbmUrl = folderUrl + encodeURIComponent(fbmFolder) + "/";
        const textureLoader = new THREE.TextureLoader();
        const textureCache = {};   // url → THREE.Texture (avoid loading the same file twice)

        function loadTex(filename) {
            const url = fbmUrl + encodeURIComponent(filename);
            if (textureCache[url]) return textureCache[url];
            const tex = textureLoader.load(url, (t) => {
                t.encoding = THREE.sRGBEncoding;
                t.needsUpdate = true;
            }, undefined, () => {
                console.warn("[FBXViewer] Could not load texture:", url);
            });
            tex.encoding = THREE.sRGBEncoding;
            textureCache[url] = tex;
            return tex;
        }

        // Pre-load every texture in the manifest so they're ready
        const allTexFiles = [...new Set(TEXTURE_MAP.map(t => t.file))];
        allTexFiles.forEach(f => loadTex(f));

        function bestTexture(name) {
            const n = name.toLowerCase();
            for (const entry of TEXTURE_MAP) {
                for (const kw of entry.keywords) {
                    if (n.includes(kw)) return loadTex(entry.file);
                }
            }
            return null;
        }

        let applied = 0;
        root.traverse((child) => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((mat) => {
                // ── Step 1: Fix all materials ──
                // The FBX references .tx bump textures that we blocked with a 1px
                // transparent pixel. Clear out any bump/normal maps so they don't
                // interfere, force colors to white, and ensure double-sided rendering.
                if (mat.color) mat.color.setHex(0xffffff);
                if (mat.emissive) mat.emissive.setHex(0x000000);
                if (mat.specular) mat.specular.setHex(0x222222);
                // Remove broken bump/normal maps (loaded from blocked .tx files)
                mat.bumpMap = null;
                mat.normalMap = null;
                mat.specularMap = null;
                mat.side = THREE.DoubleSide;
                mat.needsUpdate = true;

                // ── Step 2: Apply diffuse textures ──
                // If the material already has a working diffuse map, skip
                if (mat.map && mat.map.image && mat.map.image.width > 0) return;

                const matName = (mat.name || "").toLowerCase();
                const meshName = (child.name || "").toLowerCase();
                const combined = matName + " " + meshName;

                // Try keyword-based matching first
                let tex = bestTexture(mat.name) || bestTexture(child.name);

                // Broader fallbacks based on anatomy naming
                if (!tex && /muscle|diaph/i.test(combined))
                    tex = loadTex("Muscles_Torso_Dif.jpg");
                if (!tex && /skin|body|male|pant|human/i.test(combined))
                    tex = loadTex("texture_with_pant_2048.png");

                // For anatomy parts without a texture, set distinctive colors
                // so they're visible (not dark/black)
                if (!tex) {
                    if (/skeletal|bone|spine|rib|pelvis|skull|mandible|limb/i.test(combined)) {
                        mat.color.setHex(0xe8dcc8);   // bone off-white
                    } else if (/heart|cardio|circulat|vein|arter|blood|aorta/i.test(combined)) {
                        mat.color.setHex(0xcc4444);    // red vessels
                    } else if (/nerve|nervous|brain|spinal/i.test(combined)) {
                        mat.color.setHex(0xd4c89e);    // yellowish nerve
                    } else if (/digest|stomach|intestin|liver|colon|pancrea|gall|bladder|esoph/i.test(combined)) {
                        mat.color.setHex(0xc9907a);    // pinkish organ
                    } else if (/lung|respirat|trachea|larynx/i.test(combined)) {
                        mat.color.setHex(0xd4a0a0);    // light pink
                    } else if (/lymph|spleen|urinar|kidney|adrenal/i.test(combined)) {
                        mat.color.setHex(0xb88888);    // muted pink
                    } else if (/hair/i.test(combined)) {
                        mat.color.setHex(0x2a1a0a);    // dark brown hair
                    }
                    // If still no match — remains white, which is fine
                    mat.needsUpdate = true;
                    return;
                }

                if (tex) {
                    mat.map = tex;
                    if (mat.color) mat.color.setHex(0xffffff);
                    mat.needsUpdate = true;
                    applied++;
                }
            });
        });

        console.log(`[FBXViewer] Applied ${applied} diffuse textures from .fbm folder`);
    }

    function loadModel(anim) {
        clearModel();

        // Base folder for this animation (URL-encoded for spaces)
        const folderUrl = ANIM_BASE + encodeURIComponent(anim.folder) + "/";
        const fbxUrl = folderUrl + encodeURIComponent(anim.fbx);

        // The .fbm folder name matches the FBX filename without .fbx extension
        const fbmFolder = anim.fbx.replace(/\.fbx$/i, "") + ".fbm";

        // Custom LoadingManager to fix texture paths.
        // FBX files embed absolute paths like "E:/MOHAN MAJHI/.../Bicep.fbm/Muscles_Arms_Dif.jpg"
        // or relative paths like "Bicep.fbm/Muscles_Arms_Dif.jpg".
        // We intercept ALL texture URLs and rewrite them to the correct local .fbm folder.
        // .tx files (Maya bump maps) are blocked — we only need diffuse textures,
        // which we apply manually in applyDiffuseTextures() after loading.
        const manager = new THREE.LoadingManager();
        manager.setURLModifier((url) => {
            // Skip data URIs and blob URLs
            if (url.startsWith("data:") || url.startsWith("blob:")) return url;

            // Normalize backslashes
            const normalized = url.replace(/\\/g, "/");

            // Extract just the filename from whatever path the FBX embedded
            const filename = normalized.split("/").pop();
            if (!filename) return url;

            // Check if this is an image/texture file
            const ext = filename.split(".").pop().toLowerCase();

            // BLOCK .tx files entirely — they're Maya bump maps that don't exist
            // on disk, and loading diffuse textures into bump slots causes dark
            // rendering artifacts. We handle diffuse textures manually instead.
            if (ext === "tx") {
                console.log("[FBXViewer] Blocking .tx bump map request:", filename);
                return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRElETkSuQmCC";
            }

            if (["jpg", "jpeg", "png", "tga", "bmp", "gif"].includes(ext)) {
                // If URL already correctly points to our .fbm folder, leave it
                if (normalized.includes("/static/models/animations/") && normalized.includes(".fbm/")) {
                    return url;
                }
                // Rewrite to the local .fbm folder
                const fixed = folderUrl + encodeURIComponent(fbmFolder) + "/" + encodeURIComponent(filename);
                console.log("[FBXViewer] Texture redirect:", url.substring(0, 60) + "...", "→", fixed);
                return fixed;
            }

            return url;
        });

        const loader = new THREE.FBXLoader(manager);
        loader.load(
            fbxUrl,
            (fbx) => {
                // After loading, manually apply diffuse textures for any materials
                // that are still missing their diffuse maps
                applyDiffuseTextures(fbx, folderUrl, fbmFolder);
                addModelToScene(fbx, fbx.animations);
            },
            (xhr) => {
                if (xhr.lengthComputable) {
                    const bar = document.getElementById("fbxProgress");
                    if (bar) bar.style.width = Math.round((xhr.loaded / xhr.total) * 100) + "%";
                }
            },
            (error) => {
                console.error("FBX load error:", error);
                loadingEl.innerHTML = `
                    <div style="text-align:center; color:var(--text-muted);">
                        <div style="font-size:3rem; margin-bottom:12px;">\u{1F3CB}</div>
                        <p style="font-weight:600;">Could not load 3D model</p>
                        <p style="font-size:0.82rem; margin-top:8px;">Animation file may be missing or too large.</p>
                    </div>`;
            }
        );
    }

    function animate() {
        if (!isOpen) return;
        animationId = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) mixer.update(delta);
        if (FBXViewer._controls) FBXViewer._controls.update();
        renderer.render(scene, camera);
    }

    function resizeRenderer() {
        const container = document.getElementById("fbxViewport");
        if (!container) return;
        const w = container.clientWidth;
        const h = container.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    return { init, open, close, _controls: null };
})();

document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("fbxModal")) FBXViewer.init();
});
