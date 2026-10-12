/**
 * server.js
 * ------------------------------------------------------------------
 * Static file server for the built ERD viewer (serves ./dist, produced
 * by `npm run build`), plus JSON API routes:
 *
 *   GET|POST /api/schema
 *     Introspects a Postgres database and returns
 *     { tables, relationships, diagram, fkTargets, ... } —
 *     see lib/schema.js.
 *
 *   GET|POST /api/databases
 *     Lists the databases the Postgres user can connect to.
 *
 *   GET /api/connection
 *     The .env connection defaults (never the password) used to prefill
 *     the connection menu.
 *
 * POST bodies are { connection: { server, user, password, ssl },
 * database, schema }; blank fields fall back to .env (lib/connection.js).
 * GET requests use .env only, with ?database= / ?schema=.
 *
 * During development `npm run dev` runs Vite with hot reload and proxies
 * /api to this server.
 *
 * All of the introspection logic lives in lib/schema.js so it can be
 * unit tested without a live database.
 * ------------------------------------------------------------------
 */
require('dotenv').config();

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { fetchSchema } = require('./lib/schema');
const { publicDefaults, resolveConnection, poolFor } = require('./lib/connection');

const PORT = process.env.PORT || 4440;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'dist');

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

const MAX_BODY_BYTES = 64 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Request body too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('Invalid JSON body.')); }
    });
    req.on('error', reject);
  });
}

/* Request parameters: POST bodies carry { connection, database, schema };
   GET falls back to .env with ?database= / ?schema= query params. */
async function requestParams(req, query) {
  const body = req.method === 'POST' ? await readJsonBody(req) : {};
  return {
    conn: resolveConnection(body.connection || {}),
    database: body.database || query.get('database') || undefined,
    schema: body.schema || query.get('schema') || process.env.PGSCHEMA || 'public',
  };
}

async function handleSchemaRequest(req, res, query) {
  try {
    const { conn, database, schema } = await requestParams(req, query);
    sendJson(res, 200, await fetchSchema(poolFor(conn, database), schema));
  } catch (err) {
    console.error('/api/schema failed:', err.message);
    sendJson(res, 502, { error: 'Could not read schema from Postgres.', detail: err.message });
  }
}

async function handleDatabasesRequest(req, res, query) {
  try {
    const { conn } = await requestParams(req, query);
    const databases = await listDatabases(poolFor(conn));
    sendJson(res, 200, { databases, server: `${conn.host}:${conn.port}`, user: conn.user });
  } catch (err) {
    console.error('/api/databases failed:', err.message);
    sendJson(res, 502, { error: 'Could not list databases from Postgres.', detail: err.message });
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
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let urlPath = decodeURIComponent(requestUrl.pathname);

  const isRead = req.method === 'GET' || req.method === 'POST';
  if (isRead && urlPath === '/api/schema') {
    handleSchemaRequest(req, res, requestUrl.searchParams);
    return;
  }

  if (isRead && urlPath === '/api/databases') {
    handleDatabasesRequest(req, res, requestUrl.searchParams);
    return;
  }

  if (req.method === 'GET' && urlPath === '/api/connection') {
    sendJson(res, 200, publicDefaults());
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
      if (err.code === 'ENOENT' && urlPath === '/index.html') {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('Viewer not built yet. Run `npm run build` (or `npm run dev` for development).');
      } else if (err.code === 'ENOENT') {
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

server.listen(PORT, HOST, () => {
  const lanIp = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i.family === 'IPv4' && !i.internal)?.address;
  console.log(`ERD viewer running at http://localhost:${PORT}${lanIp ? ` (LAN: http://${lanIp}:${PORT})` : ''}`);
});
