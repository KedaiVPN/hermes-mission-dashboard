import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { TechStackWizard } from './TechStackWizard';
import { PRDPreview } from './PRDPreview';
import { AssignmentManager } from './AssignmentManager';
import type { Task } from '../types';

interface PlanningModalProps {
  task: Task | null;
  onClose: () => void;
  onApproveSuccess?: () => void;
  onUndo?: (taskId: number) => void;
}

export function PlanningModal({ task, onClose, onApproveSuccess, onUndo }: PlanningModalProps) {
  const queryClient = useQueryClient();
  const [isEditingPRD, setIsEditingPRD] = useState(false);
  const [prdDraft, setPrdDraft] = useState('');

  const prdQuery = useQuery({
    queryKey: ['prd', task?.id],
    queryFn: () => (task ? api.getPRD(task.id) : null),
    enabled: !!task,
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', task?.id],
    queryFn: () => (task ? api.listAssignments(task.id) : []),
    enabled: !!task,
  });

  const updatePrdMutation = useMutation({
    mutationFn: (content: string) => {
      if (!task) return Promise.reject('No task selected');
      return api.updatePRD(task.id, content);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prd', task?.id] });
      setIsEditingPRD(false);
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!task) return Promise.reject('No task selected');
      return api.approvePlan(task.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['prd', task?.id] });
      onApproveSuccess?.();
      onClose();
    },
  });

  useEffect(() => {
    if (prdQuery.data?.content) {
      setPrdDraft(prdQuery.data.content);
    }
  }, [prdQuery.data?.content]);

  if (!task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0f1011] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#141516]">
          <div className="min-w-0 pr-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400">
                TASK #{task.id}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 uppercase">
                {task.status}
              </span>
            </div>
            <h2 className="text-base font-semibold text-zinc-100 truncate mt-1.5">{task.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 transition-colors"
            aria-label="Tutup"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {task.description && (
            <div className="p-3.5 bg-white/5 border border-white/5 rounded-lg">
              <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-1">Brief Description</p>
              <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Condition: Planning phase */}
          {task.status === 'planning' && !prdQuery.data && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-zinc-200">
                  Review & Perencanaan Profil Agen
                </h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Profil yang dipilih mereview task ini. Jika instruksi sudah lengkap, Anda bisa langsung menyetujui tanpa perlu menjawab pertanyaan.
                </p>
              </div>
              <TechStackWizard
                task={task}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['tasks'] });
                  queryClient.invalidateQueries({ queryKey: ['prd', task.id] });
                  queryClient.invalidateQueries({ queryKey: ['assignments', task.id] });
                }}
              />
            </div>
          )}

          {/* Condition: PRD available (Backlog review or already generated) */}
          {prdQuery.data && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <PRDPreview
                  prd={prdQuery.data}
                  isEditing={isEditingPRD}
                  canEdit={task.status === 'planning'}
                  onEdit={(content) => {
                    setPrdDraft(content);
                    setIsEditingPRD(true);
                  }}
                  onSave={() => updatePrdMutation.mutate(prdDraft)}
                  onCancel={() => {
                    setIsEditingPRD(false);
                    setPrdDraft(prdQuery.data?.content || '');
                  }}
                  isSaving={updatePrdMutation.isPending}
                />
              </div>

              <div className="space-y-4">
                <AssignmentManager
                  taskId={task.id}
                  assignments={assignmentsQuery.data ?? []}
                  onRefresh={() => {
                    queryClient.invalidateQueries({ queryKey: ['assignments', task.id] });
                  }}
                />

                {prdQuery.data && task.status === 'planning' && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg space-y-3">
                    <h4 className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">
                      Approval & Antrean
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      PRD dan profil yang ditugaskan sudah siap? Setuju untuk masuk ke antrean eksekusi.
                    </p>
                    <button
                      type="button"
                      onClick={() => approveMutation.mutate()}
                      disabled={approveMutation.isPending}
                      className="w-full py-2.5 px-4 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-semibold uppercase tracking-wider rounded transition-colors disabled:opacity-50"
                    >
                      {approveMutation.isPending ? 'Memproses…' : 'Approve Plan & Queue Task'}
                    </button>
                  </div>
                )}
                {prdQuery.data && task.status === 'queued' && (
                  <div className="p-4 bg-violet-500/10 border border-violet-500/20 rounded-lg space-y-3">
                    <h4 className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
                      Revisi PRD?
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Task sudah diantrekan. Kembalikan ke Planning untuk mengedit PRD.
                    </p>
                    <button
                      type="button"
                      onClick={() => onUndo?.(task.id)}
                      disabled={approveMutation.isPending}
                      className="w-full py-2.5 px-4 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/40 text-violet-200 text-xs font-semibold uppercase tracking-wider rounded transition-colors disabled:opacity-50"
                    >
                      Kembalikan ke Planning
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
