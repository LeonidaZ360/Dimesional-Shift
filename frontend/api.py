from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import subprocess
import asyncio
import glob
import uuid
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

jobs_db = {}
UPLOAD_DIR = "uploaded_videos"
os.makedirs(UPLOAD_DIR, exist_ok=True)

def run_real_pipeline(job_id: str, video_path: str, fps: int = 2, iterations: int = 7000):
    base_dir = f"C:\\Users\\Leonard\\projects\\3d-scan-test\\{job_id}"
    frames_dir = os.path.join(base_dir, "frames")
    sparse_dir = os.path.join(base_dir, "sparse")
    processed_dir = os.path.join(base_dir, "processed")
    exports_dir = os.path.join(base_dir, "exports")
    colmap_db = os.path.join(base_dir, "database.db")
    colmap_exe = r"C:\colmap-cuda\bin\colmap.exe"

    os.makedirs(frames_dir, exist_ok=True)
    os.makedirs(sparse_dir, exist_ok=True)
    os.makedirs(exports_dir, exist_ok=True)

    try:
        # 1. EXTRACT FRAMES
        jobs_db[job_id]["status"] = "EXTRACTING"
        jobs_db[job_id]["progress_pct"] = 10
        subprocess.run([
            "ffmpeg", "-y", "-i", video_path, "-vf", f"fps={fps}",
            os.path.join(frames_dir, "frame_%04d.jpg")
        ], check=True)

        # 2. CAMERA POSES (COLMAP GLOBAL MAPPER)
        jobs_db[job_id]["status"] = "POSE_ESTIMATION"
        jobs_db[job_id]["progress_pct"] = 25
        
        subprocess.run([
            colmap_exe, "feature_extractor",
            "--database_path", colmap_db,
            "--image_path", frames_dir,
            "--ImageReader.camera_model", "SIMPLE_RADIAL",
            "--FeatureExtraction.use_gpu", "1"
        ], check=True)

        subprocess.run([
            colmap_exe, "sequential_matcher",
            "--database_path", colmap_db
        ], check=True)

        subprocess.run([
            colmap_exe, "global_mapper",
            "--database_path", colmap_db,
            "--image_path", frames_dir,
            "--output_path", sparse_dir
        ], check=True)

        # 3. PRE-PROCESS FOR NERFSTUDIO
        jobs_db[job_id]["status"] = "TRAINING"
        jobs_db[job_id]["progress_pct"] = 45
        
        sparse_model_path = os.path.join(sparse_dir, "0")
        subprocess.run([
            "ns-process-data", "images",
            "--data", frames_dir,
            "--output-dir", processed_dir,
            "--skip-colmap",
            "--colmap-model-path", sparse_model_path
        ], check=True)

        # 4. TRAIN SPLATFACTO
        jobs_db[job_id]["progress_pct"] = 65
        output_dir = os.path.join(base_dir, "outputs")
        subprocess.run([
            "ns-train", "splatfacto",
            "--data", processed_dir,
            "--max-num-iterations", str(iterations),
            "--output-dir", output_dir,
            "--viewer.quit-on-train-completion", "True",
        ], check=True)
        

        # 5. EXPORT GAUSSIAN SPLAT
        jobs_db[job_id]["progress_pct"] = 90
        
        # Locate newest config.yml inside the timestamp folder
        config_pattern = os.path.join(output_dir, "processed", "splatfacto", "*", "config.yml")
        config_files = glob.glob(config_pattern)
        if not config_files:
            raise RuntimeError("Training config.yml was not found.")
        
        latest_config = max(config_files, key=os.path.getctime)

        subprocess.run([
            "ns-export", "gaussian-splat",
            "--load-config", latest_config,
            "--output-dir", exports_dir
        ], check=True)

        # Locate exported .ply file
        exported_ply = os.path.join(exports_dir, "splat.ply")
        if not os.path.exists(exported_ply):
            ply_files = glob.glob(os.path.join(exports_dir, "*.ply"))
            if ply_files:
                exported_ply = max(ply_files, key=os.path.getctime)
            else:
                raise RuntimeError("Exported .ply file missing.")

        jobs_db[job_id]["model_path"] = exported_ply
        jobs_db[job_id]["status"] = "COMPLETED"
        jobs_db[job_id]["progress_pct"] = 100

    except Exception as e:
        print(f"Pipeline error for job {job_id}: {e}")
        jobs_db[job_id]["status"] = "FAILED"
        jobs_db[job_id]["progress_pct"] = 0


@app.post("/api/v1/jobs/upload")
async def upload_video(
    background_tasks: BackgroundTasks, 
    file: UploadFile = File(...), 
    fps: int = Form(2), 
    iterations: int = Form(7000)
):
    job_id = str(uuid.uuid4())[:8]
    save_path = os.path.join(UPLOAD_DIR, f"{job_id}_{file.filename}")
    
    with open(save_path, "wb") as buffer:
        buffer.write(await file.read())
        
    jobs_db[job_id] = {
        "job_id": job_id,
        "status": "PENDING",
        "progress_pct": 0,
        "model_path": None
    }
    
    # Run the real ML pipeline asynchronously
    background_tasks.add_task(run_real_pipeline, job_id, save_path, fps, iterations)
    return {"job_id": job_id}


@app.get("/api/v1/jobs/{job_id}")
def get_status(job_id: str):
    if job_id not in jobs_db:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs_db[job_id]


@app.get("/jobs/{job_id}/result")
def get_result(job_id: str):
    if job_id not in jobs_db or jobs_db[job_id]["status"] != "COMPLETED":
        raise HTTPException(status_code=400, detail="Model not ready")
        
    model_path = jobs_db[job_id]["model_path"]
    if not model_path or not os.path.exists(model_path):
        raise HTTPException(status_code=404, detail="Model file missing")
        
    return FileResponse(model_path, media_type="application/octet-stream", filename=f"{job_id}.ply")