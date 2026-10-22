import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { Header } from './components/Header';
import { TaskBoard } from './components/TaskBoard';
import { NewTaskComposer } from './components/NewTaskComposer';
import { Sidebar } from './components/Sidebar';
import { HamburgerButton } from './components/HamburgerButton';
import { ProfileCard } from './components/ProfileCard';
import { useEvents } from './hooks/useEvents';
import type { Task, TaskUpdate } from './types';
import { ExecutionModal } from './components/ExecutionModal';
import { PlanningModal } from './components/PlanningModal';
import { OfficeFloor } from './components/OfficeFloor';
import { CreateProfileModal } from './components/CreateProfileModal';

type View = 'office' | 'tasks' | 'new-task' | 'profiles';

export function App() {
  const queryClient = useQueryClient();
  const [currentView, setCurrentView] = useState<View>('tasks');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [planningTaskId, setPlanningTaskId] = useState<number | null>(null);
  const [showCreateProfile, setShowCreateProfile] = useState(false);

  const { data: tasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks'], queryFn: api.listTasks, refetchInterval: 5000,
  });
  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ['profiles'], queryFn: api.listProfiles, refetchInterval: 10000,
  });
  const tasks = tasksData ?? [];
  const profiles = profilesData ?? [];

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Task['status'] }) => api.updateTask(id, { status } as TaskUpdate),
    onSuccess: (updated) => {
      queryClient.setQueryData<Task[]>(['tasks'], (previous) =>
        previous?.map((task) => task.id === updated.id ? updated : task),
      );
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const runTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.runTask(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({ queryKey: ['executions', taskId] });
    },
  });
  const blockTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.updateTask(taskId, { status: 'blocked' } as TaskUpdate),
    onSuccess: (updated) => {
      queryClient.setQueryData<Task[]>(['tasks'], (previous) =>
        previous?.map((task) => task.id === updated.id ? updated : task),
      );
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (taskId: number) => api.deleteTask(taskId),
    onSuccess: (_, taskId) => {
      queryClient.setQueryData<Task[]>(['tasks'], (previous) =>
        previous?.filter((task) => task.id !== taskId),
      );
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
  const { connected: sseConnected } = useEvents((event) => {
    if (event.kind === 'task.created' || event.kind === 'task.updated') {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
    if (event.kind === 'execution.completed') {
      queryClient.invalidateQueries({ queryKey: ['executions', event.task_id] });
    }
  });

  const handleTaskStatusChange = useCallback(
    (taskId: number, status: Task['status']) => updateTaskMutation.mutate({ id: taskId, status }),
    [updateTaskMutation],
  );

  const handleUndo = useCallback(
    (taskId: number) => updateTaskMutation.mutate({ id: taskId, status: 'planning' }),
    [updateTaskMutation],
  );

  return (
    <div className="app-layout">
      <Sidebar
        currentView={currentView}
        onNavigate={setCurrentView}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        connected={sseConnected}
        tasksCount={tasks.length}
        profilesCount={profiles.length}
      />

      <main className="app-main-content">
        <div className="app-mobile-bar">
          <HamburgerButton onClick={() => setSidebarOpen((open) => !open)} isOpen={sidebarOpen} />
          <span className="app-mobile-title">
            {currentView === 'office'
              ? 'Office Floor'
              : currentView === 'tasks'
              ? 'Task Board'
              : currentView === 'new-task'
              ? 'New Task'
              : 'Agent Profiles'}
          </span>
          <span className={`connection-dot ${sseConnected ? 'live' : ''}`} aria-label={sseConnected ? 'Live connection' : 'Reconnecting'} />
        </div>
        <div className={`app-content-inner ${currentView === 'new-task' ? 'new-task-content' : ''} ${currentView === 'office' ? 'office-content' : ''}`}>
          {currentView === 'office' && (
            <section className="view-section office-section" aria-label="Office Floor">
              <OfficeFloor
                tasks={tasks}
                profiles={profiles}
                onSelectTask={setSelectedTask}
                onNavigateToNewTask={() => setCurrentView('new-task')}
                onNavigateToTasks={() => setCurrentView('tasks')}
                onOpenSidebar={() => setSidebarOpen(true)}
              />
            </section>
          )}

          {currentView === 'tasks' && <Header tasks={tasks} profiles={profiles} connected={sseConnected} />}

          {currentView === 'tasks' && (
            <section className="view-section" aria-label="Task Board">
              {tasksLoading ? (
                <div className="skeleton-wrapper"><div className="skeleton-pulse" /><p className="mt-4 text-xs text-zinc-500">Memuat tasks…</p></div>
              ) : <TaskBoard tasks={tasks} onTaskStatusChange={handleTaskStatusChange} onRunTask={runTaskMutation.mutate} onBlockTask={blockTaskMutation.mutate} onDeleteTask={deleteTaskMutation.mutate} onSelectTask={setSelectedTask} onPlanningSelect={(task) => setPlanningTaskId(task.id)} onUndo={handleUndo} />}
            </section>
          )}

          {currentView === 'new-task' && (
            <section className="view-section new-task-section" aria-label="Create New Task">
              <NewTaskComposer
                onTaskCreated={(task) => {
                  setPlanningTaskId(task.id);
                  setCurrentView('tasks');
                }}
              />
            </section>
          )}

          {currentView === 'profiles' && (
            <section className="view-section" aria-label="Agent Profiles">
              <div className="view-heading">
                <p className="section-kicker">Directory</p>
                <h1>Agent Profiles</h1>
                <p>Profiles currently available to assign tasks.</p>
              </div>
              <div className="flex justify-end mb-4">
                <button
                  type="button"
                  onClick={() => setShowCreateProfile(true)}
                  className="h-[38px] px-4 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-xs font-semibold transition-colors"
                >
                  + Profil Baru
                </button>
              </div>
              {profilesLoading ? (
                <div className="skeleton-wrapper"><div className="skeleton-pulse" /><p className="mt-4 text-xs text-zinc-500">Memuat profiles…</p></div>
              ) : profiles.length === 0 ? (
                <div className="empty-state"><p>Tidak ada profil agent yang terdeteksi.</p></div>
              ) : (
                <div className="profile-list space-y-0">
                  {profiles.map((profile) => (
                    <ProfileCard key={profile.name} profile={profile} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      <ExecutionModal task={selectedTask} onClose={() => setSelectedTask(null)} />
      {planningTaskId && (
        <PlanningModal
          task={tasks.find((t) => t.id === planningTaskId) ?? null}
          onClose={() => setPlanningTaskId(null)}
          onApproveSuccess={() => setPlanningTaskId(null)}
          onUndo={handleUndo}
        />
      )}
      {showCreateProfile && (
        <CreateProfileModal
          existingProfiles={profiles.map((profile) => profile.name)}
          onClose={() => setShowCreateProfile(false)}
        />
      )}
    </div>
  );
}
