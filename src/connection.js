/* Client side of the Postgres connection settings (see lib/connection.js).
   Server, user and SSL are remembered in localStorage; the password is
   kept in memory only and is never stored. */
const STORAGE_KEY = 'erd-connection';

export function readSavedConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && typeof saved === 'object' ? saved : null;
  } catch { return null; }
}

export function saveConnection({ server, user, ssl }) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ server, user, ssl })); } catch { /* ignore */ }
}

export function clearSavedConnection() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export async function api(path, body) {
  const res = await fetch(path, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  return json;
}
