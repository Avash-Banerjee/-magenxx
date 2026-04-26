"""
GAUSSIAN SPLATTING — FITSCAN API SERVER
========================================
Paste this entire file as a single cell in your Colab notebook AFTER:
  - Cell 1  (nvidia-smi GPU check)
  - Cell 2  (apt-get: ffmpeg, colmap, build tools)
  - Cell 3  (pip: torch, plyfile, flask, pyngrok, pycolmap …)
  - Cell 4  (git clone gaussian-splatting + submodules)

Fill in NGROK_TOKEN below and run. The cell blocks while the server is
live (spinning indicator = server alive). Copy the printed URL into your
local FitScan .env as GAUSSIAN_COLAB_URL=<url>.
"""

# ── Config ────────────────────────────────────────────────────────────────
NGROK_TOKEN = "YOUR_NGROK_AUTHTOKEN_HERE"   # <-- fill in
GS_PORT     = 5002
EXTRACT_FPS = 3
MAX_FRAMES  = 120
ITERATIONS  = 30000
_PLY_OUT    = "/content/gs_output.ply"
_GS_REPO    = "/content/gaussian_splatting"
# ─────────────────────────────────────────────────────────────────────────

import os, shutil, subprocess, uuid, threading, logging, time, sqlite3
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from pyngrok import ngrok

os.makedirs("/content/gs_jobs", exist_ok=True)


# ══════════════════════════════════════════════════════════════════════════
#  PIPELINE FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════

def extract_frames(video_path, frames_dir, fps=3, max_frames=120):
    os.makedirs(frames_dir, exist_ok=True)
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps},scale=if(gt(iw\\,1280)\\,1280\\,-2):ih",
        "-q:v", "1", "-frames:v", str(max_frames),
        f"{frames_dir}/frame_%04d.jpg", "-y", "-loglevel", "warning",
    ]
    subprocess.run(cmd, check=False)
    frames = sorted(Path(frames_dir).glob("*.jpg"))
    print(f"[extract_frames] {len(frames)} frames")
    return frames


def run_colmap(frames_dir, dataset_path):
    import pycolmap
    dataset_path = Path(dataset_path)
    frames_dir   = Path(frames_dir)
    db_path      = dataset_path / "database.db"
    sparse_dir   = dataset_path / "sparse"

    if db_path.exists():    db_path.unlink()
    if sparse_dir.exists(): shutil.rmtree(sparse_dir)
    sparse_dir.mkdir(parents=True, exist_ok=True)

    frames = list(frames_dir.glob("*.jpg"))
    print(f"[colmap] {len(frames)} input frames")

    print("[colmap] 1/3 Feature extraction...")
    ext_opts = pycolmap.FeatureExtractionOptions()
    ext_opts.sift.max_num_features = 8192
    pycolmap.extract_features(
        database_path=db_path, image_path=frames_dir,
        camera_mode=pycolmap.CameraMode.SINGLE,
        extraction_options=ext_opts,
        reader_options=pycolmap.ImageReaderOptions(camera_model="OPENCV"),
    )
    con = sqlite3.connect(db_path)
    n_images = con.execute("SELECT COUNT(*) FROM images").fetchone()[0]
    con.close()

    print("[colmap] 2/3 Sequential matching...")
    pycolmap.match_sequential(
        database_path=db_path,
        pairing_options=pycolmap.SequentialPairingOptions(overlap=20, loop_detection=False),
    )
    con = sqlite3.connect(db_path)
    n_pairs = con.execute(
        "SELECT COUNT(*) FROM two_view_geometries WHERE rows > 0"
    ).fetchone()[0]
    con.close()
    print(f"[colmap]   pairs: {n_pairs}")

    if n_pairs < 30:
        print("[colmap]   low pairs — exhaustive matching...")
        pycolmap.match_exhaustive(database_path=db_path)

    print("[colmap] 3/3 Sparse reconstruction...")
    maps = pycolmap.incremental_mapping(
        database_path=db_path, image_path=frames_dir, output_path=sparse_dir,
    )
    if not maps:
        print("[colmap] FAILED — no model produced")
        return False

    best  = maps[max(maps, key=lambda k: maps[k].num_reg_images())]
    n_reg = best.num_reg_images()
    print(f"[colmap] registered {n_reg}/{n_images} frames, {best.num_points3D():,} 3D pts")
    out = sparse_dir / "0"
    out.mkdir(exist_ok=True)
    best.write_text(str(out))
    return n_reg >= 5


def run_undistort(dataset_path, undistorted_path):
    import pycolmap
    sparse_0 = Path(dataset_path) / "sparse" / "0"
    pycolmap.undistort_images(
        output_path=undistorted_path,
        input_path=str(sparse_0),
        image_path=str(Path(dataset_path) / "input"),
    )
    ud_sparse   = Path(undistorted_path) / "sparse"
    ud_sparse_0 = ud_sparse / "0"
    ud_sparse_0.mkdir(exist_ok=True)
    for f in ud_sparse.glob("*.bin"):
        shutil.move(str(f), str(ud_sparse_0 / f.name))
    imgs = list((Path(undistorted_path) / "images").glob("*"))
    print(f"[undistort] {len(imgs)} images")
    return len(imgs) > 0


