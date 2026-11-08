#!/usr/bin/env node
/**
 * cli/generate-migrations.mjs
 * ------------------------------------------------------------------
 * Writes a migration history JSON for the viewer's import button.
 * Same work as POST /api/migrations (see lib/migrations.js).
 *
 * Usage:
 *   node cli/generate-migrations.mjs -c "postgres://user:pass@host:5432/mydb" --diff
 *   node cli/generate-migrations.mjs -c "postgres://…/mydb" --diff AddUsers1700000000000..
 *   node cli/generate-migrations.mjs -e .env -d ./migrations -o history.json   (plain .sql migrations)
 * ------------------------------------------------------------------
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { program } from 'commander';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

program
  .name('generate-migrations')
  .description('Generate migration history JSON from a Postgres database')
  .option('-c, --connection <url>', 'Postgres connection URL (postgres://user:pass@host:port/db); defaults to .env')
  .option('-e, --env <path>', 'Path to .env file with connection details', path.join(PROJECT_ROOT, '.env'))
  .option('-o, --output <file>', 'Output JSON file path', 'migration-history.json')
  .option('-t, --table <name>', 'Migration table name (auto-detected if not provided)')
  .option('-d, --migration-dir <path>', 'Migrations folder (default: MIGRATIONS_DIR; TypeORM migrations are found automatically)')
  .option('-s, --schema <name>', 'Schema to introspect', 'public')
  .option('--diff [range]', 'Print the schema diff instead of saving JSON: "from..to" (ids or names), "..to", "from.."; default: latest vs previous')
  .option('--keep-temp-db', 'Keep the temporary database (for debugging)')
  .parse();

const options = program.opts();
dotenv.config({ path: options.env });

const { resolveConnection } = require('../lib/connection.js');
const { generateMigrationHistory, compareMigrations } = require('../lib/migrations.js');

try {
  const history = await generateMigrationHistory({
    conn: resolveConnection({ server: options.connection }),
    schema: options.schema,
    migrationDir: options.migrationDir || process.env.MIGRATIONS_DIR,
    table: options.table,
    keepTempDb: options.keepTempDb,
    log: options.diff ? console.error : console.log, // keep stdout to the diff alone
  });
  if (options.diff) {
    const [from, to] = options.diff === true ? [] : options.diff.split('..');
    console.log(compareMigrations(history, { from, to }).text);
    process.exit(0);
  }
  fs.writeFileSync(options.output, JSON.stringify(history, null, 2));
  console.log(`Saved ${history.migrations.length} migrations to ${path.resolve(options.output)}`);
  process.exit(0); // pg pools would otherwise keep the process alive
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
