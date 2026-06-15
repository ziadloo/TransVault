import React, { useState, useEffect } from 'react';
import { 
  Film, CheckCircle, XCircle, Settings, Database, HardDrive, Cpu, 
  RefreshCw, Trash2, Plus, Clock, FileText, ChevronRight, Check,
  ArrowRight, Sliders, AlertCircle, Download, Loader2, Edit, Power
} from 'lucide-react';
import { api } from './api';
import type { Movie, Profile, DashboardStats, Setting, ProfileSuggestion } from './api';

interface ApprovalCardProps {
  movie: Movie;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onViewLogs: (id: number, filename: string) => void;
  formatBytes: (bytes: number, decimals?: number) => string;
}

function ApprovalCard({ movie, onApprove, onReject, onViewLogs, formatBytes }: ApprovalCardProps) {
  const [compareInfo, setCompareInfo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchCompare = async () => {
      try {
        setLoading(true);
        const data = await api.getCompareInfo(movie.id);
        if (active) {
          setCompareInfo(data);
          setError(null);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to load comparison data');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    fetchCompare();
    return () => {
      active = false;
    };
  }, [movie.id]);

  const savedBytes = movie.file_size - (movie.transcoded_size || 0);
  const savedPercent = Math.round((savedBytes / movie.file_size) * 100);

  const formatAudioTrack = (track: any) => {
    const lang = track.language ? track.language.toUpperCase() : 'UND';
    const codec = track.codec ? track.codec.toUpperCase() : 'UNKNOWN';
    const channels = track.channels ? `${track.channels}ch` : '';
    const parts = [lang, codec, channels].filter(Boolean).join(' | ');
    return track.title && !track.title.toLowerCase().startsWith('audio')
      ? `${parts} (${track.title})`
      : parts;
  };

  const formatSubtitleTrack = (track: any) => {
    const lang = track.language ? track.language.toUpperCase() : 'UND';
    const codec = track.codec ? track.codec.toUpperCase() : 'UNKNOWN';
    const parts = [lang, codec].filter(Boolean).join(' | ');
    return track.title && !track.title.toLowerCase().startsWith('sub')
      ? `${parts} (${track.title})`
      : parts;
  };

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl overflow-hidden hover:border-violet-500/20 transition-all flex flex-col justify-between">
      <div className="p-5 space-y-4">
        <div>
          <h3 className="font-extrabold text-zinc-200 text-sm truncate" title={movie.filename}>
            {movie.filename}
          </h3>
          <p className="text-zinc-500 text-[10px] mt-0.5">Profile: <strong className="text-zinc-400 font-semibold">{movie.matched_profile?.name || 'Dynamic Match'}</strong></p>
          <span className="text-[10px] text-zinc-500 font-mono select-all block truncate mt-0.5">
            {movie.relative_path}
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-2 bg-zinc-950/40 rounded-lg border border-zinc-800/50">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            <span className="text-xs text-zinc-400">Probing files for comparison...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-2 bg-rose-950/20 border border-rose-900/40 rounded-lg text-rose-300 px-4 text-center">
            <AlertCircle className="h-5 w-5 text-rose-400" />
            <p className="text-xs font-semibold">Failed to compare details</p>
            <p className="text-[10px] text-rose-400">{error}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Original File */}
            <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-850 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider font-mono">Original File</span>
                  <a
                    href={api.getOriginalDownloadUrl(movie.id)}
                    download
                    className="inline-flex items-center space-x-1 text-[10px] text-violet-400 hover:text-violet-300 font-bold transition hover:underline font-mono"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </a>
                </div>
                
                {compareInfo?.original ? (
                  <div className="mt-2 space-y-2.5">
                    <div className="font-mono text-xs text-zinc-300">
                      <p className="font-bold text-zinc-100 text-sm">{formatBytes(compareInfo.original.file_size)}</p>
                      <p className="text-zinc-400 mt-0.5">
                        {compareInfo.original.codec?.toUpperCase()} | {compareInfo.original.resolution}
                      </p>
                      <p className="text-zinc-500 text-[10px] mt-0.5">
                        HDR: {compareInfo.original.hdr_type?.toUpperCase()}
                      </p>
                    </div>

                    {/* Audio Streams */}
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-wider block font-semibold font-mono">
                        Audio Tracks ({compareInfo.original.audio_streams?.length || 0})
                      </span>
                      <div className="bg-zinc-900/60 rounded p-1.5 border border-zinc-800 max-h-[70px] overflow-y-auto space-y-1 text-[10px] font-mono text-zinc-400">
                        {compareInfo.original.audio_streams && compareInfo.original.audio_streams.length > 0 ? (
                          compareInfo.original.audio_streams.map((s: any, idx: number) => (
                            <div key={idx} className="truncate border-b border-zinc-850/40 pb-0.5 last:border-b-0" title={formatAudioTrack(s)}>
                              #{s.index}: {formatAudioTrack(s)}
                            </div>
                          ))
                        ) : (
                          <div className="text-zinc-600 italic">No audio tracks</div>
                        )}
                      </div>
                    </div>

                    {/* Subtitle Streams */}
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-wider block font-semibold font-mono">
                        Subtitle Tracks ({compareInfo.original.subtitle_streams?.length || 0})
                      </span>
                      <div className="bg-zinc-900/60 rounded p-1.5 border border-zinc-800 max-h-[70px] overflow-y-auto space-y-1 text-[10px] font-mono text-zinc-400">
                        {compareInfo.original.subtitle_streams && compareInfo.original.subtitle_streams.length > 0 ? (
                          compareInfo.original.subtitle_streams.map((s: any, idx: number) => (
                            <div key={idx} className="truncate border-b border-zinc-850/40 pb-0.5 last:border-b-0" title={formatSubtitleTrack(s)}>
                              #{s.index}: {formatSubtitleTrack(s)}
                            </div>
                          ))
                        ) : (
                          <div className="text-zinc-600 italic">No subtitle tracks</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-400 font-mono mt-2 italic">File details unavailable (vault file missing?)</p>
                )}
              </div>
            </div>

            {/* Transcoded File */}
            <div className="bg-zinc-950/80 p-4 rounded-xl border border-zinc-850 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex justify-between items-start">
                  <span className="text-[10px] text-violet-400 font-bold uppercase tracking-wider font-mono">Transcoded File</span>
                  <a
                    href={api.getTranscodedDownloadUrl(movie.id)}
                    download
                    className="inline-flex items-center space-x-1 text-[10px] text-violet-400 hover:text-violet-300 font-bold transition hover:underline font-mono"
                  >
                    <Download className="h-3 w-3" />
                    <span>Download</span>
                  </a>
                </div>

                {compareInfo?.transcoded ? (
                  <div className="mt-2 space-y-2.5">
                    <div className="font-mono text-xs text-zinc-300">
                      <div className="flex items-baseline space-x-2">
                        <p className="font-bold text-emerald-400 text-sm">
                          {formatBytes(compareInfo.transcoded.file_size)}
                        </p>
                        {savedPercent > 0 && (
                          <span className="text-[10px] text-emerald-500 font-extrabold bg-emerald-950/60 border border-emerald-900 px-1 py-0.2 rounded font-mono">
                            -{savedPercent}%
                          </span>
                        )}
                      </div>
                      <p className="text-zinc-400 mt-0.5">
                        {compareInfo.transcoded.codec?.toUpperCase()} | {compareInfo.transcoded.resolution}
                      </p>
                      <p className="text-zinc-500 text-[10px] mt-0.5">
                        HDR: {compareInfo.transcoded.hdr_type?.toUpperCase()}
                      </p>
                    </div>

                    {/* Audio Streams */}
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-wider block font-semibold font-mono">
                        Audio Tracks ({compareInfo.transcoded.audio_streams?.length || 0})
                      </span>
                      <div className="bg-zinc-900/60 rounded p-1.5 border border-zinc-800 max-h-[70px] overflow-y-auto space-y-1 text-[10px] font-mono text-zinc-400">
                        {compareInfo.transcoded.audio_streams && compareInfo.transcoded.audio_streams.length > 0 ? (
                          compareInfo.transcoded.audio_streams.map((s: any, idx: number) => (
                            <div key={idx} className="truncate border-b border-zinc-850/40 pb-0.5 last:border-b-0" title={formatAudioTrack(s)}>
                              #{s.index}: {formatAudioTrack(s)}
                            </div>
                          ))
                        ) : (
                          <div className="text-zinc-600 italic">No audio tracks</div>
                        )}
                      </div>
                    </div>

                    {/* Subtitle Streams */}
                    <div className="space-y-1">
                      <span className="text-[9px] text-zinc-500 uppercase tracking-wider block font-semibold font-mono">
                        Subtitle Tracks ({compareInfo.transcoded.subtitle_streams?.length || 0})
                      </span>
                      <div className="bg-zinc-900/60 rounded p-1.5 border border-zinc-800 max-h-[70px] overflow-y-auto space-y-1 text-[10px] font-mono text-zinc-400">
                        {compareInfo.transcoded.subtitle_streams && compareInfo.transcoded.subtitle_streams.length > 0 ? (
                          compareInfo.transcoded.subtitle_streams.map((s: any, idx: number) => (
                            <div key={idx} className="truncate border-b border-zinc-850/40 pb-0.5 last:border-b-0" title={formatSubtitleTrack(s)}>
                              #{s.index}: {formatSubtitleTrack(s)}
                            </div>
                          ))
                        ) : (
                          <div className="text-zinc-600 italic">No subtitle tracks</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-rose-400 font-mono mt-2 italic">File details unavailable (transcode failed?)</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-zinc-900/40 border-t border-zinc-800/60 flex space-x-2">
        <button
          onClick={() => onApprove(movie.id)}
          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer font-sans"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Approve Swap</span>
        </button>
        <button
          onClick={() => onReject(movie.id)}
          className="flex-1 py-2 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1 cursor-pointer font-sans"
        >
          <XCircle className="h-3.5 w-3.5" />
          <span>Reject & Restore</span>
        </button>
        <button
          onClick={() => onViewLogs(movie.id, movie.filename)}
          className="p-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-400 rounded-lg transition cursor-pointer"
          title="Logs"
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function formatRemainingTime(startedAt: string | undefined, progress: number): string {
  if (!startedAt || progress <= 0) return 'Estimating remaining time...';
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  const elapsed = (now - start) / 1000;
  if (elapsed <= 0) return 'Estimating remaining time...';
  
  const totalEstimated = elapsed / (progress / 100);
  const remaining = totalEstimated - elapsed;
  if (remaining <= 0) return 'Almost done...';
  
  if (remaining < 60) {
    return `Remaining: ${Math.round(remaining)}s`;
  }
  const remainingMinutes = Math.floor(remaining / 60);
  const remainingSeconds = Math.round(remaining % 60);
  if (remainingMinutes < 60) {
    return `Remaining: ${remainingMinutes}m ${remainingSeconds}s`;
  }
  const remainingHours = Math.floor(remainingMinutes / 60);
  const finalMinutes = remainingMinutes % 60;
  return `Remaining: ${remainingHours}h ${finalMinutes}m`;
}

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'approvals' | 'library' | 'profiles' | 'settings'>('dashboard');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [suggestedProfiles, setSuggestedProfiles] = useState<ProfileSuggestion[]>([]);
  const [_, setSettingsList] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeLogs, setActiveLogs] = useState<{ id: number; name: string; content: string } | null>(null);
  
  // Library filters
  const [libFilter, setLibFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Create Profile state
  const [showCreateProfileModal, setShowCreateProfileModal] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [newProfile, setNewProfile] = useState({
    name: '',
    description: '',
    resolution_min_width: 0,
    resolution_max_width: 99999,
    hdr_matching: 'any' as 'any' | 'hdr_only' | 'sdr_only',
    video_codec: 'av1_qsv',
    video_quality_type: 'crf' as 'crf' | 'qp' | 'bitrate',
    video_quality_value: 22,
    ffmpeg_preset: 'medium',
    audio_languages: 'eng',
    audio_codec: 'copy',
    audio_bitrate: '640k',
    subtitle_languages: 'eng',
    strip_image_subs: true,
    custom_ffmpeg_args: '',
    enabled: true
  });

  // Settings State
  const [autoQueue, setAutoQueue] = useState(true);
  const [schedulerConfig, setSchedulerConfig] = useState({
    enabled: false,
    start_time: '00:00',
    end_time: '08:00'
  });
  const [diskSafetyConfig, setDiskSafetyConfig] = useState({
    min_free_gb: 50
  });
  const [queueHalted, setQueueHalted] = useState(false);

  // Load everything on startup
  const fetchData = async () => {
    try {
      const dashboardStats = await api.getStats();
      setStats(dashboardStats);

      const profileList = await api.getProfiles();
      setProfiles(profileList);

      const suggestedList = await api.getSuggestedProfiles();
      setSuggestedProfiles(suggestedList);

      const allSettings = await api.getSettings();
      setSettingsList(allSettings);

      // Parse settings into states
      const autoQ = allSettings.find(s => s.key === 'auto_queue');
      if (autoQ) setAutoQueue(autoQ.value === 'true');

      const sched = allSettings.find(s => s.key === 'scheduler_config');
      if (sched) setSchedulerConfig(JSON.parse(sched.value));

      const disk = allSettings.find(s => s.key === 'disk_safety_config');
      if (disk) setDiskSafetyConfig(JSON.parse(disk.value));

      const haltedSetting = allSettings.find(s => s.key === 'queue_halted');
      if (haltedSetting) setQueueHalted(haltedSetting.value === 'true');

      // Fetch movies based on active view
      if (activeTab === 'library') {
        const movieList = await api.getMovies(libFilter === 'all' ? undefined : libFilter, searchQuery);
        setMovies(movieList);
      } else if (activeTab === 'approvals') {
        const pendingList = await api.getMovies('pending_approval');
        setMovies(pendingList);
      } else if (activeTab === 'dashboard') {
        // Fetch recently transcoding or pending
        const allList = await api.getMovies();
        setMovies(allList);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching data:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Handle search and status filter changes on the server side (with 300ms debounce)
  useEffect(() => {
    if (activeTab === 'library') {
      const delayDebounceFn = setTimeout(async () => {
        try {
          const status = libFilter === 'all' ? undefined : libFilter;
          const movieList = await api.getMovies(status, searchQuery);
          setMovies(movieList);
        } catch (err) {
          console.error('Error searching movies:', err);
        }
      }, 300);
      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchQuery, libFilter, activeTab]);

  // Polling for live active job stats (every 3 seconds)
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const dashboardStats = await api.getStats();
        setStats(dashboardStats);
        
        // If something is active, also refresh lists
        if (dashboardStats.gpu_status.active_job || activeTab === 'dashboard' || activeTab === 'approvals') {
          // Soft reload
          const profileList = await api.getProfiles();
          setProfiles(profileList);
          
          const suggestedList = await api.getSuggestedProfiles();
          setSuggestedProfiles(suggestedList);
          
          if (activeTab === 'library') {
            const movieList = await api.getMovies(libFilter === 'all' ? undefined : libFilter, searchQuery);
            setMovies(movieList);
          } else if (activeTab === 'approvals') {
            const pendingList = await api.getMovies('pending_approval');
            setMovies(pendingList);
          } else if (activeTab === 'dashboard') {
            const allList = await api.getMovies();
            setMovies(allList);
          }
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.scanLibrary();
      setTimeout(() => {
        setScanning(false);
        fetchData();
      }, 2000);
    } catch (err) {
      alert('Scanning failed');
      setScanning(false);
    }
  };

  const handleApprove = async (id: number) => {
    try {
      await api.approveMovie(id);
      fetchData();
    } catch (err) {
      alert('Approval failed');
    }
  };

  const handleReject = async (id: number) => {
    try {
      await api.rejectMovie(id);
      fetchData();
    } catch (err) {
      alert('Rejection failed');
    }
  };

  const handleQueue = async (id: number) => {
    try {
      await api.queueMovie(id);
      fetchData();
    } catch (err) {
      alert('Queue failed');
    }
  };

  const handleSkip = async (id: number) => {
    try {
      await api.skipMovie(id);
      fetchData();
    } catch (err) {
      alert('Mark skip failed');
    }
  };

  const handleManualProfileMatch = async (movieId: number, profileId: number | null) => {
    try {
      await api.matchProfile(movieId, profileId);
      // Auto queue after matching
      await api.queueMovie(movieId);
      fetchData();
    } catch (err) {
      alert('Profile match failed');
    }
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProfileId !== null) {
        await api.updateProfile(editingProfileId, newProfile);
      } else {
        await api.createProfile(newProfile);
      }
      setShowCreateProfileModal(false);
      setEditingProfileId(null);
      setNewProfile({
        name: '',
        description: '',
        resolution_min_width: 0,
        resolution_max_width: 99999,
        hdr_matching: 'any',
        video_codec: 'av1_qsv',
        video_quality_type: 'crf',
        video_quality_value: 22,
        ffmpeg_preset: 'medium',
        audio_languages: 'eng',
        audio_codec: 'copy',
        audio_bitrate: '640k',
        subtitle_languages: 'eng',
        strip_image_subs: true,
        custom_ffmpeg_args: '',
        enabled: true
      });
      fetchData();
    } catch (err) {
      alert(editingProfileId !== null ? 'Failed to update profile' : 'Failed to create profile');
    }
  };

  const handleToggleHalt = async () => {
    try {
      const newHaltState = !queueHalted;
      await api.updateSetting('queue_halted', newHaltState.toString());
      setQueueHalted(newHaltState);
      fetchData();
    } catch (err) {
      alert('Failed to toggle queue state');
    }
  };

  const handleResetMovie = async (id: number) => {
    try {
      await fetch(`${import.meta.env.DEV ? 'http://localhost:8080/api' : '/api'}/movies/${id}/reset`, { method: 'POST' });
      fetchData();
    } catch (err) {
      alert('Reset status failed');
    }
  };

  const handleDeleteProfile = async (id: number) => {
    if (window.confirm('Are you sure you want to delete this profile?')) {
      try {
        await api.deleteProfile(id);
        fetchData();
      } catch (err) {
        alert('Failed to delete profile');
      }
    }
  };

  const handleToggleProfileEnabled = async (p: Profile) => {
    try {
      await api.updateProfile(p.id, { enabled: !p.enabled });
      fetchData();
    } catch (err) {
      alert('Failed to update profile status');
    }
  };

  const handleEditProfileClick = (p: Profile) => {
    setEditingProfileId(p.id);
    setNewProfile({
      name: p.name,
      description: p.description || '',
      resolution_min_width: p.resolution_min_width,
      resolution_max_width: p.resolution_max_width,
      hdr_matching: p.hdr_matching,
      video_codec: p.video_codec,
      video_quality_type: p.video_quality_type,
      video_quality_value: p.video_quality_value,
      ffmpeg_preset: p.ffmpeg_preset,
      audio_languages: p.audio_languages,
      audio_codec: p.audio_codec,
      audio_bitrate: p.audio_bitrate,
      subtitle_languages: p.subtitle_languages,
      strip_image_subs: p.strip_image_subs,
      custom_ffmpeg_args: p.custom_ffmpeg_args || '',
      enabled: p.enabled
    });
    setShowCreateProfileModal(true);
  };

  const handleCreateProfileClick = () => {
    setEditingProfileId(null);
    setNewProfile({
      name: '',
      description: '',
      resolution_min_width: 0,
      resolution_max_width: 99999,
      hdr_matching: 'any',
      video_codec: 'av1_qsv',
      video_quality_type: 'crf',
      video_quality_value: 22,
      ffmpeg_preset: 'medium',
      audio_languages: 'eng',
      audio_codec: 'copy',
      audio_bitrate: '640k',
      subtitle_languages: 'eng',
      strip_image_subs: true,
      custom_ffmpeg_args: '',
      enabled: true
    });
    setShowCreateProfileModal(true);
  };

  const handleAdoptProfileClick = (s: ProfileSuggestion) => {
    setEditingProfileId(null);
    setNewProfile({
      name: s.name,
      description: s.description || '',
      resolution_min_width: s.resolution_min_width,
      resolution_max_width: s.resolution_max_width,
      hdr_matching: s.hdr_matching,
      video_codec: s.video_codec,
      video_quality_type: s.video_quality_type,
      video_quality_value: s.video_quality_value,
      ffmpeg_preset: s.ffmpeg_preset,
      audio_languages: s.audio_languages,
      audio_codec: s.audio_codec,
      audio_bitrate: s.audio_bitrate,
      subtitle_languages: s.subtitle_languages,
      strip_image_subs: s.strip_image_subs,
      custom_ffmpeg_args: s.custom_ffmpeg_args || '',
      enabled: true
    });
    setShowCreateProfileModal(true);
  };

  const handleSaveSettings = async () => {
    try {
      await api.updateSetting('auto_queue', autoQueue.toString());
      await api.updateSetting('scheduler_config', JSON.stringify(schedulerConfig));
      await api.updateSetting('disk_safety_config', JSON.stringify(diskSafetyConfig));
      alert('Settings saved successfully!');
      fetchData();
    } catch (err) {
      alert('Failed to save settings');
    }
  };

  const viewLogs = async (movieId: number, filename: string) => {
    try {
      const data = await api.getMovieLogs(movieId);
      setActiveLogs({ id: movieId, name: filename, content: data.logs });
    } catch (err) {
      alert('Failed to retrieve logs');
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'detected': return 'bg-zinc-800 text-zinc-400 border border-zinc-700';
      case 'queued': return 'bg-blue-950 text-blue-300 border border-blue-800';
      case 'transcoding': return 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse';
      case 'pending_approval': return 'bg-violet-950 text-violet-300 border border-violet-800 shadow-md shadow-violet-900/10';
      case 'approved': return 'bg-emerald-950 text-emerald-300 border border-emerald-800';
      case 'manual_matching': return 'bg-rose-950 text-rose-300 border border-rose-800';
      case 'skipped': return 'bg-zinc-900 text-zinc-500 border border-zinc-800';
      default: return 'bg-zinc-800 text-zinc-400';
    }
  };

  // Filter movies for library tab (already filtered on the server side)
  const filteredMovies = movies;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-violet-500 selection:text-white">
      {/* HEADER / NAVIGATION */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-tr from-violet-600 to-indigo-600 p-2 rounded-xl shadow-lg shadow-violet-950/40">
              <Film className="h-6 w-6 text-white" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-violet-400 to-indigo-200 bg-clip-text text-transparent">
                TransVault
              </span>
              <span className="text-[10px] font-medium bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-md ml-2 border border-zinc-700">v1.0.0</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <nav className="flex space-x-1">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: Database },
                { id: 'approvals', label: 'Approvals', icon: CheckCircle, badge: stats?.pending_approval },
                { id: 'library', label: 'Library', icon: Film },
                { id: 'profiles', label: 'Profiles', icon: Sliders },
                { id: 'settings', label: 'Settings', icon: Settings },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id 
                      ? 'bg-zinc-800 text-white shadow-inner' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? 'text-violet-400' : 'text-zinc-500'}`} />
                  <span>{tab.label}</span>
                  {tab.badge && tab.badge > 0 ? (
                    <span className="flex h-5 min-w-5 px-1 items-center justify-center text-[10px] font-bold bg-violet-600 text-white rounded-full">
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              ))}
            </nav>

            <button
              onClick={handleToggleHalt}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 border cursor-pointer ${
                queueHalted 
                  ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border-rose-800' 
                  : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${queueHalted ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`}></span>
              <span>{queueHalted ? 'Queue Halted' : 'Queue Active'}</span>
            </button>
          </div>
        </div>
      </header>

      {queueHalted && (
        <div className="bg-rose-950/40 border-b border-rose-900/60 py-2.5 text-center text-xs text-rose-300 font-bold flex items-center justify-center space-x-2">
          <AlertCircle className="h-4 w-4 text-rose-400" />
          <span>The Transvault Queue is currently halted. No new transcoding processes will start until resumed.</span>
          <button 
            onClick={handleToggleHalt} 
            className="underline ml-2 text-rose-400 hover:text-white transition cursor-pointer"
          >
            Resume Queue
          </button>
        </div>
      )}

      {/* WORKSPACE CONTENT */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* STATS OVERVIEW HEADER */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-zinc-500 mb-2">
                  <span className="text-xs uppercase tracking-wider font-semibold">Total Library</span>
                  <Film className="h-4 w-4 text-violet-400" />
                </div>
                <div className="text-2xl font-bold font-sans">{stats.total_movies} <span className="text-xs text-zinc-500 font-normal">videos</span></div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-zinc-850/80 space-y-1 text-[11px] text-zinc-400 font-mono">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                    <span>Transcoded:</span>
                  </span>
                  <strong className="text-emerald-400">{stats.transcoded_movies}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
                    <span>In Queue:</span>
                  </span>
                  <strong className="text-blue-400">{stats.queued}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500"></span>
                    <span>Manual Match:</span>
                  </span>
                  <strong className="text-rose-400">{stats.manual_matching}</strong>
                </div>
              </div>
            </div>
            
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all">
              <div className="flex items-center justify-between text-zinc-500 mb-2">
                <span className="text-xs uppercase tracking-wider font-semibold">Saved Space</span>
                <HardDrive className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold text-emerald-400">{formatBytes(stats.space_saved_bytes)}</div>
              <div className="text-xs text-emerald-500/80 mt-1 flex items-center space-x-1.5">
                <Check className="h-3.5 w-3.5" />
                <span>Storage reclaimed</span>
              </div>
            </div>
            
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all">
              <div className="flex items-center justify-between text-zinc-500 mb-2">
                <span className="text-xs uppercase tracking-wider font-semibold">Pending Approval</span>
                <CheckCircle className="h-4 w-4 text-violet-500" />
              </div>
              <div className="text-2xl font-bold text-violet-400">{stats.pending_approval}</div>
              <div className="text-xs text-violet-500/80 mt-1 flex items-center space-x-1.5">
                <Clock className="h-3 w-3" />
                <span>Awaiting safe-swap review</span>
              </div>
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700/60 transition-all">
              <div className="flex items-center justify-between text-zinc-500 mb-2">
                <span className="text-xs uppercase tracking-wider font-semibold">Intel GPU / Hardware</span>
              </div>
              <div className="text-sm font-bold flex items-center space-x-2">
                <div className={`h-2.5 w-2.5 rounded-full ${stats.gpu_status.detected ? 'bg-indigo-400 animate-pulse' : 'bg-zinc-600'}`}></div>
                <span className="truncate max-w-[150px]">{stats.gpu_status.detected ? 'Intel QuickSync Active' : 'Software Fallback'}</span>
              </div>
              <div className="text-xs text-zinc-500 mt-1.5 truncate">{stats.gpu_status.name || 'No GPU passed'}</div>
            </div>
          </div>
        )}

        {/* LOADING STATE */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <RefreshCw className="h-10 w-10 text-violet-500 animate-spin" />
            <p className="text-zinc-400">Loading TransVault core modules...</p>
          </div>
        ) : (
          <>
            {/* ==================== DASHBOARD TAB ==================== */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                
                {/* ACTIVE TRANSCODING TASK SECTION */}
                {stats?.gpu_status.active_job?.id ? (
                  <div className="bg-gradient-to-b from-zinc-900 to-zinc-950 border border-amber-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full filter blur-3xl pointer-events-none"></div>
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
                    
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                          </span>
                          <span className="text-xs uppercase tracking-wider font-extrabold text-amber-500">Active Transcoding Job</span>
                        </div>
                        <h2 className="text-xl font-bold mt-1 text-zinc-100 truncate max-w-2xl">{stats.gpu_status.active_job.filename}</h2>
                        <p className="text-xs text-zinc-400 mt-0.5">Matched Profile: <strong className="text-zinc-300">{stats.gpu_status.active_job.profile_name}</strong></p>
                      </div>
                      
                      <div className="flex items-center space-x-6 bg-zinc-900/80 px-4 py-2.5 rounded-xl border border-zinc-800 self-start md:self-auto text-sm">
                        <div>
                          <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Frames per Sec</span>
                          <strong className="text-amber-400 font-mono text-base">{stats.gpu_status.active_job.fps}</strong>
                        </div>
                        <div className="border-l border-zinc-800 h-8"></div>
                        <div>
                          <span className="block text-[10px] text-zinc-500 uppercase tracking-wider">Transcoding Speed</span>
                          <strong className="text-zinc-200 font-mono text-base">{stats.gpu_status.active_job.speed}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Progress slider bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-mono font-medium">
                        <span className="text-amber-400">{stats.gpu_status.active_job.progress}% Complete</span>
                        <span className="text-zinc-500">{formatRemainingTime(stats.gpu_status.active_job.started_at, stats.gpu_status.active_job.progress)}</span>
                      </div>
                      <div className="w-full bg-zinc-900 h-3.5 rounded-full overflow-hidden border border-zinc-800 p-0.5">
                        <div 
                          className="bg-gradient-to-r from-amber-600 to-amber-400 h-2 rounded-full transition-all duration-300 shadow-md shadow-amber-500/20"
                          style={{ width: `${stats.gpu_status.active_job.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-2xl p-6 text-center">
                    <Cpu className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-400">No active transcoding jobs.</p>
                    {stats?.queued && stats.queued > 0 ? (
                      <p className="text-xs text-zinc-500 mt-1">
                        {stats.queued} movie(s) waiting in the queue. 
                        {schedulerConfig.enabled && " Currently outside transcoding schedule window."}
                      </p>
                    ) : (
                      <div className="mt-4">
                        <button
                          onClick={handleScan}
                          disabled={scanning}
                          className="px-4 py-2 bg-zinc-850 hover:bg-zinc-800 text-zinc-200 rounded-xl text-xs font-medium border border-zinc-700 transition flex items-center space-x-1.5 mx-auto"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
                          <span>{scanning ? 'Scanning...' : 'Scan Library Now'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* RECENT MOVIES & LOGS DOUBLE COLUMN */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left: Quick Actions / Vault Pending Approvals */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-md text-zinc-300">Quick Approvals</h3>
                      <button onClick={() => setActiveTab('approvals')} className="text-violet-400 hover:text-violet-300 text-xs font-semibold flex items-center space-x-0.5">
                        <span>View all approvals</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {movies.filter(m => m.status === 'pending_approval').slice(0, 3).length > 0 ? (
                        movies.filter(m => m.status === 'pending_approval').slice(0, 3).map(movie => {
                          const saved = movie.file_size - (movie.transcoded_size || 0);
                          const pct = Math.round((saved / movie.file_size) * 100);
                          return (
                            <div key={movie.id} className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 flex justify-between items-center hover:border-zinc-700 transition-all">
                              <div className="max-w-[70%]">
                                <h4 className="font-bold text-sm text-zinc-200 truncate">{movie.filename}</h4>
                                <p className="text-zinc-500 text-[10px] mt-0.5">Profile: <strong className="text-zinc-400 font-semibold">{movie.matched_profile?.name || 'Dynamic Match'}</strong></p>
                                <div className="flex items-center space-x-2 text-xs text-zinc-500 mt-1 font-mono">
                                  <span>{formatBytes(movie.file_size)}</span>
                                  <ArrowRight className="h-3 w-3" />
                                  <span className="text-emerald-400 font-semibold">{formatBytes(movie.transcoded_size || 0)}</span>
                                  <span className="bg-emerald-950/80 text-emerald-400 border border-emerald-900 px-1 py-0.2 rounded text-[10px]">
                                    -{pct}%
                                  </span>
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <button 
                                  onClick={() => handleApprove(movie.id)}
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition"
                                  title="Approve & Delete Original"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                                <button 
                                  onClick={() => handleReject(movie.id)}
                                  className="p-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition"
                                  title="Reject & Restore Original"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="border border-zinc-800 border-dashed rounded-xl p-6 text-center text-xs text-zinc-500">
                          No transcoded movies currently pending safe-swap approval.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Library Status Log */}
                  <div className="space-y-4">
                    <h3 className="font-bold text-md text-zinc-300">Recent Transcodes</h3>
                    <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
                      <div className="divide-y divide-zinc-800/80">
                        {(() => {
                          const recent = movies
                            .filter(m => ['approved', 'transcoding', 'manual_matching'].includes(m.status))
                            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
                            .slice(0, 5);
                          
                          return recent.length > 0 ? (
                            recent.map(m => (
                              <div key={m.id} className="p-3.5 flex justify-between items-center text-xs">
                                <div className="truncate max-w-[60%]">
                                  <p className="font-semibold text-zinc-200 truncate">{m.filename}</p>
                                  <p className="text-zinc-500 text-[10px] mt-0.5">{m.matched_profile?.name || 'Automated match'}</p>
                                </div>
                                <div className="flex items-center space-x-3">
                                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${getStatusBadgeClass(m.status)}`}>
                                    {m.status.replace('_', ' ')}
                                  </span>
                                  <button 
                                    onClick={() => viewLogs(m.id, m.filename)}
                                    className="p-1 text-zinc-500 hover:text-zinc-300 transition"
                                    title="View Output Log"
                                  >
                                    <FileText className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="p-6 text-center text-xs text-zinc-500">
                              No transcodes have been completed yet.
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ==================== APPROVALS TAB ==================== */}
            {activeTab === 'approvals' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-bold text-zinc-200">Safe Vault Staging Queue</h2>
                  <p className="text-zinc-400 text-xs mt-1">
                    Original movies are held in the vault. Approve the transcoded file to delete the original and claim space, or Reject to roll back instantly.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {movies.length > 0 ? (
                    movies.map(movie => (
                      <ApprovalCard
                        key={movie.id}
                        movie={movie}
                        onApprove={handleApprove}
                        onReject={handleReject}
                        onViewLogs={viewLogs}
                        formatBytes={formatBytes}
                      />
                    ))
                  ) : (
                    <div className="col-span-2 border border-zinc-800 border-dashed rounded-2xl py-16 text-center">
                      <CheckCircle className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                      <h3 className="font-extrabold text-zinc-400 text-md">Vault Staging is Empty</h3>
                      <p className="text-zinc-500 text-xs mt-1">Transcoded movies will show up here for validation before deleting originals.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== LIBRARY TAB ==================== */}
            {activeTab === 'library' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-200">Library Indexer</h2>
                    <p className="text-zinc-400 text-xs mt-1">Track and manage transcoding jobs across your media directory.</p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleScan}
                      disabled={scanning}
                      className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
                      <span>{scanning ? 'Scanning...' : 'Trigger Scan'}</span>
                    </button>
                  </div>
                </div>

                {/* Filter and Search Bar */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2">
                    {[
                      { filter: 'all', label: 'All Files' },
                      { filter: 'detected', label: 'Detected' },
                      { filter: 'queued', label: 'Queued' },
                      { filter: 'transcoding', label: 'Transcoding' },
                      { filter: 'pending_approval', label: 'Pending Approval' },
                      { filter: 'approved', label: 'Approved' },
                      { filter: 'manual_matching', label: 'Manual Match' },
                      { filter: 'skipped', label: 'Skipped' },
                    ].map(btn => (
                      <button
                        key={btn.filter}
                        onClick={() => setLibFilter(btn.filter)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                          libFilter === btn.filter 
                            ? 'bg-zinc-800 text-white' 
                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  <input
                    type="text"
                    placeholder="Search movies by filename..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-zinc-950 border border-zinc-850 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-violet-500 w-full md:max-w-xs text-zinc-200"
                  />
                </div>

                {/* Movie list table */}
                <div className="bg-zinc-900/20 border border-zinc-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 font-bold uppercase tracking-wider">
                        <th className="p-4">Movie Filename</th>
                        <th className="p-4">Original Specs</th>
                        <th className="p-4">Current Status</th>
                        <th className="p-4">Matched Profile</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850">
                      {filteredMovies.length > 0 ? (
                        filteredMovies.map(movie => (
                          <tr key={movie.id} className="hover:bg-zinc-900/20 transition-all">
                            <td className="p-4 max-w-sm">
                              <p className="font-extrabold text-zinc-200 truncate" title={movie.filename}>{movie.filename}</p>
                              <span className="text-[10px] text-zinc-500 font-mono select-all truncate block mt-0.5">{movie.relative_path}</span>
                            </td>
                            <td className="p-4 font-mono space-y-0.5 text-[11px]">
                              <p className="text-zinc-300">{formatBytes(movie.file_size)}</p>
                              <p className="text-zinc-500">{movie.codec?.toUpperCase()} | {movie.resolution}</p>
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-extrabold tracking-wider ${getStatusBadgeClass(movie.status)}`}>
                                {movie.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="p-4">
                              {['detected', 'skipped', 'manual_matching'].includes(movie.status) ? (
                                <select
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    handleManualProfileMatch(movie.id, val ? parseInt(val) : null);
                                  }}
                                  value={movie.matched_profile_id || ""}
                                  className="bg-zinc-950 border border-zinc-800 text-zinc-300 rounded px-2 py-1 text-[11px] max-w-[180px] focus:outline-none focus:border-rose-500"
                                >
                                  <option value="">Dynamic Search...</option>
                                  {profiles.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                  ))}
                                </select>
                              ) : (
                                <span className="text-zinc-300 font-semibold">{movie.matched_profile?.name || 'Dynamic Search...'}</span>
                              )}
                            </td>
                            <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                              {['detected', 'skipped'].includes(movie.status) && (
                                <button
                                  onClick={() => handleQueue(movie.id)}
                                  className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 text-zinc-200 rounded font-semibold text-[10px]"
                                >
                                  Queue Job
                                </button>
                              )}
                              
                              {['transcoding', 'queued', 'manual_matching', 'skipped', 'pending_approval'].includes(movie.status) && (
                                <button
                                  onClick={() => handleResetMovie(movie.id)}
                                  className="px-2.5 py-1 bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 rounded font-semibold text-[10px]"
                                  title="Reset status back to detected"
                                >
                                  Reset
                                </button>
                              )}

                              {['detected', 'queued', 'manual_matching'].includes(movie.status) && (
                                <button
                                  onClick={() => handleSkip(movie.id)}
                                  className="px-2.5 py-1 hover:bg-zinc-850 text-zinc-500 rounded font-semibold text-[10px]"
                                >
                                  Skip
                                </button>
                              )}

                              {movie.status === 'pending_approval' && (
                                <div className="inline-flex space-x-1">
                                  <button
                                    onClick={() => handleApprove(movie.id)}
                                    className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded transition"
                                    title="Approve Swap"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleReject(movie.id)}
                                    className="p-1 bg-rose-600 hover:bg-rose-500 text-white rounded transition"
                                    title="Reject Restore"
                                  >
                                    <XCircle className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}

                              <button
                                onClick={() => viewLogs(movie.id, movie.filename)}
                                className="p-1 text-zinc-500 hover:text-zinc-300 transition inline-block"
                                title="Logs"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-zinc-500">
                            No movies match the selected filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ==================== PROFILES TAB ==================== */}
            {activeTab === 'profiles' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-zinc-200">Encoding Profiles</h2>
                    <p className="text-zinc-400 text-xs mt-1">Compose rules to target transcoding properties by movie matching parameters.</p>
                  </div>

                  <button
                    onClick={handleCreateProfileClick}
                    className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-violet-950/20 transition flex items-center space-x-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Create Profile</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {profiles.map(p => (
                    <div key={p.id} className={`border rounded-xl p-5 transition flex flex-col justify-between ${
                      p.enabled 
                        ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700' 
                        : 'bg-zinc-950/40 border-zinc-900/80 opacity-60 hover:opacity-80'
                    }`}>
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center space-x-2">
                              <h3 className={`font-extrabold text-sm ${p.enabled ? 'text-zinc-200' : 'text-zinc-400 line-through'}`}>{p.name}</h3>
                              <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${
                                p.enabled 
                                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' 
                                  : 'bg-zinc-900 text-zinc-500 border border-zinc-850'
                              }`}>
                                {p.enabled ? 'Active' : 'Disabled'}
                              </span>
                            </div>
                            <p className="text-zinc-500 text-[11px] mt-1">{p.description || 'No description provided.'}</p>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            <button
                              onClick={() => handleToggleProfileEnabled(p)}
                              className={`p-1.5 bg-zinc-950 border rounded-lg transition cursor-pointer ${
                                p.enabled 
                                  ? 'border-zinc-850 hover:border-emerald-800 text-zinc-500 hover:text-emerald-400' 
                                  : 'border-zinc-850 hover:border-zinc-750 text-zinc-500 hover:text-zinc-300'
                              }`}
                              title={p.enabled ? "Disable Profile" : "Enable Profile"}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleEditProfileClick(p)}
                              className="p-1.5 bg-zinc-950 hover:bg-violet-950 border border-zinc-850 hover:border-violet-900 text-zinc-500 hover:text-violet-400 rounded-lg transition cursor-pointer"
                              title="Edit Profile"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteProfile(p.id)}
                              className="p-1.5 bg-zinc-950 hover:bg-rose-950 border border-zinc-850 hover:border-rose-900 text-zinc-500 hover:text-rose-400 rounded-lg transition cursor-pointer"
                              title="Delete Profile"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        {/* Profile metrics grid */}
                        <div className="grid grid-cols-2 gap-4 bg-zinc-950 p-3.5 rounded-lg border border-zinc-850 text-xs font-mono">
                          <div>
                            <span className="block text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Target Rules</span>
                            <div className="space-y-0.5 text-zinc-400">
                              <p>Width: {p.resolution_min_width}px - {p.resolution_max_width === 99999 ? 'Any' : `${p.resolution_max_width}px`}</p>
                              <p>HDR: {p.hdr_matching.toUpperCase().replace('_', ' ')}</p>
                            </div>
                          </div>
                          <div>
                            <span className="block text-[9px] text-violet-400 uppercase tracking-wider mb-1">Encoders</span>
                            <div className="space-y-0.5 text-zinc-400">
                              <p>Video: {p.video_codec.toUpperCase()}</p>
                              <p>Quality: {p.video_quality_type.toUpperCase()} {p.video_quality_value}</p>
                              <p>Preset: {p.ffmpeg_preset}</p>
                            </div>
                          </div>
                        </div>

                        {/* Tracks details */}
                        <div className="flex flex-wrap gap-2 text-[10px]">
                          <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-850 rounded text-zinc-400">
                            Audio Keep: {p.audio_languages} | Codec: {p.audio_codec}
                          </span>
                          <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-850 rounded text-zinc-400">
                            Subs Keep: {p.subtitle_languages} {p.strip_image_subs && '(Strip PGS)'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Suggested Profiles Section */}
                {suggestedProfiles.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-zinc-850 space-y-4">
                    <div>
                      <h3 className="text-lg font-bold text-zinc-200 flex items-center space-x-2">
                        <Sliders className="h-5 w-5 text-violet-500" />
                        <span>Suggested Encoding Profiles</span>
                      </h3>
                      <p className="text-zinc-400 text-xs mt-1">Based on files in your library that do not match any existing profiles. Adopt them to customize and automate their transcoding.</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {suggestedProfiles.map((sp, idx) => (
                        <div key={`suggested-${idx}`} className="bg-zinc-900/30 border border-dashed border-zinc-850 rounded-xl p-5 hover:border-violet-900/60 transition flex flex-col justify-between">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <h3 className="font-extrabold text-zinc-300 text-sm">{sp.name}</h3>
                                  <span className="text-[9px] bg-violet-950/40 text-violet-400 border border-violet-900/60 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Suggested</span>
                                  <span className="text-[9px] bg-zinc-950 text-zinc-500 border border-zinc-850 px-1.5 py-0.5 rounded font-mono font-semibold">{sp.match_count} file{sp.match_count > 1 ? 's' : ''}</span>
                                </div>
                                <p className="text-zinc-500 text-[11px] mt-1">{sp.description}</p>
                              </div>
                              
                              <button
                                onClick={() => handleAdoptProfileClick(sp)}
                                className="px-2.5 py-1.5 bg-violet-950 hover:bg-violet-900 text-violet-300 hover:text-violet-200 border border-violet-900/85 rounded-lg text-xs font-bold transition flex items-center space-x-1"
                                title="Adopt Profile"
                              >
                                <Plus className="h-3 w-3" />
                                <span>Adopt</span>
                              </button>
                            </div>

                            {/* Suggestion metrics grid */}
                            <div className="grid grid-cols-2 gap-4 bg-zinc-950/60 p-3.5 rounded-lg border border-zinc-850 text-xs font-mono">
                              <div>
                                <span className="block text-[9px] text-zinc-500 uppercase tracking-wider mb-1">Target Rules</span>
                                <div className="space-y-0.5 text-zinc-400">
                                  <p>Width: {sp.resolution_min_width}px - {sp.resolution_max_width === 99999 ? 'Any' : `${sp.resolution_max_width}px`}</p>
                                  <p>HDR: {sp.hdr_matching.toUpperCase().replace('_', ' ')}</p>
                                </div>
                              </div>
                              <div>
                                <span className="block text-[9px] text-violet-500 uppercase tracking-wider mb-1">Recommended Encoders</span>
                                <div className="space-y-0.5 text-zinc-400">
                                  <p>Video: {sp.video_codec.toUpperCase()}</p>
                                  <p>Quality: {sp.video_quality_type.toUpperCase()} {sp.video_quality_value}</p>
                                  <p>Preset: {sp.ffmpeg_preset}</p>
                                </div>
                              </div>
                            </div>

                            {/* Tracks details */}
                            <div className="flex flex-wrap gap-2 text-[10px]">
                              <span className="px-2 py-0.5 bg-zinc-950/50 border border-zinc-850 rounded text-zinc-500">
                                Audio Keep: {sp.audio_languages} | Codec: {sp.audio_codec}
                              </span>
                              <span className="px-2 py-0.5 bg-zinc-950/50 border border-zinc-850 rounded text-zinc-500">
                                Subs Keep: {sp.subtitle_languages} {sp.strip_image_subs && '(Strip PGS)'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ==================== SETTINGS TAB ==================== */}
            {activeTab === 'settings' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h2 className="text-xl font-bold text-zinc-200">System Configurations</h2>
                  <p className="text-zinc-400 text-xs mt-1">Configure directories, automatic queue behaviors, and schedule execution windows.</p>
                </div>

                <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-6 space-y-6">
                  
                  {/* Auto-Queue Toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="font-extrabold text-sm text-zinc-200 block">Auto-Queue Transcodes</label>
                      <span className="text-zinc-500 text-xs mt-0.5">Automatically queue newly discovered movies matching profile rules.</span>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={autoQueue} 
                      onChange={(e) => setAutoQueue(e.target.checked)}
                      className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-zinc-800 rounded bg-zinc-950"
                    />
                  </div>

                  <hr className="border-zinc-800" />

                  {/* Scheduler Settings */}
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-extrabold text-sm text-zinc-200 flex items-center space-x-1.5">
                        <Clock className="h-4 w-4 text-zinc-500" />
                        <span>Transcoding Scheduling Window</span>
                      </h3>
                      <p className="text-zinc-500 text-xs mt-0.5">Define timeframe when hardware is allowed to execute transcoding workloads.</p>
                    </div>

                    <div className="flex items-center space-x-3">
                      <input 
                        type="checkbox" 
                        checked={schedulerConfig.enabled} 
                        onChange={(e) => setSchedulerConfig({...schedulerConfig, enabled: e.target.checked})}
                        className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-zinc-800 rounded bg-zinc-950"
                      />
                      <label className="text-xs text-zinc-300">Enable time schedule restriction</label>
                    </div>

                    {schedulerConfig.enabled && (
                      <div className="grid grid-cols-2 gap-4 max-w-xs font-mono">
                        <div>
                          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Start Time</label>
                          <input 
                            type="time" 
                            value={schedulerConfig.start_time}
                            onChange={(e) => setSchedulerConfig({...schedulerConfig, start_time: e.target.value})}
                            className="bg-zinc-950 border border-zinc-800 rounded p-1.5 w-full text-xs text-zinc-300 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">End Time</label>
                          <input 
                            type="time" 
                            value={schedulerConfig.end_time}
                            onChange={(e) => setSchedulerConfig({...schedulerConfig, end_time: e.target.value})}
                            className="bg-zinc-950 border border-zinc-800 rounded p-1.5 w-full text-xs text-zinc-300 focus:outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <hr className="border-zinc-800" />

                  {/* Disk Space Safety config */}
                  <div className="space-y-3">
                    <div>
                      <label className="font-extrabold text-sm text-zinc-200 block">Disk Space Safety Guardrail</label>
                      <span className="text-zinc-500 text-xs mt-0.5">Pause transcoding if free disk space on library volume falls below threshold.</span>
                    </div>

                    <div className="flex items-center space-x-2 max-w-[120px] font-mono">
                      <input 
                        type="number" 
                        value={diskSafetyConfig.min_free_gb}
                        onChange={(e) => setDiskSafetyConfig({ min_free_gb: parseInt(e.target.value) || 0 })}
                        className="bg-zinc-950 border border-zinc-800 rounded p-1.5 w-full text-xs text-zinc-300 focus:outline-none text-right"
                      />
                      <span className="text-xs text-zinc-400">GB</span>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="pt-4">
                    <button
                      onClick={handleSaveSettings}
                      className="px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-violet-950/20"
                    >
                      Save Configuration
                    </button>
                  </div>

                </div>
              </div>
            )}
          </>
        )}

      </main>

      {/* FOOTER */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-4 text-center text-[10px] text-zinc-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p>© 2026 TransVault Inc. Open source MIT license.</p>
          <div className="flex space-x-3">
            <span className="hover:text-zinc-400 cursor-pointer">Documentation</span>
            <span>•</span>
            <span className="hover:text-zinc-400 cursor-pointer">Support Discord</span>
          </div>
        </div>
      </footer>

      {/* ==================== DIALOGS & MODALS ==================== */}

      {/* CREATE PROFILE MODAL */}
      {showCreateProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col justify-between">
            <div className="p-6 border-b border-zinc-800">
              <h3 className="font-extrabold text-md text-zinc-200">{editingProfileId !== null ? 'Edit Transcoding Profile' : 'Compose Transcoding Profile'}</h3>
              <p className="text-zinc-500 text-xs mt-0.5">{editingProfileId !== null ? 'Modify rules for selecting video presets and track modifications.' : 'Compose rules for selecting video presets and track modifications.'}</p>
            </div>
            
            <form onSubmit={handleCreateProfile} className="p-6 space-y-4 text-xs flex-grow">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-zinc-400 mb-1 font-semibold">Profile Name</label>
                  <input
                    type="text" required
                    placeholder="e.g. Intel AV1 QSV 1080p SDR"
                    value={newProfile.name}
                    onChange={(e) => setNewProfile({...newProfile, name: e.target.value})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none focus:border-violet-500 text-zinc-200"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-zinc-400 mb-1 font-semibold">Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Optimized encoding for movies below 4K resolution"
                    value={newProfile.description}
                    onChange={(e) => setNewProfile({...newProfile, description: e.target.value})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none focus:border-violet-500 text-zinc-200"
                  />
                </div>

                <div className="border-t border-zinc-850 col-span-2 my-2"></div>
                <h4 className="font-extrabold text-xs text-zinc-300 col-span-2">Matching Rules</h4>

                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">Min Resolution Width (px)</label>
                  <input
                    type="number"
                    value={newProfile.resolution_min_width}
                    onChange={(e) => setNewProfile({...newProfile, resolution_min_width: parseInt(e.target.value) || 0})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">Max Resolution Width (px)</label>
                  <input
                    type="number"
                    value={newProfile.resolution_max_width}
                    onChange={(e) => setNewProfile({...newProfile, resolution_max_width: parseInt(e.target.value) || 99999})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-zinc-400 mb-1 font-semibold">HDR Matching Filter</label>
                  <select
                    value={newProfile.hdr_matching}
                    onChange={(e) => setNewProfile({...newProfile, hdr_matching: e.target.value as any})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  >
                    <option value="any">Match Any SDR or HDR</option>
                    <option value="hdr_only">HDR / Dolby Vision Only</option>
                    <option value="sdr_only">SDR Only</option>
                  </select>
                </div>

                <div className="border-t border-zinc-850 col-span-2 my-2"></div>
                <h4 className="font-extrabold text-xs text-zinc-300 col-span-2">Video Encoding Settings</h4>

                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">Video Codec</label>
                  <select
                    value={newProfile.video_codec}
                    onChange={(e) => setNewProfile({...newProfile, video_codec: e.target.value})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  >
                    <option value="av1_qsv">AV1 Hardware (Intel QSV)</option>
                    <option value="hevc_qsv">HEVC/H.265 Hardware (Intel QSV)</option>
                    <option value="h264_qsv">H.264 Hardware (Intel QSV)</option>
                    <option value="libsvtav1">AV1 Software (SVT-AV1)</option>
                    <option value="libx265">HEVC/H.265 Software (CPU)</option>
                    <option value="libx264">H.264 Software (CPU)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">Quality Level (CRF / Global Quality)</label>
                  <input
                    type="number"
                    value={newProfile.video_quality_value}
                    onChange={(e) => setNewProfile({...newProfile, video_quality_value: parseInt(e.target.value) || 22})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  />
                </div>

                <div className="border-t border-zinc-850 col-span-2 my-2"></div>
                <h4 className="font-extrabold text-xs text-zinc-300 col-span-2">Tracks Whitelist Rules</h4>

                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">Audio Languages (comma separated)</label>
                  <input
                    type="text"
                    value={newProfile.audio_languages}
                    onChange={(e) => setNewProfile({...newProfile, audio_languages: e.target.value})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1 font-semibold">Subtitle Languages (comma separated)</label>
                  <input
                    type="text"
                    value={newProfile.subtitle_languages}
                    onChange={(e) => setNewProfile({...newProfile, subtitle_languages: e.target.value})}
                    className="bg-zinc-950 border border-zinc-850 rounded-lg p-2 w-full focus:outline-none text-zinc-200"
                  />
                </div>
                <div className="col-span-2 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newProfile.strip_image_subs}
                    onChange={(e) => setNewProfile({...newProfile, strip_image_subs: e.target.checked})}
                    className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-zinc-800 rounded bg-zinc-950"
                  />
                  <label className="text-zinc-400 font-semibold">Strip image subtitles (PGS/DVD) to save space</label>
                </div>
                <div className="col-span-2 flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={newProfile.enabled}
                    onChange={(e) => setNewProfile({...newProfile, enabled: e.target.checked})}
                    className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-zinc-800 rounded bg-zinc-950"
                  />
                  <label className="text-zinc-400 font-semibold">Enable profile for automatic matching</label>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex space-x-2 justify-end">
                <button
                  type="button"
                  onClick={() => setShowCreateProfileModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-lg font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-bold shadow-md shadow-violet-950/20"
                >
                  {editingProfileId !== null ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOGS MODAL */}
      {activeLogs && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col justify-between">
            <div className="p-5 border-b border-zinc-850 flex justify-between items-center">
              <div>
                <h3 className="font-extrabold text-sm text-zinc-200">Transcode stdout log details</h3>
                <p className="text-zinc-500 text-xs mt-0.5 truncate max-w-2xl">{activeLogs.name}</p>
              </div>
              <button 
                onClick={() => setActiveLogs(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 rounded-lg text-xs font-semibold transition"
              >
                Close Logs
              </button>
            </div>
            
            <div className="p-5 flex-grow overflow-auto bg-zinc-950 text-[11px] font-mono leading-relaxed text-zinc-400 border-b border-zinc-850 whitespace-pre-wrap select-text">
              {activeLogs.content}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
