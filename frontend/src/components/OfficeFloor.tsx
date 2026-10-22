import { useState, useMemo, useEffect, lazy, Suspense } from 'react';
import type { Task, Profile, OfficeStation, OfficeRoom, OfficeState } from '../types';

// Lazy load Office3D so Three.js bundles cleanly
const Office3D = lazy(() => import('./Office3D'));

interface OfficeFloorProps {
  tasks: Task[];
  profiles: Profile[];
  onSelectTask?: (task: Task) => void;
  onNavigateToNewTask?: () => void;
  onNavigateToTasks?: () => void;
  onOpenSidebar?: () => void;
}

export function OfficeFloor({
  tasks,
  profiles,
  onSelectTask,
  onNavigateToNewTask,
  onNavigateToTasks,
  onOpenSidebar,
}: OfficeFloorProps) {
  const [selectedStation, setSelectedStation] = useState<OfficeStation | null>(null);
  const [showLegend, setShowLegend] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Check if device is mobile
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  }, []);

  // Track portrait / landscape viewport orientation
  const [isPortrait, setIsPortrait] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  });

  useEffect(() => {
    const checkOrient = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    window.addEventListener('resize', checkOrient);
    window.addEventListener('orientationchange', checkOrient);
    return () => {
      window.removeEventListener('resize', checkOrient);
      window.removeEventListener('orientationchange', checkOrient);
    };
  }, []);

  // Auto-forced landscape on mobile portrait mode (default on)
  const [forceLandscape, setForceLandscape] = useState(() => {
    try {
      const val = localStorage.getItem('mc.officeAutoLandscape');
      if (val !== null) return val === '1';
      return true;
    } catch {
      return true;
    }
  });

  const toggleForceLandscape = () => {
    setForceLandscape((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('mc.officeAutoLandscape', next ? '1' : '0');
      } catch {}
      return next;
    });
  };

  const isRotated = isMobile && isPortrait && forceLandscape;

  // Available agent profiles
  const agentList = useMemo(() => {
    if (profiles && profiles.length > 0) return profiles;
    return [{ name: 'default', path: '/root/.hermes', has_soul: true, is_default: true }];
  }, [profiles]);

  // Map Mission Control profiles & tasks into Ruang 3D OfficeStations
  const stations = useMemo<OfficeStation[]>(() => {
    return agentList.map((prof, idx) => {
      // Find active active task for this profile
      const activeTask = tasks.find((t) => {
        if (t.status !== 'active') return false;
        if (t.profile === prof.name) return true;
        if (!t.profile && prof.is_default) return true;
        return false;
      })

      const isWorking = Boolean(activeTask);
      const state: OfficeState = isWorking ? 'Working' : 'Idle';
      const room: OfficeRoom = isWorking ? 'Workspace' : 'Lounge';
      const role = prof.is_default ? 'Lead Engineer' : 'Specialist Agent';
      const activity = activeTask ? `Task #${activeTask.id}: ${activeTask.title}` : '';

      return {
        id: prof.name,
        name: prof.name,
        role,
        room,
        roomPosition: isWorking ? `desk-${idx + 1}` : 'lounge-seat-1',
        state,
        currentTask: activeTask ? `#${activeTask.id} ${activeTask.title}` : 'No active task',
        recentActivity: activeTask ? `Running Task #${activeTask.id}` : 'Resting in office',
        activity,
        seat: idx + 1,
        provenance: 'Local Hermes Profile',
        freshness: 'live',
      };
    });
  }, [agentList, tasks]);

  const workingCount = useMemo(() => {
    return stations.filter((s) => s.state === 'Working').length;
  }, [stations]);

  const idleCount = Math.max(0, stations.length - workingCount);

  // Find linked task if an agent is selected
  const activeTaskForSelected = useMemo(() => {
    if (!selectedStation) return null;
    return tasks.find((t) => {
      if (t.status !== 'active') return false;
      if (t.profile === selectedStation.id) return true;
      if (!t.profile && selectedStation.id === 'default') return true;
      return false;
    });
  }, [selectedStation, tasks]);

  return (
    <div
      className={`office-stage-3d ${isFullscreen ? 'is-fullscreen' : ''} ${
        isRotated ? 'force-landscape' : ''
      }`}
    >
      {/* 3D Office Stage Viewport - Full Landscape Bleed */}
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-[#15201c] text-sm text-[#94a3b8] font-mono">
            Memuat Ruang 3D Office...
          </div>
        }
      >
        <Office3D
          stations={stations}
          onSelect={(station) => setSelectedStation(station)}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
          isFullscreen={isFullscreen}
          isRotated={isRotated}
        />
      </Suspense>

      {/* Floating HUD Top Status Bar */}
      <div className="office-hud-bar">
        <div className="flex items-center gap-1 shrink-0">
          {onOpenSidebar && (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="rounded-md border border-white/20 bg-black/60 hover:bg-black/80 px-2 py-0.5 text-[11px] font-mono text-zinc-200 backdrop-blur-md transition-colors"
              title="Buka Navigasi Menu"
            >
              ☰ Menu
            </button>
          )}

          {isMobile && isPortrait && (
            <button
              type="button"
              onClick={toggleForceLandscape}
              className="rounded-md border border-blue-500/40 bg-blue-950/70 hover:bg-blue-900/80 px-2 py-0.5 text-[11px] font-mono text-blue-300 backdrop-blur-md transition-colors font-medium"
              title="Beralih antara mode Landscape Otomatis dan Potret"
            >
              {forceLandscape ? '🔄 Potret' : '🔄 Landscape'}
            </button>
          )}

          {onNavigateToTasks && (
            <button
              type="button"
              onClick={onNavigateToTasks}
              className="rounded-md border border-white/20 bg-black/60 hover:bg-black/80 px-2 py-0.5 text-[11px] font-mono text-zinc-300 backdrop-blur-md transition-colors"
              title="Kembali ke Task Board"
            >
              ✕ Keluar
            </button>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5">
          <span className="font-semibold text-xs tracking-wider uppercase text-white/95">Office Floor</span>
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/70 px-1.5 py-0.5 text-[10px] sm:text-[11px] text-emerald-400 backdrop-blur-md">
            <span className="font-bold">{workingCount}</span>
            <span className="hidden sm:inline">Bekerja</span>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/70 px-1.5 py-0.5 text-[10px] sm:text-[11px] text-amber-400 backdrop-blur-md">
            <span className="font-bold">{idleCount}</span>
            <span className="hidden sm:inline">Istirahat</span>
          </div>
          <button
            type="button"
            onClick={() => setShowLegend(!showLegend)}
            className="rounded-md border border-white/20 bg-black/60 hover:bg-black/80 px-1.5 py-0.5 text-[10.5px] font-mono text-zinc-200 backdrop-blur-md transition-colors"
            title="Tampilkan Info Denah Kantor"
          >
            {showLegend ? '✕ Info' : 'ℹ Info'}
          </button>
        </div>
      </div>

      {/* Floating Collapsible Info / Legend Card */}
      {showLegend && (
        <div className="office-floating-legend">
          <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-300">
              Denah Ruang Kantor 3D
            </span>
            <button
              type="button"
              onClick={() => setShowLegend(false)}
              className="text-xs text-zinc-400 hover:text-white px-1"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-2 text-[11px] text-zinc-300">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
              <span>Kantor (Meja Kerja & Ruang Meeting)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
              <span>Lounge & Pantry (Sofa TV, Galon Air & Kulkas)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
              <span>Game Room (Ping-pong, Arcade & Karambol)</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
              <span>Luar (Gerobak Bakso, Kopi Sepeda & Bendera)</span>
            </span>
          </div>
          {onNavigateToNewTask && (
            <button
              type="button"
              onClick={onNavigateToNewTask}
              className="mt-2.5 w-full rounded bg-[#5c6ad2] hover:bg-[#4b58b8] py-1 text-xs font-medium text-white transition-colors"
            >
              + Tugaskan Task Baru
            </button>
          )}
        </div>
      )}

      {/* Selected Agent Floating Inspector Modal */}
      {selectedStation && (
        <div className="absolute bottom-12 left-3 right-3 sm:left-4 sm:right-auto sm:w-84 rounded-lg border border-[#3b4252] bg-[#161a23]/95 p-3.5 backdrop-blur-md shadow-2xl transition-all z-20">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                Agent Inspector
              </span>
              <h4 className="text-sm font-semibold text-white">
                Profile: {selectedStation.name}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStation(null)}
              className="text-xs text-[#8a8f98] hover:text-white px-2 py-0.5 rounded border border-[#2e3440]"
            >
              Tutup
            </button>
          </div>

          <div className="mt-2.5 flex flex-col gap-1.5 text-xs text-[#d8dee9]">
            <div className="flex items-center justify-between border-b border-[#2e3440]/60 pb-1">
              <span className="text-[#8a8f98]">Status Saat Ini:</span>
              <span
                className={`font-semibold ${
                  selectedStation.state === 'Working'
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              >
                {selectedStation.state === 'Working' ? 'Sedang Bekerja (Coding)' : 'Sedang Istirahat (Idle)'}
              </span>
            </div>
            <div className="flex items-center justify-between border-b border-[#2e3440]/60 pb-1">
              <span className="text-[#8a8f98]">Peran:</span>
              <span className="text-[#e5e9f0]">{selectedStation.role}</span>
            </div>

            {activeTaskForSelected ? (
              <div className="mt-1 rounded bg-[#1e2330] p-2.5 border border-[#2e3440]">
                <div className="text-[11px] text-[#8a8f98]">Tugas Aktif:</div>
                <div className="text-xs font-medium text-white truncate mt-0.5">
                  #{activeTaskForSelected.id} - {activeTaskForSelected.title}
                </div>
                {onSelectTask && (
                  <button
                    type="button"
                    onClick={() => onSelectTask(activeTaskForSelected)}
                    className="mt-2 w-full rounded bg-[#5c6ad2] hover:bg-[#4b58b8] px-2.5 py-1 text-xs font-medium text-white transition-colors"
                  >
                    Buka Detail Task
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-1 text-[11px] text-[#8a8f98] italic">
                Sedang tidak ada tugas aktif. Karakter sedang menikmati fasilitas kantor.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
