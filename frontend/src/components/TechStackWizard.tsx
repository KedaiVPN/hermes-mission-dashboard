import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { Task, TechAnalysis } from '../types';

interface TechStackWizardProps {
  task: Task;
  onSuccess: (taskId: number) => void;
  isLoading?: boolean;
}

export function TechStackWizard({ task, onSuccess, isLoading = false }: TechStackWizardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});
  const [userNotes, setUserNotes] = useState('');

  const analysisQuery = useQuery<TechAnalysis>({
    queryKey: ['tech-analysis', task.id],
    queryFn: () => api.analyzeTaskTech(task.id),
  });

  // Inisialisasi default pilihan saat data analisis selesai dimuat
  useEffect(() => {
    if (analysisQuery.data?.categories) {
      const defaults: Record<string, string> = {};
      for (const cat of analysisQuery.data.categories) {
        defaults[cat.id] = cat.selected;
      }
      setSelectedChoices(defaults);
    }
  }, [analysisQuery.data]);

  const submitMutation = useMutation({
    mutationFn: () => {
      return api.submitTechChoices(task.id, {
        choices: selectedChoices,
        notes: userNotes.trim(),
      });
    },
    onSuccess: () => {
      onSuccess(task.id);
    },
  });

  const submitContextualMutation = useMutation({
    mutationFn: () => {
      const qaHistory = Object.entries(answers).map(([qId, answer]) => {
        const question = analysisQuery.data?.questions.find(q => q.id === qId);
        return {
          question: question?.question || qId,
          answer: answer.trim(),
        };
      });
      return api.generatePRD(task.id, {
        title: `PRD: ${task.title}`,
        content: '', // Backend akan generate
        qa_history: qaHistory,
      });
    },
    onSuccess: () => {
      onSuccess(task.id);
    },
  });

  const handleSelectOption = (categoryId: string, optionId: string) => {
    setSelectedChoices(prev => ({
      ...prev,
      [categoryId]: optionId,
    }));
  };

  if (analysisQuery.isLoading) {
    return (
      <div className="p-6 bg-white/5 border border-white/10 rounded-lg space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-xs font-mono uppercase tracking-wider text-indigo-400">
            Profil Agen Sedang Menganalisis Kebutuhan…
          </span>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Sistem sedang membedah deskripsi proyek, mencari tech stack yang paling relevan, dan menyiapkan pilihan yang aman untuk pemula.
        </p>
        <div className="space-y-3 pt-2">
          <div className="h-16 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-24 bg-white/5 rounded-lg animate-pulse" />
          <div className="h-24 bg-white/5 rounded-lg animate-pulse" />
        </div>
      </div>
    );
  }

  if (analysisQuery.isError || !analysisQuery.data) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-300">
        Gagal memuat analisis teknologi oleh profil agen. Silakan coba buka kembali.
      </div>
    );
  }

  const analysis = analysisQuery.data;
  const isContextual = analysis.planning_type === 'contextual';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isContextual) {
          submitContextualMutation.mutate();
        } else {
          submitMutation.mutate();
        }
      }}
      className="space-y-6"
    >
      {/* Overview Banner: Complexity & Profiles */}
      <div className="p-4 bg-[#141516] border border-white/10 rounded-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-semibold">
            Hasil Analisis Profil Agen
          </span>
          {analysis.estimated_complexity && analysis.estimated_duration && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-300">
                Kompleksitas: <strong className="text-zinc-100 uppercase">{analysis.estimated_complexity}</strong>
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-300">
                Durasi: <strong className="text-zinc-100">{analysis.estimated_duration}</strong>
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-zinc-300 leading-relaxed">
          {analysis.summary}
        </p>

        {analysis.recommended_profiles.length > 0 && (
          <div className="pt-2 border-t border-white/5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider block mb-1.5">
              Profil Agen Yang Ditugaskan Menangani Proyek Ini:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.recommended_profiles.map((prof) => (
                <span
                  key={prof.name}
                  title={prof.reason}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-zinc-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  @{prof.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Conditional: Contextual Q&A Form OR Tech Stack Categories */}
      {isContextual ? (
        <>
          {analysis.is_complete ? (
            // Complete: No questions needed, just confirmation
            <div className="p-4 bg-green-950/30 border border-green-700/50 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-green-300">✓ Profil telah mereview task ini</p>
                  <p className="text-xs text-green-200 mt-1">
                    Deskripsi dan instruksi sudah sangat jelas dan lengkap. Tidak ada pertanyaan tambahan yang diperlukan. Kamu bisa langsung mengonfirmasi dan memulai pengerjaan.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            // Incomplete: Show Q&A form
            <div className="space-y-4">
              {analysis.questions.map((q) => (
                <div key={q.id} className="p-4 bg-[#141516] border border-white/5 rounded-lg space-y-2">
                  <label htmlFor={q.id} className="block text-xs font-semibold text-zinc-200">
                    {q.question}
                    {q.required && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <textarea
                    id={q.id}
                    value={answers[q.id] || ''}
                    onChange={(e) => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder={q.placeholder}
                    required={q.required}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 min-h-[64px]"
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-5">
        {analysis.categories.map((cat) => {
          const activeOptionId = selectedChoices[cat.id] || cat.selected;

          return (
            <div
              key={cat.id}
              className="p-4 bg-[#141516] border border-white/5 rounded-lg space-y-3 hover:border-white/10 transition-colors"
            >
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
                    {cat.title}
                  </h4>
                  <span className="text-[10px] font-mono text-zinc-500">
                    Pilih 1 dari {cat.options.length} opsi
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-1 leading-normal">
                  {cat.description}
                </p>
              </div>

              {/* Options Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {cat.options.map((opt) => {
                  const isSelected = activeOptionId === opt.id;

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectOption(cat.id, opt.id)}
                      className={`text-left p-3 rounded-md border transition-all flex flex-col justify-between min-h-[92px] ${
                        isSelected
                          ? 'bg-indigo-950/30 border-indigo-500/60 shadow-[0_0_12px_rgba(94,106,210,0.15)] ring-1 ring-indigo-500/50'
                          : 'bg-white/[0.02] border-white/5 hover:border-white/15 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-1.5 mb-1.5">
                          <span className={`text-xs font-semibold ${isSelected ? 'text-indigo-200' : 'text-zinc-200'}`}>
                            {opt.name}
                          </span>
                          {opt.badge && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug">
                          {opt.description}
                        </p>
                      </div>

                      <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-mono">
                        <span
                          className={`w-2.5 h-2.5 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? 'border-indigo-400 bg-indigo-500'
                              : 'border-zinc-600 bg-transparent'
                          }`}
                        >
                          {isSelected && <span className="w-1 h-1 rounded-full bg-white" />}
                        </span>
                        <span className={isSelected ? 'text-indigo-300' : 'text-zinc-500'}>
                          {isSelected ? 'Terpilih' : 'Pilih opsi ini'}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* User Notes (only for tech stack mode) */}
      {!isContextual && (
        <div className="p-4 bg-[#141516] border border-white/5 rounded-lg space-y-2">
        <label htmlFor="user-notes" className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Catatan Tambahan untuk Agen (Opsional)
        </label>
        <p className="text-[11px] text-zinc-500">
          Ada fitur khusus, warna tema, atau batasan lain yang ingin disampaikan langsung ke agen?
        </p>
        <textarea
          id="user-notes"
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
          placeholder="Contoh: Tolong buatkan tema gelap modern, tidak perlu fitur registrasi email, cukup tombol login Google…"
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-indigo-500/50 min-h-[64px]"
        />
      </div>
      )}

      {/* Action CTA */}
      <div className="pt-2 flex flex-col gap-2">
        <button
          type="submit"
          disabled={submitMutation.isPending || submitContextualMutation.isPending || isLoading}
          className="w-full py-3 px-4 bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-100 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {(submitMutation.isPending || submitContextualMutation.isPending) ? (
            <>
              <div className="h-3.5 w-3.5 rounded-full border-2 border-indigo-200 border-t-transparent animate-spin" />
              <span>Menyusun Dokumen PRD & Menugaskan Profil…</span>
            </>
          ) : (
            <span>
              {isContextual 
                ? (analysis.is_complete ? 'Konfirmasi & Mulai Kerjakan' : 'Kirim Jawaban & Susun PRD')
                : 'Kunci Pilihan & Susun Dokumen PRD'
              }
            </span>
          )}
        </button>

        {(submitMutation.isError || submitContextualMutation.isError) && (
          <p className="text-xs text-red-400 text-center" role="alert">
            Terjadi kendala saat menyusun PRD. Silakan coba klik sekali lagi.
          </p>
        )}
      </div>
    </form>
  );
}