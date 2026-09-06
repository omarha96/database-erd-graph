/**
 * lib/schema.js
 * ------------------------------------------------------------------
 * Turns Postgres information_schema rows into the same shape as
 * public/data.js: a Mermaid `erDiagram` definition string plus an
 * `fkTargets` map ({ columnName: targetTableName }).
 *
 * Split into:
 *   - queries that hit a live Postgres instance (fetchSchema)
 *   - a pure builder (buildErDiagram) that only deals with plain JS
 *     objects, so it can be unit tested without a database.
 * ------------------------------------------------------------------
 */

// Postgres type names can contain spaces ("character varying(255)",
// "timestamp without time zone"), which Mermaid's erDiagram grammar
// can't parse as a single attribute type. Collapse the common ones to
// single-word aliases; anything else just has its spaces stripped.
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
  // Strip any parenthesized precision/length, e.g. "numeric(10,2)" -> "numeric".
  const base = rawType.replace(/\(.*\)$/, '').trim().toLowerCase();
  if (TYPE_ALIASES[base]) return TYPE_ALIASES[base];
  return base.replace(/\s+/g, '_');
}

// Mermaid attribute names/types are whitespace-delimited tokens, so
// anything that isn't [A-Za-z0-9_] would break the grammar. Real
// Postgres identifiers are only quoted-then-weird in edge cases; this
// keeps the diagram from silently failing to render on those.
function sanitizeIdentifier(name) {
  return String(name).replace(/[^A-Za-z0-9_]/g, '_');
}

/**
 * @param {Array<{table_name: string}>} tables
 * @param {Array<{table_name: string, column_name: string, data_type: string, ordinal_position: number}>} columns
 * @param {Array<{table_name: string, column_name: string}>} primaryKeys
 * @param {Array<{source_table: string, source_column: string, target_table: string, target_column: string}>} foreignKeys
 * @returns {{ diagram: string, fkTargets: Object<string,string>, tableCount: number, relationshipCount: number }}
 */
function buildErDiagram(tables, columns, primaryKeys, foreignKeys) {
  const tableNames = tables.map((t) => sanitizeIdentifier(t.table_name)).sort();
  const tableNameSet = new Set(tableNames);

  const pkSet = new Set(
    primaryKeys.map((pk) => `${sanitizeIdentifier(pk.table_name)}.${sanitizeIdentifier(pk.column_name)}`)
  );
  const fkSet = new Set(
    foreignKeys.map((fk) => `${sanitizeIdentifier(fk.source_table)}.${sanitizeIdentifier(fk.source_column)}`)
  );

  const columnsByTable = new Map(tableNames.map((name) => [name, []]));
  for (const col of columns) {
    const table = sanitizeIdentifier(col.table_name);
    if (!columnsByTable.has(table)) continue; // skip columns for tables we didn't include (views, etc.)
    columnsByTable.get(table).push(col);
  }

  const lines = ['erDiagram'];

  // Relationships first (Mermaid convention: one-side ||--o{ many-side : label).
  // Only emit a relationship when both tables are present in this schema dump,
  // and de-dupe in case a composite FK produces the same table pair twice.
  const seenRelationships = new Set();
  for (const fk of foreignKeys) {
    const source = sanitizeIdentifier(fk.source_table);
    const target = sanitizeIdentifier(fk.target_table);
    if (!tableNameSet.has(source) || !tableNameSet.has(target)) continue;
    const key = `${target}->${source}:${fk.source_column}`;
    if (seenRelationships.has(key)) continue;
    seenRelationships.add(key);
    lines.push(`    ${target} ||--o{ ${source} : "${sanitizeIdentifier(fk.source_column)}"`);
  }

  lines.push('');

  // Then one attribute block per table.
  for (const table of tableNames) {
    const cols = columnsByTable.get(table) || [];
    lines.push(`    ${table} {`);
    for (const col of cols.sort((a, b) => a.ordinal_position - b.ordinal_position)) {
      const colName = sanitizeIdentifier(col.column_name);
      const type = sanitizeType(col.data_type);
      const key = `${table}.${colName}`;
      const isPK = pkSet.has(key);
      const isFK = fkSet.has(key);
      const suffix = isPK && isFK ? ' PK,FK' : isPK ? ' PK' : isFK ? ' FK' : '';
      lines.push(`        ${type} ${colName}${suffix}`);
    }
    lines.push('    }');
  }

  // fkTargets: { columnName: targetTableName }, matching data.js's shape.
  // Later foreign keys win on a name collision, same simplistic
  // last-write-wins behavior as the hand-written data.js map.
  const fkTargets = {};
  for (const fk of foreignKeys) {
    const target = sanitizeIdentifier(fk.target_table);
    if (tableNameSet.has(target)) {
      fkTargets[sanitizeIdentifier(fk.source_column)] = target;
    }
  }

  return {
    diagram: lines.join('\n'),
    fkTargets,
    tableCount: tableNames.length,
    relationshipCount: seenRelationships.size,
  };
}

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

/**
 * Runs the introspection queries against a live Postgres connection
 * (anything with a .query(text, params) method — a Pool or a Client
 * both work) and returns the same shape as buildErDiagram().
 *
 * @param {import('pg').Pool | import('pg').Client} db
 * @param {string} schemaName
 */
async function fetchSchema(db, schemaName = 'public') {
  const [tablesRes, columnsRes, pksRes, fksRes] = await Promise.all([
    db.query(TABLES_QUERY, [schemaName]),
    db.query(COLUMNS_QUERY, [schemaName]),
    db.query(PRIMARY_KEYS_QUERY, [schemaName]),
    db.query(FOREIGN_KEYS_QUERY, [schemaName]),
  ]);

  if (tablesRes.rows.length === 0) {
    throw new Error(`No tables found in schema "${schemaName}". Check PGSCHEMA and that the database has tables.`);
  }

  return buildErDiagram(tablesRes.rows, columnsRes.rows, pksRes.rows, fksRes.rows);
}

module.exports = { buildErDiagram, fetchSchema, sanitizeIdentifier, sanitizeType };
