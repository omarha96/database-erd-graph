# ERD Viewer

An interactive ER-diagram viewer for Postgres schemas. Tables are
draggable React Flow nodes, auto-arranged with ELK, with FK navigation,
connectivity grouping, light/dark themes, and JSON / MySQL export.

## Structure

```
├── server.js            # serves ./dist + GET /api/schema, GET /api/databases
├── lib/schema.js        # Postgres introspection → { tables, relationships } (pure, unit-testable)
├── index.html           # Vite entry
├── vite.config.mjs      # dev server proxies /api to server.js; `--mode desktop` for Pake
├── desktop/             # Pake config + app icon
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
cp .env.example .env   # optional: default connection settings
```

## Connecting to Postgres

Click the **server icon** at the left of the toolbar to open the
connection menu: enter a server (`host`, `host:port`, or a full
`postgres://user:pass@host:port/db?sslmode=require` URL), username and
password, tick **Use SSL** for hosted databases, and press **Connect**.
The database dropdown then lists that server's databases. A red dot on
the icon means there is no working connection yet.

- `.env` (`DATABASE_URL` or `PG*` variables, see `.env.example`) only
  provides **defaults** that prefill the menu; any field left blank falls
  back to it.
- The `.env` password is never sent to the browser, and is only used when
  connecting to the `.env` server as the `.env` user, so it can't be
  handed to some other server.
- Server, username and SSL are remembered in the browser; passwords are
  not, so after a reload you re-enter the password for non-`.env`
  servers.
- The server connects to whatever host you enter, so only expose the app
  (it listens on `0.0.0.0` by default, set `HOST=127.0.0.1` to restrict
  it) on networks you trust.

## Run it

```bash
npm run dev     # API on :4440 + Vite with hot reload on http://localhost:5173
npm run build   # production bundle into ./dist
npm start       # serve ./dist + API on http://localhost:4440 (set PORT to change)
```

## Desktop app (Pake)

The viewer can be packaged as a small native app (~5–10 MB, Tauri +
the system WebView) for Linux, Windows and macOS with
[Pake](https://github.com/tw93/Pake).

The desktop app is the static frontend only: sample data, layout,
import/export, PNG and PDF all work offline. To browse Postgres it talks to
`server.js` running somewhere (`npm start`, default
`http://localhost:4440`); change that address under **App server** in the
connection menu. The server only accepts cross-origin calls from the
desktop app's origins (`tauri://localhost`, `http(s)://tauri.localhost`,
plus any in `CORS_ORIGINS`), so other websites can't use it.

- **All platforms:** move `desktop/desktop-workflow.yml` to
  `.github/workflows/desktop.yml` once (it lives outside that folder only
  because the tool that wrote it could not push workflow files), then run
  the *Desktop apps* workflow from the GitHub Actions tab (or push a `v*` tag to attach the installers to a release).
  It builds `.deb` + `.AppImage` (Linux), `.msi` (Windows) and a universal
  `.dmg` (macOS) on native runners.
- **Locally** (builds for your own OS only): install
  [Rust](https://rustup.rs) and, on Linux,
  `libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev`,
  then `npm run desktop`. The first build compiles Tauri and takes a while.

Settings live in `desktop/pake.json`; `.env.desktop` sets the default app
server address.

## Schema shape

`POST /api/schema` with `{ connection: { server, user, password, ssl }, database, schema }`
(or `GET /api/schema?database=<name>` using `.env` only) returns:

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
  any zoom, with selectable and searchable text, set in Space Grotesk).
- Export the diagram as JSON (schema + table positions) or as a MySQL
  `.sql` script; Import accepts both this JSON and files exported by the
  old Mermaid-based viewer.
