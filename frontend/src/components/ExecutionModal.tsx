import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Task, Execution } from '../types';

interface ExecutionModalProps {
  task: Task | null;
  onClose: () => void;
}

export function ExecutionModal({ task, onClose }: ExecutionModalProps) {
  const { data: executions, isLoading } = useQuery<Execution[]>({
    queryKey: ['executions', task?.id],
    queryFn: () => (task ? api.listExecutions(task.id) : Promise.resolve([])),
    enabled: !!task,
    refetchInterval: 3000,
  });

  if (!task) return null;

  const latestExec = executions?.[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl border border-white/10 rounded-lg bg-[#0f1011] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#141517]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Execution Log</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-zinc-400">#{task.id}</span>
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 mt-1">{task.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="text-xs text-zinc-500 font-mono">Loading execution logs...</div>
          ) : !executions?.length ? (
            <div className="text-xs text-zinc-500 font-mono py-8 text-center">
              No executions yet. Click "Run with Hermes" to execute.
            </div>
          ) : (
            <div>
              {latestExec && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="flex items-center gap-2">
                      Status:
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                        latestExec.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        latestExec.status === 'running' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                        'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}>
                        {latestExec.status}
                      </span>
                    </span>
                    <span className="text-zinc-500">
                      Started: {new Date(latestExec.started_at).toLocaleTimeString()}
                    </span>
                  </div>

                  {/* Terminal output box */}
                  <div className="border border-white/5 rounded bg-[#08090a] p-3 font-mono text-[11px] leading-relaxed overflow-x-auto max-h-[400px]">
                    <pre className="text-zinc-300 whitespace-pre-wrap word-break">
                      {latestExec.output || (latestExec.status === 'running' ? 'Running Hermes agent in background...' : 'No output')}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/5 bg-[#141517] flex justify-end">
          <button
            onClick={onClose}
            className="btn-secondary text-xs uppercase"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
