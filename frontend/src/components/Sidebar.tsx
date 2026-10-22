interface SidebarProps {
  currentView: 'office' | 'tasks' | 'new-task' | 'profiles';
  onNavigate: (view: 'office' | 'tasks' | 'new-task' | 'profiles') => void;
  isOpen: boolean;
  onClose: () => void;
  connected: boolean;
  tasksCount: number;
  profilesCount: number;
}

export function Sidebar({
  currentView,
  onNavigate,
  isOpen,
  onClose,
  connected,
  tasksCount,
  profilesCount,
}: SidebarProps) {
  const handleNav = (view: 'office' | 'tasks' | 'new-task' | 'profiles') => {
    onNavigate(view);
    onClose();
  };

  return (
    <>
      {/* Mobile Backdrop - Sentry-style deep overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 backdrop-blur-sm md:hidden"
          style={{ background: 'rgba(0, 0, 0, 0.85)' }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Container - Linear dark-mode native */}
      <aside
        className={`
          fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r transition-transform duration-200 ease-out
          md:static md:z-auto md:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        style={{
          background: '#0f1011',
          borderColor: 'rgba(255, 255, 255, 0.05)',
        }}
        aria-label="Navigasi Utama"
      >
        {/* Brand Header - Linear signature weight 510 */}
        <div 
          className="flex h-16 items-center justify-between border-b px-5"
          style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="flex h-9 w-9 items-center justify-center rounded-lg border font-mono text-base font-semibold"
              style={{ 
                background: '#1b315c',
                borderColor: '#3c65b7',
                color: '#d9e7ff',
                fontWeight: 510,
              }}
            >
              H
            </div>
            <div>
              <div 
                className="text-sm tracking-tight"
                style={{ 
                  color: '#f7f8f8',
                  fontWeight: 510,
                  letterSpacing: '-0.015em',
                }}
              >
                HERMES
              </div>
              <div 
                className="text-[10px] font-mono"
                style={{ color: '#8a8f98' }}
              >
                Mission Control
              </div>
            </div>
          </div>
          {/* Close button for mobile */}
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-md md:hidden transition-colors"
            style={{ color: '#62666d' }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#f7f8f8'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#62666d'}
            aria-label="Tutup navigasi"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation Items - Linear 510 weight + tight spacing */}
        <nav className="flex-1 space-y-0.5 p-2 overflow-y-auto" aria-label="Menu">
          <NavItem
            active={currentView === 'office'}
            onClick={() => handleNav('office')}
            icon={<OfficeIcon />}
            label="Office Floor"
            badge="LIVE"
            isBadgeAccent
          />

          <NavItem
            active={currentView === 'tasks'}
            onClick={() => handleNav('tasks')}
            icon={<TasksIcon />}
            label="Task Board"
            badge={tasksCount.toString()}
          />
          
          <NavItem
            active={currentView === 'new-task'}
            onClick={() => handleNav('new-task')}
            icon={<PlusIcon />}
            label="New Task"
            badge="CREATE"
          />
          
          <NavItem
            active={currentView === 'profiles'}
            onClick={() => handleNav('profiles')}
            icon={<UsersIcon />}
            label="Agent Profiles"
            badge={profilesCount.toString()}
          />
        </nav>

        {/* Footer - Linear tertiary text + Sentry data display */}
        <div 
          className="border-t p-3.5"
          style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
        >
          <div className="flex items-center justify-between">
            <span 
              className="text-[11px]"
              style={{ color: '#62666d', fontWeight: 510 }}
            >
              SSE Stream
            </span>
            <div 
              className="inline-flex items-center gap-1.5 text-[10px] font-mono"
              style={{ color: connected ? '#36c99c' : '#f0b45a', fontWeight: 510 }}
            >
              <span 
                className="h-1.5 w-1.5 rounded-full"
                style={{ 
                  background: connected ? '#36c99c' : '#f0b45a',
                  boxShadow: connected ? '0 0 6px rgba(54, 201, 156, 0.5)' : '0 0 6px rgba(240, 180, 90, 0.5)',
                }} 
              />
              {connected ? 'LIVE' : 'DOWN'}
            </div>
          </div>
          <div 
            className="mt-2 text-[10px] font-mono"
            style={{ color: '#3e4248' }}
          >
            103.253.245.46:8080
          </div>
        </div>
      </aside>
    </>
  );
}

/* Linear-style NavItem with weight 510 + semi-transparent borders */
function NavItem({ 
  active, 
  onClick, 
  icon, 
  label, 
  badge, 
  isBadgeAccent 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon: React.ReactNode; 
  label: string; 
  badge?: string;
  isBadgeAccent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-xs transition-all min-h-[44px] group"
      style={{
        background: active ? 'rgba(92, 106, 210, 0.12)' : 'transparent',
        border: active ? '1px solid rgba(92, 106, 210, 0.25)' : '1px solid transparent',
        color: active ? '#828fff' : '#8a8f98',
        fontWeight: 510,
      }}
    >
      <div className="flex items-center gap-3">
        <span 
          className="transition-colors"
          style={{ color: active ? '#828fff' : '#62666d' }}
        >
          {icon}
        </span>
        <span className="tracking-[-0.01em]">{label}</span>
      </div>
      {badge && (
        <span 
          className="font-mono text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{ 
            background: isBadgeAccent ? 'rgba(92, 106, 210, 0.15)' : 'rgba(255, 255, 255, 0.03)',
            border: isBadgeAccent ? '1px solid rgba(92, 106, 210, 0.25)' : '1px solid rgba(255, 255, 255, 0.05)',
            color: isBadgeAccent ? '#828fff' : '#62666d',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function OfficeIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
    </svg>
  );
}

function TasksIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}
