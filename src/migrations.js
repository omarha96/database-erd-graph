/**
 * src/migrations.js
 * ------------------------------------------------------------------
 * Migration history utilities for the ERD viewer.
 * Handles loading migration history from JSON, computing schema diffs,
 * and generating migration history from a live database via CLI.
 * ------------------------------------------------------------------
 */

import { normalizeSchema } from './model.js';
import { buildErDiagram } from './lib/schema.js';
import { poolFor, resolveConnection } from '../lib/connection.js';

/**
 * Migration object structure:
 * {
 *   id: string,           // Migration identifier (e.g., "202401150001_create_users")
 *   name: string,         // Human-readable name
 *   timestamp: number,    // Unix timestamp for ordering
 *   schema: Schema,       // Full schema at this migration point { tables, relationships }
 *   positions?: Record<string, { x: number, y: number }>, // Optional saved table positions
 *   upSql?: string,       // Optional: the UP migration SQL
 *   downSql?: string,     // Optional: the DOWN migration SQL
 *   author?: string,      // Optional: migration author
 *   description?: string  // Optional: migration description
 * }
 */

/**
 * Migration history file structure:
 * {
 *   version: 1,
 *   database: string,     // Database name
 *   generatedAt: number,  // Generation timestamp
 *   connection?: { server, user, ssl }, // Connection info (no password)
 *   migrations: Migration[]
 * }
 */

const MIGRATION_TABLES = [
  { name: 'flyway_schema_history', system: 'flyway', versionCol: 'installed_rank', nameCol: 'description', timestampCol: 'installed_on', checksumCol: 'checksum' },
  { name: 'knex_migrations', system: 'knex', versionCol: 'id', nameCol: 'name', timestampCol: 'migration_time' },
  { name: 'sequelizemeta', system: 'sequelize', versionCol: 'name', nameCol: 'name', timestampCol: null },
  { name: 'schema_migrations', system: 'custom', versionCol: 'version', nameCol: 'name', timestampCol: 'created_at' },
  { name: 'schema_migrations', system: 'custom', versionCol: 'version', nameCol: 'version', timestampCol: null }, // Rails-style
];

/**
 * Load migration history from a JSON file
 * @param {File|string} file - File object or JSON string
 * @returns {Promise<{ version: number, database: string, migrations: Migration[] }>}
 */
export async function loadMigrationsFromJson(file) {
  let json;
  if (typeof file === 'string') {
    json = JSON.parse(file);
  } else if (file instanceof File) {
    json = JSON.parse(await file.text());
  } else if (file && typeof file === 'object') {
    json = file;
  } else {
    throw new Error('Invalid input: expected File, JSON string, or object');
  }

  if (!json.migrations || !Array.isArray(json.migrations)) {
    throw new Error('Invalid migration file: missing "migrations" array');
  }

  // Sort migrations by timestamp (oldest first)
  const sorted = [...json.migrations].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

  return {
    version: json.version || 1,
    database: json.database || 'unknown',
    generatedAt: json.generatedAt || Date.now(),
    connection: json.connection || null,
    migrations: sorted,
  };
}

/**
 * Save migration history to JSON file (trigger download)
 * @param {Object} data - { database, migrations, connection }
 */
