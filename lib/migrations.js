/**
 * lib/migrations.js
 * ------------------------------------------------------------------
 * Builds a migration history: reads the migration log table of a database,
 * replays each migration into a throwaway database and snapshots the schema
 * after every step. TypeORM migrations (.ts/.js) are found automatically
 * from the names in the log; other tools replay the .sql files of
 * MIGRATIONS_DIR in name order.
 * Used by POST /api/migrations and cli/generate-migrations.mjs.
 * ------------------------------------------------------------------
 */
const fs = require('fs');
const path = require('path');
const { Pool, escapeIdentifier } = require('pg');
const { poolFor } = require('./connection');
const os = require('os');
const { fetchSchema } = require('./schema');
const { runMigrationFile } = require('./typeorm-runner');
const { computeSchemaDiff, generateUnifiedDiff } = require('../src/diff.js'); // same diff the viewer shows

const SYSTEMS = {
  typeorm: { table: 'migrations', version: 'id', name: 'name', time: 'timestamp' },
  flyway: { table: 'flyway_schema_history', version: 'installed_rank', name: 'description', time: 'installed_on' },
  knex: { table: 'knex_migrations', version: 'id', name: 'name', time: 'migration_time' },
  sequelize: { table: 'sequelizemeta', version: 'name', name: 'name', time: null },
  custom: { table: 'schema_migrations', version: 'version', name: 'version', time: null }, // Rails-style
};

async function tableExists(db, name) {
  const res = await db.query('select to_regclass($1) is not null as ok', [name]);
  return res.rows[0].ok;
}

// `migrations` is a common name (Laravel uses it too); TypeORM's has a bigint timestamp column.
async function isTypeormTable(db, name) {
  const res = await db.query(
    "select 1 from information_schema.columns where table_schema = current_schema() and table_name = $1 and column_name = 'timestamp' and data_type = 'bigint'",
    [name],
  );
  return res.rowCount > 0;
}

async function detectSystem(db, table) {
  for (const [system, def] of Object.entries(SYSTEMS)) {
    const found = table ? def.table === table : await tableExists(db, def.table);
    if (found && (system !== 'typeorm' || await isTypeormTable(db, def.table))) return { system, def: { ...def, table: table || def.table } };
  }
  if (table && await tableExists(db, table)) return { system: 'custom', def: { ...SYSTEMS.custom, table } };
  return null;
}

async function readMigrations(db, { system, def }) {
  const q = escapeIdentifier;
  const time = def.time ? q(def.time) : 'null';
  const res = await db.query(
    `select ${q(def.version)}::text as version, ${q(def.name)}::text as name, ${time} as ts from ${q(def.table)} order by ${q(def.version)}`,
  );
  return res.rows.map((row, i) => ({
    id: row.version,
    name: row.name || row.version,
    // TypeORM stores epoch ms as bigint text; no time column keeps the order only.
    timestamp: row.ts ? new Date(/^\d+$/.test(row.ts) ? Number(row.ts) : row.ts).getTime() : i,
    system,
  }));
}

/* A step that has created no tables yet is an empty snapshot, not an error. */
async function snapshot(db, schema) {
  const res = await db.query("select count(*)::int as n from information_schema.tables where table_schema = $1 and table_type = 'BASE TABLE'", [schema]);
  return res.rows[0].n ? fetchSchema(db, schema) : { tables: [], relationships: [] };
}

/* *.sql files in name order; they are matched to migrations by position. */
function readSqlFiles(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'))
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8'));
}

/* TypeORM names a migration class `<Name><timestamp>` and its file `<timestamp>-<Name>.ts`. */
const typeormFileName = (name) => {
  const m = /^(.*?)(\d{13})$/.exec(name);
  return m ? `${m[2]}-${m[1]}` : null;
};
const typeormFileKey = (file) => {
  const m = /^(\d+)-(.+)\.(ts|js)$/.exec(file);
  return m && !file.endsWith('.d.ts') ? `${m[2]}${m[1]}` : null;
};

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', 'vendor', 'tmp', 'temp', 'Library', 'AppData', 'snap']);
const foundDirs = new Map(); // newest migration name -> folder, for this server's lifetime

