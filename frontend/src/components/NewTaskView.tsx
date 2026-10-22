import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { WorkspaceSelector } from './WorkspaceSelector';
import type { Project, TaskCreate, GitHubRepo } from '../types';

interface CreateTaskFormState {
  title: string;
  description: string;
  selectedProfile: string;
  projectMode: 'existing' | 'new';
  selectedProject: Project | null;
  githubRepos: GitHubRepo[];
  isLoadingRepos: boolean;
  hasRequestedRepos: boolean;
}

export function NewTaskView() {
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<CreateTaskFormState>({
    title: '',
    description: '',
    selectedProfile: '',
    projectMode: 'existing',
    selectedProject: null,
    githubRepos: [],
    isLoadingRepos: false,
    hasRequestedRepos: false,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setFormState({
        title: '',
        description: '',
        selectedProfile: '',
        projectMode: 'existing',
        selectedProject: null,
        githubRepos: [],
        isLoadingRepos: false,
        hasRequestedRepos: false,
      });
    },
  });

  const handleCreate = (payload: TaskCreate) => {
    createMutation.mutate(payload);
  };

  const handleRepoLoad = () => {
    if (!formState.hasRequestedRepos) {
      setFormState(prev => ({ ...prev, isLoadingRepos: true }));
      api.listGitHubRepos().then((repos: GitHubRepo[]) => {
        setFormState(prev => ({ ...prev, githubRepos: repos, isLoadingRepos: false, hasRequestedRepos: true }));
      });
    }
  };

  const handleProjectSelect = (project: Project) => {
    setFormState(prev => ({ ...prev, selectedProject: project, projectMode: 'existing' }));
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formState.title.trim()) return;

    let project_id = null;
    if (formState.projectMode === 'existing' && formState.selectedProject) {
      project_id = formState.selectedProject.id;
    }

    handleCreate({
      title: formState.title.trim(),
      description: formState.description.trim(),
      profile: formState.selectedProfile || null,
      project_id,
      project_mode: formState.projectMode,
      new_project_name: null,
    });
  };

  return (
    <div className="max-w-2xl">
      <header className="mb-6">
        <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-[0.14em]">Compose</p>
        <h1 className="text-2xl font-semibold text-zinc-100 mt-1">New Task</h1>
        <p className="text-sm text-zinc-400 mt-2">
          Create a new task with workspace/repository selection and planning workflow.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white/5 border border-white/10 rounded-lg p-5">
        {/* Title */}
        <div>
          <label htmlFor="title" className="block text-xs font-medium text-zinc-400 mb-1.5">Task Title</label>
          <input
            id="title"
            type="text"
            value={formState.title}
            onChange={e => setFormState(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Contoh: Buatkan saya website payment gateway…"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="block text-xs font-medium text-zinc-400 mb-1.5">Description</label>
          <textarea
            id="description"
            value={formState.description}
            onChange={e => setFormState(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Detail task…"
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 min-h-[90px]"
          />
        </div>

        {/* Profile Selector */}
        <div>
          <label htmlFor="profile" className="block text-xs font-medium text-zinc-400 mb-1.5">Profile Agen</label>
          <select
            id="profile"
            value={formState.selectedProfile}
            onChange={e => setFormState(prev => ({ ...prev, selectedProfile: e.target.value }))}
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded text-sm text-zinc-200 focus:outline-none focus:border-blue-500/50 appearance-none cursor-pointer"
          >
            <option value="">Pilih profile (opsional)</option>
            {profilesQuery.data?.map(p => (
              <option key={p.name} value={p.name}>
                @{p.name} {p.is_default ? '(default)' : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-zinc-500">
            Profile yang dipilih akan menganalisis dan mengajukan pertanyaan sesuai konteks task.
          </p>
        </div>

        {/* Workspace/Project Selector */}
        <div className="pt-4 border-t border-white/5">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-3">Workspace & Project</h2>
          <WorkspaceSelector
            mode={formState.projectMode}
            onModeChange={(mode: 'existing' | 'new') => setFormState(prev => ({ ...prev, projectMode: mode }))}
            selectedProject={formState.selectedProject}
            onProjectSelect={handleProjectSelect}
            onBrowseGitHub={handleRepoLoad}
            projects={projectsQuery.data ?? []}
            githubRepos={formState.githubRepos}
            isLoadingRepos={formState.isLoadingRepos}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4">
          <button
            type="submit"
            disabled={createMutation.isPending || !formState.title.trim()}
            className="flex-1 px-4 py-2.5 bg-blue-500/15 border border-blue-500/30 rounded text-sm font-medium text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Task & Start Planning'}
          </button>
          <button
            type="button"
            onClick={() => {
              setFormState({
                title: '',
                description: '',
                selectedProfile: '',
                projectMode: 'existing',
                selectedProject: null,
                githubRepos: [],
                isLoadingRepos: false,
                hasRequestedRepos: false,
              });
            }}
            className="px-4 py-2.5 bg-white/5 border border-white/10 rounded text-sm font-medium text-zinc-400 hover:bg-white/10 transition-colors"
          >
            Reset
          </button>
        </div>

        {createMutation.isError && (
          <p className="text-xs text-red-400 mt-2" role="alert">
            Gagal membuat task. Periksa koneksi dan coba lagi.
          </p>
        )}
      </form>
    </div>
  );
}
