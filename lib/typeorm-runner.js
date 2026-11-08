/**
 * lib/typeorm-runner.js
 * ------------------------------------------------------------------
 * Runs TypeORM migration files (.ts or .js) without the project's own
 * node_modules: each file is bundled with esbuild (relative imports
 * included) and `typeorm` / `@nestjs/common` are swapped for the small
 * stand-ins below. Its QueryRunner covers what generated and hand-written
 * migrations use: query(), transactions and foreign keys. Anything else
 * fails with a message naming the missing method.
 * ------------------------------------------------------------------
 */
const path = require('path');
const Module = require('module');

class Options { constructor(options = {}) { Object.assign(this, options); } }
const typeormShim = {
  Table: class Table extends Options {},
  TableColumn: class TableColumn extends Options {},
  TableIndex: class TableIndex extends Options {},
  TableForeignKey: class TableForeignKey extends Options {},
  TableUnique: class TableUnique extends Options {},
  TableCheck: class TableCheck extends Options {},
};
const nestShim = {
  Logger: class Logger {
    constructor(context) { this.context = context; }
    log(...a) { console.log(`[${this.context}]`, ...a); }
    warn(...a) { console.warn(`[${this.context}]`, ...a); }
    error(...a) { console.error(`[${this.context}]`, ...a); }
    debug() {}
    verbose() {}
  },
};
const SHIMS = { typeorm: typeormShim, '@nestjs/common': nestShim };

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
const tableName = (t) => (typeof t === 'string' ? t : t.name);

/* The subset of TypeORM's QueryRunner that migrations call, over one pg client. */
function queryRunnerFor(client) {
  const runner = {
    isTransactionActive: false,
    async query(sql, params) {
      const res = await client.query(sql, params);
      return Array.isArray(res) ? res.map((r) => r.rows) : res.rows;
    },
    async startTransaction() { await client.query('BEGIN'); runner.isTransactionActive = true; },
    async commitTransaction() { await client.query('COMMIT'); runner.isTransactionActive = false; },
    async rollbackTransaction() { await client.query('ROLLBACK'); runner.isTransactionActive = false; },
    async createForeignKey(table, fk) {
      const name = fk.name ? `CONSTRAINT ${q(fk.name)} ` : '';
      await client.query(
        `ALTER TABLE ${q(tableName(table))} ADD ${name}FOREIGN KEY (${fk.columnNames.map(q).join(', ')}) `
        + `REFERENCES ${q(fk.referencedTableName)} (${fk.referencedColumnNames.map(q).join(', ')})`
        + `${fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ''}${fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : ''}`,
      );
    },
    async createForeignKeys(table, fks) { for (const fk of fks) await runner.createForeignKey(table, fk); },
    async dropForeignKey(table, fk) {
      let name = typeof fk === 'string' ? fk : fk.name;
      if (!name) { // unnamed TableForeignKey: look the constraint up by its columns
        const res = await client.query(
          `SELECT con.conname FROM pg_constraint con
             JOIN pg_class c ON c.oid = con.conrelid
            WHERE con.contype = 'f' AND c.relname = $1
              AND (SELECT array_agg(a.attname ORDER BY a.attname) FROM pg_attribute a
                    WHERE a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)) = $2::name[]`,
          [tableName(table), [...fk.columnNames].sort()],
        );
        name = res.rows[0]?.conname;
        if (!name) throw new Error(`No foreign key on ${tableName(table)}(${fk.columnNames.join(', ')})`);
      }
      await client.query(`ALTER TABLE ${q(tableName(table))} DROP CONSTRAINT ${q(name)}`);
    },
    async dropForeignKeys(table, fks) { for (const fk of fks) await runner.dropForeignKey(table, fk); },
    async hasTable(table) {
      const res = await client.query('SELECT to_regclass($1) IS NOT NULL AS ok', [tableName(table)]);
      return res.rows[0].ok;
    },
    async hasColumn(table, column) {
      const res = await client.query(
        'SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 AND column_name = $2',
        [tableName(table), column],
      );
      return res.rowCount > 0;
    },
  };
  return new Proxy(runner, {
    get(target, prop) {
      if (prop in target || typeof prop === 'symbol' || prop === 'then') return target[prop];
      throw new Error(`queryRunner.${String(prop)}() is not supported when replaying migrations here; only query() and foreign-key helpers are.`);
    },
  });
}

/* Bundles a migration file and returns its exported migration classes. */
async function loadMigrationClasses(file) {
  let esbuild;
  try { esbuild = require('esbuild'); } catch {
    throw new Error('Replaying TypeORM migrations needs the esbuild package (npm install esbuild).');
  }
  const result = await esbuild.build({
    entryPoints: [file],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    // Shimmed packages are resolved by the require() below; other packages
    // stay external and resolve from the migration's own folder if installed.
    packages: 'external',
  });
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const fallback = Module.createRequire(file);
  mod.require = (id) => SHIMS[id] || fallback(id);
  mod._compile(result.outputFiles[0].text, file);
  return Object.values(mod.exports).filter((v) => typeof v === 'function' && typeof v.prototype?.up === 'function');
}

/* Runs one migration's up() the way TypeORM does: inside a transaction
   unless the migration sets `transaction = false`. */
async function runMigrationFile(client, file) {
  const classes = await loadMigrationClasses(file);
  if (!classes.length) throw new Error(`No migration class with an up() method in ${path.basename(file)}`);
  const runner = queryRunnerFor(client);
  for (const Migration of classes) {
    const migration = new Migration();
    const wrap = migration.transaction !== false;
    if (wrap) await runner.startTransaction();
    try {
      await migration.up(runner);
      if (runner.isTransactionActive) await runner.commitTransaction();
    } catch (err) {
      if (runner.isTransactionActive) await runner.rollbackTransaction().catch(() => {});
      throw err;
    }
  }
}

module.exports = { runMigrationFile };