/* Maps each logged TypeORM migration to its file in `dir` (null where the
   file is gone, e.g. renamed after it ran). Returns null for a folder that
   lacks more than MAX_MISSING of them: an old copy of the project, not drift. */
const MAX_MISSING = 0.1;
function typeormFiles(dir, migrations) {
  const byKey = new Map();
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  for (const f of names) {
    const key = typeormFileKey(f);
    if (key && (!byKey.has(key) || f.endsWith('.ts'))) byKey.set(key, path.join(dir, f)); // prefer .ts over compiled .js
  }
  const files = migrations.map((m) => byKey.get(m.name) || null);
  const missing = files.filter((f) => !f).length;
  return missing <= Math.floor(migrations.length * MAX_MISSING) ? files : null;
}

/* Breadth-first search for the migrations folder: the first one holding
   (nearly) every logged migration, skipping hidden, dependency and build
   folders. Roots: MIGRATION_SEARCH_ROOTS or $HOME. */
async function findMigrationDir(migrations, log) {
  const cacheKey = migrations[migrations.length - 1].name;
  if (foundDirs.has(cacheKey)) return foundDirs.get(cacheKey);
  const targets = new Set(migrations.map((m) => typeormFileName(m.name)).filter(Boolean).flatMap((stem) => [`${stem}.ts`, `${stem}.js`]));
  const started = Date.now();
  let queue = (process.env.MIGRATION_SEARCH_ROOTS || os.homedir()).split(path.delimiter).filter(Boolean);
  // ponytail: plain directory walk; an index (e.g. plocate) would make huge home folders instant.
  while (queue.length) {
    const next = [];
    for (const dir of queue) {
      let entries;
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
      if (entries.some((e) => e.isFile() && targets.has(e.name)) && typeormFiles(dir, migrations)) {
        log(`Found migrations in ${dir} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
        foundDirs.set(cacheKey, dir);
        return dir;
      }
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) next.push(path.join(dir, e.name));
      }
    }
    queue = next;
  }
  return null;
}

/**
 * @param {object} opts
 * @param {object} opts.conn         resolved connection (lib/connection.js resolveConnection)
 * @param {string} [opts.database]   database holding the migration log (default: conn.database)
 * @param {string} [opts.schema]     schema to snapshot (default 'public')
 * @param {string} [opts.migrationDir] migrations folder (TypeORM: found automatically if omitted)
 * @param {string} [opts.table]      migration log table (auto-detected if omitted)
 * @param {boolean} [opts.keepTempDb]
 * @param {(msg: string) => void} [opts.log]
 */
async function generateMigrationHistory({ conn, database, schema = 'public', migrationDir, table, keepTempDb = false, log = () => {} }) {
  const dbName = database || conn.database;
  const source = poolFor(conn, dbName);

  const detected = await detectSystem(source, table);
  if (!detected) throw new Error(table ? `Migration table "${table}" not found.` : 'No migration table found (TypeORM, Flyway, Knex, Sequelize or schema_migrations).');
  const migrations = await readMigrations(source, detected);
  log(`Found ${migrations.length} migrations in ${detected.def.table} (${detected.system})`);
  if (!migrations.length) throw new Error('The migration table is empty.');

  // Each step is { sql } or { file } (a TypeORM migration to run).
  let steps;
  if (detected.system === 'typeorm') {
    migrationDir = migrationDir || await findMigrationDir(migrations, log);
    const newest = typeormFileName(migrations[migrations.length - 1].name);
    if (!migrationDir) throw new Error(`Could not find the migration files (looked for files like ${newest}.ts under ${process.env.MIGRATION_SEARCH_ROOTS || os.homedir()}). Set MIGRATIONS_DIR or MIGRATION_SEARCH_ROOTS.`);
    const files = typeormFiles(migrationDir, migrations);
    if (!files) throw new Error(`${migrationDir} is missing too many of the migrations recorded in the database.`);
    steps = files.map((file) => ({ file, missing: !file }));
  } else {
    if (!migrationDir) throw new Error(`Set MIGRATIONS_DIR to the folder of .sql files (automatic search only works for TypeORM).`);
    const sqls = readSqlFiles(path.resolve(migrationDir));
    if (sqls.length !== migrations.length) log(`Warning: ${sqls.length} .sql files for ${migrations.length} migrations`);
    steps = migrations.map((_, i) => ({ sql: sqls[i] || '' }));
  }

  const tempDb = `erd_migration_temp_${Date.now()}`;
  await source.query(`create database ${escapeIdentifier(tempDb)}`);
  // Own pool, not poolFor's cache: it must be fully closed before the drop.
  const temp = new Pool({ ...conn, database: tempDb, ssl: conn.ssl ? { rejectUnauthorized: false } : false, max: 2 });
  const client = await temp.connect(); // one session, so transactions span a migration's queries
  try {
    // Extensions usually come from outside the migrations (TypeORM's driver
    // installs uuid-ossp on connect), so mirror the source database's.
    const ext = await source.query("select extname from pg_extension where extname <> 'plpgsql'");
    for (const { extname } of ext.rows) await client.query(`create extension if not exists ${escapeIdentifier(extname)}`);
    const history = [];
    for (const [i, m] of migrations.entries()) {
      const { sql, file, missing } = steps[i];
      log(`[${i + 1}/${migrations.length}] ${m.name}${missing ? ' (file not found, skipped)' : ''}`);
      try {
        if (file) await runMigrationFile(client, file);
        else if (sql?.trim()) await client.query(`begin; ${sql}; commit;`);
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw new Error(`Migration ${m.name} failed: ${err.message}`);
      }
      history.push({ ...m, schema: await snapshot(temp, schema), ...(sql ? { upSql: sql } : { file }), ...(missing ? { missing: true } : {}) });
    }
    return {
      version: 1,
      database: dbName,
      migrationDir: path.resolve(migrationDir),
      generatedAt: Date.now(),
      connection: { server: `${conn.host}:${conn.port}`, user: conn.user, ssl: !!conn.ssl },
      migrations: history,
    };
  } finally {
    client.release();
    await temp.end();
    if (keepTempDb) log(`Temporary database kept: ${tempDb}`);
    else await source.query(`drop database if exists ${escapeIdentifier(tempDb)}`);
  }
}

/**
 * Diff two snapshots of a history. Migrations are picked by id or name;
 * `to` defaults to the latest and `from` to the one before `to`, so with no
 * arguments it answers "what did the newest migration change?".
 */
function compareMigrations(history, { from, to } = {}) {
  const list = history.migrations;
  const find = (key) => {
    const i = list.findIndex((m) => m.id === String(key) || m.name === String(key));
    if (i < 0) throw new Error(`Migration "${key}" not found.`);
    return i;
  };
  const toIdx = to != null && to !== '' ? find(to) : list.length - 1;
  const fromIdx = from != null && from !== '' ? find(from) : toIdx - 1;
  if (toIdx < 0) throw new Error('The history has no migrations.');
  // Before the first migration the database was empty.
  const empty = { id: '(empty)', name: 'empty database', schema: { tables: [], relationships: [] } };
  const a = list[fromIdx] || empty;
  const b = list[toIdx];
  const { fromSchema, toSchema, ...changes } = computeSchemaDiff(a.schema, b.schema);
  return {
    from: { id: a.id, name: a.name },
    to: { id: b.id, name: b.name },
    changed: changes.tables.length + changes.relationships.added.length + changes.relationships.removed.length + changes.relationships.modified.length > 0,
    ...changes,
    text: `# ${a.id} (${a.name}) -> ${b.id} (${b.name})\n${generateUnifiedDiff({ fromSchema, toSchema, ...changes })}`,
  };
}

module.exports = { generateMigrationHistory, compareMigrations };