def run_training(dataset_path, output_path, iterations=30000):
    cmd = [
        "python", "train.py",
        "-s", dataset_path, "-m", output_path,
        "--iterations", str(iterations),
        "--save_iterations", str(iterations),
        "--test_iterations", str(iterations),
    ]
    proc = subprocess.Popen(cmd, cwd=_GS_REPO,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    for line in proc.stderr:
        line = line.rstrip()
        if line: print(line)
    proc.wait()
    print(f"[train] exit {proc.returncode}")
    return proc.returncode == 0


def copy_output_ply(output_path):
    candidates = sorted(Path(output_path).rglob("point_cloud.ply"),
                        key=lambda p: p.stat().st_size, reverse=True)
    if not candidates:
        print("[export] no point_cloud.ply found")
        return ""
    best = candidates[0]
    shutil.copy(str(best), _PLY_OUT)
    print(f"[export] {best} ({best.stat().st_size/1024/1024:.1f} MB) -> {_PLY_OUT}")
    return _PLY_OUT


def run_full_pipeline(video_path, job_id,
                      fps=3, max_frames=120, iterations=30000, status_cb=None):
    import traceback
    def cb(stage, msg=""):
        print(f"[pipeline:{stage}] {msg}")
        if status_cb: status_cb(stage, msg)
    try:
        base       = f"/content/gs_jobs/{job_id}"
        frames_dir = f"{base}/input"
        undist     = f"{base}_undistorted"
        out_path   = f"{base}_output"
        os.makedirs(base, exist_ok=True)

        cb("extracting", f"fps={fps} max={max_frames}")
        if not extract_frames(video_path, frames_dir, fps, max_frames):
            cb("error", "no frames extracted"); return False

        cb("colmap")
        if not run_colmap(frames_dir, base):
            cb("error", "COLMAP failed"); return False

        cb("undistorting")
        if not run_undistort(base, undist):
            cb("error", "undistort failed"); return False

        cb("training", f"iterations={iterations}")
        if not run_training(undist, out_path, iterations):
            cb("error", "training failed"); return False

        cb("exporting")
        if not copy_output_ply(out_path):
            cb("error", "no PLY output"); return False

        cb("done", f"PLY at {_PLY_OUT}")
        return True
    except Exception as e:
        traceback.print_exc()
        cb("error", str(e))
        return False


# ══════════════════════════════════════════════════════════════════════════
#  FLASK API SERVER
# ══════════════════════════════════════════════════════════════════════════

# Kill leftover port/tunnel from previous runs
subprocess.run(["fuser", "-k", f"{GS_PORT}/tcp"],
               stderr=subprocess.DEVNULL, check=False)
time.sleep(1)
try:
    ngrok.kill()
    time.sleep(1)
except Exception:
    pass

ngrok.set_auth_token(NGROK_TOKEN)

gs_app = Flask(__name__)
logging.getLogger("werkzeug").setLevel(logging.ERROR)

_job      = {"id": None, "status": "idle", "stage": "", "message": "", "error": None}
_job_lock = threading.Lock()


def _set_job(**kw):
    with _job_lock:
        _job.update(kw)


@gs_app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "job": _job["status"]})


@gs_app.route("/status", methods=["GET"])
def status():
    ready = os.path.exists(_PLY_OUT)
    with _job_lock:
        return jsonify({
            "available":    _job["status"] == "done" and ready,
            "status":       _job["status"],
            "stage":        _job["stage"],
            "message":      _job["message"],
            "error":        _job["error"],
            "job_id":       _job["id"],
            "output_ready": ready,
        })


@gs_app.route("/process", methods=["POST"])
def process_video():
    if "video" not in request.files:
        return jsonify({"error": "no video file"}), 400
    with _job_lock:
        if _job["status"] == "processing":
            return jsonify({"error": "job already running", "job_id": _job["id"]}), 409

    job_id     = uuid.uuid4().hex[:8]
    video_file = request.files["video"]
    video_path = f"/content/gs_jobs/upload_{job_id}.mp4"
    video_file.save(video_path)

    fps        = int(request.form.get("fps",        EXTRACT_FPS))
    max_frames = int(request.form.get("max_frames", MAX_FRAMES))
    iterations = int(request.form.get("iterations", ITERATIONS))

    _set_job(id=job_id, status="processing", stage="queued",
             message="queued", error=None)

    def worker():
        try:
            ok = run_full_pipeline(
                video_path=video_path, job_id=job_id,
                fps=fps, max_frames=max_frames, iterations=iterations,
                status_cb=lambda s, m="": _set_job(stage=s, message=m),
            )
        except Exception as e:
            _set_job(status="error", stage="error", message=str(e), error=str(e))
            return
        finally:
            if os.path.exists(video_path): os.remove(video_path)
        if ok:
            _set_job(status="done", stage="done",
                     message="PLY ready at /output.ply", error=None)
        else:
            _set_job(status="error", stage="error",
                     message="pipeline failed", error="pipeline failed")

    threading.Thread(target=worker, daemon=True).start()
    return jsonify({"success": True, "job_id": job_id}), 202


@gs_app.route("/output.ply", methods=["GET"])
def get_ply():
    if not os.path.exists(_PLY_OUT):
        return jsonify({"error": "no PLY yet — check /status"}), 404
    return send_file(_PLY_OUT, mimetype="application/octet-stream",
                     as_attachment=True, download_name="gaussian_splat.ply")


# ── Launch ────────────────────────────────────────────────────────────────
tunnel  = ngrok.connect(GS_PORT)
url_str = tunnel.public_url if hasattr(tunnel, "public_url") else str(tunnel).split('"')[1]

print("\n" + "=" * 60)
print("GAUSSIAN SPLATTING API SERVER IS LIVE")
print(f"  URL    : {url_str}")
print(f"  Status : {url_str}/status")
print(f"  Upload : POST {url_str}/process")
print(f"  PLY    : {url_str}/output.ply")
print("=" * 60)
print(f"\nPaste into local FitScan .env:")
print(f"  GAUSSIAN_COLAB_URL={url_str}")
print("\nCell stays spinning = server is alive.\n")

gs_app.run(host="0.0.0.0", port=GS_PORT, use_reloader=False, threaded=True)
