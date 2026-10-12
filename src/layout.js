import ELK from 'elkjs/lib/elk-api.js';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { tableSize } from './model.js';

// ELK runs in a Web Worker so laying out large schemas never blocks the UI.
const elk = new ELK({ workerFactory: () => new Worker(elkWorkerUrl) });

const LAYOUT_OPTIONS = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110',
  'elk.spacing.nodeNode': '50',
  'elk.spacing.componentComponent': '80',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.separateConnectedComponents': 'true',
};

/**
 * Returns { [tableName]: { x, y } } for the given tables. Edges point
 * from the referenced table to the referencing one so parent tables end
 * up on the left, like the old Mermaid layout.
 */
export async function layoutTables(tables, relationships) {
  const names = new Set(tables.map((t) => t.name));
  const graph = {
    id: 'root',
    layoutOptions: LAYOUT_OPTIONS,
    children: tables.map((t) => ({ id: t.name, ...tableSize(t) })),
    edges: relationships
      .filter((r) => names.has(r.source) && names.has(r.target) && r.source !== r.target)
      .map((r, i) => ({ id: `e${i}`, sources: [r.target], targets: [r.source] })),
  };
  const result = await elk.layout(graph);
  return Object.fromEntries(result.children.map((n) => [n.id, { x: n.x, y: n.y }]));
}