export function saveMigrationsToJson(data) {
  const payload = {
    version: 1,
    database: data.database,
    generatedAt: Date.now(),
    connection: data.connection ? { ...data.connection, password: undefined } : undefined,
    migrations: data.migrations,
  };
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `migration-history-${data.database}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Compute schema diff between two schemas
 * @param {Schema} fromSchema - Source schema
 * @param {Schema} toSchema - Target schema
 * @returns {DiffResult}
 */
export function computeSchemaDiff(fromSchema, toSchema) {
  const fromNorm = normalizeSchema(fromSchema);
  const toNorm = normalizeSchema(toSchema);

  const fromTables = new Map(fromNorm.tables.map(t => [t.name, t]));
  const toTables = new Map(toNorm.tables.map(t => [t.name, t]));

  const allTableNames = new Set([...fromTables.keys(), ...toTables.keys()]);

  const tableDiffs = [];
  for (const name of allTableNames) {
    const fromTable = fromTables.get(name);
    const toTable = toTables.get(name);

    if (!fromTable) {
      tableDiffs.push({ type: 'added', table: toTable });
    } else if (!toTable) {
      tableDiffs.push({ type: 'removed', table: fromTable });
    } else {
      const columnDiff = computeColumnDiff(fromTable.columns, toTable.columns);
      if (columnDiff.hasChanges) {
        tableDiffs.push({ type: 'modified', tableName: name, ...columnDiff });
      }
    }
  }

  // Relationships diff
  const fromRels = new Map(fromNorm.relationships.map(r => [`${r.source}.${r.sourceColumn}->${r.target}.${r.targetColumn}`, r]));
  const toRels = new Map(toNorm.relationships.map(r => [`${r.source}.${r.sourceColumn}->${r.target}.${r.targetColumn}`, r]));
  const allRelKeys = new Set([...fromRels.keys(), ...toRels.keys()]);

  const addedRels = [], removedRels = [], modifiedRels = [];
  for (const key of allRelKeys) {
    const from = fromRels.get(key);
    const to = toRels.get(key);
    if (!from) addedRels.push(to);
    else if (!to) removedRels.push(from);
    else if (!relationshipsEqual(from, to)) modifiedRels.push({ from, to });
  }

  return {
    fromSchema: fromNorm,
    toSchema: toNorm,
    tables: tableDiffs,
    relationships: {
      added: addedRels,
      removed: removedRels,
      modified: modifiedRels,
    },
  };
}

function computeColumnDiff(fromCols, toCols) {
  const fromMap = new Map(fromCols.map(c => [c.name, c]));
  const toMap = new Map(toCols.map(c => [c.name, c]));
  const allNames = new Set([...fromMap.keys(), ...toMap.keys()]);

  const added = [], removed = [], modified = [];

  for (const name of allNames) {
    const from = fromMap.get(name);
    const to = toMap.get(name);

    if (!from) {
      added.push(to);
    } else if (!to) {
      removed.push(from);
    } else if (!columnsEqual(from, to)) {
      modified.push({ columnName: name, from, to });
    }
  }

  return {
    added,
    removed,
    modified,
    hasChanges: added.length > 0 || removed.length > 0 || modified.length > 0,
  };
}

function columnsEqual(a, b) {
  return a.type === b.type &&
         a.pk === b.pk &&
         a.fk === b.fk &&
         JSON.stringify(a.ref || null) === JSON.stringify(b.ref || null);
}

function relationshipsEqual(a, b) {
  return a.source === b.source &&
         a.sourceColumn === b.sourceColumn &&
         a.target === b.target &&
         a.targetColumn === b.targetColumn;
}

/**
 * Apply diff result to nodes/edges for visual highlighting
 * @param {Node[]} nodes - React Flow nodes
 * @param {Edge[]} edges - React Flow edges
 * @param {DiffResult} diffResult - Result from computeSchemaDiff
 * @returns { { nodes: Node[], edges: Edge[] } }
 */
export function applyDiffClasses(nodes, edges, diffResult) {
  // Build lookup maps for diff status
  const tableStatus = new Map(); // tableName -> 'added' | 'removed' | 'modified' | null
  const columnStatus = new Map(); // `${tableName}.${columnName}` -> 'added' | 'removed' | 'modified' | null
  const relStatus = new Map(); // edgeId -> 'added' | 'removed' | 'modified' | null

  for (const t of diffResult.tables) {
    if (t.type === 'added') tableStatus.set(t.table.name, 'added');
    else if (t.type === 'removed') tableStatus.set(t.table.name, 'removed');
    else if (t.type === 'modified') {
      tableStatus.set(t.tableName, 'modified');
      for (const c of t.added) columnStatus.set(`${t.tableName}.${c.name}`, 'added');
      for (const c of t.removed) columnStatus.set(`${t.tableName}.${c.name}`, 'removed');
      for (const c of t.modified) columnStatus.set(`${t.tableName}.${c.columnName}`, 'modified');
    }
  }

  for (const r of diffResult.relationships.added) {
    relStatus.set(edgeId(r), 'added');
  }
  for (const r of diffResult.relationships.removed) {
    relStatus.set(edgeId(r), 'removed');
  }
  for (const r of diffResult.relationships.modified) {
    relStatus.set(edgeId(r.from), 'modified');
  }

  const newNodes = nodes.map(node => {
    const status = tableStatus.get(node.id) || null;
    const data = { ...node.data };
    if (status) {
      data.diffStatus = status;
      // Add column-level diff info
      const diffColumns = {};
      for (const [key, colStatus] of columnStatus) {
        if (key.startsWith(node.id + '.')) {
          diffColumns[key.split('.')[1]] = colStatus;
        }
      }
      if (Object.keys(diffColumns).length > 0) {
        data.diffColumns = diffColumns;
      }
    }
    return { ...node, data };
  });

  const newEdges = edges.map(edge => {
    const status = relStatus.get(edge.id) || null;
    if (status) {
      return { ...edge, data: { ...edge.data, diffStatus: status } };
    }
    return edge;
  });

  return { nodes: newNodes, edges: newEdges };
}

function edgeId(r) {
  return `${r.source}.${r.sourceColumn}->${r.target}.${r.targetColumn}`;
}

/**
 * Detect migration table in database
 * @param {Pool|Client} db - pg Pool or Client
 * @returns {Promise<{ table: string, system: string }|null>}
 */
export async function detectMigrationTable(db) {
  for (const mt of MIGRATION_TABLES) {
    try {
      const res = await db.query(`SELECT 1 FROM ${mt.name} LIMIT 1`);
      if (res.rowCount !== null) {
        return { table: mt.name, system: mt.system };
      }
    } catch {
      // Table doesn't exist, try next
    }
  }
  return null;
}

/**
 * Read migrations from detected migration table
 * @param {Pool|Client} db - pg Pool or Client
 * @param {Object} detected - { table, system } from detectMigrationTable
 * @returns {Promise<Migration[]>}
 */
export async function readMigrationsFromTable(db, detected) {
  const mt = MIGRATION_TABLES.find(m => m.name === detected.table && m.system === detected.system);
  if (!mt) throw new Error(`Unknown migration table: ${detected.table}`);

  let query;
  if (mt.system === 'flyway') {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name, ${mt.timestampCol} as timestamp, ${mt.checksumCol} as checksum FROM ${mt.name} ORDER BY ${mt.versionCol}`;
  } else if (mt.system === 'knex') {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name, ${mt.timestampCol} as timestamp FROM ${mt.name} ORDER BY ${mt.versionCol}`;
  } else if (mt.system === 'sequelize') {
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name FROM ${mt.name} ORDER BY ${mt.versionCol}`;
  } else {
    // Custom - try common columns
    query = `SELECT ${mt.versionCol} as version, ${mt.nameCol} as name, ${mt.timestampCol || 'now()'} as timestamp FROM ${mt.name} ORDER BY ${mt.versionCol}`;
  }

  const res = await db.query(query);
  return res.rows.map((row, i) => ({
    id: String(row.version || row.name || `migration-${i}`),
    name: row.name || String(row.version),
    timestamp: row.timestamp ? new Date(row.timestamp).getTime() : Date.now() - (res.rows.length - i) * 86400000,
    system: mt.system,
    checksum: row.checksum || null,
  }));
}

/**
 * Generate migration history by applying migrations to a temporary database
 * This is the core function for the CLI script
 * @param {Object} options
 * @param {Object} options.connection - { server, user, password, ssl, database }
 * @param {string} options.migrationTable - Specific migration table name (optional, auto-detect if not provided)
 * @param {string} options.migrationDir - Directory with migration SQL files (optional)
 * @returns {Promise<{ database: string, migrations: Migration[] }>}
 */
export async function generateMigrationHistory(options) {
  const { connection, migrationTable, migrationDir } = options;

  // This function is designed to run in Node.js (CLI script)
  // It will:
  // 1. Create a temporary database
  // 2. Detect or use provided migration table
  // 3. Read migration list
  // 4. For each migration: apply UP SQL, introspect schema, save snapshot
  // 5. Clean up temp database
  // 6. Return migration history with full schemas

  throw new Error('generateMigrationHistory must be run in Node.js environment (see cli/generate-migrations.js)');
}

export default {
  loadMigrationsFromJson,
  saveMigrationsToJson,
  computeSchemaDiff,
  applyDiffClasses,
  detectMigrationTable,
  readMigrationsFromTable,
  generateMigrationHistory,
  MIGRATION_TABLES,
};
