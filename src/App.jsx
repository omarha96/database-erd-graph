import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, MiniMap, ReactFlow,
  useNodesState, useReactFlow, useStore,
} from '@xyflow/react';
import TableNode from './TableNode.jsx';
import RelationEdge from './RelationEdge.jsx';
import EdgeMarkers from './EdgeMarkers.jsx';
import HoverLabel from './HoverLabel.jsx';
import Toolbar from './Toolbar.jsx';
import { GroupMenu, ReferencesMenu } from './Menus.jsx';
import { ErdActions } from './ErdActions.js';
import { flashTable, setHoveredTable } from './highlightStore.js';
import { layoutTables } from './layout.js';
import { computeGroups, normalizeSchema, parseMermaidSchema, tableSize, toMysqlDDL } from './model.js';
import { sampleSchema } from './sampleSchema.js';

const nodeTypes = { table: TableNode };
const edgeTypes = { relation: RelationEdge };
const SAMPLE_SOURCE = { kind: 'sample', name: 'sample' };
// Past this many tables, skip rendering nodes/edges outside the viewport.
const VIRTUALIZE_THRESHOLD = 120;

/* ---------- Saved table positions (per data source, in localStorage) ---------- */
const positionsKey = (source) => `erd-positions:${source.kind}:${source.name}`;
function readPositions(source) {
  try { return JSON.parse(localStorage.getItem(positionsKey(source))) || {}; } catch { return {}; }
}
function writePositions(source, nodes) {
  try {
    const positions = Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
    localStorage.setItem(positionsKey(source), JSON.stringify(positions));
  } catch { /* storage full or blocked: positions just won't persist */ }
}
function clearPositions(source) {
  try { localStorage.removeItem(positionsKey(source)); } catch { /* ignore */ }
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function setDbQueryParam(name) {
  const url = new URL(window.location.href);
  if (name) url.searchParams.set('db', name); else url.searchParams.delete('db');
  window.history.replaceState(null, '', url);
}

function buildEdges(schema) {
  const rowIndex = new Map(schema.tables.map((t) => [t.name, new Map(t.columns.map((c, i) => [c.name, i]))]));
  return schema.relationships.map((r) => ({
    id: `${r.source}.${r.sourceColumn}->${r.target}.${r.targetColumn}`,
    type: 'relation',
    source: r.source,
    target: r.target,
    selectable: false,
    data: {
      sourceRow: rowIndex.get(r.source).get(r.sourceColumn) ?? 0,
      targetRow: rowIndex.get(r.target).get(r.targetColumn) ?? 0,
      label: r.sourceColumn,
    },
  }));
}

export default function App() {
  const { fitView, setCenter, getInternalNode, getNodes, getViewport, setViewport } = useReactFlow();
  const [mode, setMode] = useState(() => document.documentElement.dataset.mode || 'light');
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [schema, setSchema] = useState(() => normalizeSchema(sampleSchema));
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [loading, setLoading] = useState(null); // message while a schema loads
  const [databases, setDatabases] = useState([]);
  const [hiddenGroups, setHiddenGroups] = useState(() => new Set());
  const [groupMenuAnchor, setGroupMenuAnchor] = useState(null);
  const [refsMenu, setRefsMenu] = useState(null); // { anchor, table, column }
  const sourceRef = useRef(source);
  sourceRef.current = source;

  const edges = useMemo(() => buildEdges(schema), [schema]);
  const groups = useMemo(() => computeGroups(schema), [schema]);
  const tableStats = useMemo(() => {
    const stats = new Map(schema.tables.map((t) => [t.name, { columns: t.columns.length, relations: 0 }]));
    for (const r of schema.relationships) {
      stats.get(r.source).relations++;
      if (r.target !== r.source) stats.get(r.target).relations++;
    }
    return stats;
  }, [schema]);
  const hiddenTables = useMemo(
    () => new Set(groups.filter((g) => hiddenGroups.has(g.id)).flatMap((g) => g.tables)),
    [groups, hiddenGroups],
  );

  /* ---------- Loading a schema onto the canvas ---------- */
  const showSchema = useCallback(async (nextSchema, nextSource, presetPositions) => {
    const normalized = normalizeSchema(nextSchema);
    const saved = presetPositions || readPositions(nextSource);
    const missing = normalized.tables.some((t) => !saved[t.name]);
    const auto = missing ? await layoutTables(normalized.tables, normalized.relationships) : {};

    const referenced = new Map(normalized.tables.map((t) => [t.name, new Set()]));
    for (const r of normalized.relationships) referenced.get(r.target).add(r.targetColumn);

    setSchema(normalized);
    setSource(nextSource);
    setHiddenGroups(new Set());
    setRefsMenu(null);
    setHoveredTable(null);
    setNodes(normalized.tables.map((t) => {
      const { width, height } = tableSize(t);
      return {
        id: t.name,
        type: 'table',
        position: saved[t.name] || auto[t.name] || { x: 0, y: 0 },
        width,
        height,
        data: { table: t, width, referencedColumns: referenced.get(t.name) },
      };
    }));
    if (presetPositions) writePositions(nextSource, Object.entries(presetPositions).map(([id, position]) => ({ id, position })));
    requestAnimationFrame(() => fitView({ padding: 0.12, maxZoom: 1.5 }));
  }, [fitView, setNodes]);

  const relayout = useCallback(async () => {
    const visible = schema.tables.filter((t) => !hiddenTables.has(t.name));
    const positions = await layoutTables(visible, schema.relationships);
    clearPositions(source);
    setNodes((ns) => ns.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)));
    requestAnimationFrame(() => fitView({ padding: 0.12, maxZoom: 1.5, duration: 400 }));
  }, [schema, hiddenTables, source, setNodes, fitView]);

  const loadDatabase = useCallback(async (name) => {
    setLoading(`Loading schema for "${name}"…`);
    try {
      const res = await fetch(`/api/schema?database=${encodeURIComponent(name)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      await showSchema(body, { kind: 'db', name });
      setDbQueryParam(name);
    } catch (err) {
      alert(`Could not load schema from "${name}":\n${err.message}\n\nCheck .env and that Postgres is running.`);
      setDbQueryParam('');
    } finally {
      setLoading(null);
    }
  }, [showSchema]);

  // Boot: sample schema, then the database list (and ?db= if present).
  useEffect(() => {
    showSchema(sampleSchema, SAMPLE_SOURCE);
    fetch('/api/databases')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || body.error || `HTTP ${res.status}`);
        setDatabases(body.databases);
        const wanted = new URL(window.location.href).searchParams.get('db');
        if (wanted && body.databases.includes(wanted)) loadDatabase(wanted);
      })
      .catch((err) => console.warn('Could not list databases:', err.message));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSelectDatabase = (name) => {
    if (name) loadDatabase(name);
    else { setDbQueryParam(''); showSchema(sampleSchema, SAMPLE_SOURCE); }
  };

  /* ---------- Group filter: hide tables instead of re-rendering ---------- */
  useEffect(() => {
    setNodes((ns) => ns.map((n) => (n.hidden === hiddenTables.has(n.id) ? n : { ...n, hidden: hiddenTables.has(n.id) })));
  }, [hiddenTables, setNodes]);

  const toggleGroup = (id, on) => setHiddenGroups((prev) => {
    const next = new Set(prev);
    if (on) next.delete(id); else next.add(id);
    return next;
  });

  /* ---------- FK navigation & reverse references ---------- */
  const hiddenRef = useRef(hiddenTables);
  hiddenRef.current = hiddenTables;
  const actions = useMemo(() => ({
    goToTable: (table, column) => {
      const node = getInternalNode(table);
      if (!node || hiddenRef.current.has(table)) return;
      const { x, y } = node.internals.positionAbsolute;
      setCenter(x + (node.measured?.width ?? 0) / 2, y + (node.measured?.height ?? 0) / 2,
        { zoom: Math.max(getViewport().zoom, 0.8), duration: 450 });
      flashTable(table, column);
    },
    showReferences: (anchor, table, column) => setRefsMenu({ anchor: anchor.getBoundingClientRect(), table, column }),
  }), [getInternalNode, setCenter, getViewport]);

  const references = useMemo(() => {
    if (!refsMenu) return [];
    return schema.relationships.filter((r) => r.target === refsMenu.table && r.targetColumn === refsMenu.column);
  }, [refsMenu, schema]);

  /* ---------- Theme ---------- */
  const toggleTheme = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.mode = next;
    try { localStorage.setItem('erd-theme', next); } catch { /* ignore */ }
    setMode(next);
  };

  /* ---------- Export / import ---------- */
  const exportJson = () => {
    const positions = Object.fromEntries(nodes.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
    const payload = { version: 2, source: source.name, ...schema, positions };
    download(`erd-${source.name}.json`, JSON.stringify(payload, null, 2), 'application/json');
  };
  const exportSql = () => download(`erd-${source.name}.sql`, toMysqlDDL(schema), 'application/sql');
  const importFile = async (file) => {
    try {
      const payload = JSON.parse(await file.text());
      let imported;
      if (Array.isArray(payload.tables)) imported = payload;
      else if (typeof payload.diagram === 'string') imported = parseMermaidSchema(payload.diagram, payload.fkTargets);
      else throw new Error('File has neither "tables" nor a legacy "diagram" field');
      setDbQueryParam('');
      await showSchema(imported, { kind: 'import', name: payload.source || file.name.replace(/\.json$/, '') }, payload.positions);
    } catch (err) {
      alert(`Could not import diagram:\n${err.message}`);
    }
  };

  /* ---------- Keyboard: 0 fit, +/- zoom, arrows pan ---------- */
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const vp = getViewport();
      const step = 60;
      const pan = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [step, 0], ArrowRight: [-step, 0] }[e.key];
      if (e.key === '0') fitView({ padding: 0.12, maxZoom: 1.5, duration: 400 });
      else if (e.key === '+' || e.key === '=') zoomBy(0.15);
      else if (e.key === '-' || e.key === '_') zoomBy(-0.15);
      else if (pan) setViewport({ x: vp.x + pan[0], y: vp.y + pan[1], zoom: vp.zoom }, { duration: 120 });
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const viewportRef = useRef(null);
  const zoomBy = (delta) => {
    const { x, y, zoom } = getViewport();
    const next = Math.min(3, Math.max(0.05, zoom + delta));
    const rect = viewportRef.current.getBoundingClientRect();
    const cx = rect.width / 2, cy = rect.height / 2;
    setViewport({ x: cx - ((cx - x) * next) / zoom, y: cy - ((cy - y) * next) / zoom, zoom: next }, { duration: 150 });
  };
  const zoom = useStore((s) => s.transform[2]);

  /* ---------- Hold Ctrl: names-only map preview ---------- */
  const [namesPreview, setNamesPreview] = useState(false);
  useEffect(() => {
    const down = (e) => { if (e.key === 'Control' && !e.repeat) setNamesPreview(true); };
    const up = (e) => { if (e.key === 'Control') setNamesPreview(false); };
    const off = () => setNamesPreview(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', off);
    document.addEventListener('visibilitychange', off);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', off);
      document.removeEventListener('visibilitychange', off);
    };
  }, []);

  return (
    <div id="erd-wrap" data-view-mode={source.kind === 'sample' ? 'placeholder' : 'live'}>
      <h1 className="sr-only">Database ERD viewer</h1>
      <EdgeMarkers />
      <div
        id="erd-viewport"
        ref={viewportRef}
        className={namesPreview ? 'names-preview' : undefined}
        style={{ '--inv-zoom': 1 / zoom }}
      >
        <ErdActions.Provider value={actions}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            colorMode={mode}
            minZoom={0.05}
            maxZoom={3}
            nodesConnectable={false}
            edgesFocusable={false}
            onlyRenderVisibleElements={schema.tables.length > VIRTUALIZE_THRESHOLD}
            onNodeDragStop={() => writePositions(sourceRef.current, getNodes())}
            onNodeMouseEnter={(_, n) => setHoveredTable(n.id)}
            onNodeMouseLeave={() => setHoveredTable(null)}
            onPaneClick={() => setRefsMenu(null)}
            onMoveStart={() => setRefsMenu(null)}
            deleteKeyCode={null}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
            <MiniMap pannable zoomable nodeColor="var(--erd-header)" nodeBorderRadius={4} className="erd-minimap" />
          </ReactFlow>
        </ErdActions.Provider>
        <HoverLabel stats={tableStats} />
        {source.kind === 'sample' && (
          <div id="placeholder-banner">Sample data — not a real schema. Pick a database below to load your actual tables.</div>
        )}
      </div>

      <Toolbar
        databases={databases}
        selectedDatabase={source.kind === 'db' ? source.name : ''}
        onSelectDatabase={onSelectDatabase}
        groupsActive={hiddenGroups.size > 0}
        onToggleGroupMenu={(rect) => setGroupMenuAnchor((a) => (a ? null : rect))}
        onRelayout={relayout}
        zoom={zoom}
        onZoomIn={() => zoomBy(0.15)}
        onZoomOut={() => zoomBy(-0.15)}
        onFit={() => fitView({ padding: 0.12, maxZoom: 1.5, duration: 400 })}
        mode={mode}
        onToggleTheme={toggleTheme}
        onExportJson={exportJson}
        onExportSql={exportSql}
        onImport={importFile}
        disabled={!!loading}
      />
      <div id="hint">
        drag tables to arrange · hold Ctrl for a names-only map · scroll to zoom · drag background or arrow keys to pan · click an FK to jump · click a referenced PK for reverse relations · press 0 to fit
      </div>

      {groupMenuAnchor && (
        <GroupMenu
          anchor={groupMenuAnchor}
          groups={groups}
          hiddenGroups={hiddenGroups}
          onToggle={toggleGroup}
          onAll={() => setHiddenGroups(new Set())}
          onNone={() => setHiddenGroups(new Set(groups.map((g) => g.id)))}
          onClose={() => setGroupMenuAnchor(null)}
        />
      )}
      {refsMenu && (
        <ReferencesMenu
          anchor={refsMenu.anchor}
          title={`${refsMenu.table}.${refsMenu.column}`}
          references={references}
          onPick={(r) => { setRefsMenu(null); actions.goToTable(r.source, r.sourceColumn); }}
          onClose={() => setRefsMenu(null)}
        />
      )}
      {loading && (
        <div id="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner" aria-hidden="true" />
            <div className="loading-text">{loading}</div>
          </div>
        </div>
      )}
    </div>
  );
}
