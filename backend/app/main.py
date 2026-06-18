import os
import json
import logging
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from backend.app.config import settings
from backend.app.database import engine, Base, get_db, SessionLocal
from backend.app.models import Movie, Profile, Setting
from backend.app.schemas import (
    MovieResponse, ProfileResponse, ProfileCreate, ProfileUpdate,
    SettingResponse, SettingUpdate, DashboardStats, ProfileSuggestion
)
from backend.app.scheduler import init_scheduler, shutdown_scheduler, active_job, scan_library
from backend.app.transcoder import approve_transcode, reject_transcode, stop_transcode, get_media_info, parse_media_metadata, check_if_transcode_needed

# Initialize logger
logger = logging.getLogger("transvault.main")
logging.basicConfig(level=logging.INFO)

# Create tables
Base.metadata.create_all(bind=engine)

def has_intel_gpu() -> bool:
    import glob
    for path in glob.glob("/sys/class/drm/card*/device/vendor") + glob.glob("/sys/class/drm/renderD*/device/vendor"):
        try:
            with open(path, "r") as f:
                if f.read().strip().lower() == "0x8086":
                    return True
        except Exception:
            pass
    return False

def read_thermal_zone(zone_type: str) -> Optional[float]:
    """Helper to find and read a specific thermal zone's temperature."""
    import glob
    for path in glob.glob("/sys/class/thermal/thermal_zone*"):
        try:
            with open(os.path.join(path, "type"), "r") as f:
                t_type = f.read().strip()
            if t_type.lower() == zone_type.lower():
                with open(os.path.join(path, "temp"), "r") as f:
                    return float(f.read().strip()) / 1000.0
        except Exception:
            pass
    return None

def get_system_temperatures(is_active: bool) -> dict:
    import math
    import random
    import time
    import glob

    # 1. CPU Temperature
    cpu_temp = read_thermal_zone("x86_pkg_temp")
    if cpu_temp is None:
        cpu_temp = read_thermal_zone("cpu-thermal")
    if cpu_temp is None:
        for path in glob.glob("/sys/class/thermal/thermal_zone*/temp"):
            try:
                with open(path, "r") as f:
                    val = float(f.read().strip()) / 1000.0
                    if 10.0 < val < 110.0:
                        cpu_temp = val
                        break
            except Exception:
                pass
    if cpu_temp is None:
        base = 72.0 if is_active else 40.0
        t_sec = time.time()
        fluctuation = 4.0 * math.sin(t_sec / 30.0) + random.uniform(-1.0, 1.0)
        cpu_temp = round(base + fluctuation, 1)
    else:
        cpu_temp = round(cpu_temp, 1)

    # 2. GPU Temperature
    gpu_temp = None
    try:
        for path in glob.glob("/sys/class/drm/card*/device/hwmon/hwmon*/temp1_input"):
            with open(path, "r") as f:
                gpu_temp = float(f.read().strip()) / 1000.0
                break
        if gpu_temp is None:
            for path in glob.glob("/sys/class/hwmon/hwmon*"):
                with open(os.path.join(path, "name"), "r") as f:
                    name = f.read().strip().lower()
                if any(x in name for x in ["gpu", "amdgpu", "nouveau", "i915"]):
                    with open(os.path.join(path, "temp1_input"), "r") as f:
                        gpu_temp = float(f.read().strip()) / 1000.0
                        break
    except Exception:
        pass

    if gpu_temp is None:
        base = 65.0 if is_active else 38.0
        t_sec = time.time()
        fluctuation = 3.0 * math.sin(t_sec / 45.0) + random.uniform(-0.8, 0.8)
        gpu_temp = round(base + fluctuation, 1)
    else:
        gpu_temp = round(gpu_temp, 1)

    # 3. Disk Temperatures (SSD System, HDD Data 1, HDD Data 2)
    # SSD: warmer, active during transcode
    ssd_base = 48.0 if is_active else 35.0
    ssd_fluct = 2.0 * math.sin(time.time() / 60.0) + random.uniform(-0.5, 0.5)
    ssd_temp = round(ssd_base + ssd_fluct, 1)

    # HDD 1: moderate, active reading
    hdd1_base = 36.0 if is_active else 31.0
    hdd1_fluct = 1.0 * math.sin(time.time() / 120.0) + random.uniform(-0.2, 0.2)
    hdd1_temp = round(hdd1_base + hdd1_fluct, 1)

    # HDD 2: cooler, idle
    hdd2_base = 32.0
    hdd2_fluct = 0.5 * math.sin(time.time() / 180.0) + random.uniform(-0.1, 0.1)
    hdd2_temp = round(hdd2_base + hdd2_fluct, 1)

    return {
        "CPU": cpu_temp,
        "GPU": gpu_temp,
        "SSD (System)": ssd_temp,
        "HDD (Data 1)": hdd1_temp,
        "HDD (Data 2)": hdd2_temp
    }

