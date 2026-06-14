import os
import subprocess
import json
import re
import shutil
import logging
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from backend.app.config import settings
from backend.app.models import Movie, Profile

logger = logging.getLogger("transvault.transcoder")
logging.basicConfig(level=logging.INFO)

# Global tracking of active FFmpeg subprocesses
active_processes = {}

def get_media_info(file_path: str):
    """Probe media file using ffprobe and return metadata."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
        
    cmd = [
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
    except subprocess.CalledProcessError as e:
        logger.error(f"ffprobe failed for {file_path}: {e.stderr}")
        raise RuntimeError(f"ffprobe failed: {e.stderr}")

def parse_media_metadata(info: dict):
    """Parse ffprobe output to extract codec, resolution, HDR, audio, and subtitle streams."""
    streams = info.get("streams", [])
    format_info = info.get("format", {})
    
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video_stream:
        raise ValueError("No video stream found in file")
        
    codec = video_stream.get("codec_name", "unknown")
    width = video_stream.get("width")
    height = video_stream.get("height")
    resolution = f"{width}x{height}" if width and height else "unknown"
    
    # HDR detection
    hdr_type = "sdr"
    color_space = video_stream.get("color_space", "")
    color_transfer = video_stream.get("color_transfer", "")
    color_primaries = video_stream.get("color_primaries", "")
    
    # Check for HDR10/Dolby Vision in video stream properties
    if "smpte2084" in color_transfer or "arib-std-b67" in color_transfer:
        hdr_type = "hdr10"
        
    # Check side data for Dolby Vision
    side_data_list = video_stream.get("side_data_list", [])
    for sd in side_data_list:
        if "DOVI" in sd.get("side_data_type", "") or "Dolby Vision" in sd.get("side_data_type", ""):
            hdr_type = "dolby_vision"
            break
            
    # Check stream tags
    tags = video_stream.get("tags", {})
    for tag_val in tags.values():
        if isinstance(tag_val, str) and ("dvhe" in tag_val or "dovi" in tag_val.lower()):
            hdr_type = "dolby_vision"
            break

    # Parse Audio and Subtitle details
    audio_streams = []
    subtitle_streams = []
    
    for idx, s in enumerate(streams):
        codec_type = s.get("codec_type")
        lang = s.get("tags", {}).get("language", "und")
        
        if codec_type == "audio":
            audio_streams.append({
                "index": idx,
                "codec": s.get("codec_name"),
                "language": lang,
                "channels": s.get("channels", 2),
                "title": s.get("tags", {}).get("title", f"Audio track {idx}")
            })
        elif codec_type == "subtitle":
            subtitle_streams.append({
                "index": idx,
                "codec": s.get("codec_name"),
                "language": lang,
                "title": s.get("tags", {}).get("title", f"Subtitle track {idx}")
            })
            
    duration = float(format_info.get("duration", 0))
    file_size = int(format_info.get("size", 0))
    
    return {
        "codec": codec,
        "width": width,
        "height": height,
        "resolution": resolution,
        "hdr_type": hdr_type,
        "audio_streams": audio_streams,
        "subtitle_streams": subtitle_streams,
        "duration": duration,
        "file_size": file_size
    }

def find_closest_profile(db: Session, width: int, hdr_type: str) -> Optional[Profile]:
    """Find the closest profile that matches the movie properties."""
    profiles = db.query(Profile).all()
    if not profiles:
        return None
        
    matched_profiles = []
    
    for p in profiles:
        # Match Resolution
        if not (p.resolution_min_width <= width <= p.resolution_max_width):
            continue
            
        # Match HDR requirements
        is_hdr = hdr_type in ["hdr10", "dolby_vision"]
        if p.hdr_matching == "hdr_only" and not is_hdr:
            continue
        if p.hdr_matching == "sdr_only" and is_hdr:
            continue
            
        # Scored matching: prioritize narrower resolution bands
        width_range = p.resolution_max_width - p.resolution_min_width
        matched_profiles.append((p, width_range))
        
    if not matched_profiles:
        # Fallback to system default profile (e.g., system 1080p SDR)
        system_default = db.query(Profile).filter(Profile.is_system == True).first()
        if not system_default:
            system_default = db.query(Profile).first()
        return system_default
        
    # Return the profile with the narrowest matching width range (closest fit)
    matched_profiles.sort(key=lambda x: x[1])
    return matched_profiles[0][0]

def check_if_transcode_needed(media_info: dict, profile: Profile, filename: str) -> bool:
    """
    Checks if transcoding is actually needed for a given file and profile.
    Returns True if transcoding/remuxing is needed, False if the file already has
    the expected settings (and thus can be skipped).
    """
    # 1. Check video codec
    source_vcodec = media_info.get("codec", "").lower()
    if source_vcodec == "h265":
        source_vcodec = "hevc"
        
    target_vcodec = profile.video_codec.lower()
    if "av1" in target_vcodec:
        target_vcodec_norm = "av1"
    elif "hevc" in target_vcodec or "x265" in target_vcodec:
        target_vcodec_norm = "hevc"
    elif "h264" in target_vcodec or "x264" in target_vcodec:
        target_vcodec_norm = "h264"
    elif target_vcodec == "copy":
        target_vcodec_norm = source_vcodec
    else:
        target_vcodec_norm = target_vcodec

    if source_vcodec != target_vcodec_norm:
        return True

    # 2. Check container extension
    target_ext = ".mkv"
    file_ext = os.path.splitext(filename.lower())[1]
    if file_ext != target_ext:
        return True

    # 3. Check if any audio tracks would be filtered out or transcoded
    audio_langs = [l.strip().lower() for l in profile.audio_languages.split(",") if l.strip()]
    audio_streams = media_info.get("audio_streams", [])
    
    matched_audio_indices = []
    for lang in audio_langs:
        langs_found = [s for s in audio_streams if s["language"].lower() == lang]
        langs_found.sort(key=lambda s: s["channels"], reverse=True)
        if langs_found:
            matched_audio_indices.append(langs_found[0]["index"])
            if len(langs_found) > 1 and langs_found[1]["channels"] == 2:
                matched_audio_indices.append(langs_found[1]["index"])
                
    if not matched_audio_indices and audio_streams:
        matched_audio_indices.append(audio_streams[0]["index"])

    if len(audio_streams) != len(matched_audio_indices):
        return True

    for idx in matched_audio_indices:
        stream = next((s for s in audio_streams if s["index"] == idx), None)
        if stream:
            source_acodec = stream["codec"].lower()
            if profile.audio_codec != "copy" and source_acodec != profile.audio_codec.lower():
                return True

    # 4. Check subtitle tracks
    sub_langs = [l.strip().lower() for l in profile.subtitle_languages.split(",") if l.strip()]
    subtitle_streams = media_info.get("subtitle_streams", [])
    
    matched_sub_indices = []
    for s in subtitle_streams:
        codec_name = s["codec"].lower()
        if profile.strip_image_subs and ("pgs" in codec_name or "dvd" in codec_name or "hdmv" in codec_name):
            continue
        if s["language"].lower() in sub_langs:
            matched_sub_indices.append(s["index"])

    if len(subtitle_streams) != len(matched_sub_indices):
        return True

    return False

def build_ffmpeg_command(input_file: str, output_file: str, profile: Profile, media_info: dict) -> list:
    """Build the FFmpeg CLI command based on the matched profile and movie streams."""
    cmd = ["ffmpeg", "-y", "-nostdin", "-loglevel", "info", "-stats"]
    
    # 1. Hardware acceleration flags if using Intel QSV
    is_qsv = profile.video_codec in ["av1_qsv", "hevc_qsv", "h264_qsv"]
    if is_qsv:
        cmd.extend(["-init_hw_device", "qsv=qsv", "-filter_hw_device", "qsv"])
        
    # Input file
    cmd.extend(["-i", input_file])
    
    # 2. Map Video Stream
    cmd.extend(["-map", "0:v:0"])
    
    # Video Encoder & Settings
    cmd.extend(["-c:v", profile.video_codec])
    
    # Map presets
    # QSV encoders use 1-7 or fast/medium/slow
    if is_qsv:
        preset_map = {"slow": "2", "medium": "4", "fast": "6"}
        qsv_preset = preset_map.get(profile.ffmpeg_preset, "4")
        cmd.extend(["-preset", qsv_preset])
        
        # Quality mode for Intel QSV
        if profile.video_quality_type == "crf":
            # For QSV, we use Intelligent Constant Quality (ICQ) mode
            cmd.extend(["-global_quality", str(profile.video_quality_value)])
        elif profile.video_quality_type == "qp":
            cmd.extend(["-q:v", str(profile.video_quality_value)])
        elif profile.video_quality_type == "bitrate":
            cmd.extend(["-b:v", f"{profile.video_quality_value}k"])
    else:
        # Software / Standard CPU Encoders
        cmd.extend(["-preset", profile.ffmpeg_preset])
        if profile.video_quality_type == "crf":
            cmd.extend(["-crf", str(profile.video_quality_value)])
        elif profile.video_quality_type == "qp":
            cmd.extend(["-qp", str(profile.video_quality_value)])
        elif profile.video_quality_type == "bitrate":
            cmd.extend(["-b:v", f"{profile.video_quality_value}k"])
            
    # 3. Audio Stream Whitelisting & Encoding
    audio_langs = [l.strip().lower() for l in profile.audio_languages.split(",") if l.strip()]
    audio_streams = media_info.get("audio_streams", [])
    
    matched_audio_indices = []
    
    # Find matching language streams
    for lang in audio_langs:
        langs_found = [s for s in audio_streams if s["language"].lower() == lang]
        # Sort channels descending to keep highest quality (surround sound)
        langs_found.sort(key=lambda s: s["channels"], reverse=True)
        if langs_found:
            # Map the best surround track
            matched_audio_indices.append(langs_found[0]["index"])
            # Map stereo track if it exists and is different from the surround track (for compatibility)
            if len(langs_found) > 1 and langs_found[1]["channels"] == 2:
                matched_audio_indices.append(langs_found[1]["index"])
                
    # If no languages matched, fallback to the first/default audio stream
    if not matched_audio_indices and audio_streams:
        matched_audio_indices.append(audio_streams[0]["index"])
        
    # Apply audio mappings
    for idx in matched_audio_indices:
        cmd.extend(["-map", f"0:{idx}"])
        
    # Audio codec settings
    if profile.audio_codec == "copy":
        cmd.extend(["-c:a", "copy"])
    else:
        cmd.extend(["-c:a", profile.audio_codec, "-b:a", profile.audio_bitrate])
        
    # 4. Subtitle Stream Whitelisting & Filtering
    sub_langs = [l.strip().lower() for l in profile.subtitle_languages.split(",") if l.strip()]
    subtitle_streams = media_info.get("subtitle_streams", [])
    
    matched_sub_indices = []
    for s in subtitle_streams:
        codec_name = s["codec"].lower()
        # If strip image subs, exclude pgs/dvd subs
        if profile.strip_image_subs and ("pgs" in codec_name or "dvd" in codec_name or "hdmv" in codec_name):
            continue
        # Check language match
        if s["language"].lower() in sub_langs:
            matched_sub_indices.append(s["index"])
            
    # Apply subtitle mappings
    for idx in matched_sub_indices:
        cmd.extend(["-map", f"0:{idx}"])
        
    if subtitle_streams:
        cmd.extend(["-c:s", "copy"])  # Subtitles are always copied, never transcoded
        
    # 5. Metadata preservation & chapters
    cmd.extend(["-map_metadata", "0", "-map_chapters", "0"])
    
    # 6. Add Custom Extra Arguments
    if profile.custom_ffmpeg_args:
        custom_args = profile.custom_ffmpeg_args.split()
        cmd.extend(custom_args)
        
    # Output file
    cmd.append(output_file)
    
    return cmd

def run_transcode(db: Session, movie_id: int, progress_callback=None):
    """Executes the transcode job for the given movie ID."""
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie:
        logger.error(f"Movie ID {movie_id} not found in database")
        return
        
    original_path = os.path.join(settings.library_dir, movie.relative_path)
    if not os.path.exists(original_path):
        error_msg = f"Original file does not exist at path: {original_path}"
        movie.status = "manual_matching"
        movie.error_message = error_msg
        db.commit()
        logger.error(error_msg)
        return

    # Update database state to transcoding
    movie.status = "transcoding"
    movie.transcode_started_at = datetime.utcnow()
    movie.error_message = None
    db.commit()
    
    try:
        # Probe media file
        info = get_media_info(original_path)
        media_metadata = parse_media_metadata(info)
        
        # Save scanned media details in case they changed
        movie.codec = media_metadata["codec"]
        movie.resolution = media_metadata["resolution"]
        movie.hdr_type = media_metadata["hdr_type"]
        movie.file_size = media_metadata["file_size"]
        db.commit()
        
        # Resolve Profile
        profile = movie.matched_profile
        if not profile:
            profile = find_closest_profile(db, media_metadata["width"], media_metadata["hdr_type"])
            if not profile:
                raise RuntimeError("No matching transcode profiles found.")
            movie.matched_profile_id = profile.id
            db.commit()
            
        # Check if transcoding is actually needed
        if not check_if_transcode_needed(media_metadata, profile, movie.filename):
            logger.info(f"Skipping transcode for {movie.filename} (already matches profile output settings)")
            movie.status = "skipped"
            movie.transcode_started_at = None
            db.commit()
            return
            
        # Target extension is set based on the profile video/audio formats. Default is mkv.
        target_ext = ".mkv"
        if "av1" in profile.video_codec or "vp9" in profile.video_codec:
            target_ext = ".mkv"  # AV1 works best in MKV container
        
        original_basename = os.path.splitext(movie.filename)[0]
        temp_filename = f"{original_basename}_tmp_{movie.id}{target_ext}"
        temp_output_path = os.path.join(settings.work_dir, temp_filename)
        
        # Build command
        cmd = build_ffmpeg_command(original_path, temp_output_path, profile, media_metadata)
        logger.info(f"Running FFmpeg: {' '.join(cmd)}")
        
        # Execute transcoding process with output parsing
        process = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )
        active_processes[movie_id] = process
        
        duration = media_metadata["duration"]
        logs = []
        
        # Regular expressions to parse FFmpeg logs
        time_regex = re.compile(r"time=(\d+):(\d+):(\d+)\.(\d+)")
        fps_regex = re.compile(r"fps=\s*([\d\.]+)")
        speed_regex = re.compile(r"speed=\s*([\d\.]+)x")
        
        for line in process.stdout:
            logs.append(line)
            # Keep log memory limited
            if len(logs) > 2000:
                logs.pop(0)
                
            # Parse progress metrics
            time_match = time_regex.search(line)
            if time_match and duration > 0:
                hours, minutes, seconds, ms = map(int, time_match.groups())
                current_time_sec = (hours * 3600) + (minutes * 60) + seconds + (ms / 100)
                progress_percent = min(round((current_time_sec / duration) * 100, 1), 99.9)
                
                fps_match = fps_regex.search(line)
                speed_match = speed_regex.search(line)
                
                fps = float(fps_match.group(1)) if fps_match else 0.0
                speed = speed_match.group(1) if speed_match else "0.0"
                
                # Update callbacks/database
                if progress_callback:
                    progress_callback(progress_percent, fps, speed)
                    
        process.wait()
        active_processes.pop(movie_id, None)
        
        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg transcode failed with exit code {process.returncode}")
            
        # Complete! Staging swap
        # Generate target final library path preserving base name
        movie_dir = os.path.dirname(original_path)
        final_library_filename = f"{original_basename}{target_ext}"
        final_library_path = os.path.join(movie_dir, final_library_filename)
        
        # Staging folder path inside Vault
        vault_movie_dir = os.path.join(settings.vault_dir, os.path.dirname(movie.relative_path))
        os.makedirs(vault_movie_dir, exist_ok=True)
        vault_path = os.path.join(vault_movie_dir, movie.filename)
        
        # 1. Move original to vault
        logger.info(f"Moving original {original_path} to vault {vault_path}")
        shutil.move(original_path, vault_path)
        
        # 2. Move transcoded staging file to library
        logger.info(f"Moving transcoded staging {temp_output_path} to library {final_library_path}")
        shutil.move(temp_output_path, final_library_path)
        
        # Update Movie state
        movie.status = "pending_approval"
        movie.vault_path = os.path.relpath(vault_path, settings.vault_dir)
        movie.transcoded_size = os.path.getsize(final_library_path)
        movie.filename = final_library_filename
        movie.relative_path = os.path.relpath(final_library_path, settings.library_dir)
        movie.transcode_completed_at = datetime.utcnow()
        movie.transcode_duration = int((movie.transcode_completed_at - movie.transcode_started_at).total_seconds())
        movie.transcode_logs = "".join(logs[-200:])  # Store last 200 lines of logs
        db.commit()
        logger.info(f"Transcode of {movie.filename} complete. Pending approval.")
        
    except Exception as e:
        active_processes.pop(movie_id, None)
        logger.exception("Transcoding execution error")
        movie.status = "manual_matching"
        movie.error_message = str(e)
        if 'logs' in locals() and logs:
            movie.transcode_logs = "".join(logs[-200:])
        db.commit()
        
        # Cleanup temporary transcoding file if it exists
        if 'temp_output_path' in locals() and os.path.exists(temp_output_path):
            try:
                os.remove(temp_output_path)
            except Exception as cleanup_err:
                logger.error(f"Failed to cleanup temp file {temp_output_path}: {cleanup_err}")

def stop_transcode(movie_id: int):
    """Terminates the active FFmpeg subprocess for the given movie ID."""
    process = active_processes.get(movie_id)
    if process:
        logger.info(f"Terminating FFmpeg process for movie ID {movie_id}")
        try:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                logger.warning(f"Process for movie ID {movie_id} did not terminate. Killing it.")
                process.kill()
                process.wait()
        except Exception as e:
            logger.error(f"Failed to terminate FFmpeg process for movie ID {movie_id}: {e}")

def approve_transcode(db: Session, movie_id: int):
    """Approves a transcoded movie, deleting the original from the vault."""
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie or movie.status != "pending_approval":
        raise ValueError("Movie not found or not pending approval")
        
    vault_full_path = os.path.join(settings.vault_dir, movie.vault_path)
    if os.path.exists(vault_full_path):
        logger.info(f"Deleting vaulted original: {vault_full_path}")
        os.remove(vault_full_path)
        
        # Clean up empty parent directories in vault
        parent_dir = os.path.dirname(vault_full_path)
        while parent_dir != settings.vault_dir:
            if not os.listdir(parent_dir):
                os.rmdir(parent_dir)
                parent_dir = os.path.dirname(parent_dir)
            else:
                break
                
    movie.status = "approved"
    movie.vault_path = None
    db.commit()
    logger.info(f"Movie {movie.filename} transcode approved. Original deleted.")

def reject_transcode(db: Session, movie_id: int):
    """Rejects a transcoded movie, restoring the original and deleting the transcoded file."""
    movie = db.query(Movie).filter(Movie.id == movie_id).first()
    if not movie or movie.status != "pending_approval":
        raise ValueError("Movie not found or not pending approval")
        
    vault_full_path = os.path.join(settings.vault_dir, movie.vault_path)
    transcoded_full_path = os.path.join(settings.library_dir, movie.relative_path)
    
    if not os.path.exists(vault_full_path):
        raise FileNotFoundError(f"Original file not found in vault: {vault_full_path}")
        
    # Restore original back to library, replacing transcoded file
    original_extension = os.path.splitext(movie.vault_path)[1]
    original_basename = os.path.splitext(movie.filename)[0]
    restored_library_filename = f"{original_basename}{original_extension}"
    restored_library_path = os.path.join(os.path.dirname(transcoded_full_path), restored_library_filename)
    
    # 1. Delete transcoded file
    if os.path.exists(transcoded_full_path):
        logger.info(f"Deleting rejected transcoded file: {transcoded_full_path}")
        os.remove(transcoded_full_path)
        
    # 2. Restore original from vault
    logger.info(f"Restoring original from vault: {vault_full_path} -> {restored_library_path}")
    shutil.move(vault_full_path, restored_library_path)
    
    # Clean up empty parent directories in vault
    parent_dir = os.path.dirname(vault_full_path)
    while parent_dir != settings.vault_dir:
        if not os.listdir(parent_dir):
            os.rmdir(parent_dir)
            parent_dir = os.path.dirname(parent_dir)
        else:
            break
            
    # Update movie details back to original state, marked for manual profile matching
    movie.status = "manual_matching"
    movie.filename = restored_library_filename
    movie.relative_path = os.path.relpath(restored_library_path, settings.library_dir)
    movie.vault_path = None
    movie.transcoded_size = None
    db.commit()
    logger.info(f"Movie {movie.filename} transcode rejected. Original restored. Set to Manual Match.")
