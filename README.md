# ERD Viewer

An interactive ER-diagram viewer for Postgres schemas. Tables are
draggable React Flow nodes, auto-arranged with ELK, with FK navigation,
connectivity grouping, light/dark themes, and JSON / MySQL export.

## Structure

```
├── server.js            # serves ./dist + GET /api/schema, GET /api/databases
├── lib/schema.js        # Postgres introspection → { tables, relationships } (pure, unit-testable)
├── index.html           # Vite entry
├── vite.config.mjs      # dev server proxies /api to server.js
└── src/
    ├── App.jsx          # canvas, data loading, FK navigation, export/import, keyboard
    ├── TableNode.jsx    # one table (memoized custom node)
    ├── RelationEdge.jsx # FK edge anchored to the exact column rows, crow's-foot markers
    ├── layout.js        # ELK layered layout, run in a Web Worker
    ├── model.js         # table sizes, connectivity groups, MySQL DDL, legacy import
    ├── highlightStore.js# hover/flash state with per-node subscriptions
    ├── Toolbar.jsx / Menus.jsx / EdgeMarkers.jsx
    └── sampleSchema.js  # obviously-fake sample schema shown before a DB is picked
```

## Setup

```bash
npm install
cp .env.example .env   # then point it at your Postgres
```

Use discrete `PG*` vars or a single `DATABASE_URL`:

```
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

## Run it

```bash
npm run dev     # API on :4440 + Vite with hot reload on http://localhost:5173
npm run build   # production bundle into ./dist
npm start       # serve ./dist + API on http://localhost:4440 (set PORT to change)
```

## Schema shape

`GET /api/schema?database=<name>[&schema=public]` returns:

```js
{
  tables: [{ name, columns: [{ name, type, pk, fk, ref?: { table, column } }] }],
  relationships: [{ source, sourceColumn, target, targetColumn }], // source = referencing table
  diagram, fkTargets, tableCount, relationshipCount,               // legacy Mermaid form, kept for compatibility
}
```

## Controls

- Hold **Ctrl** (briefly, on its own) for a names-only preview of the map: tables stay in place
  and show just their name, sized to stay readable at the current zoom.
- The **Tighter / Sparser** buttons step the layout spacing (0.5×–2.6×,
  remembered between visits) and re-arrange the tables.
- **Drag tables** to arrange them. Positions are saved per database in
  `localStorage` and restored on reload. **Auto Layout** discards them
  and re-runs ELK on the visible tables. ELK pins each relationship to
  its column rows and routes it in its own lane, so lines don't overlap;
  lines attached to a table you drag afterwards are re-routed on the fly.
- Scroll to zoom, drag the background (or arrow keys) to pan, pinch on touch.
  `+` / `-` zoom, `0` fits the diagram. The minimap is draggable too.
- Hover or select a table to highlight its relationships and see the FK
  column names on the edges.
- Click an underlined FK column to jump to the referenced table/column.
- Click a dotted-underlined PK column to list everything that references it.
- **Group Tables** shows tightly connected clusters (greedy modularity);
  unchecking a group hides those tables without re-laying out the rest.
- The camera button saves a PNG screenshot of the current view; the PDF
  button exports the whole diagram on one page as a vector PDF (sharp at
  any zoom, with selectable and searchable text).
- Export the diagram as JSON (schema + table positions) or as a MySQL
  `.sql` script; Import accepts both this JSON and files exported by the
  old Mermaid-based viewer.
