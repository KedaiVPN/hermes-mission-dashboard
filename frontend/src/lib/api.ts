import type { Profile, Task, TaskCreate, TaskUpdate, Execution, Project, GitHubRepo, PRD, PlanningQuestion, TaskAssignment, QAPair, ProfileCreatePayload, SoulDocument, SkillCatalog, ProfileSkills, SkillEntry } from '../types';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; service: string }>('/api/health'),
  listTasks: () => request<Task[]>('/api/tasks'),
  createTask: (payload: TaskCreate) =>
    request<Task>('/api/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  updateTask: (id: number, payload: TaskUpdate) =>
    request<Task>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteTask: (id: number) =>
    request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  listProfiles: () => request<Profile[]>('/api/profiles'),
  getProfileModel: (profileName: string) => request<import('../types').ProfileModel>(`/api/profiles/${profileName}/model`),
  updateProfileModel: (profileName: string, modelName: string) =>
    request<{ success: boolean; profile_name: string; model_name: string; message: string }>(
      `/api/profiles/${profileName}/model`,
      { method: 'POST', body: JSON.stringify({ model_name: modelName }) },
    ),
  listModels: () => request<{ models: string[]; count: number }>('/api/models'),

  // Profile administration (create / delete / SOUL.md / skills)
  createProfile: (payload: ProfileCreatePayload) =>
    request<Profile>('/api/profiles', { method: 'POST', body: JSON.stringify(payload) }),
  deleteProfile: (profileName: string, confirm: string) =>
    request<{ deleted: string; path: string }>(
      `/api/profiles/${encodeURIComponent(profileName)}?confirm=${encodeURIComponent(confirm)}`,
      { method: 'DELETE' },
    ),
  getProfileSoul: (profileName: string) =>
    request<SoulDocument>(`/api/profiles/${encodeURIComponent(profileName)}/soul`),
  updateProfileSoul: (profileName: string, content: string) =>
    request<{ profile: string; path: string; bytes: number; backup: string | null }>(
      `/api/profiles/${encodeURIComponent(profileName)}/soul`,
      { method: 'PUT', body: JSON.stringify({ content }) },
    ),
  listProfileSkills: (profileName: string) =>
    request<ProfileSkills>(`/api/profiles/${encodeURIComponent(profileName)}/skills`),
  listSkillCatalog: (profileName?: string) =>
    request<SkillCatalog>(`/api/skills/catalog${profileName ? `?profile=${encodeURIComponent(profileName)}` : ''}`),
  addProfileSkill: (profileName: string, skill: { name: string; category?: string }) =>
    request<SkillEntry>(`/api/profiles/${encodeURIComponent(profileName)}/skills`, {
      method: 'POST',
      body: JSON.stringify(skill),
    }),
  removeProfileSkill: (profileName: string, skillName: string, category?: string) =>
    request<{ profile: string; removed: string; path: string }>(
      `/api/profiles/${encodeURIComponent(profileName)}/skills/${encodeURIComponent(skillName)}${category ? `?category=${encodeURIComponent(category)}` : ''}`,
      { method: 'DELETE' },
    ),
  runTask: (taskId: number) =>
    request<{ execution_id: number; status: string }>(`/api/tasks/${taskId}/run`, { method: 'POST' }),
  listExecutions: (taskId: number) =>
    request<Execution[]>(`/api/tasks/${taskId}/executions`),
  eventsUrl: () => `${apiBase}/api/events`,

  // Projects & GitHub
  listProjects: () => request<Project[]>('/api/projects'),
  listGitHubRepos: () => request<GitHubRepo[]>('/api/github/repos'),
  importGitHubProject: (repoFullName: string) =>
    request<Project>(`/api/github/import-project?repo_full_name=${encodeURIComponent(repoFullName)}`, { method: 'POST' }),

  // Planning & PRD
  analyzeTaskTech: (taskId: number) =>
    request<import('../types').TechAnalysis>(`/api/tasks/${taskId}/plan/analyze`, { method: 'POST' }),
  submitTechChoices: (taskId: number, payload: { choices: Record<string, string>; notes?: string }) =>
    request<PRD>(`/api/tasks/${taskId}/plan/submit-tech-choices`, { method: 'POST', body: JSON.stringify(payload) }),
  getPlanningQuestions: (taskId: number) =>
    request<{ questions: PlanningQuestion[] }>(`/api/tasks/${taskId}/plan/questions`),
  generatePRD: (taskId: number, payload: { title: string; content: string; qa_history: QAPair[] }) =>
    request<PRD>(`/api/tasks/${taskId}/plan/generate-prd`, { method: 'POST', body: JSON.stringify(payload) }),
  getPRD: (taskId: number) =>
    request<PRD>(`/api/tasks/${taskId}/prd`),
  updatePRD: (taskId: number, content: string) =>
    request<PRD>(`/api/tasks/${taskId}/prd`, { method: 'PATCH', body: JSON.stringify({ content }) }),
  approvePlan: (taskId: number) =>
    request<Task>(`/api/tasks/${taskId}/plan/approve`, { method: 'POST' }),
  listAssignments: (taskId: number) =>
    request<TaskAssignment[]>(`/api/tasks/${taskId}/assignments`),
  addAssignment: (taskId: number, payload: { profile_name: string; role: string; reason: string }) =>
    request<TaskAssignment>(`/api/tasks/${taskId}/assignments`, { method: 'POST', body: JSON.stringify(payload) }),
  deleteAssignment: (taskId: number, assignmentId: number) =>
    request<void>(`/api/tasks/${taskId}/assignments/${assignmentId}`, { method: 'DELETE' }),
};
