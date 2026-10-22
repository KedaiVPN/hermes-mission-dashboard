import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ModelComboboxProps {
  label?: string;
  placeholder?: string;
  selectedValue?: string;
  onSelect: (model: string) => void;
}

export function ModelCombobox({
  label = 'Pilih / Cari Model AI',
  placeholder = 'Ketik untuk mencari atau input model custom...',
  selectedValue,
  onSelect,
}: ModelComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: modelsData, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: () => api.listModels(),
    // Detect config.yaml edits while the model picker remains open.
    refetchInterval: isOpen ? 3000 : false,
    refetchOnWindowFocus: true,
  });

  
  const [inputValue, setInputValue] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allModels = modelsData?.models ?? [];
  
  const query = inputValue.trim().toLowerCase();
  const filteredModels = allModels.filter((model) => {
    if (!query) return true;
    return model.toLowerCase().includes(query);
  });

  // Limit rendering to 25 items for smooth scrolling performance
  const displayedModels = filteredModels.slice(0, 25);
  const isExactMatch = allModels.some((m) => m.toLowerCase() === query);
  const isCustomCandidate = inputValue.trim() !== '' && !isExactMatch;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (selectedValue !== undefined) {
      setInputValue(selectedValue);
    }
  }, [selectedValue]);

  const handleSelectModel = (model: string) => {
    setInputValue(model);
    onSelect(model);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        setIsOpen(true);
        setHighlightedIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % displayedModels.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev - 1 + displayedModels.length) % displayedModels.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && displayedModels[highlightedIndex]) {
          handleSelectModel(displayedModels[highlightedIndex]);
        } else if (inputValue.trim()) {
          handleSelectModel(inputValue.trim());
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const clearInput = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInputValue('');
    onSelect('');
    inputRef.current?.focus();
    setIsOpen(true);
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="block text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
          {label}
        </label>
        {allModels.length > 0 && (
          <span className="text-[10px] font-mono text-zinc-500">
            {allModels.length.toLocaleString()} model tersedia
          </span>
        )}
      </div>

      <div
        className={`
          group relative flex items-center
          bg-zinc-900/90 border border-zinc-700/70
          hover:border-zinc-500/70 focus-within:border-emerald-500/80
          focus-within:ring-1 focus-within:ring-emerald-500/30
          rounded-md px-3 py-2 transition-all duration-150
          shadow-sm
        `}
      >
        <div className="mr-2.5 text-zinc-500 group-focus-within:text-emerald-400 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            const val = e.target.value;
            setInputValue(val);
            onSelect(val);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          className="w-full bg-transparent text-xs sm:text-sm font-mono text-zinc-100 placeholder-zinc-500 outline-none pr-14"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {inputValue && (
            <button
              type="button"
              onClick={clearInput}
              className="p-1 text-zinc-500 hover:text-zinc-300 rounded hover:bg-zinc-800 transition-colors"
              title="Hapus pencarian"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {isLoading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-600 border-t-emerald-400" />
          ) : (
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-emerald-400' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-lg border border-zinc-700/80 bg-zinc-900 shadow-2xl max-h-[280px] flex flex-col">
          {isCustomCandidate && (
            <div
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectModel(inputValue.trim());
              }}
              className="px-3 py-2 bg-emerald-950/40 hover:bg-emerald-900/40 border-b border-emerald-900/40 cursor-pointer flex items-center justify-between text-xs transition-colors"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-800/60 text-emerald-300">
                  Custom
                </span>
                <span className="text-emerald-200 font-mono truncate font-medium">
                  {inputValue.trim()}
                </span>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono whitespace-nowrap ml-2">
                Tekan Enter ↵
              </span>
            </div>
          )}

          <div className="overflow-y-auto flex-1 divide-y divide-zinc-800/40">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono">
                Memuat katalog model Hermes...
              </div>
            ) : displayedModels.length === 0 ? (
              <div className="py-8 text-center text-xs text-zinc-500 font-mono px-4">
                {inputValue.trim()
                  ? `Tidak ada model terdaftar yang cocok dengan "${inputValue}". Anda bisa tetap menggunakannya sebagai custom model.`
                  : 'Ketik kata kunci untuk mencari model.'}
              </div>
            ) : (
              <ul className="py-1">
                {displayedModels.map((model, index) => {
                  const isSelected = selectedValue === model;
                  const isHighlighted = index === highlightedIndex;
                  const parts = model.split('/');
                  const providerName = parts.length > 1 ? parts[0] : 'custom / default';
                  const modelShortName = parts.length > 1 ? parts.slice(1).join('/') : model;

                  return (
                    <li
                      key={model}
                      role="option"
                      aria-selected={isSelected}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectModel(model);
                      }}
                      className={`
                        px-3 py-2 text-xs cursor-pointer transition-colors duration-75 flex items-center justify-between gap-2
                        ${isHighlighted
                          ? 'bg-zinc-800 text-zinc-100'
                          : isSelected
                          ? 'bg-zinc-800/50 text-emerald-400'
                          : 'text-zinc-300 hover:bg-zinc-800/60'
                        }
                      `}
                    >
                      <div className="truncate min-w-0 flex-1">
                        <span className="font-mono font-medium block truncate">
                          {modelShortName}
                        </span>
                        <span className="text-[10px] font-sans text-zinc-500 block truncate mt-0.5">
                          {providerName}
                        </span>
                      </div>

                      {isSelected && (
                        <span className="text-emerald-400 text-xs flex-shrink-0">✓</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-zinc-800/80 bg-zinc-950/70 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-500">
            <span>
              {filteredModels.length.toLocaleString()} hasil cocok
            </span>
            <span>
              {displayedModels.length < filteredModels.length && `(menampilkan 25 teratas)`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
