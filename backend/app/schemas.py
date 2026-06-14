from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

# Profile Schemas
class ProfileBase(BaseModel):
    name: str
    description: Optional[str] = None
    resolution_min_width: int = 0
    resolution_max_width: int = 99999
    hdr_matching: str = "any" # any, hdr_only, sdr_only
    
    video_codec: str = "av1_qsv"
    video_quality_type: str = "crf"
    video_quality_value: int = 22
    ffmpeg_preset: str = "medium"
    
    audio_languages: str = "eng"
    audio_codec: str = "copy"
    audio_bitrate: str = "640k"
    
    subtitle_languages: str = "eng"
    strip_image_subs: bool = True
    
    custom_ffmpeg_args: Optional[str] = None

class ProfileCreate(ProfileBase):
    pass

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    resolution_min_width: Optional[int] = None
    resolution_max_width: Optional[int] = None
    hdr_matching: Optional[str] = None
    video_codec: Optional[str] = None
    video_quality_type: Optional[str] = None
    video_quality_value: Optional[int] = None
    ffmpeg_preset: Optional[str] = None
    audio_languages: Optional[str] = None
    audio_codec: Optional[str] = None
    audio_bitrate: Optional[str] = None
    subtitle_languages: Optional[str] = None
    strip_image_subs: Optional[bool] = None
    custom_ffmpeg_args: Optional[str] = None

class ProfileResponse(ProfileBase):
    id: int
    is_system: bool
    added_at: datetime

    class Config:
        from_attributes = True

class ProfileSuggestion(ProfileBase):
    match_count: int


# Movie Schemas
class MovieResponse(BaseModel):
    id: int
    relative_path: str
    filename: str
    file_size: int
    codec: Optional[str] = None
    resolution: Optional[str] = None
    hdr_type: str
    status: str
    matched_profile_id: Optional[int] = None
    matched_profile: Optional[ProfileResponse] = None
    transcoded_size: Optional[int] = None
    transcode_duration: Optional[int] = None
    vault_path: Optional[str] = None
    transcode_started_at: Optional[datetime] = None
    transcode_completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    added_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MovieUpdate(BaseModel):
    status: Optional[str] = None
    matched_profile_id: Optional[int] = None


# Setting Schemas
class SettingResponse(BaseModel):
    key: str
    value: str

    class Config:
        from_attributes = True

class SettingUpdate(BaseModel):
    value: str


# Dashboard Stats
class DashboardStats(BaseModel):
    total_movies: int
    transcoded_movies: int
    pending_approval: int
    manual_matching: int
    queued: int
    transcoding: int
    space_saved_bytes: int
    gpu_status: dict
