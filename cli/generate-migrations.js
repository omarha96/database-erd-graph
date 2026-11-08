#!/usr/bin/env node
/**
 * cli/generate-migrations.js
 * ------------------------------------------------------------------
 * CLI script to generate migration history JSON from a live Postgres database.
 * 
 * Usage:
 *   node cli/generate-migrations.js --connection "postgres://user:pass@host:port/db" --output migration-history.json
 *   node cli/generate-migrations.js --env .env --output migration-history.json
 * 
 * This script:
 * 1. Connects to the source database
 * 2. Detects the migration system (Flyway, Knex, Sequelize, custom)
 * 3. Reads the migration list
 * 4. Creates a temporary database
 * 5. Applies each migration in sequence
 * 6. Introspects schema at each step
 * 7. Exports full migration history as JSON
 * ------------------------------------------------------------------
 */

import { program } from 'commander';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import dotenv from 'dotenv';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, '..');

// Load .env if exists
dotenv.config({ path: resolve(PROJECT_ROOT, '.env') });

program
  .name('generate-migrations')
  .description('Generate migration history JSON from a Postgres database')
  .version('1.0.0')
  .option('-c, --connection <url>', 'Postgres connection URL (postgres://user:pass@host:port/db)')
  .option('-e, --env <path>', 'Path to .env file with connection details')
  .option('-o, --output <file>', 'Output JSON file path', 'migration-history.json')
  .option('-t, --table <name>', 'Specific migration table name (auto-detect if not provided)')
  .option('-d, --migration-dir <path>', 'Directory with migration SQL files (for systems without migration table)')
  .option('-s, --schema <name>', 'Schema to introspect (default: public)', 'public')
  .option('--temp-db-prefix <prefix>', 'Prefix for temporary database name', 'erd_migration_temp_')
  .option('--keep-temp-db', 'Keep temporary database after generation (for debugging)')
  .parse();

const options = program.opts();

