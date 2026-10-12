/**
 * Schema model helpers. A schema is:
 *
 *   { tables: [{ name, columns: [{ name, type, pk, fk, ref?: { table, column } }] }],
 *     relationships: [{ source, sourceColumn, target, targetColumn }] }
 *
 * `source` is the referencing (many) side, `target` the referenced (one) side.
 */

/* ---------- Table geometry ----------
   Rows have a fixed height so edges can anchor to a specific column
   without measuring the DOM, and widths are estimated from text length
   so ELK can lay out tables before they are ever rendered. */
export const HEADER_HEIGHT = 36;
export const ROW_HEIGHT = 26;
const CHAR_WIDTH = 7.4;

export function tableSize(table) {
  const longestRow = Math.max(
    0,
    ...table.columns.map((c) => c.name.length + c.type.length + (c.pk || c.fk ? 6 : 0)),
  );
  const width = Math.max(180, Math.ceil(Math.max(table.name.length * 8.2, longestRow * CHAR_WIDTH + 24) + 32));
  const height = HEADER_HEIGHT + Math.max(1, table.columns.length) * ROW_HEIGHT + 2;
  return { width, height };
}

export function rowCenterY(index) {
  return HEADER_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/* Fills in `relationships` from per-column refs when absent, and drops
   any relationship pointing at a table that doesn't exist. */
export function normalizeSchema(schema) {
  const tables = schema.tables.map((t) => ({ name: t.name, columns: t.columns.map((c) => ({ ...c })) }));
  const names = new Set(tables.map((t) => t.name));
  let relationships = schema.relationships;
  if (!relationships) {
    relationships = [];
    for (const t of tables) {
      for (const c of t.columns) {
        if (c.ref) relationships.push({ source: t.name, sourceColumn: c.name, target: c.ref.table, targetColumn: c.ref.column });
      }
    }
  }
  relationships = relationships.filter((r) => names.has(r.source) && names.has(r.target));
  return { tables, relationships };
}

/* Legacy import: the previous Mermaid-based viewer exported
   { diagram: "erDiagram ...", fkTargets: { column: table } }. */
export function parseMermaidSchema(definition, fkTargets = {}) {
  const tables = [];
  const tableBlockRe = /^\s*([A-Za-z0-9_]+)\s*\{([\s\S]*?)\n\s*\}/gm;
  const columnRe = /^\s*(\S+)\s+(\S+)(?:\s+(PK,FK|FK,PK|PK|FK))?\s*$/;
  let m;
  while ((m = tableBlockRe.exec(definition))) {
    const columns = [];
    for (const line of m[2].split('\n')) {
      const cm = columnRe.exec(line);
      if (!cm) continue;
      const key = cm[3] || '';
      columns.push({ name: cm[2], type: cm[1], pk: key.includes('PK'), fk: key.includes('FK') });
    }
    tables.push({ name: m[1], columns });
  }
  const names = new Set(tables.map((t) => t.name));
  for (const t of tables) {
    for (const c of t.columns) {
      const target = fkTargets[c.name];
      if (c.fk && target && names.has(target)) c.ref = { table: target, column: 'id' };
    }
  }
  return normalizeSchema({ tables });
}

/* ---------- Grouping by connectivity ----------
   Tables with no relationship at all go into one "Unconnected" group;
   connected components are split into tightly-connected clusters with
   greedy modularity maximization (Clauset–Newman–Moore). Deterministic
   because nodes arrive in sorted order and ties keep the first pair. */
function greedyModularityCommunities(comp, adj) {
  if (comp.length <= 2) return [comp.slice()];
  const degree = new Map(comp.map((n) => [n, [...adj.get(n).values()].reduce((s, w) => s + w, 0)]));
  const m2 = comp.reduce((s, n) => s + degree.get(n), 0);
  if (m2 === 0) return comp.map((n) => [n]);

  const members = new Map(comp.map((n) => [n, new Set([n])]));
  const commDegree = new Map(comp.map((n) => [n, degree.get(n)]));
  const edgesBetween = (cA, cB) => {
    const A = members.get(cA), B = members.get(cB);
    const [small, big] = A.size < B.size ? [A, B] : [B, A];
    let w = 0;
    for (const n of small) for (const [nb, wt] of adj.get(n)) if (big.has(nb)) w += wt;
    return w;
  };

  for (;;) {
    const comms = [...members.keys()];
    let best = null;
    for (let i = 0; i < comms.length; i++) {
      for (let j = i + 1; j < comms.length; j++) {
        const eAB = edgesBetween(comms[i], comms[j]);
        if (eAB === 0) continue;
        const dQ = (2 * eAB) / m2 - (2 * commDegree.get(comms[i]) * commDegree.get(comms[j])) / (m2 * m2);
        if (!best || dQ > best.dQ) best = { cA: comms[i], cB: comms[j], dQ };
      }
    }
    if (!best || best.dQ <= 1e-12) break;
    for (const n of members.get(best.cB)) members.get(best.cA).add(n);
    commDegree.set(best.cA, commDegree.get(best.cA) + commDegree.get(best.cB));
    members.delete(best.cB);
    commDegree.delete(best.cB);
  }
  return [...members.values()].map((s) => [...s]);
}

export function computeGroups(schema) {
  const names = schema.tables.map((t) => t.name).sort();
  const adj = new Map(names.map((n) => [n, new Map()]));
  for (const r of schema.relationships) {
    if (r.source === r.target) continue;
    adj.get(r.source).set(r.target, (adj.get(r.source).get(r.target) || 0) + 1);
    adj.get(r.target).set(r.source, (adj.get(r.target).get(r.source) || 0) + 1);
  }

  const parent = new Map(names.map((n) => [n, n]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const [n, nbs] of adj) for (const nb of nbs.keys()) { const a = find(n), b = find(nb); if (a !== b) parent.set(a, b); }

  const byRoot = new Map();
  for (const n of names) {
    const root = find(n);
    if (!byRoot.has(root)) byRoot.set(root, []);
    byRoot.get(root).push(n);
  }

  const unconnected = [];
  const clusters = [];
  for (const component of byRoot.values()) {
    if (component.length === 1 && adj.get(component[0]).size === 0) unconnected.push(component[0]);
    else for (const sub of greedyModularityCommunities(component, adj)) clusters.push(sub.sort());
  }
  clusters.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));

  const groups = clusters.map((tables, i) => ({ id: `g${i}`, tables, kind: 'cluster' }));
  if (unconnected.length) groups.push({ id: 'unconnected', tables: unconnected.sort(), kind: 'unconnected' });
  return groups;
}

