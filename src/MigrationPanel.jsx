import { useEffect, useState } from 'react';

/* Migration history side panel: generates the history of the open database
   (POST /api/migrations; the server finds the migration files itself), lists
   its migrations to view one at a time, and compares two of them
   (POST /api/migrations/diff). */

export default function MigrationPanel({
  isOpen, database, migrations, migrationDir, currentIndex, diffPair, busy, error,
  onGenerate, onLoad, onCompare, onShowLive, onClose,
}) {
  const [picked, setPicked] = useState([]); // up to two indices, in click order

  useEffect(() => { setPicked([]); }, [migrations]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const togglePick = (i) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p.slice(-1), i]));
  const [a, b] = [...picked].sort((x, y) => x - y);
  const hasHistory = migrations.length > 0;

  return (
    <aside id="migration-panel" className="open" aria-label="Migrations">
      <header className="migration-panel-header">
        <div>
          <h2 className="migration-panel-title">Migrations</h2>
          <div className="migration-panel-sub">
            {database || 'No database open'}
            {onShowLive && database && <> · <button type="button" className="link-btn" onClick={onShowLive}>back to live</button></>}
          </div>
        </div>
        <div className="migration-panel-tools">
          {hasHistory && (
            <>
              <button type="button" className="icon-btn" onClick={onGenerate} disabled={busy || !database} aria-label="Regenerate" title="Regenerate from the database and migration files">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></svg>
              </button>
            </>
          )}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close migrations" title="Close (Esc)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </header>

      {!hasHistory && (
        <div className="migration-generate">
          <p className="migration-hint">
            Finds this database's migration files on the app server, replays them into a temporary database and snapshots the schema after each one.
          </p>
          <button type="button" className="primary-btn" onClick={onGenerate} disabled={busy || !database}>
            {busy ? 'Finding and replaying migrations…' : database ? `Generate history for “${database}”` : 'Open a database first'}
          </button>
        </div>
      )}
      {hasHistory && migrationDir && <div className="migration-source" title={migrationDir}>{shortPath(migrationDir)}</div>}

      {error && <div className="connection-status error migration-error" role="alert">{error}</div>}

      {hasHistory && (
        <ol className="migration-list">
          {migrations.map((m, i) => {
            const inDiff = diffPair && (diffPair.to === i || diffPair.from === i);
            return (
              <li
                key={m.id}
                className={`migration-item${i === currentIndex ? ' current' : ''}${picked.includes(i) ? ' picked' : ''}${inDiff ? ' in-diff' : ''}${m.missing ? ' missing' : ''}`}
              >
                <input
                  type="checkbox"
                  className="diff-checkbox"
                  checked={picked.includes(i)}
                  onChange={() => togglePick(i)}
                  aria-label={`Pick ${m.name} for comparison`}
                  title="Pick two to compare"
                />
                <button type="button" className="migration-main" onClick={() => onLoad(i)} disabled={busy} title="Show the schema after this migration">
                  <span className="migration-name" title={m.name}>{m.name.replace(/\d{13}$/, '') /* TypeORM's timestamp suffix */}</span>
                  <span className="migration-meta">
                    {m.missing ? <span className="migration-missing" title="Recorded in the database, but its file is gone (renamed or deleted?), so it was skipped">file not found · skipped</span> : formatTimeAgo(m.timestamp)}
                  </span>
                </button>
                <button
                  type="button"
                  className="migration-delta"
                  onClick={() => onCompare(i - 1, i)}
                  disabled={busy}
                  title={i === 0 ? 'Changes from an empty database' : 'Changes made by this migration'}
                  aria-label={`Changes made by ${m.name}`}
                >
                  Δ
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {hasHistory && (
        <footer className="migration-diff-bar">
          {picked.length === 2 ? (
            <button type="button" className="primary-btn compare-btn" onClick={() => onCompare(a, b)} disabled={busy}>
              Compare {migrations[a].name} → {migrations[b].name}
            </button>
          ) : (
            <span className="migration-hint">Click a migration to view it · Δ shows what it changed · tick two to compare</span>
          )}
        </footer>
      )}
    </aside>
  );
}

// Last three folders, e.g. "…/backend/src/database/migrations" → "…/src/database/migrations".
const shortPath = (p) => { const parts = p.split(/[\\/]/); return parts.length > 3 ? `…/${parts.slice(-3).join('/')}` : p; };

function formatTimeAgo(timestamp) {
  if (!timestamp || timestamp < 1e11) return ''; // no time column in the migration log
  const mins = Math.floor((Date.now() - timestamp) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`;
}
