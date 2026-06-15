import os
import time
import logging
import datetime
from threading import Thread
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.database import SessionLocal
from backend.app.models import Movie, Profile, Setting
from backend.app.transcoder import get_media_info, parse_media_metadata, find_closest_profile, run_transcode, check_if_transcode_needed

logger = logging.getLogger("transvault.scheduler")

# Global tracking of active transcoding job
active_job = {
    "movie_id": None,
    "progress": 0.0,
    "fps": 0.0,
    "speed": "0.0x",
    "thread": None
}

def is_within_transcode_window(db: Session) -> bool:
    """Check if current time is within the allowed scheduling window."""
    setting = db.query(Setting).filter(Setting.key == "scheduler_config").first()
    if not setting:
        return True # Default to always active
        
    try:
        import json
        config = json.loads(setting.value)
        if not config.get("enabled", False):
            return True # If scheduling is disabled, run anytime
            
        now = datetime.datetime.now()
        current_time_str = now.strftime("%H:%M")
        
        start_time_str = config.get("start_time", "00:00")
        end_time_str = config.get("end_time", "23:59")
        
        # Simple string-based comparison for HH:MM
        if start_time_str <= end_time_str:
            return start_time_str <= current_time_str <= end_time_str
        else:
            # Over-midnight window (e.g., 22:00 to 06:00)
            return current_time_str >= start_time_str or current_time_str <= end_time_str
    except Exception as e:
        logger.error(f"Error parsing scheduler config: {e}")
        return True

def scan_library():
    """Scans library directory to discover new movies."""
    db = SessionLocal()
    try:
        logger.info("Starting library file scan...")
        supported_extensions = ('.mkv', '.mp4', '.avi', '.m4v', '.mov', '.flv', '.webm', '.ts', '.wmv')
        
        # Traverse directory
        found_files = []
        for root, _, files in os.walk(settings.library_dir):
            for file in files:
                if file.lower().endswith(supported_extensions):
                    # Skip files in temporary workdir or vault folders if nested
                    if settings.work_dir in root or settings.vault_dir in root:
                        continue
                    
                    full_path = os.path.join(root, file)
                    rel_path = os.path.relpath(full_path, settings.library_dir)
                    found_files.append((rel_path, file, full_path))
                    
        # Check against database
        for rel_path, filename, full_path in found_files:
            # Skip if we already tracked it
            existing = db.query(Movie).filter(Movie.relative_path == rel_path).first()
            if existing:
                continue
                
            try:
                logger.info(f"Discovered new media file: {rel_path}")
                # Probe and parse metadata
                info = get_media_info(full_path)
                meta = parse_media_metadata(info)
                
                # Check closest profile match
                profile = find_closest_profile(db, meta["width"], meta["hdr_type"])
                
                status = "detected"
                if profile and not check_if_transcode_needed(meta, profile, filename):
                    status = "skipped"
                    logger.info(f"Skipping {filename} automatically (already matches profile output settings)")
                
                movie = Movie(
                    relative_path=rel_path,
                    filename=filename,
                    file_size=meta["file_size"],
                    codec=meta["codec"],
                    resolution=meta["resolution"],
                    hdr_type=meta["hdr_type"],
                    status=status,
                    matched_profile_id=profile.id if profile else None
                )
                db.add(movie)
                db.commit()
                logger.info(f"Added {filename} to database with status '{status}'")
            except Exception as e:
                logger.error(f"Failed to process newly discovered file {rel_path}: {e}")
                
        logger.info("Library scan complete.")
    finally:
        db.close()

def progress_callback(progress, fps, speed):
    """Callback triggered by transcoder to update live progress metrics."""
    active_job["progress"] = progress
    active_job["fps"] = fps
    active_job["speed"] = f"{speed}x"

def run_transcode_task(movie_id: int):
    """Internal runner for transcoding inside a thread."""
    db = None
    try:
        db = SessionLocal()
        run_transcode(db, movie_id, progress_callback=progress_callback)
    except Exception as e:
        logger.error(f"Error executing thread transcode for movie {movie_id}: {e}")
    finally:
        if db:
            try:
                db.close()
            except Exception as close_err:
                logger.error(f"Error closing DB session in transcode task: {close_err}")
        # Reset active job state
        active_job["movie_id"] = None
        active_job["progress"] = 0.0
        active_job["fps"] = 0.0
        active_job["speed"] = "0.0x"
        active_job["thread"] = None

