export interface Task {
  id: number;
  title: string;
  description: string;
  status: 'planning' | 'queued' | 'active' | 'blocked' | 'done';
  profile: string | null;
  project_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  title?: string;
  description: string;
  profile?: string | null;
  project_id?: number | null;
  project_mode?: 'existing' | 'new';
  new_project_name?: string | null;
}

export interface TaskUpdate {
  status: 'planning' | 'queued' | 'active' | 'blocked' | 'done';
}

export interface Profile {
  name: string;
  has_soul: boolean;
  is_default?: boolean;
}

export interface ProfileModel {
  default: string;
  provider: string;
  base_url?: string;
}

export interface TaskEvent {
  id: number;
  task_id: number;
  kind: string;
  message: string;
  created_at: string;
}

export interface Execution {
  id: number;
  task_id: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  exit_code: number | null;
  output: string;
  started_at: string;
  finished_at: string | null;
}

export interface Project {
  id: number;
  name: string;
  type: 'local' | 'github';
  local_path: string;
  github_repo: string | null;
  github_url: string | null;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface GitHubRepo {
  name: string;
  nameWithOwner: string;
  url: string;
  isPrivate: boolean;
  description: string | null;
  updatedAt: string;
}

export interface QAPair {
  question: string;
  answer: string;
}

export interface TechOption {
  id: string;
  name: string;
  description: string;
  recommended: boolean;
  badge?: string | null;
}

export interface TechStackCategory {
  id: string;
  title: string;
  description: string;
  options: TechOption[];
  selected: string;
}

export interface RecommendedProfile {
  name: string;
  reason: string;
}

export type OfficeState = 'Idle' | 'Working' | 'Reviewing' | 'Collaborating' | 'Offline' | 'Unknown';
export type OfficeRoom = 'Workspace' | 'Lounge';

export interface OfficeStation {
  id: string;
  name: string;
  role: string;
  room: OfficeRoom;
  roomPosition: string;
  state: OfficeState;
  currentTask: string;
  recentActivity: string;
  activity: string;
  seat: number;
  provenance?: string;
  freshness?: string;
  privacy?: 'locked' | 'unlocked';
}

export interface Source<T> {
  availability: 'available' | 'unavailable';
  data: T | null;
}


export interface PlanningQuestion {
  id: string;
  question: string;
  placeholder: string;
  required?: boolean;
}

export interface TechAnalysis {
  task_id: number;
  task_title: string;
  task_description: string;
  planning_type: 'tech_stack' | 'contextual';
  is_complete?: boolean;
  lead_profile: string | null;
  summary: string;
  estimated_complexity?: 'simple' | 'moderate' | 'complex';
  estimated_duration?: string;
  recommended_profiles: RecommendedProfile[];
  categories: TechStackCategory[];
  questions: PlanningQuestion[];
}

export interface PRD {
  id: number;
  task_id: number;
  title: string;
  content: string;
  qa_history: QAPair[];
  status: 'draft' | 'reviewed' | 'approved';
  created_at: string;
  updated_at: string;
}

export interface TaskAssignment {
  id: number;
  task_id: number;
  profile_name: string;
  role: string;
  reason: string;
  created_at: string;
}

export interface PlanningQuestion {
  id: string;
  question: string;
  placeholder: string;
  required?: boolean;
}

// ---------------------------------------------------------------------------
// Profile administration
// ---------------------------------------------------------------------------

export interface ProfileCreatePayload {
  name: string;
  description?: string | null;
  clone_from?: string | null;
  include_skills?: boolean;
}

export interface SoulDocument {
  profile: string;
  path: string;
  exists: boolean;
  content: string;
  updated_at: string | null;
}

export interface SkillEntry {
  name: string;
  dir_name: string;
  category: string;
  description: string;
  path: string;
  installed?: boolean;
}

export interface SkillCatalog {
  skills: SkillEntry[];
  count: number;
  categories: string[];
}

export interface ProfileSkills {
  profile: string;
  skills: SkillEntry[];
  count: number;
  is_global_pool: boolean;
}
