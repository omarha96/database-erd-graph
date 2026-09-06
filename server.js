/**
 * server.js
 * ------------------------------------------------------------------
 * Static file server for the ERD viewer (serves ./public), plus one
 * JSON API route:
 *
 *   GET /api/schema[?schema=public]
 *     Introspects the Postgres database configured via .env (see
 *     .env.example) and returns { diagram, fkTargets, tableCount,
 *     relationshipCount } in the same shape public/data.js uses — the
 *     browser renders it with the exact same renderDiagram() code
 *     path as the static workflow/form diagrams.
 *
 * All of the introspection logic lives in lib/schema.js so it can be
 * unit tested without a live database.
 * ------------------------------------------------------------------
 */
require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { fetchSchema } = require('./lib/schema');

const PORT = process.env.PORT || 4400;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Pools are cached per-database name, since Postgres connections are
// bound to a single database and a user may switch between several
// (see GET /api/databases below). Built lazily, not at startup, so the
// static viewer still works fine even if no Postgres is configured.
const pools = new Map();

function poolConfigFor(databaseName) {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (databaseName) url.pathname = `/${databaseName}`;
    return { connectionString: url.toString() };
  }
  return {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: databaseName || process.env.PGDATABASE || 'postgres',
  };
}

function getPool(databaseName) {
  const key = databaseName || '__default__';
  if (!pools.has(key)) {
    pools.set(key, new Pool(poolConfigFor(databaseName)));
  }
  return pools.get(key);
}

const DATABASES_QUERY = `
  select datname
  from pg_database
  where datistemplate = false and datallowconn = true
  order by datname;
`;

async function listDatabases(db) {
  const res = await db.query(DATABASES_QUERY);
  return res.rows.map((row) => row.datname);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleSchemaRequest(req, res, query) {
  const schemaName = query.get('schema') || process.env.PGSCHEMA || 'public';
  const databaseName = query.get('database') || undefined;
  try {
    const result = await fetchSchema(getPool(databaseName), schemaName);
    sendJson(res, 200, result);
  } catch (err) {
    console.error('GET /api/schema failed:', err.message);
    sendJson(res, 502, {
      error: 'Could not read schema from Postgres.',
      detail: err.message,
    });
  }
}

async function handleDatabasesRequest(req, res) {
  try {
    const databases = await listDatabases(getPool());
    sendJson(res, 200, { databases });
  } catch (err) {
    console.error('GET /api/databases failed:', err.message);
    sendJson(res, 502, {
      error: 'Could not list databases from Postgres.',
      detail: err.message,
    });
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let urlPath = decodeURIComponent(requestUrl.pathname);

  if (req.method === 'GET' && urlPath === '/api/schema') {
    handleSchemaRequest(req, res, requestUrl.searchParams);
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/databases') {
    handleDatabasesRequest(req, res);
    return;
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);

  // Prevent path traversal outside of PUBLIC_DIR.
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`ERD viewer running at http://localhost:${PORT}`);
});
