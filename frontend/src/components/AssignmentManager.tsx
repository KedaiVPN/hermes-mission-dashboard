import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { TaskAssignment, Profile } from '../types';

interface AssignmentManagerProps {
  taskId: number;
  assignments: TaskAssignment[];
  onRefresh: () => void;
}

export function AssignmentManager({ taskId, assignments, onRefresh }: AssignmentManagerProps) {
  const queryClient = useQueryClient();
  const [newProfileName, setNewProfileName] = useState('');

  const profilesQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: api.listProfiles,
  });

  const addAssignmentMutation = useMutation({
    mutationFn: (profileName: string) =>
      api.addAssignment?.(taskId, {
        profile_name: profileName,
        role: 'contributor',
        reason: 'Manually added',
      }) || Promise.reject('Not implemented'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', taskId] });
      setNewProfileName('');
      onRefresh();
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number) =>
      api.deleteAssignment?.(taskId, assignmentId) || Promise.reject('Not implemented'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignments', taskId] });
      onRefresh();
    },
  });

  const availableProfiles = profilesQuery.data?.filter(
    (p: Profile) => !assignments.some((a) => a.profile_name === p.name)
  ) || [];

  const handleAddAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    addAssignmentMutation.mutate(newProfileName);
  };

  return (
    <div className="space-y-4 bg-white/5 border border-white/10 rounded-lg p-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Profile Assignments</h3>
        <p className="text-xs text-zinc-500 mt-1">Add or remove profiles yang akan mengerjakan task ini.</p>
      </div>

      {/* Current Assignments */}
      {assignments.length > 0 ? (
        <div className="space-y-2">
          {assignments.map((assign) => (
            <div key={assign.id} className="flex items-center gap-3 px-3 py-2.5 bg-white/5 rounded border border-white/10">
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-zinc-300">@{assign.profile_name}</p>
                <p className="text-xs text-zinc-600 line-clamp-2">{assign.reason}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteAssignmentMutation.mutate(assign.id)}
                disabled={deleteAssignmentMutation.isPending}
                className="px-2.5 py-1 text-xs font-medium rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-600 px-3 py-2">Tidak ada profil yang di-assign.</p>
      )}

      {/* Add New Assignment */}
      {availableProfiles.length > 0 && (
        <form onSubmit={handleAddAssignment} className="flex gap-2 pt-2 border-t border-white/10">
          <select
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            className="flex-1 px-2.5 py-1.5 text-xs bg-white/5 border border-white/10 rounded text-zinc-200 focus:outline-none focus:border-blue-500/50"
          >
            <option value="">Pilih profil untuk ditambahkan…</option>
            {availableProfiles.map((p: Profile) => (
              <option key={p.name} value={p.name}>
                @{p.name} {p.has_soul ? '(active)' : '(standby)'}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={addAssignmentMutation.isPending || !newProfileName}
            className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
