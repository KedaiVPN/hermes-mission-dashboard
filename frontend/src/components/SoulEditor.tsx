import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

interface SoulEditorProps {
  profileName: string;
}

export function SoulEditor({ profileName }: SoulEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data: soul, isLoading } = useQuery({
    queryKey: ['profileSoul', profileName],
    queryFn: () => api.getProfileSoul(profileName),
  });

  useEffect(() => {
    if (soul) setDraft(soul.content);
  }, [soul]);

  const saveMutation = useMutation({
    mutationFn: () => api.updateProfileSoul(profileName, draft),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['profileSoul', profileName] });
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setFeedback({
        tone: 'ok',
        text: result.backup ? `Tersimpan (${result.bytes} byte), backup lama dibuat` : `Tersimpan (${result.bytes} byte)`,
      });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: Error) => setFeedback({ tone: 'err', text: err.message || 'Gagal menyimpan SOUL.md' }),
  });

  const original = soul?.content ?? '';
  const dirty = draft !== original;

  return (
    <div className="mt-4 pt-4 border-t border-zinc-800/60">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">SOUL.md</span>
          {!isLoading && !soul?.exists && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-400 border border-amber-900/40">
              belum ada
            </span>
          )}
          {dirty && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
              belum disimpan
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600 hidden sm:inline">
            {draft.length.toLocaleString('id-ID')} karakter
          </span>
          <button
            type="button"
            onClick={() => setDraft(original)}
            disabled={!dirty}
            className="h-[32px] px-3 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-[11px] text-zinc-300 transition-colors disabled:opacity-30"
          >
            Batalkan
          </button>
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!dirty || saveMutation.isPending}
            className="h-[32px] px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-emerald-950 text-[11px] font-semibold transition-colors disabled:opacity-30"
          >
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan SOUL'}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`mb-3 px-3 py-2 rounded text-[11px] font-mono border ${
            feedback.tone === 'ok'
              ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40'
              : 'bg-rose-950/50 text-rose-400 border-rose-900/40'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        spellCheck={false}
        placeholder={isLoading ? 'Memuat SOUL.md...' : 'Belum ada SOUL.md. Tulis identitas dan panduan profil ini di sini...'}
        className="w-full h-[280px] p-3.5 rounded bg-zinc-900/70 border border-zinc-800 text-[12px] leading-relaxed font-mono text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 resize-y"
      />

      <p className="text-[10px] font-mono text-zinc-600 mt-2 break-all">
        {soul?.path}
        {soul?.updated_at ? ` · terakhir diubah ${new Date(soul.updated_at).toLocaleString('id-ID')}` : ''}
      </p>
    </div>
  );
}