# ERD Viewer

A self-contained Node.js server that serves an interactive, pan/zoomable
Mermaid ER-diagram viewer with FK navigation and a light/dark theme toggle.

## Structure

```
erd-viewer/
├── server.js          # static file server + GET /api/schema route
├── lib/
│   └── schema.js       # Postgres introspection → Mermaid erDiagram (pure + unit-testable)
├── package.json
├── .env                # local Postgres connection settings (see below)
├── .env.example
└── public/
    ├── index.html      # markup, styles, and all viewer/interaction logic
    └── data.js         # the static graph data — edit this to change the default diagrams
```

## Setup

```bash
npm install
```

`.env` already ships with sane local defaults (`localhost:5432`, user/db
`postgres`). Edit it to point at your own Postgres instance, either with
discrete `PG*` vars or a single `DATABASE_URL`:

```
DATABASE_URL=postgres://user:password@localhost:5432/mydb
```

`.env` is gitignored — copy `.env.example` if you need a template to share.

The split mirrors a "chart + data" pattern: `index.html` never contains any
schema-specific content, it only reads a global `data` object. `data.js` is
loaded first via a classic `<script>` tag, so `data` is available to the
`<script type="module">` in `index.html`.

## `data.js` contract

`data.js` must define a global `data` object shaped like:

```js
const data = {
  workflowDiagram: `erDiagram ...`,  // Mermaid erDiagram definition string
  formDiagram: `erDiagram ...`,      // a second Mermaid erDiagram definition string
  fkTargets: {                        // { fieldName: targetTableName } for FK click-navigation
    formId: 'forms',
    // ...
  },
};
```

- `workflowDiagram` / `formDiagram` are rendered into the two toggleable
  views (the "Workflow" / "Forms" button in the top bar).
- `fkTargets` powers the click-to-navigate behavior on any attribute
  marked `FK` in a diagram: clicking it centers the view on
  `fkTargets[fieldName]`'s table, and clicking a `PK id` row shows a
  "referenced by" menu of every field across all tables whose
  `fkTargets` entry points back at it.

To point the viewer at a different schema, just replace the two Mermaid
definition strings and the `fkTargets` map in `data.js` — nothing in
`index.html` needs to change. If you only have one diagram, set both
`workflowDiagram` and `formDiagram` to the same string.

## Loading a schema live from Postgres

Click **Load DB Schema** in the toolbar to fetch `GET /api/schema`, which:

1. connects to the Postgres database configured in `.env`,
2. reads `information_schema` for that schema's tables, columns, primary
   keys, and foreign keys (default schema: `public`, override with
   `PGSCHEMA` or `?schema=` on the request),
3. builds a Mermaid `erDiagram` string and an `fkTargets` map — the exact
   same shape as `data.js` — in `lib/schema.js`, and
4. renders it into a third "Live DB" view using the same pan/zoom/FK-click
   code as the two static views.

Click the button again to jump back to the static diagram. If the database
is unreachable or misconfigured, you'll get an alert with the underlying
error (bad host/port/credentials, no tables in the schema, etc.) instead of
a silent failure. `lib/schema.js` exports a pure `buildErDiagram()` function
(no DB connection required) if you want to unit test or reuse the
introspection logic elsewhere.

## Run it

```bash
npm start
# or: node server.js
```

Then open http://localhost:3000 (set `PORT` to use a different port).

## Controls

- Scroll to zoom, drag to pan, pinch to zoom on touch.
- Click an underlined `FK` field to jump to the table it references.
- Click an underlined `PK id` field to see everything that references it.
- Press `0` (or the fit button) to re-center and fit the diagram.
- The top-right button toggles between the Workflow and Forms views.
- The sun/moon button toggles light/dark theme (persisted in `localStorage`).
