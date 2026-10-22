import { useMemo, useState } from 'react';
import type { Task } from '../types';

const STATUS_ORDER: Task['status'][] = ['planning', 'queued', 'active', 'blocked', 'done'];

const STATUS_META: Record<Task['status'], { label: string; dot: string; border: string; action: string | null }> = {
  planning: { label: 'Planning', dot: 'bg-violet-400', border: 'border-violet-500/30', action: 'Plan task' },
  queued: { label: 'Queued', dot: 'bg-sky-400', border: 'border-sky-500/30', action: 'Start task' },
  active: { label: 'Active', dot: 'bg-blue-500', border: 'border-blue-500/40', action: 'Mark done' },
  blocked: { label: 'Blocked', dot: 'bg-amber-400', border: 'border-amber-500/30', action: 'Resume task' },
  done: { label: 'Done', dot: 'bg-emerald-400', border: 'border-emerald-500/25', action: null },
};

function nextStatus(status: Task['status']): Task['status'] {
  if (status === 'planning') return 'queued';
  if (status === 'queued' || status === 'blocked') return 'active';
  return 'done';
}

interface TaskCardProps {
  task: Task;
  onStatusChange: (taskId: number, status: Task['status']) => void;
  onRunTask: (taskId: number) => void;
  onBlockTask: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
  onSelectTask: (task: Task) => void;
  onPlanningSelect?: (task: Task) => void;
  onUndo?: (taskId: number) => void;
}

