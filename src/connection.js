/* Client side of the Postgres connection settings (see lib/connection.js).
   Server, user and SSL are remembered in localStorage; the password is
   kept in memory only and is never stored. */
const STORAGE_KEY = 'erd-connection';
const API_BASE_KEY = 'erd-api-base';

/* The desktop app (Pake build, `vite build --mode desktop`) is a static
   page, so it reaches the Postgres API on a separately running server.js
   at a configurable "app server" URL. The web build uses its own origin. */
export const IS_DESKTOP = import.meta.env.VITE_DESKTOP === '1';
const DEFAULT_API_BASE = import.meta.env.VITE_API_BASE || '';

export function getApiBase() {
  if (!IS_DESKTOP) return '';
  try { return localStorage.getItem(API_BASE_KEY) || DEFAULT_API_BASE; } catch { return DEFAULT_API_BASE; }
}

export function setApiBase(url) {
  try {
    const clean = String(url || '').trim().replace(/\/+$/, '');
    if (clean && clean !== DEFAULT_API_BASE) localStorage.setItem(API_BASE_KEY, clean);
    else localStorage.removeItem(API_BASE_KEY);
  } catch { /* ignore */ }
}

export const defaultApiBase = () => DEFAULT_API_BASE;

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
  const base = getApiBase();
  let res;
  try {
    res = await fetch(base + path, body === undefined ? undefined : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(IS_DESKTOP
      ? `Can't reach the app server at ${base || '(not set)'}. Start it with \`npm start\` (or set its address above).`
      : "Can't reach the app server.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.detail || json.error || `HTTP ${res.status}`);
  return json;
}
