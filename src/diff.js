/**
 * src/diff.js
 * ------------------------------------------------------------------
 * Schema diff computation and React Flow node/edge diff class application.
 * Separated from migrations.js for single responsibility.
 * ------------------------------------------------------------------
 */

import { normalizeSchema } from './model.js';

/**
 * Compute detailed schema diff between two normalized schemas
 * @param {Schema} fromSchema - Source schema (older)
 * @param {Schema} toSchema - Target schema (newer)
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
  const fromRels = new Map(fromNorm.relationships.map(r => [edgeId(r), r]));
  const toRels = new Map(toNorm.relationships.map(r => [edgeId(r), r]));
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
    summary: {
      tablesAdded: tableDiffs.filter(t => t.type === 'added').length,
      tablesRemoved: tableDiffs.filter(t => t.type === 'removed').length,
      tablesModified: tableDiffs.filter(t => t.type === 'modified').length,
      relationshipsAdded: addedRels.length,
      relationshipsRemoved: removedRels.length,
      relationshipsModified: modifiedRels.length,
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

function edgeId(r) {
  return `${r.source}.${r.sourceColumn}->${r.target}.${r.targetColumn}`;
}

/**
 * Build lookup maps for diff status from a DiffResult
 * @param {DiffResult} diffResult
 * @returns {DiffLookups}
 */
export function buildDiffLookups(diffResult) {
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

  return { tableStatus, columnStatus, relStatus };
}

/**
 * Apply diff classes to React Flow nodes and edges
 * @param {Node[]} nodes - React Flow nodes
 * @param {Edge[]} edges - React Flow edges
 * @param {DiffLookups} lookups - Result from buildDiffLookups
 * @returns { { nodes: Node[], edges: Edge[] } }
 */
export function applyDiffClasses(nodes, edges, lookups) {
  const { tableStatus, columnStatus, relStatus } = lookups;

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

/**
 * Union of both schemas so removed tables/columns/relations stay visible (in red)
 * on the canvas: the "to" schema plus everything the diff marks as removed.
 * @param {DiffResult} diffResult
 * @returns {Schema}
 */
export function mergeForDiff(diffResult) {
  const removedCols = new Map(diffResult.tables.filter(t => t.type === 'modified').map(t => [t.tableName, t.removed]));
  const tables = diffResult.toSchema.tables.map(t => ({ ...t, columns: [...t.columns, ...(removedCols.get(t.name) || [])] }));
  for (const t of diffResult.tables) if (t.type === 'removed') tables.push(t.table);
  return { tables, relationships: [...diffResult.toSchema.relationships, ...diffResult.relationships.removed] };
}

/**
 * Generate unified diff text output (Git-style)
 * @param {DiffResult} diffResult
 * @returns {string}
 */
export function generateUnifiedDiff(diffResult) {
  const lines = [];
  
  lines.push(`# Schema Diff: ${diffResult.fromSchema.tables.length} -> ${diffResult.toSchema.tables.length} tables`);
  lines.push(`# Tables: +${diffResult.summary.tablesAdded} -${diffResult.summary.tablesRemoved} ~${diffResult.summary.tablesModified}`);
  lines.push(`# Relationships: +${diffResult.summary.relationshipsAdded} -${diffResult.summary.relationshipsRemoved} ~${diffResult.summary.relationshipsModified}`);
  lines.push('');

  // Table diffs
  for (const t of diffResult.tables) {
    if (t.type === 'added') {
      lines.push(`+ Table ${t.table.name} (added)`);
      for (const col of t.table.columns) {
        lines.push(`+   ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`);
      }
      lines.push('');
    } else if (t.type === 'removed') {
      lines.push(`- Table ${t.table.name} (removed)`);
      for (const col of t.table.columns) {
        lines.push(`-   ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`);
      }
      lines.push('');
    } else if (t.type === 'modified') {
      lines.push(`~ Table ${t.tableName} (modified)`);
      for (const col of t.added) {
        lines.push(`+   ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`);
      }
      for (const col of t.removed) {
        lines.push(`-   ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`);
      }
      for (const col of t.modified) {
        lines.push(`~   ${col.columnName}: ${col.from.type} -> ${col.to.type}${col.from.pk !== col.to.pk ? ` PK:${col.from.pk}->${col.to.pk}` : ''}${col.from.fk !== col.to.fk ? ` FK:${col.from.fk}->${col.to.fk}` : ''}`);
      }
      lines.push('');
    }
  }

  // Relationship diffs
  if (diffResult.relationships.added.length > 0) {
    lines.push('# Relationships added:');
    for (const r of diffResult.relationships.added) {
      lines.push(`+ ${r.source}.${r.sourceColumn} -> ${r.target}.${r.targetColumn}`);
    }
    lines.push('');
  }
  if (diffResult.relationships.removed.length > 0) {
    lines.push('# Relationships removed:');
    for (const r of diffResult.relationships.removed) {
      lines.push(`- ${r.source}.${r.sourceColumn} -> ${r.target}.${r.targetColumn}`);
    }
    lines.push('');
  }
  if (diffResult.relationships.modified.length > 0) {
    lines.push('# Relationships modified:');
    for (const r of diffResult.relationships.modified) {
      lines.push(`~ ${r.from.source}.${r.from.sourceColumn} -> ${r.from.target}.${r.from.targetColumn}`);
      lines.push(`    to ${r.to.source}.${r.to.sourceColumn} -> ${r.to.target}.${r.to.targetColumn}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get diff summary for UI display
 * @param {DiffResult} diffResult
 * @returns {DiffSummary}
 */
export function getDiffSummary(diffResult) {
  return {
    ...diffResult.summary,
    hasChanges: diffResult.summary.tablesAdded > 0 ||
                diffResult.summary.tablesRemoved > 0 ||
                diffResult.summary.tablesModified > 0 ||
                diffResult.summary.relationshipsAdded > 0 ||
                diffResult.summary.relationshipsRemoved > 0 ||
                diffResult.summary.relationshipsModified > 0,
  };
}

export default {
  computeSchemaDiff,
  buildDiffLookups,
  applyDiffClasses,
  generateUnifiedDiff,
  getDiffSummary,
};
