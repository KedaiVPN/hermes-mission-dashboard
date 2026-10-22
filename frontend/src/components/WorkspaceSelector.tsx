import { useState } from 'react';
import type { Project, GitHubRepo } from '../types';

interface WorkspaceSelectorProps {
  mode: 'existing' | 'new';
  onModeChange: (mode: 'existing' | 'new') => void;
  selectedProject: Project | null;
  onProjectSelect: (project: Project) => void;
  onBrowseGitHub: () => void;
  onGitHubRepoSelect?: (repo: GitHubRepo) => void;
  onClose?: () => void;
  projects: Project[];
  githubRepos: GitHubRepo[];
  isLoadingRepos?: boolean;
}

export function WorkspaceSelector({
  mode,
  onModeChange,
  selectedProject,
  onProjectSelect,
  onBrowseGitHub,
  onGitHubRepoSelect,
  onClose: _onClose,
  projects,
  githubRepos,
  isLoadingRepos = false,
}: WorkspaceSelectorProps) {
  const [showProjectList, setShowProjectList] = useState(false);
  const [showGitHubList, setShowGitHubList] = useState(false);

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange('existing')}
          className={`flex-1 px-3 py-2.5 text-xs font-medium rounded transition-all ${
            mode === 'existing'
              ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
              : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
          }`}
        >
          Edit Existing
        </button>
        <button
          type="button"
          onClick={() => onModeChange('new')}
          className={`flex-1 px-3 py-2.5 text-xs font-medium rounded transition-all ${
            mode === 'new'
              ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
              : 'bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10'
          }`}
        >
          New Project
        </button>
      </div>

      {/* Existing Project Selection */}
      {mode === 'existing' && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-zinc-400">Select Workspace</label>
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowProjectList(!showProjectList);
                setShowGitHubList(false);
              }}
              className="w-full text-left px-3 py-2.5 bg-white/5 border border-white/10 rounded text-sm text-zinc-200 hover:bg-white/10 transition-colors"
            >
              {selectedProject ? selectedProject.name : 'Choose workspace…'}
            </button>
            {showProjectList && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded shadow-lg z-10">
                {projects.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-zinc-600">No workspaces found</p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto">
                    {projects.map((proj) => (
                      <li key={proj.id}>
                        <button
                          type="button"
                          onClick={() => {
                            onProjectSelect(proj);
                            setShowProjectList(false);
                          }}
                          className="w-full text-left px-3 py-2.5 hover:bg-white/10 transition-colors text-sm text-zinc-300"
                        >
                          <div className="font-medium">{proj.name}</div>
                          <div className="text-xs text-zinc-600 mt-0.5">{proj.type === 'github' ? 'repo' : 'local'}</div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* GitHub Repos Option */}
          <button
            type="button"
            onClick={() => {
              onBrowseGitHub();
              setShowGitHubList(!showGitHubList);
              setShowProjectList(false);
            }}
            className="w-full text-left px-3 py-2.5 bg-white/5 border border-white/10 rounded text-sm text-zinc-400 hover:bg-white/10 transition-colors"
          >
            {showGitHubList ? 'Hide GitHub Repos' : 'Browse GitHub Repos'}
          </button>

          {showGitHubList && (
            <div className="bg-white/5 border border-white/10 rounded p-3 space-y-2 max-h-48 overflow-y-auto">
              {isLoadingRepos ? (
                <p className="text-xs text-zinc-600">Loading repos…</p>
              ) : githubRepos.length === 0 ? (
                <p className="text-xs text-zinc-600">No repos found</p>
              ) : (
                <ul className="space-y-1">
                  {githubRepos.map((repo) => (
                    <li key={repo.nameWithOwner}>
                      <button
                        type="button"
                        onClick={() => {
                          if (onGitHubRepoSelect) {
                            onGitHubRepoSelect(repo);
                          } else {
                            // Preserve the legacy selector behavior for callers
                            // that do not handle GitHub imports themselves.
                            console.log('Select GitHub repo:', repo.nameWithOwner);
                            setShowGitHubList(false);
                          }
                        }}
                        className="w-full text-left px-2.5 py-1.5 hover:bg-white/10 rounded text-xs transition-colors"
                      >
                        <div className="font-mono text-zinc-300">{repo.nameWithOwner}</div>
                        {repo.description && (
                          <div className="text-zinc-600 mt-0.5 line-clamp-1">{repo.description}</div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
