const API_BASE = import.meta.env.DEV ? 'http://localhost:8080/api' : '/api';

export interface Profile {
  id: number;
  name: string;
  description: string;
  resolution_min_width: number;
  resolution_max_width: number;
  hdr_matching: 'any' | 'hdr_only' | 'sdr_only';
  video_codec: string;
  video_quality_type: 'crf' | 'qp' | 'bitrate';
  video_quality_value: number;
  ffmpeg_preset: string;
  audio_languages: string;
  audio_codec: string;
  audio_bitrate: string;
  subtitle_languages: string;
  strip_image_subs: boolean;
  custom_ffmpeg_args?: string;
  is_system: boolean;
  added_at: string;
}

export interface Movie {
  id: number;
  relative_path: string;
  filename: string;
  file_size: number;
  codec?: string;
  resolution?: string;
  hdr_type: 'sdr' | 'hdr10' | 'dolby_vision' | 'unknown';
  status: 'detected' | 'queued' | 'transcoding' | 'pending_approval' | 'approved' | 'manual_matching' | 'skipped';
  matched_profile_id?: number;
  matched_profile?: Profile;
  transcoded_size?: number;
  transcode_duration?: number;
  vault_path?: string;
  transcode_started_at?: string;
  transcode_completed_at?: string;
  error_message?: string;
  added_at: string;
  updated_at: string;
}

export interface DashboardStats {
  total_movies: number;
  transcoded_movies: number;
  pending_approval: number;
  manual_matching: number;
  queued: number;
  transcoding: number;
  space_saved_bytes: number;
  gpu_status: {
    detected: boolean;
    name: string;
    temp: string;
    utilization: string;
    active_job?: {
      id: number;
      filename: string;
      progress: number;
      fps: number;
      speed: string;
      profile_name: string;
    };
  };
}

export interface Setting {
  key: string;
  value: string;
}

export const api = {
  getStats: async (): Promise<DashboardStats> => {
    const res = await fetch(`${API_BASE}/dashboard/stats`);
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
  },

  getMovies: async (status?: string): Promise<Movie[]> => {
    const url = status ? `${API_BASE}/movies?status=${status}&limit=100` : `${API_BASE}/movies?limit=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch movies');
    return res.json();
  },

  scanLibrary: async (): Promise<void> => {
    const res = await fetch(`${API_BASE}/movies/scan`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to trigger scan');
  },

  queueMovie: async (movieId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/movies/${movieId}/queue`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to queue movie');
  },

  skipMovie: async (movieId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/movies/${movieId}/skip`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to skip movie');
  },

  matchProfile: async (movieId: number, profileId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/movies/${movieId}/match-profile?profile_id=${profileId}`, { method: 'PATCH' });
    if (!res.ok) throw new Error('Failed to match profile');
  },

  approveMovie: async (movieId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/movies/${movieId}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to approve transcode');
  },

  rejectMovie: async (movieId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/movies/${movieId}/reject`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reject transcode');
  },

  getMovieLogs: async (movieId: number): Promise<{ logs: string }> => {
    const res = await fetch(`${API_BASE}/movies/${movieId}/logs`);
    if (!res.ok) throw new Error('Failed to fetch movie logs');
    return res.json();
  },

  getProfiles: async (): Promise<Profile[]> => {
    const res = await fetch(`${API_BASE}/profiles`);
    if (!res.ok) throw new Error('Failed to fetch profiles');
    return res.json();
  },

  createProfile: async (profile: Omit<Profile, 'id' | 'is_system' | 'added_at'>): Promise<Profile> => {
    const res = await fetch(`${API_BASE}/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error('Failed to create profile');
    return res.json();
  },

  deleteProfile: async (profileId: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/profiles/${profileId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete profile');
  },

  getSettings: async (): Promise<Setting[]> => {
    const res = await fetch(`${API_BASE}/settings`);
    if (!res.ok) throw new Error('Failed to fetch settings');
    return res.json();
  },

  updateSetting: async (key: string, value: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/settings/${key}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) throw new Error('Failed to update setting');
  },
};