def check_queue_and_process():
    """Checks the queue and starts transcoding if resource conditions are met."""
    global active_job
    
    # If a job is already running, do nothing
    if active_job["movie_id"] is not None:
        # Check if the thread is actually alive, just in case
        is_thread_dead = (active_job["thread"] is None) or (not active_job["thread"].is_alive())
        if is_thread_dead:
            logger.warning("Transcoding thread is not active/running. Resetting active job.")
            active_job["movie_id"] = None
            active_job["thread"] = None
        else:
            return
            
    db = SessionLocal()
    try:
        # Check if queue has been globally halted by user
        halt_setting = db.query(Setting).filter(Setting.key == "queue_halted").first()
        if halt_setting and halt_setting.value.lower() == "true":
            return
            
        # Check scheduler window
        if not is_within_transcode_window(db):
            return
            
        # Check disk space threshold safety
        disk_setting = db.query(Setting).filter(Setting.key == "disk_safety_config").first()
        if disk_setting:
            import json
            try:
                disk_config = json.loads(disk_setting.value)
                min_free_gb = disk_config.get("min_free_gb", 50)
                
                # Check free space on library volume
                stat = os.statvfs(settings.library_dir)
                free_gb = (stat.f_bavail * stat.f_frsize) / (1024 ** 3)
                
                if free_gb < min_free_gb:
                    logger.warning(f"Disk space guardrail triggered! Free space: {free_gb:.2f}GB < {min_free_gb}GB limit. Transcoding paused.")
                    return
            except Exception as e:
                logger.error(f"Error checking disk space: {e}")
                
        # Find next queued movie
        next_movie = db.query(Movie).filter(Movie.status == "queued").order_by(Movie.added_at.asc()).first()
        if not next_movie:
            # Fallback: if no queued movies, check if we want to auto-queue 'detected' movies
            auto_queue_setting = db.query(Setting).filter(Setting.key == "auto_queue").first()
            if auto_queue_setting and auto_queue_setting.value.lower() == "true":
                next_movie = db.query(Movie).filter(Movie.status == "detected").order_by(Movie.added_at.asc()).first()
                if next_movie:
                    next_movie.status = "queued"
                    db.commit()
                    
        if next_movie:
            profile_name = next_movie.matched_profile.name if next_movie.matched_profile else "Dynamic Match"
            logger.info(f"Triggering transcode for {next_movie.filename} (ID: {next_movie.id}) using profile: {profile_name}")
            active_job["movie_id"] = next_movie.id
            active_job["progress"] = 0.0
            active_job["fps"] = 0.0
            active_job["speed"] = "0.0x"
            
            # Spawn transcoding thread
            try:
                t = Thread(target=run_transcode_task, args=(next_movie.id,), daemon=True)
                active_job["thread"] = t
                t.start()
            except Exception as spawn_err:
                logger.error(f"Failed to spawn transcode thread for movie {next_movie.id}: {spawn_err}")
                active_job["movie_id"] = None
                active_job["thread"] = None
    except Exception as e:
        logger.error(f"Scheduler queue processor failed: {e}")
    finally:
        db.close()

# APScheduler instance
scheduler = BackgroundScheduler()

def init_scheduler():
    """Starts the background scanning and transcoding jobs."""
    if not scheduler.running:
        # Scan for new files every 5 minutes
        scheduler.add_job(scan_library, 'interval', minutes=5, id='scan_library_job')
        
        # Check transcode queue and process every 10 seconds
        scheduler.add_job(check_queue_and_process, 'interval', seconds=10, id='queue_processor_job')
        
        scheduler.start()
        logger.info("Background scheduler initialized.")
        
        # Trigger initial scan asynchronously
        Thread(target=scan_library, daemon=True).start()

def shutdown_scheduler():
    """Stops the scheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler shut down.")
