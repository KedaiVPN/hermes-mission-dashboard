import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface DeleteProfileDialogProps {
  profileName: string;
  onClose: () => void;
  onDeleted?: (name: string) => void;
}

export function DeleteProfileDialog({ profileName, onClose, onDeleted }: DeleteProfileDialogProps) {
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProfile(profileName, typed.trim()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      onDeleted?.(profileName);
      onClose();
    },
    onError: (err: Error) => setError(err.message || 'Gagal menghapus profil'),
  });

  const matches = typed.trim() === profileName;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
      <div className="w-full max-w-md border border-rose-900/50 rounded-lg bg-[#0f1011] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-rose-900/30 bg-rose-950/20">
          <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400">Konfirmasi Hapus</span>
          <h2 className="text-sm font-semibold text-zinc-100 mt-1">Hapus profil @{profileName}?</h2>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-zinc-400 leading-relaxed">
            Seluruh isi profil ini ikut terhapus permanen: <span className="text-zinc-200">SOUL.md</span>,{' '}
            <span className="text-zinc-200">skills</span>, <span className="text-zinc-200">memories</span>, dan{' '}
            <span className="text-zinc-200">riwayat sesi</span>. Tidak ada undo.
          </p>

          <div>
            <label className="block text-[11px] font-mono text-zinc-500 mb-2">
              Ketik nama profil untuk melanjutkan:
            </label>
            <input
              type="text"
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={profileName}
              className="w-full h-[40px] px-3 rounded bg-zinc-900 border border-zinc-800 text-sm font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-rose-700"
            />
            <p className="text-[11px] font-mono text-zinc-600 mt-1.5">
              harus sama persis: <span className="text-zinc-400">{profileName}</span>
            </p>
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-rose-950/50 border border-rose-900/40 text-[11px] text-rose-400 font-mono whitespace-pre-wrap break-words">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-rose-900/30 flex justify-end gap-2 bg-rose-950/10">
          <button
            type="button"
            onClick={onClose}
            className="h-[38px] px-4 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!matches || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            className="h-[38px] px-4 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors disabled:opacity-30"
          >
            {deleteMutation.isPending ? 'Menghapus...' : 'Hapus Permanen'}
          </button>
        </div>
      </div>
    </div>
  );
}