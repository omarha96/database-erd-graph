import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { edgeId, rowCenterY, tableSize } from './model.js';

// ELK runs in a Web Worker so laying out large schemas never blocks the UI.
const elk = new ELK({ workerFactory: () => new Worker(elkWorkerUrl) });

/* Each FK becomes an edge between two fixed ports: the referenced column
   on the parent's right side and the referencing column on the child's
   left side. With ports pinned to rows, ELK routes every line
   orthogonally in its own channel between layers, so lines don't run on
   top of each other or through tables. */
// Gaps in canvas px at spacing 1; the sparseness control scales them.
const SPACINGS = {
  'elk.layered.spacing.nodeNodeBetweenLayers': 90,
  'elk.layered.spacing.edgeNodeBetweenLayers': 24,
  'elk.layered.spacing.edgeEdgeBetweenLayers': 14,
  'elk.spacing.edgeEdge': 14,
  'elk.spacing.edgeNode': 24,
  'elk.spacing.nodeNode': 50,
  'elk.spacing.componentComponent': 80,
};

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
  'elk.layered.unnecessaryBendpoints': 'true',
  'elk.separateConnectedComponents': 'true',
};

const portId = (table, column, side) => `${table}\u0000${column}\u0000${side}`;

/**
 * `spacing` multiplies every gap (1 = default).
 * Returns {
 *   positions: { [table]: { x, y } },
 *   routes: { [edgeId]: { points: [{x,y}...], source: {x,y}, target: {x,y} } },
 * }
 * Route points run from the referencing (child) table to the referenced
 * one, matching RelationEdge's direction; `source`/`target` record the
 * table positions the route was computed for, so a route can be dropped
 * once either table is dragged.
 */
export async function layoutTables(tables, relationships, spacing = 1) {
  const byName = new Map(tables.map((t) => [t.name, t]));
  const rels = relationships.filter((r) => byName.has(r.source) && byName.has(r.target) && r.source !== r.target);

  const ports = new Map(tables.map((t) => [t.name, new Map()]));
  const addPort = (table, column, side) => {
    const id = portId(table, column, side);
    if (ports.get(table).has(id)) return id;
    const t = byName.get(table);
    const row = Math.max(0, t.columns.findIndex((c) => c.name === column));
    const { width } = tableSize(t);
    ports.get(table).set(id, {
      id,
      width: 0,
      height: 0,
      x: side === 'EAST' ? width : 0,
      y: rowCenterY(row),
      layoutOptions: { 'elk.port.side': side },
    });
    return id;
  };

  const edges = rels.map((r) => ({
    id: edgeId(r),
    sources: [addPort(r.target, r.targetColumn, 'EAST')],
    targets: [addPort(r.source, r.sourceColumn, 'WEST')],
  }));

  const graph = {
    id: 'root',
    layoutOptions: {
      ...LAYOUT_OPTIONS,
      ...Object.fromEntries(Object.entries(SPACINGS).map(([k, v]) => [k, String(Math.round(v * spacing))])),
    },
    children: tables.map((t) => ({
      id: t.name,
      ...tableSize(t),
      ports: [...ports.get(t.name).values()],
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
    })),
    edges,
  };

  const result = await elk.layout(graph);
  const positions = Object.fromEntries(result.children.map((n) => [n.id, { x: n.x, y: n.y }]));
  const routes = {};
  const relById = new Map(rels.map((r) => [edgeId(r), r]));
  for (const e of result.edges || []) {
    const s = e.sections?.[0];
    if (!s) continue;
    const r = relById.get(e.id);
    // ELK runs parent -> child; RelationEdge draws child -> parent.
    const points = [s.startPoint, ...(s.bendPoints || []), s.endPoint].reverse();
    routes[e.id] = { points, source: positions[r.source], target: positions[r.target] };
  }
  return { positions, routes };
}
