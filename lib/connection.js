/**
 * lib/connection.js
 * ------------------------------------------------------------------
 * Postgres connection settings. The browser can supply a server,
 * username, password and SSL flag (the connection menu in the toolbar);
 * anything it leaves blank falls back to .env (DATABASE_URL or the PG*
 * variables), which therefore only provides defaults.
 *
 * The .env password is never sent to the browser: GET /api/connection
 * only reports whether one exists, and a blank password in a request
 * means "use the .env one" -- but only for the .env server and user.
 * ------------------------------------------------------------------
 */
const crypto = require('crypto');
const { Pool } = require('pg');

const DEFAULT_PORT = 5432;
const MAX_POOLS = 8;

/* Settings from .env, normalized to { host, port, user, password, database, ssl }. */
function envDefaults(env = process.env) {
  if (env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    const sslmode = url.searchParams.get('sslmode');
    return {
      host: url.hostname || 'localhost',
      port: Number(url.port) || DEFAULT_PORT,
      user: decodeURIComponent(url.username || '') || 'postgres',
      password: decodeURIComponent(url.password || ''),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
      ssl: !!sslmode && sslmode !== 'disable',
    };
  }
  return {
    host: env.PGHOST || 'localhost',
    port: Number(env.PGPORT) || DEFAULT_PORT,
    user: env.PGUSER || 'postgres',
    password: env.PGPASSWORD || '',
    database: env.PGDATABASE || 'postgres',
    ssl: !!env.PGSSLMODE && env.PGSSLMODE !== 'disable',
  };
}

/* What the browser may see: everything except the password itself. */
function publicDefaults(env = process.env) {
  const { password, ...rest } = envDefaults(env);
  return { ...rest, server: `${rest.host}:${rest.port}`, hasPassword: !!password };
}

/* Parses "host", "host:port", "[::1]:5432" or a postgres:// URL. */
function parseServer(server) {
  const value = String(server || '').trim();
  if (!value) return {};
  if (/^postgres(ql)?:\/\//i.test(value)) {
    const url = new URL(value);
    const sslmode = url.searchParams.get('sslmode');
    return {
      host: url.hostname,
      port: Number(url.port) || DEFAULT_PORT,
      ...(url.username ? { user: decodeURIComponent(url.username) } : {}),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      ...(url.pathname.length > 1 ? { database: decodeURIComponent(url.pathname.slice(1)) } : {}),
      ...(sslmode ? { ssl: sslmode !== 'disable' } : {}),
    };
  }
  const m = /^\[?([^\]]+?)\]?(?::(\d+))?$/.exec(value.includes(']') || value.split(':').length <= 2 ? value : `[${value}]`);
  if (!m) throw new Error(`Invalid server "${value}". Use host, host:port or a postgres:// URL.`);
  return { host: m[1], port: Number(m[2]) || DEFAULT_PORT };
}

/* Request-supplied settings merged over .env defaults. */
function resolveConnection(input = {}, env = process.env) {
  const defaults = envDefaults(env);
  const fromServer = parseServer(input.server);
  const conn = {
    ...defaults,
    ...fromServer,
    ...(input.user ? { user: String(input.user) } : {}),
    ...(typeof input.ssl === 'boolean' ? { ssl: input.ssl } : {}),
  };
  // The .env password is only ever sent to the .env server as the .env
  // user. Otherwise a client could point the app at a host it controls
  // and receive that password in the Postgres handshake.
  const sameAsEnv = conn.host === defaults.host && conn.port === defaults.port && conn.user === defaults.user;
  conn.password = input.password ? String(input.password)
    : fromServer.password ? fromServer.password
      : sameAsEnv ? defaults.password : '';
  if (!conn.host) throw new Error('No server given and none configured in .env.');
  if (!Number.isInteger(conn.port) || conn.port < 1 || conn.port > 65535) throw new Error(`Invalid port ${conn.port}.`);
  return conn;
}

/* Pools are cached per (server, user, password, database, ssl) and the
   least recently used ones are closed once there are more than MAX_POOLS. */
const pools = new Map();

function poolFor(conn, databaseName) {
  const database = databaseName || conn.database;
  const key = JSON.stringify([
    conn.host, conn.port, conn.user, database, conn.ssl,
    crypto.createHash('sha256').update(conn.password || '').digest('hex'),
  ]);
  let pool = pools.get(key);
  if (pool) {
    pools.delete(key); // re-insert as most recently used
  } else {
    pool = new Pool({
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database,
      // Like libpq's sslmode=require: encrypted, certificate not verified.
      ssl: conn.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 8000,
      max: 4,
    });
    pool.on('error', (err) => console.error('Postgres pool error:', err.message));
  }
  pools.set(key, pool);
  while (pools.size > MAX_POOLS) {
    const [oldKey, oldPool] = pools.entries().next().value;
    pools.delete(oldKey);
    oldPool.end().catch(() => {});
  }
  return pool;
}

module.exports = { envDefaults, publicDefaults, parseServer, resolveConnection, poolFor };
