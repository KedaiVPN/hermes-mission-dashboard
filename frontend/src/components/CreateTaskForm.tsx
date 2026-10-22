import { useState } from 'react';
import type { TaskCreate, Profile } from '../types';

interface CreateTaskFormProps {
  profiles: Profile[];
  onSubmit: (payload: TaskCreate) => void;
  isLoading?: boolean;
  onCancel?: () => void;
}

export function CreateTaskForm({ profiles, onSubmit, isLoading, onCancel }: CreateTaskFormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [profile, setProfile] = useState<string>('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setProfile('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      profile: profile || null,
    });
    reset();
  };

  return (
    <form onSubmit={handleSubmit} className="composer-form">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-300">Task Details</h2>
        <span className="text-[10px] font-mono text-zinc-600">QUEUE ENTRY</span>
      </div>

      <div className="space-y-4 pt-4">
        <div>
          <label htmlFor="task-title" className="mb-1.5 block text-xs font-medium text-zinc-400">Judul Task</label>
          <input
            id="task-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Contoh: Audit endpoint /api/events…"
            className="form-input"
            autoComplete="off"
            required
          />
        </div>

        <div>
          <label htmlFor="task-description" className="mb-1.5 block text-xs font-medium text-zinc-400">Deskripsi</label>
          <textarea
            id="task-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Catatan detail task…"
            className="form-textarea"
            rows={4}
          />
        </div>

        {profiles.length > 0 && (
          <div>
            <label htmlFor="task-profile" className="mb-1.5 block text-xs font-medium text-zinc-400">Assign Profile</label>
            <select
              id="task-profile"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="form-select"
            >
              <option value="">Tanpa assignment</option>
              {profiles.map((p) => <option key={p.name} value={p.name}>@{p.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-5">
        <button type="submit" disabled={isLoading || !title.trim()} className="btn-primary flex-1">
          {isLoading ? 'Menyimpan…' : 'Create Task'}
        </button>
        <button
          type="button"
          onClick={() => { reset(); onCancel?.(); }}
          className="btn-secondary"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
