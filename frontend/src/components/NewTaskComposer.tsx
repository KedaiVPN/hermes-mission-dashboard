import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { WorkspaceSelector } from './WorkspaceSelector';
import type { Project, Task, TaskCreate, GitHubRepo } from '../types';

interface ComposerState {
  description: string;
  selectedProfile: string;
  projectMode: 'existing' | 'new';
  selectedProject: Project | null;
  githubRepos: GitHubRepo[];
  isLoadingRepos: boolean;
  hasRequestedRepos: boolean;
  showWorkspaceSelector: boolean;
}

interface NewTaskComposerProps {
  onTaskCreated?: (task: Task) => void;
}

export function NewTaskComposer({ onTaskCreated }: NewTaskComposerProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  const [state, setState] = useState<ComposerState>({
    description: '',
    selectedProfile: '',
    projectMode: 'new',
    selectedProject: null,
    githubRepos: [],
    isLoadingRepos: false,
    hasRequestedRepos: false,
    showWorkspaceSelector: false,
  });

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: api.listProjects,
    refetchInterval: 30000,
  });

  const profilesQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: api.listProfiles,
    staleTime: 60000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: TaskCreate) => api.createTask(payload),
    onSuccess: (createdTask: Task) => {
      // Write the new task into the cache synchronously so the parent can
      // resolve it via tasks.find(...) in the same render (avoids a race
      // where PlanningModal renders with task === null and returns null).
      queryClient.setQueryData<Task[]>(['tasks'], (previous) => {
        if (!previous) return [createdTask];
        if (previous.some((task) => task.id === createdTask.id)) return previous;
        return [createdTask, ...previous];
      });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setState({
        description: '',
        selectedProfile: '',
        projectMode: 'new',
        selectedProject: null,
        githubRepos: [],
        isLoadingRepos: false,
        hasRequestedRepos: false,
        showWorkspaceSelector: false,
      });
      if (inputRef.current) inputRef.current.focus();
      onTaskCreated?.(createdTask);
    },
  });

  const importMutation = useMutation({
    mutationFn: (repoFullName: string) => api.importGitHubProject(repoFullName),
    onSuccess: (project: Project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setState(prev => ({
        ...prev,
        selectedProject: project,
        projectMode: 'existing',
        showWorkspaceSelector: false,
      }));
    },
  });

  const handleRepoLoad = () => {
    if (!state.hasRequestedRepos) {
      setState(prev => ({ ...prev, isLoadingRepos: true }));
      api.listGitHubRepos().then((repos: GitHubRepo[]) => {
        setState(prev => ({ ...prev, githubRepos: repos, isLoadingRepos: false, hasRequestedRepos: true }));
      });
    }
  };

  const handleProjectSelect = (project: Project) => {
    setState(prev => ({ ...prev, selectedProject: project, projectMode: 'existing', showWorkspaceSelector: false }));
  };

  const handleGitHubRepoSelect = (repo: GitHubRepo) => {
    importMutation.mutate(repo.nameWithOwner);
  };

  const handleSubmit = () => {
    if (!state.description.trim()) return;

    createMutation.mutate({
      description: state.description.trim(),
      profile: state.selectedProfile || null,
      project_id: state.projectMode === 'existing' && state.selectedProject ? state.selectedProject.id : null,
      project_mode: state.projectMode,
      new_project_name: null, // AI will auto-generate the project name
    });
  };

  // Auto-expand textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [state.description]);

  const isReady = state.description.trim().length > 0;

  // Nama yang ditampilkan di tempat "Project"
  const currentProjectLabel = state.projectMode === 'new' 
    ? 'New (auto)'
    : (state.selectedProject ? state.selectedProject.name : null);

  return (
    <div className="flex items-center justify-center h-full">
      {/* Single unified composer box */}
      <div className="w-full max-w-5xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Textarea */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            ref={inputRef}
            value={state.description}
            onChange={e => setState(prev => ({ ...prev, description: e.target.value }))}
            placeholder="What do you want to build or fix?"
            rows={3}
            className="w-full min-h-[120px] bg-transparent text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none text-[15px] leading-relaxed"
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (isReady) handleSubmit();
              }
            }}
          />
        </div>

        {/* Error */}
        {createMutation.isError && (
          <div className="px-4 pb-2">
            <p className="text-[11px] text-red-400">Gagal membuat task. Coba lagi.</p>
          </div>
        )}

        {/* Workspace selector panel (collapsible via Existing/New click) */}
        {state.showWorkspaceSelector && (
          <div className="px-4 pb-2">
            <div className="border border-zinc-800 rounded-lg bg-zinc-800/30 p-2 max-h-64 overflow-y-auto">
              <WorkspaceSelector
                mode={state.projectMode}
                onModeChange={(mode: 'existing' | 'new') => {
                  if (mode === 'new') {
                    setState(prev => ({ ...prev, projectMode: 'new', selectedProject: null, showWorkspaceSelector: false }));
                  } else {
                    setState(prev => ({ ...prev, projectMode: 'existing' }));
                  }
                }}
                selectedProject={state.selectedProject}
                onProjectSelect={handleProjectSelect}
                onBrowseGitHub={handleRepoLoad}
                onGitHubRepoSelect={handleGitHubRepoSelect}
                onClose={() => setState(prev => ({ ...prev, showWorkspaceSelector: false }))}
                projects={projectsQuery.data ?? []}
                githubRepos={state.githubRepos}
                isLoadingRepos={state.isLoadingRepos}
              />
            </div>
          </div>
        )}

        {/* Small chips row at bottom (seamless inside composer) */}
        <div className="px-3 pb-3 flex gap-1 items-center flex-nowrap overflow-x-auto">
          
          {/* Profile */}
          <div className="relative flex-shrink-0">
            <select
              value={state.selectedProfile}
              onChange={e => setState(prev => ({ ...prev, selectedProfile: e.target.value }))}
              className="h-6 pl-1.5 pr-5 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[10px] hover:bg-white/10 hover:text-zinc-200 transition-colors appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500/40 whitespace-nowrap"
            >
              <option value="">Profile</option>
              {profilesQuery.data?.map(p => (
                <option key={p.name} value={p.name}>{p.name}{p.is_default ? ' ✓' : ''}</option>
              ))}
            </select>
            <span className="absolute right-1 top-1/2 -translate-y-1/2 text-zinc-600 text-[8px] pointer-events-none">▾</span>
          </div>

          {/* Mode toggle (Existing / New) - sekarang klik ini untuk buka/tutup selector */}
          <div className="inline-flex rounded-full border border-white/10 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  projectMode: 'existing',
                  // Jika panel sudah kebuka dan mode sudah existing, toggle tutup. Kalau belum, buka.
                  showWorkspaceSelector: prev.projectMode === 'existing' ? !prev.showWorkspaceSelector : true,
                }));
              }}
              className={`h-6 px-2 text-[10px] transition-colors ${
                state.projectMode === 'existing' 
                  ? 'bg-blue-500/20 text-blue-300 font-medium' 
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Existing
            </button>
            <button
              type="button"
              onClick={() => {
                setState(prev => ({
                  ...prev,
                  projectMode: 'new',
                  // Jika panel sudah kebuka dan mode sudah new, toggle tutup. Kalau belum, buka.
                  showWorkspaceSelector: prev.projectMode === 'new' ? !prev.showWorkspaceSelector : true,
                }));
              }}
              className={`h-6 px-2 text-[10px] border-l border-white/10 transition-colors ${
                state.projectMode === 'new' 
                  ? 'bg-blue-500/20 text-blue-300 font-medium' 
                  : 'bg-white/5 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              New
            </button>
          </div>

          {/* Chip Hasil Project (hanya muncul saat ada project yang dipilih / nama new diisi) */}
          {currentProjectLabel && (
            <button
              type="button"
              onClick={() => setState(prev => ({ ...prev, showWorkspaceSelector: !prev.showWorkspaceSelector }))}
              className="h-6 px-2 rounded-full border border-blue-500/40 bg-blue-500/15 text-blue-300 text-[10px] transition-colors whitespace-nowrap flex-shrink-0 flex items-center gap-1"
              title="Klik untuk mengganti workspace"
            >
              <span>{currentProjectLabel}</span>
              <span className="text-[9px] text-blue-400/70">▾</span>
            </button>
          )}

          <div className="flex-1" />

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isReady || createMutation.isPending}
            aria-label="Submit task"
            className="h-6 w-6 rounded-full bg-zinc-100 hover:bg-white disabled:bg-zinc-800 disabled:opacity-50 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <svg
              className={`w-3 h-3 ${isReady ? 'text-zinc-900' : 'text-zinc-600'}`}
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
