import { useState } from 'react';
import type { PRD, QAPair } from '../types';
import { renderMarkdownSafe } from '../lib/renderMarkdown';

interface PRDPreviewProps {
  prd: PRD | null;
  onEdit: (content: string) => void;
  isEditing: boolean;
  onSave: () => void;
  onCancel: () => void;
  isSaving?: boolean;
  canEdit?: boolean;
}

export function PRDPreview({
  prd,
  onEdit,
  isEditing,
  onSave,
  onCancel,
  isSaving = false,
  canEdit = true,
}: PRDPreviewProps) {
  const [editContent, setEditContent] = useState(prd?.content || '');

  if (!prd) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center">
        <p className="text-sm text-zinc-400">No PRD generated yet. Create a task and generate PRD to see it here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-100">{prd.title}</h3>
          <p className="text-xs text-zinc-600 mt-1">Status: <span className="inline-block px-2 py-0.5 bg-blue-500/15 text-blue-300 rounded text-[10px] font-mono">{prd.status}</span></p>
        </div>
        {!isEditing && canEdit && (
          <button
            type="button"
            onClick={() => {
              setEditContent(prd.content);
              onEdit(prd.content);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 transition-colors"
          >
            Edit PRD
          </button>
        )}
      </div>

      {/* QA History */}
      {prd.qa_history && prd.qa_history.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded p-3 space-y-2">
          <p className="text-xs font-medium text-zinc-400">Planning Q&A</p>
          <div className="space-y-2">
            {prd.qa_history.map((qa: QAPair, idx: number) => (
              <div key={idx} className="text-xs">
                <p className="font-medium text-zinc-300">Q: {qa.question}</p>
                <p className="text-zinc-500 mt-1">A: {qa.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PRD Content */}
      {isEditing ? (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-zinc-400">PRD Content (Markdown)</label>
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-48 px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/50 font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                onEdit(editContent);
                onSave();
              }}
              disabled={isSaving}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 hover:bg-blue-500/20 disabled:opacity-50 transition-colors"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditContent(prd.content);
                onCancel();
              }}
              className="px-3 py-1.5 text-xs font-medium rounded bg-white/5 border border-white/10 text-zinc-400 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="bg-white/5 border border-white/10 rounded p-4 max-h-96 overflow-y-auto space-y-2 text-xs text-zinc-300 font-sans leading-relaxed"
          dangerouslySetInnerHTML={{ __html: renderMarkdownSafe(prd.content) }}
        />
      )}
    </div>
  );
}