/* ---------- MySQL DDL export ---------- */
const SQL_TYPE_MAP = {
  uuid: 'CHAR(36)', timestamp: 'DATETIME', timestamptz: 'DATETIME',
  date: 'DATE', int: 'INT', integer: 'INT', bigint: 'BIGINT',
  smallint: 'SMALLINT', numeric: 'DECIMAL(12,2)', decimal: 'DECIMAL(12,2)',
  float: 'DOUBLE', double: 'DOUBLE', boolean: 'TINYINT(1)', bool: 'TINYINT(1)',
  text: 'TEXT', json: 'JSON', jsonb: 'JSON', string: 'VARCHAR(255)',
  varchar: 'VARCHAR(255)', char: 'CHAR(1)',
};
const sqlType = (t) => SQL_TYPE_MAP[t.toLowerCase()] || 'VARCHAR(255)';
const sqlIdent = (name) => `\`${name.replace(/`/g, '``')}\``;

export function toMysqlDDL(schema) {
  const statements = [];
  for (const t of schema.tables) {
    const lines = t.columns.map((c) => `  ${sqlIdent(c.name)} ${sqlType(c.type)}${c.pk ? ' NOT NULL' : ''}`);
    const pk = t.columns.filter((c) => c.pk).map((c) => sqlIdent(c.name));
    if (pk.length) lines.push(`  PRIMARY KEY (${pk.join(', ')})`);
    statements.push(`CREATE TABLE ${sqlIdent(t.name)} (\n${lines.join(',\n')}\n) ENGINE=InnoDB;`);
  }
  for (const r of schema.relationships) {
    statements.push(
      `ALTER TABLE ${sqlIdent(r.source)} ADD CONSTRAINT ${sqlIdent(`fk_${r.source}_${r.sourceColumn}`)} `
      + `FOREIGN KEY (${sqlIdent(r.sourceColumn)}) REFERENCES ${sqlIdent(r.target)} (${sqlIdent(r.targetColumn)});`,
    );
  }
  return statements.join('\n\n') + '\n';
}

export const edgeId = (r) => `${r.source}.${r.sourceColumn}->${r.target}.${r.targetColumn}`;
