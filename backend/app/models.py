from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Text, BigInteger
from sqlalchemy.orm import relationship
import datetime
from backend.app.database import Base

class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    relative_path = Column(String, unique=True, index=True, nullable=False)
    filename = Column(String, nullable=False)
    file_size = Column(BigInteger, nullable=False)  # Original size in bytes
    codec = Column(String, nullable=True)           # Original video codec
    resolution = Column(String, nullable=True)      # Original resolution (e.g., 1920x1080)
    hdr_type = Column(String, default="sdr")        # sdr, hdr10, dolby_vision, unknown
    
    # Status: detected, queued, transcoding, pending_approval, approved, manual_matching, skipped
    status = Column(String, default="detected", index=True)
    
    matched_profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=True)
    matched_profile = relationship("Profile", back_populates="movies")
    
    transcoded_size = Column(BigInteger, nullable=True)
    transcode_duration = Column(Integer, nullable=True)  # in seconds
    vault_path = Column(String, nullable=True)           # Path of original file in vault
    transcode_started_at = Column(DateTime, nullable=True)
    transcode_completed_at = Column(DateTime, nullable=True)
    
    error_message = Column(Text, nullable=True)
    transcode_logs = Column(Text, nullable=True)
    
    added_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=True)
    
    # Matching rules
    resolution_min_width = Column(Integer, default=0)  # e.g., 3840 for 4K
    resolution_max_width = Column(Integer, default=99999)
    hdr_matching = Column(String, default="any")  # any, hdr_only, sdr_only
    
    # Video settings
    # Codec: av1_qsv, hevc_qsv, h264_qsv, libsvtav1, libx265, libx264, copy
    video_codec = Column(String, default="av1_qsv")
    video_quality_type = Column(String, default="crf")  # crf, qp, bitrate
    video_quality_value = Column(Integer, default=22)    # CRF/QP value, or bitrate in kbps
    ffmpeg_preset = Column(String, default="medium")     # slow, medium, fast, etc.
    
    # Audio settings
    audio_languages = Column(String, default="eng")       # Comma separated e.g. "eng,spa"
    audio_codec = Column(String, default="copy")          # copy, aac, ac3
    audio_bitrate = Column(String, default="640k")        # Bitrate per track
    
    # Subtitle settings
    subtitle_languages = Column(String, default="eng")    # Comma separated e.g. "eng,spa"
    strip_image_subs = Column(Boolean, default=True)      # Strip PGS, keep SRT
    
    custom_ffmpeg_args = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    
    movies = relationship("Movie", back_populates="matched_profile")
    
    added_at = Column(DateTime, default=datetime.datetime.utcnow)


class Setting(Base):
    __tablename__ = "settings"

    key = Column(String, primary_key=True, index=True)
    value = Column(String, nullable=False)