async function main() {
  // Resolve connection
  let connectionConfig;
  if (options.connection) {
    const url = new URL(options.connection);
    connectionConfig = {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
      ssl: url.searchParams.get('ssl') === 'true' ? { rejectUnauthorized: false } : false,
    };
  } else {
    // Use .env defaults (same as server.js)
    connectionConfig = {
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT) || 5432,
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'postgres',
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    };
  }

  if (!connectionConfig.password && process.env.PGPASSWORD) {
    connectionConfig.password = process.env.PGPASSWORD;
  }

  console.log('🔌 Connecting to source database...');
  const sourcePool = new Pool(connectionConfig);
  
  try {
    await sourcePool.query('SELECT 1');
    console.log('✅ Connected to source database');
  } catch (err) {
    console.error('❌ Failed to connect:', err.message);
    process.exit(1);
  }

  // Detect migration table
  let migrationTable = options.table;
  let migrationSystem = null;
  
  if (!migrationTable) {
    console.log('🔍 Auto-detecting migration table...');
    const MIGRATION_TABLES = [
      { name: 'flyway_schema_history', system: 'flyway', versionCol: 'installed_rank', nameCol: 'description', timestampCol: 'installed_on', checksumCol: 'checksum' },
      { name: 'knex_migrations', system: 'knex', versionCol: 'id', nameCol: 'name', timestampCol: 'migration_time' },
      { name: 'sequelizemeta', system: 'sequelize', versionCol: 'name', nameCol: 'name', timestampCol: null },
      { name: 'schema_migrations', system: 'custom', versionCol: 'version', nameCol: 'name', timestampCol: 'created_at' },
      { name: 'schema_migrations', system: 'custom', versionCol: 'version', nameCol: 'version', timestampCol: null },
    ];

    for (const mt of MIGRATION_TABLES) {
      try {
        await sourcePool.query(`SELECT 1 FROM ${mt.name} LIMIT 1`);
        migrationTable = mt.name;
        migrationSystem = mt.system;
        console.log(`✅ Found migration table: ${mt.name} (${mt.system})`);
        break;
      } catch {
        // Table doesn't exist
      }
    }
  }

  if (!migrationTable) {
    console.error('❌ No migration table found. Use --table to specify or --migration-dir for file-based migrations.');
    process.exit(1);
  }

  // Read migrations from table
  console.log(`📋 Reading migrations from ${migrationTable}...`);
  const migrations = await readMigrationsFromTable(sourcePool, migrationTable, migrationSystem);
  console.log(`✅ Found ${migrations.length} migrations`);

  if (migrations.length === 0) {
    console.log('⚠️  No migrations found. Nothing to do.');
    await sourcePool.end();
    return;
  }

  // Create temporary database
  const tempDbName = `${options.tempDbPrefix}${Date.now()}`;
  console.log(`🗄️  Creating temporary database: ${tempDbName}`);
  
  // Connect to postgres database to create temp DB
  const adminPool = new Pool({ ...connectionConfig, database: 'postgres' });
  try {
    await adminPool.query(`CREATE DATABASE ${tempDbName}`);
  } catch (err) {
    console.error('❌ Failed to create temp database:', err.message);
    await adminPool.end();
    await sourcePool.end();
    process.exit(1);
  }
  await adminPool.end();

  const tempPool = new Pool({ ...connectionConfig, database: tempDbName });
  
  try {
    await tempPool.query('SELECT 1');
    console.log('✅ Connected to temporary database');
  } catch (err) {
    console.error('❌ Failed to connect to temp database:', err.message);
    await tempPool.end();
    await sourcePool.end();
    process.exit(1);
  }

  // If we have migration directory with SQL files, use those
  // Otherwise, we need to extract SQL from the source database (harder)
  let migrationSqls = [];
  
  if (options.migrationDir) {
    console.log(`📁 Reading migration SQL files from ${options.migrationDir}...`);
    migrationSqls = await readMigrationSqlFiles(options.migrationDir, migrations);
  } else {
    // Try to get SQL from migration table (Flyway has checksum, others may not have SQL)
    console.log('⚠️  No migration directory provided. Attempting to extract SQL from source database...');
    migrationSqls = await extractMigrationSql(sourcePool, migrationTable, migrationSystem, migrations);
  }

  if (migrationSqls.length !== migrations.length) {
    console.warn(`⚠️  Warning: Found ${migrationSqls.length} SQL files but ${migrations.length} migrations`);
  }

  // Apply migrations one by one and capture schema
  console.log('🔄 Applying migrations and capturing schemas...');
  const migrationHistory = [];
  
  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i];
    const sql = migrationSqls[i] || '';
    
    console.log(`  [${i + 1}/${migrations.length}] ${migration.id}: ${migration.name}`);
    
    if (sql.trim()) {
      try {
        await tempPool.query('BEGIN');
        await tempPool.query(sql);
        await tempPool.query('COMMIT');
      } catch (err) {
        await tempPool.query('ROLLBACK');
        console.error(`❌ Failed to apply migration ${migration.id}:`, err.message);
        console.error('SQL:', sql.substring(0, 500));
        throw err;
      }
    } else {
      console.warn(`    ⚠️  No SQL for this migration, skipping apply`);
    }

    // Introspect schema
    const schema = await introspectSchema(tempPool, options.schema);
    
    // Save table positions (will be auto-laid out later, but we can save current)
    const positions = {}; // Could compute initial layout here if needed

    migrationHistory.push({
      id: migration.id,
      name: migration.name,
      timestamp: migration.timestamp,
      schema: schema,
      positions: positions,
      upSql: sql,
      downSql: '', // Could extract from migration table if available
      system: migrationSystem,
    });
  }

  console.log('✅ All migrations applied and schemas captured');

  // Clean up temp database
  if (!options.keepTempDb) {
    console.log('🧹 Cleaning up temporary database...');
    await tempPool.end();
    const cleanupPool = new Pool({ ...connectionConfig, database: 'postgres' });
    await cleanupPool.query(`DROP DATABASE ${tempDbName}`);
    await cleanupPool.end();
    console.log('✅ Temporary database removed');
  } else {
    console.log(`ℹ️  Temporary database kept: ${tempDbName}`);
    await tempPool.end();
  }

  await sourcePool.end();

  // Generate output JSON
  const output = {
    version: 1,
    database: connectionConfig.database,
    generatedAt: Date.now(),
    connection: {
      server: `${connectionConfig.host}:${connectionConfig.port}`,
      user: connectionConfig.user,
      ssl: !!connectionConfig.ssl,
    },
    migrations: migrationHistory,
  };

  const outputPath = path.isAbsolute(options.output) ? options.output : resolve(PROJECT_ROOT, options.output);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Migration history saved to: ${outputPath}`);
  console.log(`📊 Total migrations: ${migrationHistory.length}`);
  console.log(`📁 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
}

async function readMigrationsFromTable(pool, tableName, system) {
  const MIGRATION_TABLES = {
    flyway: { versionCol: 'installed_rank', nameCol: 'description', timestampCol: 'installed_on', checksumCol: 'checksum' },
    knex: { versionCol: 'id', nameCol: 'name', timestampCol: 'migration_time' },
    sequelize: { versionCol: 'name', nameCol: 'name', timestampCol: null },
    custom: { versionCol: 'version', nameCol: 'name', timestampCol: 'created_at' },
  };

  const mt = MIGRATION_TABLES[system] || MIGRATION_TABLES.custom;
  
  let query;
  if (system === 'flyway') {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name, ${mt.timestampCol} as timestamp, ${mt.checksumCol} as checksum FROM ${tableName} ORDER BY ${mt.versionCol}`;
  } else if (system === 'knex') {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name, ${mt.timestampCol} as timestamp FROM ${tableName} ORDER BY ${mt.versionCol}`;
  } else if (system === 'sequelize') {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name FROM ${tableName} ORDER BY ${mt.versionCol}`;
  } else {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name, ${mt.timestampCol || 'now()'} as timestamp FROM ${tableName} ORDER BY ${mt.versionCol}`;
  }

  const res = await pool.query(query);
  return res.rows.map((row, i) => ({
    id: String(row.version || row.name || `migration-${i}`),
    name: row.name || String(row.version),
    timestamp: row.timestamp ? new Date(row.timestamp).getTime() : Date.now() - (res.rows.length - i) * 86400000,
    system: system,
    checksum: row.checksum || null,
  }));
}