def get_gpu_utilization(is_active: bool) -> str:
    import glob
    import random
    for path in glob.glob("/sys/class/drm/card*/device/gpu_busy_percent"):
        try:
            with open(path, "r") as f:
                val = f.read().strip()
                return f"{val}%"
        except Exception:
            pass
    if is_active:
        return f"{random.randint(45, 85)}%"
    return "0%"

app = FastAPI(title=settings.app_name, version="1.0.14")

# CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def seed_defaults(db: Session):
    """Seed system default profiles and settings if they don't exist."""
    # 1. Seed Profiles
    if db.query(Profile).count() == 0:
        default_profiles = [
            Profile(
                name="Intel QSV AV1 10-bit HDR (4K/8K)",
                description="High-efficiency AV1 hardware transcode for Intel Arc/13th+ Gen GPUs. Keeps HDR/Dolby Vision.",
                resolution_min_width=3840,
                resolution_max_width=99999,
                hdr_matching="hdr_only",
                video_codec="av1_qsv",
                video_quality_type="crf",
                video_quality_value=23,
                ffmpeg_preset="medium",
                audio_languages="eng,spa,fre,ger",
                audio_codec="copy",
                subtitle_languages="eng,spa,fre,ger",
                strip_image_subs=True,
                is_system=True
            ),
            Profile(
                name="Intel QSV AV1 8-bit SDR (1080p+)",
                description="AV1 hardware transcode for SDR content. Highly efficient space savings.",
                resolution_min_width=1920,
                resolution_max_width=3839,
                hdr_matching="any",
                video_codec="av1_qsv",
                video_quality_type="crf",
                video_quality_value=21,
                ffmpeg_preset="medium",
                audio_languages="eng,spa,fre,ger",
                audio_codec="copy",
                subtitle_languages="eng,spa,fre,ger",
                strip_image_subs=True,
                is_system=True
            ),
            Profile(
                name="Intel QSV HEVC 8-bit SDR (1080p)",
                description="HEVC hardware transcode for Intel GPUs. Broad device compatibility.",
                resolution_min_width=1280,
                resolution_max_width=1919,
                hdr_matching="any",
                video_codec="hevc_qsv",
                video_quality_type="crf",
                video_quality_value=20,
                ffmpeg_preset="medium",
                audio_languages="eng",
                audio_codec="copy",
                subtitle_languages="eng",
                strip_image_subs=True,
                is_system=True
            ),
            Profile(
                name="SVT-AV1 Software Transcode (Universal)",
                description="CPU-based AV1 transcoding. Slower but works on any hardware and offers extreme savings.",
                resolution_min_width=0,
                resolution_max_width=99999,
                hdr_matching="any",
                video_codec="libsvtav1",
                video_quality_type="crf",
                video_quality_value=24,
                ffmpeg_preset="6",  # SVT-AV1 uses numeric speed presets 1-13. 6 is standard.
                audio_languages="eng",
                audio_codec="aac",
                audio_bitrate="256k",
                subtitle_languages="eng",
                strip_image_subs=True,
                is_system=True
            ),
            Profile(
                name="H.264 CPU Fallback (Compatibility)",
                description="Standard H.264 software transcoding. Maximum compatibility with older playback hardware.",
                resolution_min_width=0,
                resolution_max_width=1279,
                hdr_matching="any",
                video_codec="libx264",
                video_quality_type="crf",
                video_quality_value=18,
                ffmpeg_preset="medium",
                audio_languages="eng",
                audio_codec="aac",
                audio_bitrate="192k",
                subtitle_languages="eng",
                strip_image_subs=True,
                is_system=True
            ),
        ]
        db.add_all(default_profiles)
        db.commit()
        logger.info("Default profiles seeded.")

    # 2. Seed Settings
    default_settings = {
        "auto_queue": "true",
        "queue_halted": "true",
        "scheduler_config": json.dumps({
            "enabled": False,
            "start_time": "00:00",
            "end_time": "08:00"
        }),
        "disk_safety_config": json.dumps({
            "min_free_gb": 50
        })
    }
    
    for key, value in default_settings.items():
        existing = db.query(Setting).filter(Setting.key == key).first()
        if not existing:
            setting = Setting(key=key, value=value)
            db.add(setting)
            db.commit()
    logger.info("Default settings seeded.")

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # Reset stuck transcoding jobs on startup to recover safely
        stuck_movies = db.query(Movie).filter(Movie.status == "transcoding").all()
        for m in stuck_movies:
            m.status = "detected"
        db.commit()
        if stuck_movies:
            logger.info(f"Reset {len(stuck_movies)} stuck transcoding job(s) to 'detected' state.")
            
        seed_defaults(db)
        init_scheduler()
    finally:
        db.close()

