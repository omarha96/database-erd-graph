/* Client side of the Postgres connection settings (see lib/connection.js).
   Server, user and SSL are remembered in localStorage, both the last one
   used and a list of saved servers; the password is kept in memory only
   and is never stored. */
const STORAGE_KEY = 'erd-connection';
const SERVERS_KEY = 'erd-servers';
const sameServer = (a, b) => (a.server || '') === (b.server || '') && (a.user || '') === (b.user || '');

export function readSavedConnection() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved && typeof saved === 'object' ? saved : null;
  } catch { return null; }
}

export function readSavedServers() {
  try {
    const list = JSON.parse(localStorage.getItem(SERVERS_KEY));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writeSavedServers(list) {
  try { localStorage.setItem(SERVERS_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}

// Remembers a successful connection as the last used, and adds it to (or
// moves it to the top of) the saved servers.
export function saveConnection({ server, user, ssl }) {
  const entry = { server, user, ssl };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entry)); } catch { /* ignore */ }
  return writeSavedServers([entry, ...readSavedServers().filter((s) => !sameServer(s, entry))]);
}

export function removeSavedServer(entry) {
  return writeSavedServers(readSavedServers().filter((s) => !sameServer(s, entry)));
}

export function clearSavedConnection() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

export async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the app server.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  return json;
}
