import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Profile } from '../types';
import { ModelCombobox } from './ModelCombobox';
import { SoulEditor } from './SoulEditor';
import { SkillPicker } from './SkillPicker';
import { DeleteProfileDialog } from './DeleteProfileDialog';

interface ProfileCardProps {
  profile: Profile;
}

type Panel = 'none' | 'soul' | 'skills';

export function ProfileCard({ profile }: ProfileCardProps) {
  const queryClient = useQueryClient();
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('none');
  const [showPicker, setShowPicker] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [skillFeedback, setSkillFeedback] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const { data: modelConfig, isLoading } = useQuery({
    queryKey: ['profileModel', profile.name],
    queryFn: () => api.getProfileModel(profile.name),
  });

  const { data: skills } = useQuery({
    queryKey: ['profileSkills', profile.name],
    queryFn: () => api.listProfileSkills(profile.name),
  });

  useEffect(() => {
    if (modelConfig?.default) {
      setSelectedModel(modelConfig.default);
    }
  }, [modelConfig]);

  const updateMutation = useMutation({
    mutationFn: (modelName: string) => api.updateProfileModel(profile.name, modelName),
    onSuccess: () => {
      setStatusMessage('Tersimpan');
      queryClient.invalidateQueries({ queryKey: ['profileModel', profile.name] });
      setTimeout(() => setStatusMessage(null), 3000);
    },
    onError: (err: any) => {
      setStatusMessage(err?.message || 'Gagal menyimpan');
      setTimeout(() => setStatusMessage(null), 4000);
    },
  });

  const removeSkillMutation = useMutation({
    mutationFn: (skillName: string) => api.removeProfileSkill(profile.name, skillName),
    onSuccess: (_, skillName) => {
      queryClient.invalidateQueries({ queryKey: ['profileSkills', profile.name] });
      queryClient.invalidateQueries({ queryKey: ['skillCatalog', profile.name] });
      setSkillFeedback({ tone: 'ok', text: `Skill "${skillName}" dihapus` });
      setTimeout(() => setSkillFeedback(null), 3000);
    },
    onError: (err: Error) => setSkillFeedback({ tone: 'err', text: err.message || 'Gagal menghapus skill' }),
  });

  const handleSave = () => {
    if (!selectedModel.trim()) return;
    updateMutation.mutate(selectedModel.trim());
  };

  const handleRemoveSkill = (skillName: string) => {
    if (window.confirm(`Hapus skill "${skillName}" dari profil @${profile.name}?`)) {
      removeSkillMutation.mutate(skillName);
    }
  };

  const currentActive = modelConfig?.default || 'Belum diatur';
  const hasChanges = selectedModel.trim() !== '' && selectedModel.trim() !== modelConfig?.default;
  const isGlobalPool = skills?.is_global_pool ?? profile.is_default;
  const skillCount = skills?.count ?? 0;

  const panelButton = (target: Panel, label: string, badge?: string) => (
    <button
      type="button"
      onClick={() => setPanel((current) => (current === target ? 'none' : target))}
      className={`h-[32px] px-3 rounded border text-[11px] font-medium transition-colors whitespace-nowrap ${
        panel === target
          ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
          : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
      }`}
    >
      {label}
      {badge && <span className="ml-1.5 font-mono text-[10px] text-zinc-500">{badge}</span>}
    </button>
  );

  return (
    <article className="profile-card">
      <div className="profile-card-main">
        <div className="flex items-start gap-3.5 min-w-[240px]">
          <span className={`profile-status mt-1 ${profile.has_soul ? 'online' : ''}`} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-mono font-medium text-zinc-100">@{profile.name}</h2>
              {profile.is_default && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 font-mono tracking-wider border border-zinc-700/50">
                  DEFAULT
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {profile.has_soul ? 'Profile active' : 'No SOUL.md found'}
            </p>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-mono text-zinc-500">Model aktif:</span>
              <span className="text-[11px] font-mono bg-zinc-900 text-emerald-400 px-2 py-0.5 rounded border border-zinc-800">
                {isLoading ? '...' : currentActive}
              </span>
              <span className="text-[11px] font-mono text-zinc-500">·</span>
              <span className="text-[11px] font-mono bg-zinc-900 text-zinc-300 px-2 py-0.5 rounded border border-zinc-800">
                {skillCount} skill
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full lg:w-[480px]">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <ModelCombobox
                label="Pilih / Cari Model AI"
                placeholder="Cari model (e.g. Razix, claude, gpt-4o, qwen...)"
                selectedValue={selectedModel}
                onSelect={(model) => setSelectedModel(model)}
              />
            </div>

            <div className="flex items-center gap-2 pb-0.5">
              <button
                type="button"
                onClick={handleSave}
                disabled={isLoading || updateMutation.isPending || !hasChanges}
                className="h-[38px] px-4 bg-zinc-100 hover:bg-white text-zinc-950 font-medium text-xs rounded transition-all disabled:opacity-30 disabled:hover:bg-zinc-100 shadow-sm whitespace-nowrap"
              >
                {updateMutation.isPending ? 'Menyimpan...' : 'Ganti Model'}
              </button>

              {statusMessage && (
                <span
                  className={`text-xs font-mono px-2 py-1 rounded ${
                    statusMessage === 'Tersimpan'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                      : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                  }`}
                >
                  {statusMessage}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {panelButton('soul', 'SOUL.md')}
            {panelButton('skills', 'Skill', String(skillCount))}
            {!profile.is_default && (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                className="h-[32px] px-3 rounded border border-rose-900/50 bg-rose-950/30 text-[11px] font-medium text-rose-400 hover:bg-rose-950/60 hover:text-rose-300 transition-colors whitespace-nowrap"
              >
                Hapus profil
              </button>
            )}
          </div>
        </div>
      </div>

      {panel === 'soul' && (
        <div className="px-5 pb-5">
          <SoulEditor profileName={profile.name} />
        </div>
      )}

      {panel === 'skills' && (
        <div className="px-5 pb-5">
          <div className="mt-4 pt-4 border-t border-zinc-800/60">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">
                  Skill terpasang
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-300 border border-zinc-700/50">
                  {skillCount}
                </span>
                {isGlobalPool && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-950/50 text-sky-400 border border-sky-900/40">
                    katalog global
                  </span>
                )}
              </div>
              {!isGlobalPool && (
                <button
                  type="button"
                  onClick={() => setShowPicker(true)}
                  className="h-[32px] px-3 rounded bg-zinc-100 hover:bg-white text-zinc-950 text-[11px] font-semibold transition-colors"
                >
                  Tambah skill
                </button>
              )}
            </div>

            {isGlobalPool && (
              <p className="mb-3 text-[11px] text-zinc-500 leading-relaxed">
                Profil <span className="font-mono text-zinc-300">default</span> memakai katalog skill global
                (<span className="font-mono text-zinc-300">{skillCount}</span> skill). Skill di sini dipakai bersama
                semua profil, jadi penambahan dan penghapusan tidak dilakukan dari halaman ini.
              </p>
            )}

            {skillFeedback && (
              <div
                className={`mb-3 px-3 py-2 rounded text-[11px] font-mono border ${
                  skillFeedback.tone === 'ok'
                    ? 'bg-emerald-950/50 text-emerald-400 border-emerald-900/40'
                    : 'bg-rose-950/50 text-rose-400 border-rose-900/40'
                }`}
              >
                {skillFeedback.text}
              </div>
            )}

            {skillCount === 0 ? (
              <p className="text-[11px] font-mono text-zinc-500 py-6 text-center border border-dashed border-zinc-800 rounded">
                Belum ada skill terpasang di profil ini.
              </p>
            ) : (
              <ul className="grid gap-1.5 max-h-[320px] overflow-y-auto pr-1">
                {(skills?.skills ?? []).map((skill) => (
                  <li
                    key={`${skill.category}/${skill.dir_name}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded border border-zinc-800/70 bg-zinc-950/40"
                  >
                    <div className="min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-zinc-200 truncate">{skill.name}</span>
                      {skill.category && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-500 border border-zinc-700/50">
                          {skill.category}
                        </span>
                      )}
                    </div>
                    {!isGlobalPool && (
                      <button
                        type="button"
                        disabled={removeSkillMutation.isPending}
                        onClick={() => handleRemoveSkill(skill.dir_name)}
                        className="shrink-0 h-[28px] px-2.5 rounded border border-zinc-800 bg-zinc-900 hover:bg-rose-950/50 hover:border-rose-900/50 hover:text-rose-400 text-[10px] font-medium text-zinc-400 transition-colors disabled:opacity-30"
                      >
                        Hapus
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showPicker && (
        <SkillPicker
          profileName={profile.name}
          installed={skills?.skills ?? []}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showDelete && (
        <DeleteProfileDialog profileName={profile.name} onClose={() => setShowDelete(false)} />
      )}
    </article>
  );
}