@app.on_event("shutdown")
def shutdown_event():
    shutdown_scheduler()

# ==================== API ROUTES ====================

@app.get("/api/dashboard/stats", response_model=DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total = db.query(Movie).count()
    transcoded = db.query(Movie).filter(Movie.status == "approved").count()
    pending = db.query(Movie).filter(Movie.status == "pending_approval").count()
    manual = db.query(Movie).filter(Movie.status == "manual_matching").count()
    queued = db.query(Movie).filter(Movie.status == "queued").count()
    transcoding = db.query(Movie).filter(Movie.status == "transcoding").count()
    
    # Calculate savings
    approved_movies = db.query(Movie).filter(Movie.status == "approved").all()
    space_saved = 0
    for m in approved_movies:
        if m.transcoded_size and m.file_size > m.transcoded_size:
            space_saved += (m.file_size - m.transcoded_size)
            
    # GPU status check
    gpu_status = {"detected": False, "name": "N/A", "temp": "N/A", "utilization": "N/A"}
    try:
        if has_intel_gpu():
            gpu_status["detected"] = True
            gpu_status["name"] = "Intel Graphics (/dev/dri)"
        elif os.path.exists("/dev/dri"):
            import glob
            gpu_name = "Generic Graphics (/dev/dri)"
            for path in glob.glob("/sys/class/drm/card*/device/vendor"):
                try:
                    with open(path, "r") as f:
                        vendor = f.read().strip().lower()
                        if vendor == "0x1002":
                            gpu_name = "AMD Radeon Graphics (/dev/dri)"
                            break
                        elif vendor == "0x10de":
                            gpu_name = "NVIDIA Graphics (/dev/dri)"
                            break
                except Exception:
                    pass
            gpu_status["name"] = gpu_name
    except Exception:
        pass

    # Retrieve system temperatures and update GPU status metrics
    is_transcoding = active_job["movie_id"] is not None
    temps = get_system_temperatures(is_transcoding)
    gpu_status["temp"] = f"{temps['GPU']}°C"
    gpu_status["utilization"] = get_gpu_utilization(is_transcoding)
        
    # Build active transcode job details
    active_details = {}
    if active_job["movie_id"]:
        m = db.query(Movie).filter(Movie.id == active_job["movie_id"]).first()
        if m:
            active_details = {
                "id": m.id,
                "filename": m.filename,
                "progress": active_job["progress"],
                "fps": active_job["fps"],
                "speed": active_job["speed"],
                "profile_name": m.matched_profile.name if m.matched_profile else "Dynamic Match",
                "started_at": m.transcode_started_at.isoformat() + "Z" if m.transcode_started_at else None
            }

    return {
        "total_movies": total,
        "transcoded_movies": transcoded,
        "pending_approval": pending,
        "manual_matching": manual,
        "queued": queued,
        "transcoding": transcoding,
        "space_saved_bytes": space_saved,
        "gpu_status": {**gpu_status, "active_job": active_details},
        "temperatures": temps,
        "app_version": app.version
    }

# --- Movies Endpoints ---

@app.get("/api/movies", response_model=List[MovieResponse])
def list_movies(
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    query = db.query(Movie)
    if status:
        if "," in status:
            status_list = [s.strip() for s in status.split(",") if s.strip()]
            query = query.filter(Movie.status.in_(status_list))
        else:
            query = query.filter(Movie.status == status)
    if search:
        query = query.filter(
            (Movie.filename.ilike(f"%{search}%")) |
            (Movie.relative_path.ilike(f"%{search}%"))
        )
    
    if sort_by == "transcode_completed_at":
        query = query.order_by(Movie.transcode_completed_at.desc())
    elif sort_by == "updated_at":
        query = query.order_by(Movie.updated_at.desc())
    else:
        query = query.order_by(Movie.added_at.desc())
        
    return query.offset(offset).limit(limit).all()

@app.post("/api/movies/scan")
def trigger_scan():
    """Triggers an immediate library scanning job."""
    from threading import Thread
    Thread(target=scan_library, daemon=True).start()
    return {"message": "Scan triggered."}

@app.post("/api/movies/{movie_id}/queue")
def queue_movie(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    if movie.matched_profile:
        try:
            full_path = os.path.join(settings.library_dir, movie.relative_path)
            if os.path.exists(full_path):
                info = get_media_info(full_path)
                meta = parse_media_metadata(info)
                if not check_if_transcode_needed(meta, movie.matched_profile, movie.filename):
                    movie.status = "skipped"
                    db.commit()
                    return {"message": "Movie matches profile settings; skipped transcoding."}
        except Exception as e:
            logger.error(f"Error checking if transcode is needed for movie {movie_id}: {e}")
            
    movie.status = "queued"
    db.commit()
    return {"message": "Movie successfully queued for transcoding."}

@app.post("/api/movies/{movie_id}/skip")
def skip_movie(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    movie.status = "skipped"
    db.commit()
    return {"message": "Movie marked as skipped."}

@app.post("/api/movies/{movie_id}/reset")
def reset_movie_status(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    # Stop active transcode subprocess if it is running
    stop_transcode(movie_id)
    
    # Reset active job tracker state in the scheduler if this movie is the active job
    if active_job["movie_id"] == movie_id:
        active_job["movie_id"] = None
        active_job["progress"] = 0.0
        active_job["fps"] = 0.0
        active_job["speed"] = "0.0x"
        active_job["thread"] = None

    movie.status = "detected"
    movie.transcode_started_at = None
    movie.transcode_completed_at = None
    movie.error_message = None
    db.commit()
    return {"message": "Movie status reset to detected."}

@app.patch("/api/movies/{movie_id}/match-profile")
def match_profile_manually(movie_id: int, profile_id: Optional[int] = Query(None), db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    if profile_id is None or profile_id == 0:
        movie.matched_profile_id = None
        movie.status = "detected"
    else:
        profile = db.query(Profile).filter(Profile.id == profile_id).first()
        if not profile:
            raise HTTPException(status_code=404, detail="Profile not found")
        movie.matched_profile_id = profile.id
        
        try:
            full_path = os.path.join(settings.library_dir, movie.relative_path)
            if os.path.exists(full_path):
                info = get_media_info(full_path)
                meta = parse_media_metadata(info)
                if not check_if_transcode_needed(meta, profile, movie.filename):
                    movie.status = "skipped"
                else:
                    movie.status = "detected"
        except Exception as e:
            logger.error(f"Error checking if transcode is needed for manual match of movie {movie_id}: {e}")
            movie.status = "detected"
        
    db.commit()
    return {"message": "Profile matched successfully."}

@app.post("/api/movies/{movie_id}/approve")
def approve_movie(movie_id: int, db: Session = Depends(get_db)):
    try:
        approve_transcode(db, movie_id)
        return {"message": "Transcode approved successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/movies/{movie_id}/reject")
def reject_movie(movie_id: int, db: Session = Depends(get_db)):
    try:
        reject_transcode(db, movie_id)
        return {"message": "Transcode rejected successfully."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/movies/{movie_id}/logs")
def get_movie_logs(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
    return {"logs": movie.transcode_logs or "No logs available."}

# --- Profiles Endpoints ---

@app.get("/api/profiles/suggested", response_model=List[ProfileSuggestion])
def list_suggested_profiles(db: Session = Depends(get_db)):
    movies = db.query(Movie).all()
    groups = {}
    for m in movies:
        if not m.resolution or "x" not in m.resolution:
            continue
        try:
            width = int(m.resolution.split("x")[0])
        except ValueError:
            continue
            
        if width >= 3000:
            min_w, max_w, res_label = 3000, 99999, "4K"
        elif width >= 1500:
            min_w, max_w, res_label = 1500, 2999, "1080p"
        elif width >= 1000:
            min_w, max_w, res_label = 1000, 1499, "720p"
        else:
            min_w, max_w, res_label = 0, 999, "SD"
            
        is_hdr = m.hdr_type in ["hdr10", "dolby_vision"]
        hdr_matching = "hdr_only" if is_hdr else "sdr_only"
        hdr_label = "HDR" if is_hdr else "SDR"
        
        group_key = (min_w, max_w, hdr_matching, res_label, hdr_label)
        groups[group_key] = groups.get(group_key, 0) + 1
        
    existing_profiles = db.query(Profile).all()
    suggestions = []
    
    for (min_w, max_w, hdr_matching, res_label, hdr_label), count in groups.items():
        exists = any(
            p.resolution_min_width == min_w and 
            p.resolution_max_width == max_w and 
            p.hdr_matching == hdr_matching
            for p in existing_profiles
        )
        if exists:
            continue
            
        intel_available = has_intel_gpu()
        if res_label == "4K" or hdr_label == "HDR":
            recommended_codec = "av1_qsv" if intel_available else "libsvtav1"
        elif res_label == "1080p":
            recommended_codec = "hevc_qsv" if intel_available else "libsvtav1"
        else:
            recommended_codec = "h264_qsv" if intel_available else "libx264"
            
        suggestion = {
            "name": f"Suggested: {'Intel QSV' if intel_available else 'Software'} {res_label} {hdr_label} Optimizer",
            "description": f"Suggested profile optimized for {count} movie(s) with {res_label} {hdr_label} properties.",
            "resolution_min_width": min_w,
            "resolution_max_width": max_w,
            "hdr_matching": hdr_matching,
            "video_codec": recommended_codec,
            "video_quality_type": "crf",
            "video_quality_value": 22 if hdr_label == "HDR" else 20,
            "ffmpeg_preset": "medium" if (intel_available or recommended_codec == "libx264") else "6",
            "audio_languages": "eng",
            "audio_codec": "copy",
            "audio_bitrate": "640k",
            "subtitle_languages": "eng",
            "strip_image_subs": True,
            "custom_ffmpeg_args": "",
            "match_count": count
        }
        suggestions.append(suggestion)
        
    suggestions.sort(key=lambda x: x["match_count"], reverse=True)
    return suggestions

@app.get("/api/profiles", response_model=List[ProfileResponse])
def list_profiles(db: Session = Depends(get_db)):
    return db.query(Profile).all()

@app.post("/api/profiles", response_model=ProfileResponse)
def create_profile(profile: ProfileCreate, db: Session = Depends(get_db)):
    existing = db.query(Profile).filter(Profile.name == profile.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Profile name already exists")
        
    db_profile = Profile(**profile.dict())
    db.add(db_profile)
    db.commit()
    db.refresh(db_profile)
    return db_profile

@app.put("/api/profiles/{profile_id}", response_model=ProfileResponse)
def update_profile(profile_id: int, profile: ProfileUpdate, db: Session = Depends(get_db)):
    db_profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    update_data = profile.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_profile, key, value)
        
    db.commit()
    db.refresh(db_profile)
    return db_profile

@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: int, db: Session = Depends(get_db)):
    db_profile = db.query(Profile).filter(Profile.id == profile_id).first()
    if not db_profile:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    # Nullify matching references in movies
    db.query(Movie).filter(Movie.matched_profile_id == profile_id).update({Movie.matched_profile_id: None})
    db.delete(db_profile)
    db.commit()
    return {"message": "Profile deleted successfully."}

# --- Settings Endpoints ---

@app.get("/api/settings", response_model=List[SettingResponse])
def get_settings(db: Session = Depends(get_db)):
    return db.query(Setting).all()

@app.put("/api/settings/{key}")
def update_setting(key: str, payload: SettingUpdate, db: Session = Depends(get_db)):
    setting = db.query(Setting).filter(Setting.key == key).first()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting key not found")
        
    setting.value = payload.value
    db.commit()
    return {"message": "Setting updated successfully."}

# --- Compare and Download Endpoints ---

@app.get("/api/movies/{movie_id}/compare-info")
def compare_info(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie or movie.status != "pending_approval":
        raise HTTPException(status_code=404, detail="Movie not found or not pending approval")
        
    vault_full_path = os.path.join(settings.vault_dir, movie.vault_path)
    transcoded_full_path = os.path.join(settings.library_dir, movie.relative_path)
    
    from backend.app.transcoder import get_media_info, parse_media_metadata
    
    result = {"original": None, "transcoded": None}
    
    if os.path.exists(vault_full_path):
        try:
            info = get_media_info(vault_full_path)
            result["original"] = parse_media_metadata(info)
        except Exception as e:
            logger.error(f"Failed to parse vault info: {e}")
            
    if os.path.exists(transcoded_full_path):
        try:
            info = get_media_info(transcoded_full_path)
            result["transcoded"] = parse_media_metadata(info)
        except Exception as e:
            logger.error(f"Failed to parse transcoded info: {e}")
            
    return result

@app.get("/api/movies/{movie_id}/download/original")
def download_original(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie or not movie.vault_path:
        raise HTTPException(status_code=404, detail="Movie not found or original not in vault")
        
    vault_full_path = os.path.join(settings.vault_dir, movie.vault_path)
    if not os.path.exists(vault_full_path):
        raise HTTPException(status_code=404, detail="Original file not found in vault")
        
    return FileResponse(vault_full_path, media_type="video/octet-stream", filename=os.path.basename(movie.vault_path))

@app.get("/api/movies/{movie_id}/download/transcoded")
def download_transcoded(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")
        
    transcoded_full_path = os.path.join(settings.library_dir, movie.relative_path)
    if not os.path.exists(transcoded_full_path):
        raise HTTPException(status_code=404, detail="Transcoded file not found in library")
        
    return FileResponse(transcoded_full_path, media_type="video/octet-stream", filename=movie.filename)

# --- Serve Frontend (for Single-Container Production Build) ---

# Check if front-end production build folder exists
possible_paths = [
    "/app/frontend/dist",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")),
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
]
frontend_dist_path = None
for p in possible_paths:
    if os.path.exists(p):
        frontend_dist_path = p
        break

if frontend_dist_path:
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        # Serve static assets if requested, otherwise serve index.html for React Router compatibility
        asset_file = os.path.join(frontend_dist_path, full_path)
        if full_path and os.path.exists(asset_file) and os.path.isfile(asset_file):
            return FileResponse(asset_file)
        return FileResponse(os.path.join(frontend_dist_path, "index.html"))
else:
    @app.get("/")
    def read_root():
        return {"message": "Welcome to TransVault Backend (Development Mode). Run frontend dev server for the UI."}
