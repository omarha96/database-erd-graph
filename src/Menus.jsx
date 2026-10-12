import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/* Fixed-position popover below (or above, if it would overflow) an
   anchor rect; closes on outside click or Escape. */
function Popover({ anchor, className, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: anchor.left, top: anchor.bottom + 6, visibility: 'hidden' });

  useLayoutEffect(() => {
    const rect = ref.current.getBoundingClientRect();
    let left = anchor.left;
    let top = anchor.bottom + 6;
    if (left + rect.width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - rect.width - 12);
    if (top + rect.height > window.innerHeight - 12) top = Math.max(12, anchor.top - rect.height - 6);
    setPos({ left, top, visibility: 'visible' });
  }, [anchor]);

  useEffect(() => {
    const onDown = (e) => {
      // The button that toggles this popover handles its own close.
      if (!ref.current?.contains(e.target) && !e.target.closest?.('[data-popover-toggle]')) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    // Defer so the click that opened the menu doesn't immediately close it.
    const id = setTimeout(() => document.addEventListener('pointerdown', onDown));
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(id); document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return <div ref={ref} className={`popover ${className}`} style={pos}>{children}</div>;
}

export function GroupMenu({ anchor, groups, hiddenGroups, onToggle, onAll, onNone, onClose }) {
  let cluster = 0;
  return (
    <Popover anchor={anchor} className="group-menu" onClose={onClose}>
      <div className="popover-header">
        <span>{groups.length} group{groups.length !== 1 ? 's' : ''}</span>
        <span className="popover-actions">
          <button type="button" onClick={onAll}>All</button>
          <button type="button" onClick={onNone}>None</button>
        </span>
      </div>
      {groups.length === 0 && <div className="popover-empty">No tables to group.</div>}
      {groups.map((g) => {
        const count = `${g.tables.length} table${g.tables.length !== 1 ? 's' : ''}`;
        const name = g.kind === 'unconnected' ? `Unconnected tables — ${count}` : `Cluster ${++cluster} — ${count}`;
        const preview = g.tables.slice(0, 4).join(', ') + (g.tables.length > 4 ? `, +${g.tables.length - 4} more` : '');
        return (
          <label key={g.id} className="popover-item">
            <input type="checkbox" checked={!hiddenGroups.has(g.id)} onChange={(e) => onToggle(g.id, e.target.checked)} />
            <span>
              <span className="group-name">{name}</span>
              <span className="group-tables">{preview}</span>
            </span>
          </label>
        );
      })}
    </Popover>
  );
}

export function ReferencesMenu({ anchor, title, references, onPick, onClose }) {
  return (
    <Popover anchor={anchor} className="reverse-menu" onClose={onClose}>
      <div className="popover-header">
        <span>{title} — referenced by {references.length} field{references.length !== 1 ? 's' : ''}</span>
      </div>
      {references.length === 0 && <div className="popover-empty">No references</div>}
      {references.map((r) => (
        <button key={`${r.source}.${r.sourceColumn}`} type="button" className="popover-item" onClick={() => onPick(r)}>
          <code>{r.source}</code><span className="dim">.{r.sourceColumn}</span>
        </button>
      ))}
    </Popover>
  );
}

/* Postgres connection settings. Blank fields use the server's .env
   defaults; the .env password itself is never shown or sent here. */
export function ConnectionMenu({ anchor, initial, defaults, connected, databaseCount, onConnect, onReset, onClose }) {
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState(
    connected ? { ok: true, text: `Connected as ${connected.user}@${connected.server} — ${databaseCount} database${databaseCount !== 1 ? 's' : ''}` } : null,
  );
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const envServer = defaults?.server;
  const usesEnvPassword = defaults?.hasPassword && !form.password
    && (form.server || envServer) === envServer && (form.user || defaults?.user) === defaults?.user;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const body = await onConnect(form);
      setStatus({ ok: true, text: `Connected as ${body.user}@${body.server} — ${body.databases.length} database${body.databases.length !== 1 ? 's' : ''}` });
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover anchor={anchor} className="connection-menu" onClose={onClose}>
      <div className="popover-header"><span>Postgres connection</span></div>
      <form className="connection-form" onSubmit={submit}>
        <label>
          <span>Server</span>
          <input
            value={form.server}
            onChange={set('server')}
            placeholder={envServer || 'host:port or postgres://…'}
            autoComplete="off"
            spellCheck={false}
            autoFocus
          />
        </label>
        <label>
          <span>Username</span>
          <input value={form.user} onChange={set('user')} placeholder={defaults?.user || 'postgres'} autoComplete="username" spellCheck={false} />
        </label>
        <label>
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder={usesEnvPassword ? 'from .env' : ''}
            autoComplete="current-password"
          />
        </label>
        <label className="connection-check">
          <input type="checkbox" checked={!!form.ssl} onChange={set('ssl')} />
          <span>Use SSL (required by most hosted databases)</span>
        </label>
        {status && <div className={`connection-status ${status.ok ? 'ok' : 'error'}`} role="status">{status.text}</div>}
        <div className="connection-actions">
          {defaults && (
            <button type="button" className="link-btn" onClick={() => { setForm(onReset()); setStatus(null); }}>
              Reset to .env defaults
            </button>
          )}
          <button type="submit" className="primary-btn" disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
        </div>
        <p className="connection-note">Server, username and SSL are remembered in this browser; the password is not.</p>
      </form>
    </Popover>
  );
}
