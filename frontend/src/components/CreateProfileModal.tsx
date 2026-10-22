import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface CreateProfileModalProps {
  existingProfiles: string[];
  onClose: () => void;
  onCreated?: (name: string) => void;
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function CreateProfileModal({ existingProfiles, onClose, onCreated }: CreateProfileModalProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cloneFrom, setCloneFrom] = useState('');
  const [includeSkills, setIncludeSkills] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: catalog } = useQuery({
    queryKey: ['skillCatalog', 'host'],
    queryFn: () => api.listSkillCatalog(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createProfile({
        name: name.trim().toLowerCase(),
        description: description.trim() || null,
        clone_from: cloneFrom || null,
        include_skills: includeSkills,
      }),
    onSuccess: (profile) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onCreated?.(profile.name);
      onClose();
    },
    onError: (err: Error) => setError(err.message || 'Gagal membuat profil'),
  });

  const normalized = name.trim().toLowerCase();
  const nameInvalid = normalized.length > 0 && !NAME_PATTERN.test(normalized);
  const nameTaken = existingProfiles.includes(normalized);
  const canSubmit = normalized.length > 0 && !nameInvalid && !nameTaken && !createMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-lg border border-white/10 rounded-lg bg-[#0f1011] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#141517]">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Profil Baru</span>
            <h2 className="text-sm font-semibold text-zinc-100 mt-1">Buat profil Hermes</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
              Nama profil
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="contoh: analis-data"
              className="w-full h-[40px] px-3 rounded bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
            {nameInvalid && (
              <p className="text-[11px] text-rose-400 mt-1.5">
                Hanya huruf kecil, angka, tanda hubung, dan garis bawah. Maksimal 64 karakter.
              </p>
            )}
            {!nameInvalid && nameTaken && (
              <p className="text-[11px] text-rose-400 mt-1.5">Nama "{normalized}" sudah dipakai.</p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
              Deskripsi <span className="text-zinc-700 normal-case">(opsional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Peran singkat profil ini"
              className="w-full h-[40px] px-3 rounded bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">
              Clone dari profil <span className="text-zinc-700 normal-case">(opsional)</span>
            </label>
            <select
              value={cloneFrom}
              onChange={(event) => setCloneFrom(event.target.value)}
              className="w-full h-[40px] px-3 rounded bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
            >
              <option value="">Tidak, mulai dari kosong</option>
              {existingProfiles.map((item) => (
                <option key={item} value={item}>Clone dari @{item}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-3 px-3 py-3 rounded border border-zinc-800 bg-zinc-950/40 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSkills}
              onChange={(event) => setIncludeSkills(event.target.checked)}
              className="mt-0.5 accent-emerald-500"
            />
            <span>
              <span className="block text-xs text-zinc-200">Sertakan skill bawaan Hermes</span>
              <span className="block text-[11px] text-zinc-500 mt-1">
                {includeSkills
                  ? `Profil akan diisi seluruh katalog bawaan, prosesnya lebih lama. Ringkasnya ±${catalog?.count ?? 0} skill host.`
                  : 'Profil dibuat ringan, tanpa skill bawaan.'}
              </span>
            </span>
          </label>

          {error && (
            <div className="px-3 py-2 rounded bg-rose-950/50 border border-rose-900/40 text-xs text-rose-400 font-mono whitespace-pre-wrap break-words">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/5 flex justify-end gap-2 bg-[#141517]">
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] px-4 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => createMutation.mutate()}
            className="h-[38px] px-4 rounded text-xs font-medium transition-colors disabled:opacity-30 bg-zinc-100 hover:bg-white text-zinc-950"
          >
            {createMutation.isPending ? 'Membuat...' : 'Buat Profil'}
          </button>
        </div>
      </div>
    </div>
  );
}