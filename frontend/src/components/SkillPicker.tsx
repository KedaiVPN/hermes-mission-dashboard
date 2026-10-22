import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SkillEntry } from '../types';

interface SkillPickerProps {
  profileName: string;
  installed: SkillEntry[];
  onClose: () => void;
}

export function SkillPicker({ profileName, installed, onClose }: SkillPickerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['skillCatalog', profileName],
    queryFn: () => api.listSkillCatalog(profileName),
  });

  const installedKeys = useMemo(
    () => new Set(installed.map((skill) => `${skill.category}/${skill.dir_name}`)),
    [installed],
  );

  const addMutation = useMutation({
    mutationFn: (skill: SkillEntry) => api.addProfileSkill(profileName, { name: skill.dir_name, category: skill.category || undefined }),
    onSuccess: (_, skill) => {
      setFeedback({ tone: 'ok', text: `Skill "${skill.name}" berhasil ditambahkan` });
      queryClient.invalidateQueries({ queryKey: ['profileSkills', profileName] });
      queryClient.invalidateQueries({ queryKey: ['skillCatalog', profileName] });
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (err: Error) => {
      setFeedback({ tone: 'err', text: err.message || 'Gagal menambahkan skill' });
    },
  });

  const results = useMemo(() => {
    const pool = catalog?.skills ?? [];
    const needle = search.trim().toLowerCase();
    return pool
      .filter((skill) => (category ? skill.category === category : true))
      .filter((skill) => {
        if (!needle) return true;
        return (
          skill.name.toLowerCase().includes(needle) ||
          skill.category.toLowerCase().includes(needle) ||
          skill.description.toLowerCase().includes(needle)
        );
      })
      .slice(0, 240);
  }, [catalog, search, category]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl border border-white/10 rounded-lg bg-[#0f1011] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-[#141517]">
          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Katalog Skill Host</span>
            <h2 className="text-sm font-semibold text-zinc-100 mt-1">
              Tambah skill ke <span className="font-mono text-emerald-400">@{profileName}</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
            ✕
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/5 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari nama skill atau kategori..."
            className="flex-1 h-[38px] px-3 rounded bg-zinc-900 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="h-[38px] px-3 rounded bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            <option value="">Semua kategori</option>
            {(catalog?.categories ?? []).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        {feedback && (
          <div
            className={`px-5 py-2 text-xs font-mono border-b ${
              feedback.tone === 'ok'
                ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40'
                : 'bg-rose-950/50 text-rose-400 border-rose-900/40'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <p className="text-xs text-zinc-500 font-mono py-8 text-center">Memuat katalog skill...</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-zinc-500 font-mono py-8 text-center">Tidak ada skill yang cocok.</p>
          ) : (
            <ul className="space-y-1.5">
              {results.map((skill) => {
                const already = installedKeys.has(`${skill.category}/${skill.dir_name}`) || skill.installed;
                return (
                  <li
                    key={`${skill.category}/${skill.dir_name}`}
                    className="flex items-start justify-between gap-3 px-3 py-2 rounded border border-zinc-800/70 bg-zinc-950/40 hover:bg-zinc-900/40 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-zinc-100">{skill.name}</span>
                        {skill.category && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                            {skill.category}
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{skill.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={already || addMutation.isPending}
                      onClick={() => addMutation.mutate(skill)}
                      className="shrink-0 h-[30px] px-3 rounded text-[11px] font-medium transition-colors disabled:opacity-30 bg-zinc-100 hover:bg-white text-zinc-950 disabled:hover:bg-zinc-100"
                    >
                      {already ? 'Terpasang' : 'Tambah'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
          <span className="text-[11px] font-mono text-zinc-500">
            {results.length} dari {catalog?.count ?? 0} skill host
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-[34px] px-4 rounded border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}