async function readMigrationSqlFiles(dir, migrations) {
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql') || f.endsWith('.up.sql'))
    .sort(); // Assumes files are named with timestamp/version prefix

  const sqls = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    // Split by ; and filter out empty statements
    const statements = content.split(';').map(s => s.trim()).filter(s => s.length > 0);
    sqls.push(statements.join('; '));
  }
  return sqls;
}

async function extractMigrationSql(pool, tableName, system, migrations) {
  // This is a best-effort attempt to get SQL from migration table
  // Flyway doesn't store SQL, Knex might, custom tables vary
  // For now, return empty array - user should provide --migration-dir
  console.warn('⚠️  SQL extraction from migration table not implemented. Use --migration-dir.');
  return migrations.map(() => '');
}

async function introspectSchema(pool, schemaName) {
  // Replicate the logic from lib/schema.js
  const TABLES_QUERY = `
    select table_name
    from information_schema.tables
    where table_schema = $1 and table_type = 'BASE TABLE'
    order by table_name;
  `;

  const COLUMNS_QUERY = `
    select table_name, column_name, data_type, ordinal_position
    from information_schema.columns
    where table_schema = $1
    order by table_name, ordinal_position;
  `;

  const PRIMARY_KEYS_QUERY = `
    select tc.table_name, kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = $1;
  `;

  const FOREIGN_KEYS_QUERY = `
    select
      tc.table_name as source_table,
      kcu.column_name as source_column,
      ccu.table_name as target_table,
      ccu.column_name as target_column
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on tc.constraint_name = ccu.constraint_name
     and tc.table_schema = ccu.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = $1;
  `;

  const [tablesRes, columnsRes, pksRes, fksRes] = await Promise.all([
    pool.query(TABLES_QUERY, [schemaName]),
    pool.query(COLUMNS_QUERY, [schemaName]),
    pool.query(PRIMARY_KEYS_QUERY, [schemaName]),
    pool.query(FOREIGN_KEYS_QUERY, [schemaName]),
  ]);

  if (tablesRes.rows.length === 0) {
    return { tables: [], relationships: [] };
  }

  // Build structured schema (same as buildErDiagram in lib/schema.js)
  const TYPE_ALIASES = {
    'character varying': 'varchar',
    'timestamp without time zone': 'timestamp',
    'timestamp with time zone': 'timestamptz',
    'time without time zone': 'time',
    'time with time zone': 'timetz',
    'double precision': 'double',
  };

  function sanitizeType(rawType) {
    if (!rawType) return 'unknown';
    const base = rawType.replace(/\(.*\)$/, '').trim().toLowerCase();
    if (TYPE_ALIASES[base]) return TYPE_ALIASES[base];
    return base.replace(/\s+/g, '_');
  }

  function sanitizeIdentifier(name) {
    return String(name).replace(/[^A-Za-z0-9_]/g, '_');
  }

  const tableNames = tablesRes.rows.map(t => sanitizeIdentifier(t.table_name)).sort();
  const tableNameSet = new Set(tableNames);

  const pkSet = new Set(
    pksRes.rows.map(pk => `${sanitizeIdentifier(pk.table_name)}.${sanitizeIdentifier(pk.column_name)}`)
  );
  const fkSet = new Set(
    fksRes.rows.map(fk => `${sanitizeIdentifier(fk.source_table)}.${sanitizeIdentifier(fk.source_column)}`)
  );

  const columnsByTable = new Map(tableNames.map(name => [name, []]));
  for (const col of columnsRes.rows) {
    const table = sanitizeIdentifier(col.table_name);
    if (!columnsByTable.has(table)) continue;
    columnsByTable.get(table).push(col);
  }

  const fkByColumn = new Map();
  for (const fk of fksRes.rows) {
    const target = sanitizeIdentifier(fk.target_table);
    if (!tableNameSet.has(target)) continue;
    fkByColumn.set(`${sanitizeIdentifier(fk.source_table)}.${sanitizeIdentifier(fk.source_column)}`, {
      table: target,
      column: sanitizeIdentifier(fk.target_column),
    });
  }

  const structuredTables = tableNames.map(table => ({
    name: table,
    columns: (columnsByTable.get(table) || []).map(col => {
      const name = sanitizeIdentifier(col.column_name);
      const key = `${table}.${name}`;
      const ref = fkByColumn.get(key);
      return {
        name,
        type: sanitizeType(col.data_type),
        pk: pkSet.has(key),
        fk: fkSet.has(key),
        ...(ref ? { ref } : {}),
      };
    }),
  }));

  const relationships = [];
  for (const table of structuredTables) {
    for (const col of table.columns) {
      if (!col.ref) continue;
      relationships.push({
        source: table.name,
        sourceColumn: col.name,
        target: col.ref.table,
        targetColumn: col.ref.column,
      });
    }
  }

  return { tables: structuredTables, relationships };
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
