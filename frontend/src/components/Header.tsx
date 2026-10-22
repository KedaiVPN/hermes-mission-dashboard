import type { Profile, Task } from '../types';

interface HeaderProps {
  tasks: Task[];
  profiles: Profile[];
  connected: boolean;
}

export function Header({ tasks, profiles, connected }: HeaderProps) {
  const active = tasks.filter((t) => t.status === 'active').length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;

  return (
    <>
      <header className="app-header">
        <div className="brand-mark">
          <span className="brand-glyph" aria-hidden="true">H</span>
          <div>
            <div className="brand-name">Hermes</div>
            <div className="brand-subtitle">{profiles.length} active profiles</div>
          </div>
        </div>
        <div className="connection" aria-live="polite">
          <span className={`connection-dot ${connected ? 'live' : ''}`} />
          {connected ? 'Live updates on' : 'Reconnecting'}
        </div>
      </header>

      <section className="page-intro" aria-label="Dashboard overview">
        <p className="section-kicker">Mission control</p>
        <h1>Task overview</h1>
        <p>Monitor and move work across your agent queue.</p>
      </section>

      <section className="metric-strip" aria-label="Task metrics">
        <div className="metric">
          <span className="metric-label">All tasks</span>
          <span className="metric-value">{tasks.length}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Active</span>
          <span className="metric-value active">{active}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Blocked</span>
          <span className="metric-value blocked">{blocked}</span>
        </div>
      </section>
    </>
  );
}
