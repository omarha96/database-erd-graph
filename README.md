# ERD Viewer

An interactive entity-relationship diagram viewer for PostgreSQL. Point it at
a database and it draws every table, column and foreign key as a diagram you
can rearrange, explore and export.

- **Auto-layout** with [ELK](https://eclipse.dev/elk/): relationship lines are
  routed in their own lanes, so they don't overlap each other or cut through
  tables. A spacing control makes the layout tighter or sparser.
- **Draggable tables**: arrange them by hand and the positions are remembered
  per database.
- **Explore**: click a foreign key to jump to the table it references, click a
  primary key to list everything that references it, hover a table to
  highlight its relationships, hold <kbd>Ctrl</kbd> for a names-only overview
  of the whole map.
- **Group tables** into clusters of tightly connected tables and hide the ones
  you don't need.
- **Export** a PNG of the current view, a vector PDF of the whole diagram
  (sharp at any zoom, with selectable text), JSON (schema + layout) or a MySQL
  `.sql` script. JSON exports can be imported again.
- **Remote servers**: connect to any Postgres server from the app, including
  hosted databases over SSL.
- Light and dark themes, and a **desktop app** for Linux, Windows and macOS.

Built with [React Flow](https://reactflow.dev), ELK and [Vite](https://vite.dev),
with a small Node.js server for database access.

## Requirements

- Node.js 18 or newer
- Network access to a PostgreSQL server (any recent version) with a user that
  can read `information_schema` for the schema you want to view

## Getting started

```bash
git clone https://github.com/omarha96/database-erd-graph.git
cd database-erd-graph
npm install
npm run build
npm start
```

Open <http://localhost:4440>. A sample schema is shown until you connect to a
database.

To connect, click the **server icon** at the left of the toolbar, enter the
server, username and password, and press **Connect**. The dropdown next to it
then lists the server's databases; pick one to load its schema.

The server field accepts `host`, `host:port`, or a full connection URL such as
`postgres://user@db.example.com:5432/mydb?sslmode=require`. Tick **Use SSL**
for hosted databases (it encrypts the connection without verifying the
server's certificate, like `sslmode=require`).

## Configuration

Configuration is optional. To set defaults, copy `.env.example` to `.env` and
edit it:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4440` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address; use `127.0.0.1` to accept local connections only |
| `DATABASE_URL` | – | Default connection as one URL (takes priority over `PG*`) |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | `localhost`, `5432`, `postgres`, –, `postgres` | Default connection, in parts |
| `PGSSLMODE` | – | `require` to connect with SSL by default |
| `PGSCHEMA` | `public` | Schema to introspect |
| `CORS_ORIGINS` | – | Extra origins allowed to call the API cross-origin (comma-separated) |

These values only **prefill** the connection menu; anything entered in the
app takes precedence, and blank fields fall back to them.

## Security

- **Keep credentials in `.env`.** It is git-ignored, so it isn't committed or
  included in builds. Don't put credentials in any `VITE_*` variable:
  those are compiled into the frontend, and the build refuses to run if one
  looks like a secret, or if a database password from the environment ends up
  in the bundle.
- **The `.env` password never reaches the browser.** The app only learns
  whether one is set. It is used only when connecting to the `.env` server as
  the `.env` user, so it can't be redirected to another server.
- **Passwords typed into the app are not stored.** The server, username and
  SSL setting are remembered in the browser; the password has to be entered
  again after a reload.
- **Only run the server where you trust the network.** It connects to whatever
  database server the app asks for and returns schema information. It listens
  on all interfaces by default; set `HOST=127.0.0.1` to keep it local.
  Cross-origin API calls are refused (unless listed in `CORS_ORIGINS`), so
  other websites you visit can't use it.

## Using the viewer

| Action | How |
| --- | --- |
| Pan | Drag the background, or arrow keys |
| Zoom | Scroll wheel, pinch, or <kbd>+</kbd> / <kbd>-</kbd> |
| Fit the diagram to the screen | <kbd>0</kbd> or the fit button |
| Move a table | Drag it; positions are saved per database |
| Re-arrange everything | **Auto layout** button (discards manual positions) |
| Tighter / sparser layout | The two arrow buttons; re-arranges the tables |
| Go to a referenced table | Click an underlined foreign-key column |
| See what references a key | Click a dotted-underlined primary-key column |
| Highlight a table's relationships | Hover or select the table |
| Names-only overview | Hold <kbd>Ctrl</kbd> |
| Show or hide clusters | **Group tables** button |

## Desktop app

The desktop app is one installer per platform (`.deb` on Linux, `.exe` setup
on Windows, `.dmg` on macOS) with the backend built in: no separate server
to run. It is a [Tauri](https://tauri.app) app that uses the system WebView
(no bundled Chromium). On launch it starts `server.js`, compiled into a
standalone Node executable, on a private `127.0.0.1` port that the LAN
can't reach, and opens its window on it. The Node runtime accounts for most
of the size (about 50 MB download).

**Build on GitHub (all platforms).** `.github/workflows/desktop.yml` builds
all three installers. Run **Desktop apps** from the Actions tab, or push a
tag like `v2.0.0` to attach the installers to a release.

**Build locally (your own OS only).** Install Node 25.5+ (for
`--build-sea`), [Rust](https://rustup.rs) and the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your
platform (on Debian/Ubuntu: `pkg-config libwebkit2gtk-4.1-dev libssl-dev
librsvg2-dev libxdo-dev`), then run:

```bash
npm run desktop
```

The installer lands in `desktop/src-tauri/target/release/bundle/`. The first
build compiles Tauri and can take ten minutes or more. App settings (name,
window size, icon) are in `desktop/src-tauri/`.

The installers are not code-signed, so Windows and macOS show a warning the
first time the app is opened.

## Development

```bash
npm run dev
```

This starts the API server on port 4440 and the Vite dev server with hot
reload on <http://localhost:5173>.

| Script | What it does |
| --- | --- |
| `npm run dev` | API server and Vite dev server |
| `npm run build` | Production frontend into `dist/` |
| `npm start` | Serve `dist/` and the API on port 4440 |
| `npm run desktop` | Build the desktop app installer (Tauri + bundled backend) |

### Project layout

```
├── server.js            HTTP server: static files and the /api routes
├── lib/
│   ├── schema.js        Postgres introspection → tables and relationships
│   └── connection.js    Connection settings (.env defaults) and pool cache
├── src/
│   ├── App.jsx          Canvas, loading, navigation, export/import, keyboard
│   ├── TableNode.jsx    A table on the canvas
│   ├── RelationEdge.jsx A foreign-key line, anchored to its column rows
│   ├── layout.js        ELK layout and edge routing (in a Web Worker)
│   ├── model.js         Table sizes, grouping, MySQL export, legacy import
│   ├── pdfExport.js     Vector PDF export
│   ├── capture.js       PNG export
│   └── ...              Toolbar, menus, connection client, sample schema
├── desktop/             Tauri app (src-tauri/), backend sidecar build, app icon
└── vite.config.mjs      Build config, including the credential guard
```

### API

| Route | Description |
| --- | --- |
| `GET /api/connection` | The default connection settings from `.env` (never the password) |
| `POST /api/databases` | List the databases on a server |
| `POST /api/schema` | Introspect one database |

`POST` bodies look like
`{ "connection": { "server", "user", "password", "ssl" }, "database", "schema" }`;
blank fields fall back to `.env`. `GET /api/databases` and
`GET /api/schema?database=<name>` use `.env` only.

`/api/schema` returns:

```js
{
  tables: [{ name, columns: [{ name, type, pk, fk, ref?: { table, column } }] }],
  relationships: [{ source, sourceColumn, target, targetColumn }], // source = referencing table
  tableCount, relationshipCount,
  diagram, fkTargets, // the same schema as a Mermaid erDiagram, for compatibility
}
```

## Credits

- Text in the PDF export is set in
  [Space Grotesk](https://github.com/floriankarsten/space-grotesk)
  (SIL Open Font License 1.1, see `src/assets/fonts/OFL.txt`).
- Desktop packaging by [Tauri](https://tauri.app).