function TaskCard({ task, onStatusChange, onRunTask, onBlockTask, onDeleteTask, onSelectTask, onPlanningSelect, onUndo }: TaskCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const meta = STATUS_META[task.status];
  const targetStatus = nextStatus(task.status);
  const isLongDesc = (task.description?.length ?? 0) > 160;

  const handleActionSelect = (action: 'run' | 'block' | 'delete' | 'undo') => {
    setShowActionMenu(false);
    if (action === 'run') {
      onRunTask(task.id);
    } else if (action === 'block') {
      onBlockTask(task.id);
    } else if (action === 'undo') {
      onUndo?.(task.id);
    } else if (action === 'delete') {
      setShowDeleteConfirm(true);
    }
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDeleteTask(task.id);
  };

  return (
    <article className={`task-card ${meta.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-mono text-zinc-500 mb-1">
            {task.profile ? `@${task.profile}` : 'Unassigned'}
          </p>
          <h3 className="text-sm font-semibold leading-snug text-zinc-100 break-words">{task.title}</h3>
          {task.description && (
            <div>
              <p
                className={`mt-1.5 text-xs leading-5 text-zinc-400 ${
                  !isExpanded ? 'line-clamp-2' : ''
                }`}
              >
                {task.description}
              </p>
              {isLongDesc && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-0.5 text-[11px] font-medium text-[#9ca8ff] hover:text-[#b8c1ff] transition-colors"
                >
                  {isExpanded ? 'sembunyikan' : 'selengkapnya'}
                </button>
              )}
            </div>
          )}
        </div>
        <span className="shrink-0 text-[10px] font-mono text-zinc-600">#{task.id}</span>
      </div>

      <div className="mt-4 flex flex-col gap-2 border-t border-zinc-800/80 pt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {meta.action && (
            <button
              type="button"
              onClick={() => {
                if (task.status === 'planning') {
                  onPlanningSelect?.(task);
                } else {
                  onStatusChange(task.id, targetStatus);
                }
              }}
              className="task-action"
              aria-label={`${meta.action}: ${task.title}`}
            >
              {meta.action}
              <span aria-hidden="true">→</span>
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <button
              type="button"
              onClick={() => setShowActionMenu(!showActionMenu)}
              className="w-full px-3 py-1.5 text-[11px] font-semibold rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center justify-between gap-2"
            >
              <span>Aksi</span>
              <span className="text-[9px]">▼</span>
            </button>
            {showActionMenu && (
              <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-[#0f1011] border border-zinc-800 rounded shadow-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleActionSelect('run')}
                  className="w-full px-3 py-2 text-[11px] font-medium text-zinc-300 hover:bg-white/5 text-left transition-colors"
                >
                  Run task
                </button>
                <button
                  type="button"
                  onClick={() => handleActionSelect('block')}
                  className="w-full px-3 py-2 text-[11px] font-medium text-amber-400 hover:bg-white/5 text-left transition-colors border-t border-zinc-800/50"
                >
                  Block task
                </button>
                {task.status === 'queued' && (
                  <button
                    type="button"
                    onClick={() => handleActionSelect('undo')}
                    className="w-full px-3 py-2 text-[11px] font-medium text-violet-300 hover:bg-white/5 text-left transition-colors border-t border-zinc-800/50"
                  >
                    Kembalikan ke Planning
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleActionSelect('delete')}
                  className="w-full px-3 py-2 text-[11px] font-medium text-red-400 hover:bg-white/5 text-left transition-colors border-t border-zinc-800/50"
                >
                  Delete task
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSelectTask(task)}
            className="px-3 py-1.5 text-[11px] font-semibold rounded bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 transition-colors"
          >
            View Log
          </button>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-[#0f1011] border border-zinc-800 rounded-lg p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-sm font-semibold text-zinc-100 mb-2">Hapus task #{task.id}?</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Task dan workspace-nya akan dihapus permanen. Repository GitHub tidak akan terhapus.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmDelete}
                className="flex-1 px-3 py-2 text-[11px] font-semibold rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
              >
                Ya, Hapus
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-3 py-2 text-[11px] font-semibold rounded bg-white/5 text-zinc-400 border border-white/10 hover:bg-white/10 transition-colors"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

interface TaskBoardProps {
  tasks: Task[];
  onTaskStatusChange: (taskId: number, status: Task['status']) => void;
  onRunTask: (taskId: number) => void;
  onBlockTask: (taskId: number) => void;
  onDeleteTask: (taskId: number) => void;
  onSelectTask: (task: Task) => void;
  onPlanningSelect?: (task: Task) => void;
  onUndo?: (taskId: number) => void;
}

export function TaskBoard({ tasks, onTaskStatusChange, onRunTask, onBlockTask, onDeleteTask, onSelectTask, onPlanningSelect, onUndo }: TaskBoardProps) {
  const [selectedStatus, setSelectedStatus] = useState<Task['status']>('active');
  const grouped = useMemo(() => {
    const data: Record<Task['status'], Task[]> = { planning: [], queued: [], active: [], blocked: [], done: [] };
    tasks.forEach((task) => data[task.status].push(task));
    return data;
  }, [tasks]);

  const renderLane = (status: Task['status']) => {
    const meta = STATUS_META[status];
    const laneTasks = grouped[status];
    return (
      <section key={status} className="task-lane">
        <div className="mb-3 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300">{meta.label}</h2>
          <span className="text-xs font-mono text-zinc-600">{laneTasks.length}</span>
        </div>
        <div className="space-y-3">
          {laneTasks.length ? laneTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onStatusChange={onTaskStatusChange}
              onRunTask={onRunTask}
              onBlockTask={onBlockTask}
              onDeleteTask={onDeleteTask}
              onSelectTask={onSelectTask}
              onPlanningSelect={onPlanningSelect}
              onUndo={onUndo}
            />
          )) : <p className="px-1 py-3 text-xs text-zinc-600">Tidak ada task.</p>}
        </div>
      </section>
    );
  };

  return (
    <section aria-label="Task board">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="section-kicker">Work queue</p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-100">Tasks</h2>
        </div>
        <p className="hidden text-xs text-zinc-500 sm:block">Gunakan tombol aksi untuk memindahkan status.</p>
      </div>

      <div className="mobile-status-tabs" role="tablist" aria-label="Task status">
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status];
          const selected = status === selectedStatus;
          return (
            <button
              key={status}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSelectedStatus(status)}
              className={`mobile-status-tab ${selected ? 'is-selected' : ''}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
              <span className="font-mono text-zinc-500">{grouped[status].length}</span>
            </button>
          );
        })}
      </div>

      <div className="mobile-task-lane">{renderLane(selectedStatus)}</div>
      <div className="desktop-task-board">{STATUS_ORDER.map(renderLane)}</div>
    </section>
  );
}
