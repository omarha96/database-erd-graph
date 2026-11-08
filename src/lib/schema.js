/**
 * src/lib/schema.js
 * ------------------------------------------------------------------
 * Client-safe schema utilities (pure functions, no Node.js deps).
 * Used by migrations.js for diff computation in the browser.
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
 * Builds ER diagram and structured schema from raw Postgres introspection data.
 * Pure function - no side effects, no Node.js deps.
 * @param {Array<{table_name: string}>} tables
 * @param {Array<{table_name: string, column_name: string, data_type: string, ordinal_position: number}>} columns
 * @param {Array<{table_name: string, column_name: string}>} primaryKeys
 * @param {Array<{source_table: string, source_column: string, target_table: string, target_column: string}>} foreignKeys
 * @returns {{ diagram: string, fkTargets: Object<string,string>, tables: Array, relationships: Array, tableCount: number, relationshipCount: number }}
 */
export function buildErDiagram(tables, columns, primaryKeys, foreignKeys) {
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

  // Structured form of the same schema, consumed by the React Flow
  // viewer. Unlike fkTargets this keeps per-column FK targets, so two
  // tables can each have e.g. an `owner_id` pointing at different tables.
  const fkByColumn = new Map();
  for (const fk of foreignKeys) {
    const target = sanitizeIdentifier(fk.target_table);
    if (!tableNameSet.has(target)) continue;
    fkByColumn.set(`${sanitizeIdentifier(fk.source_table)}.${sanitizeIdentifier(fk.source_column)}`, {
      table: target,
      column: sanitizeIdentifier(fk.target_column),
    });
  }
  const structuredTables = tableNames.map((table) => ({
    name: table,
    columns: (columnsByTable.get(table) || []).map((col) => {
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

  return {
    diagram: lines.join('\n'),
    fkTargets,
    tables: structuredTables,
    relationships,
    tableCount: tableNames.length,
    relationshipCount: seenRelationships.size,
  };
}

export { sanitizeIdentifier, sanitizeType };
