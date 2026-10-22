interface HamburgerButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export function HamburgerButton({ onClick, isOpen }: HamburgerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-md border border-zinc-800 text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200 md:hidden"
      aria-label={isOpen ? 'Tutup navigasi' : 'Buka navigasi'}
      aria-expanded={isOpen}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        {isOpen ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        )}
      </svg>
    </button>
  );
}
