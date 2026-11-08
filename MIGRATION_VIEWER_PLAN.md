# Migration Viewer Feature - Implementation Plan

## Project Overview
This project is an **ERD Viewer for PostgreSQL schemas** built with:
- **React 19** + **React Flow (@xyflow/react v12)** for the diagram canvas
- **ELK.js** for automatic layout
- **Vite** for development/build
- **Node.js/Express** backend for schema introspection
- **Tauri** for desktop app

The viewer displays database tables as draggable nodes with foreign key relationships as edges. Current features include: database connection management, group filtering, auto-layout, zoom/pan, theme toggle, export/import (JSON, SQL, PNG, PDF), and keyboard shortcuts.

---

## Feature Requirements

### Core Feature: Migration History Viewer
A panel that shows the full database schema at each migration step, with navigation between migration history points.

### Core Feature: Migration Diff View
A comparison view that takes two migrations as checkpoints and shows the differences between them using Git-style diff coloring (green for additions, red for deletions).

### Design Requirements
- Preserve the current database view (React Flow canvas)
- Add diff coloring following Git diff conventions
- Align with the project's visual style (CSS variables, spacing, typography)
- Maintain responsive design for both web and desktop (Tauri)

---

## Architecture Design

### 1. Data Model Extensions

#### Migration Schema
```javascript
// Migration object structure
{
  id: string,           // Migration identifier (e.g., "20240115_add_users_table")
  name: string,         // Human-readable name
  timestamp: number,    // Unix timestamp for ordering
  schema: Schema,       // Full schema at this migration point
  upSql?: string,       // Optional: the UP migration SQL
  downSql?: string,     // Optional: the DOWN migration SQL
  author?: string,      // Optional: migration author
  description?: string  // Optional: migration description
}

// Migration History (ordered array, oldest first)
const migrations: Migration[] = [];

// Diff Result
{
  fromMigration: Migration,
  toMigration: Migration,
  tables: {
    added: Table[],       // New tables
    removed: Table[],     // Dropped tables
    modified: {           // Changed tables
      tableName: string,
      columns: {
        added: Column[],
        removed: Column[],
        modified: {       // Type changes, constraint changes
          columnName: string,
          from: Column,
          to: Column
        }[]
      },
      indexes?: { added: [], removed: [], modified: [] },
      constraints?: { added: [], removed: [], modified: [] }
    }[]
  },
  relationships: {
    added: Relationship[],
    removed: Relationship[],
    modified: Relationship[]
  }
}
```

### 2. API Endpoints (Backend)

Add to `server.js`:
- `GET /api/migrations` - List all migrations for current database
- `GET /api/migrations/:id` - Get schema at specific migration
- `POST /api/migrations/diff` - Diff two migrations (body: { from, to })
- `POST /api/migrations/apply` - Apply migration (for future)

Or implement client-side diffing since we have full schema objects.

### 3. Frontend State Management (App.jsx additions)

```javascript
// New state
const [migrationHistory, setMigrationHistory] = useState([]);
const [currentMigrationIndex, setCurrentMigrationIndex] = useState(-1);
const [diffMode, setDiffMode] = useState(false);
const [diffFromIndex, setDiffFromIndex] = useState(null);
const [diffToIndex, setDiffToIndex] = useState(null);
const [diffResult, setDiffResult] = useState(null);
const [showMigrationPanel, setShowMigrationPanel] = useState(false);

// Migration panel states
const [selectedForDiff, setSelectedForDiff] = useState(new Set()); // max 2
```

---

## UI/UX Design

### 1. Migration History Panel (Side Panel)

**Location**: Right side of the viewport (collapsible panel)

**Components**:
- **Header**: "Migration History" with close button
- **Migration List**: Vertically stacked migration items
- **Navigation**: Previous/Next arrows at top/bottom or keyboard shortcuts
- **Diff Controls**: Checkbox per migration to select for diff, "Compare" button

**Migration Item Design**:
```jsx
<div className="migration-item">
  <div className="migration-meta">
    <span className="migration-id">{migration.id}</span>
    <span className="migration-time">{formatTime(migration.timestamp)}</span>
  </div>
  <div className="migration-name">{migration.name}</div>
  <div className="migration-actions">
    <input 
      type="checkbox" 
      className="diff-checkbox"
      checked={selectedForDiff.has(index)}
      onChange={() => toggleDiffSelection(index)}
    />
    <span className="diff-label">Diff</span>
    <button 
      className="load-migration-btn"
      onClick={() => loadMigration(index)}
      disabled={index === currentMigrationIndex}
    >
      Load
    </button>
  </div>
  {index === currentMigrationIndex && <span className="current-badge">● Current</span>}
</div>
```

### 2. Diff View Mode

When two migrations are selected and "Compare" is clicked:

**Option A: Inline Diff on Canvas**
- Keep React Flow canvas visible
- Color tables/columns based on diff result:
  - **Green background/border**: Added tables/columns
  - **Red background/border**: Removed tables/columns  
  - **Yellow/Orange border**: Modified tables/columns
  - **Tooltip**: Show what changed on hover
- Diff legend in toolbar

**Option B: Split View (Side-by-Side)**
- Two React Flow instances side by side
- Left: "From" migration, Right: "To" migration
- Synchronized zoom/pan
- Highlighted differences

**Option C: Unified Diff Panel (Recommended)**
- Text-based unified diff below or beside canvas
- Git-style: `+ added`, `- removed`, `  unchanged`
- Clickable entries that navigate to table on canvas
- Preserves canvas view

### 3. Git-Style Diff Coloring (CSS Variables)

Add to `:root` in styles.css:
```css
:root {
  /* Existing variables... */
  
  /* Diff colors - Git style */
  --diff-add: #1a7f37;           /* Green for additions */
  --diff-add-bg: #dafbe1;        /* Light green background */
  --diff-add-border: #2da44e;
  --diff-remove: #cf222e;        /* Red for deletions */
  --diff-remove-bg: #ffebe9;     /* Light red background */
  --diff-remove-border: #f85149;
  --diff-modify: #9a6700;        /* Yellow/amber for modifications */
  --diff-modify-bg: #fff8c5;     /* Light yellow background */
  --diff-modify-border: #d29922;
  --diff-context: #6a737d;       /* Gray for context lines */
  
  /* Dark mode diff colors */
  --diff-add-dark: #3fb950;
  --diff-add-bg-dark: rgba(63, 185, 80, 0.15);
  --diff-remove-dark: #f85149;
  --diff-remove-bg-dark: rgba(248, 81, 73, 0.15);
  --diff-modify-dark: #d29922;
  --diff-modify-bg-dark: rgba(210, 153, 34, 0.15);
}

[data-mode="dark"] {
  /* Existing dark mode... */
  --diff-add: var(--diff-add-dark);
  --diff-add-bg: var(--diff-add-bg-dark);
  --diff-remove: var(--diff-remove-dark);
  --diff-remove-bg: var(--diff-remove-bg-dark);
  --diff-modify: var(--diff-modify-dark);
  --diff-modify-bg: var(--diff-modify-bg-dark);
}
```

### 4. Table/Row Diff Styling

**Added Table**: Green left border (4px), green header background tint
```css
.erd-table.diff-added {
  border-left: 4px solid var(--diff-add);
  box-shadow: inset 4px 0 0 var(--diff-add-bg);
}
.erd-table.diff-added .erd-table-header {
  background: linear-gradient(90deg, var(--erd-header), var(--diff-add-bg));
}
```

**Removed Table**: Red left border, strikethrough header, reduced opacity
```css
.erd-table.diff-removed {
  border-left: 4px solid var(--diff-remove);
  opacity: 0.6;
}
.erd-table.diff-removed .erd-table-header {
  text-decoration: line-through;
  background: linear-gradient(90deg, var(--erd-header), var(--diff-remove-bg));
}
```

**Modified Table**: Yellow/amber left border
```css
.erd-table.diff-modified {
  border-left: 4px solid var(--diff-modify);
}
```

**Row-level diffs** (inside table):
```css
.erd-row.diff-added {
  background: var(--diff-add-bg);
  border-left: 3px solid var(--diff-add);
}
.erd-row.diff-removed {
  background: var(--diff-remove-bg);
  text-decoration: line-through;
  opacity: 0.7;
}
.erd-row.diff-modified {
  background: var(--diff-modify-bg);
  border-left: 3px solid var(--diff-modify);
}
```

### 5. Diff Legend (Toolbar Addition)

Add to toolbar:
```jsx
<div className="tool-group diff-legend" role="group" aria-label="Diff legend">
  <span className="legend-item">
    <span className="legend-color added" aria-hidden="true"></span>
    Added
  </span>
  <span className="legend-item">
    <span className="legend-color removed" aria-hidden="true"></span>
    Removed
  </span>
  <span className="legend-item">
    <span className="legend-color modified" aria-hidden="true"></span>
    Modified
  </span>
  <button 
    className="exit-diff-btn text-btn"
    onClick={exitDiffMode}
    aria-label="Exit diff mode"
  >
    Exit Diff
  </button>
</div>
```

---

## Implementation Plan

### Phase 1: Data Infrastructure (Week 1)

#### 1.1 Migration Data Source
- **Option A**: Parse migration files from filesystem (e.g., `migrations/` folder with SQL files)
- **Option B**: Query PostgreSQL migration history table (e.g., `schema_migrations`, `knex_migrations`, `flyway_schema_history`)
- **Option C**: Manual JSON import/export (simplest for MVP)

**Recommendation**: Start with Option C (JSON import) for MVP, then add Option A/B.

#### 1.2 Create `src/migrations.js` - Migration Utilities
```javascript
// Core functions:
// - loadMigrationsFromJson(file)
// - loadMigrationsFromFolder(path) - Tauri only
// - loadMigrationsFromDb(connection) - query migration table
// - computeDiff(fromSchema, toSchema) -> DiffResult
// - applyDiffToSchema(baseSchema, diff) -> newSchema
// - sortMigrationsByTimestamp(migrations)
```

#### 1.3 Diff Algorithm
Implement a schema diff algorithm that compares two normalized schemas:
- Table-level: added/removed/modified
- Column-level: added/removed/modified (type, pk, fk, nullable)
- Relationship-level: added/removed/modified
- Index/constraint level (future)

### Phase 2: Migration History Panel (Week 2)

#### 2.1 Create `src/MigrationPanel.jsx`
- Collapsible side panel (right side)
- Migration list with virtualized rendering (if many migrations)
- Checkbox selection for diff (max 2)
- Load migration button per item
- Previous/Next navigation buttons
- Keyboard shortcuts: `Alt+Left`/`Alt+Right` for navigation

#### 2.2 Integrate with App.jsx
- Add panel state (`showMigrationPanel`)
- Add toolbar button to toggle panel
- Connect migration loading to existing `showSchema` function
- Persist migration history in localStorage (per database)

#### 2.3 Migration Loading Flow
```javascript
const loadMigration = async (index) => {
  const migration = migrationHistory[index];
  if (!migration) return;
  
  // If we have full schema in migration object, use it
  if (migration.schema) {
    await showSchema(migration.schema, { 
      kind: 'migration', 
      name: migration.id,
      migrationIndex: index 
    }, migration.positions);
    setCurrentMigrationIndex(index);
    return;
  }
  
  // Otherwise fetch from server (if API supports it)
  // For now, assume schema is embedded
};
```

### Phase 3: Diff View Implementation (Week 3)

#### 3.1 Create `src/DiffView.jsx` - Unified Diff Panel
- Text-based diff output (like `git diff`)
- Sections: Tables, Columns, Relationships
- Clickable entries → navigate to table on canvas
- Syntax highlighting with CSS variables

#### 3.2 Create `src/diff.js` - Diff Computation
```javascript
export function computeSchemaDiff(fromSchema, toSchema) {
  // Returns structured diff result
}

export function applyDiffClasses(nodes, edges, diffResult) {
  // Returns nodes/edges with diff CSS classes applied
}
```

#### 3.3 Canvas Diff Highlighting
- Modify `TableNode.jsx` to accept diff classes
- Modify `RelationEdge.jsx` for relationship diffs
- Add diff classes to nodes/edges based on diff result
- Preserve existing selection/hover/flash behavior

#### 3.4 Diff Mode State
- Enter diff mode when two migrations selected
- Show diff legend in toolbar
- Show unified diff panel
- "Exit Diff" button to return to normal view

### Phase 4: Polish & Integration (Week 4)

#### 4.1 Keyboard Shortcuts
- `Alt+Left` / `Alt+Right`: Previous/Next migration
- `Alt+D`: Toggle diff mode
- `Escape`: Exit diff mode / close panels

#### 4.2 Persistence
- Save migration history per database in localStorage
- Remember last viewed migration
- Remember diff selections

#### 4.3 Responsive Design
- Panel collapses on mobile (< 640px)
- Diff panel stacks below canvas on mobile
- Touch-friendly controls

#### 4.4 Accessibility
- ARIA labels for all diff elements
- Keyboard navigation in migration list
- Screen reader announcements for diff changes
- High contrast mode support

#### 4.5 Testing
- Unit tests for diff algorithm
- Visual regression tests for diff coloring
- Integration tests for migration loading

---

## File Structure Changes

```
src/
├── App.jsx                    # Main app - add migration state & handlers
├── MigrationPanel.jsx         # NEW - Migration history side panel
├── DiffView.jsx               # NEW - Unified diff display panel
├── DiffLegend.jsx             # NEW - Diff legend in toolbar
├── migrations.js              # NEW - Migration utilities & diff algorithm
├── diff.js                    # NEW - Diff computation & application
├── Toolbar.jsx                # MODIFY - Add migration panel toggle, diff legend
├── TableNode.jsx              # MODIFY - Accept diff classes for rows/tables
├── RelationEdge.jsx           # MODIFY - Accept diff classes for edges
├── styles.css                 # ADD - Diff CSS variables & classes
├── model.js                   # No changes needed
├── highlightStore.js          # No changes needed
├── layout.js                  # No changes needed
├── connection.js              # No changes needed
└── previewFont.js             # No changes needed

lib/
├── schema.js                  # No changes (schema fetching)
└── connection.js              # No changes

server.js                      # OPTIONAL - Add migration API endpoints
```

---

## Visual Style Alignment

### Current Design Language
- **Colors**: Purple accent (`--erd-accent: #5146B8`), clean grays
- **Typography**: System UI font stack, 12.5px base for tables
- **Spacing**: 8px base unit, 12px padding, 16px gaps
- **Border Radius**: 8px for tables, 10px for popovers, 4px for badges
- **Shadows**: Subtle layered shadows (0 1px 3px, 0 4px 14px)
- **Transitions**: 150-200ms ease for interactions

### Diff Design Language (New)
- **Added**: Green (`#1a7f37` / `#3fb950` dark) - GitHub/GitLab convention
- **Removed**: Red (`#cf222e` / `#f85149` dark) - GitHub/GitLab convention  
- **Modified**: Amber (`#9a6700` / `#d29922` dark) - distinct from add/remove
- **Backgrounds**: 10-15% opacity tints for subtlety
- **Borders**: 3-4px left borders on tables, 3px on rows
- **Animations**: Subtle fade-in for diff highlights (200ms)

### Consistency Checklist
- [ ] Diff colors work in both light/dark modes
- [ ] Diff classes don't break existing hover/selection/flash states
- [ ] Panel animations match existing (200ms ease)
- [ ] Toolbar buttons follow existing pattern (36px, 8px radius)
- [ ] Popovers use existing `.popover` styles
- [ ] Loading states use existing `.loading-spinner`
- [ ] Tooltips use existing `data-tooltip` pattern

---

## Migration Data Source Options (Detailed)

### Option 1: JSON Import (MVP - Easiest)
```json
{
  "version": 1,
  "database": "myapp",
  "migrations": [
    {
      "id": "202401150001_create_users",
      "name": "Create users table",
      "timestamp": 1705276800000,
      "schema": { "tables": [...], "relationships": [...] },
      "positions": { "users": { "x": 100, "y": 100 } }
    },
    {
      "id": "202401160001_add_email_index",
      "name": "Add email index to users",
      "timestamp": 1705363200000,
      "schema": { "tables": [...], "relationships": [...] },
      "positions": { "users": { "x": 100, "y": 100 }, "posts": { "x": 400, "y": 100 } }
    }
  ]
}
```
Import via existing Import button or new "Import Migrations" button.

### Option 2: Migration Folder (Tauri Desktop)
- Read `migrations/` folder with `.sql` files
- Parse UP/DOWN SQL to extract schema changes
- Use `lib/schema.js` logic to introspect at each step
- Requires Tauri filesystem access

### Option 3: Database Migration Table
Query standard migration tables:
- **Flyway**: `flyway_schema_history`
- **Knex**: `knex_migrations`
- **Sequelize**: `SequelizeMeta`
- **Custom**: `schema_migrations`
- Execute each migration in transaction, introspect, rollback

### Option 4: pg_dump History (Advanced)
- Use PostgreSQL's built-in schema versioning
- Requires superuser or specific extensions

---

## Diff Algorithm Design

### High-Level Approach
```javascript
function computeSchemaDiff(fromSchema, toSchema) {
  const fromTables = new Map(fromSchema.tables.map(t => [t.name, t]));
  const toTables = new Map(toSchema.tables.map(t => [t.name, t]));
  
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
  const relationshipDiff = computeRelationshipDiff(
    fromSchema.relationships, 
    toSchema.relationships
  );
  
  return { tables: tableDiffs, relationships: relationshipDiff };
}

function computeColumnDiff(fromCols, toCols) {
  const fromMap = new Map(fromCols.map(c => [c.name, c]));
  const toMap = new Map(toCols.map(c => [c.name, c]));
  const allNames = new Set([...fromMap.keys(), ...toMap.keys()]);
  
  const added = [], removed = [], modified = [];
  
  for (const name of allNames) {
    const from = fromMap.get(name);
    const to = toMap.get(name);
    
    if (!from) added.push(to);
    else if (!to) removed.push(from);
    else if (!columnsEqual(from, to)) {
      modified.push({ columnName: name, from, to });
    }
  }
  
  return { added, removed, modified, hasChanges: added.length || removed.length || modified.length };
}

function columnsEqual(a, b) {
  return a.type === b.type && 
         a.pk === b.pk && 
         a.fk === b.fk &&
         JSON.stringify(a.ref) === JSON.stringify(b.ref);
}
```

---

## Integration Points with Existing Code

### 1. App.jsx - State Additions
```javascript
// Add near existing state declarations
const [migrationHistory, setMigrationHistory] = useState([]);
const [currentMigrationIndex, setCurrentMigrationIndex] = useState(-1);
const [showMigrationPanel, setShowMigrationPanel] = useState(false);
const [diffMode, setDiffMode] = useState(false);
const [diffSelection, setDiffSelection] = useState({ from: null, to: null });
const [diffResult, setDiffResult] = useState(null);
```

### 2. App.jsx - Handler Functions
```javascript
const loadMigration = useCallback(async (index) => { ... }, [...]);
const toggleMigrationPanel = () => setShowMigrationPanel(p => !p);
const selectForDiff = (index) => { ... };
const runDiff = useCallback(() => { ... }, [...]);
const exitDiffMode = () => { setDiffMode(false); setDiffResult(null); setDiffSelection({ from: null, to: null }); };
const nextMigration = () => { ... };
const prevMigration = () => { ... };
```

### 3. Toolbar.jsx - New Props
```javascript
// Add to Toolbar props:
showMigrationPanel, onToggleMigrationPanel,
diffMode, diffResult, onExitDiffMode,
migrationHistory, currentMigrationIndex, onNextMigration, onPrevMigration
```

### 4. TableNode.jsx - Diff Props
```javascript
// Add to TableNode props via data:
diffStatus: 'added' | 'removed' | 'modified' | null,
diffColumns: Set<string>, // column names with diff status
```

---

## Risk Assessment & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Diff algorithm performance on large schemas | High | Medium | Memoize diff computation, virtualize rendering, web worker for heavy diffs |
| CSS conflicts with existing styles | Medium | Low | Use specific CSS classes, test in both themes, use CSS variables |
| State management complexity | High | Medium | Keep diff state separate, use useCallback, clear on exit |
| Migration data availability | High | High (for MVP) | Start with JSON import, add other sources incrementally |
| Canvas re-render performance in diff mode | Medium | Medium | Only add CSS classes, don't recreate nodes/edges |
| Mobile/desktop layout conflicts | Medium | Low | Test responsive breakpoints, use existing patterns |

---

## Success Criteria

1. **Migration Panel**: Opens/closes smoothly, lists migrations with timestamps
2. **Navigation**: Previous/Next arrows and keyboard shortcuts work
3. **Load Migration**: Clicking "Load" shows that migration's schema on canvas
4. **Diff Selection**: Can select exactly 2 migrations for comparison
5. **Diff View**: Shows Git-style unified diff + canvas highlighting
6. **Coloring**: Green added, Red removed, Amber modified - both themes
7. **Exit Diff**: Returns to normal view cleanly
8. **Persistence**: Remembers last migration per database
9. **Performance**: < 200ms for diff on 100-table schema
10. **Accessibility**: Keyboard navigable, screen reader friendly

---

## Future Enhancements (Post-MVP)

1. **Migration Authoring**: Create/edit migrations from UI
2. **Branch Visualization**: Show migration branches/merges
3. **Schema Drift Detection**: Compare live DB vs migration history
4. **Rollback Preview**: Show what DOWN migration would do
5. **Team Collaboration**: Share migration views via URL
6. **CI/CD Integration**: Link to GitHub/GitLab commits
7. **Automatic Migration Detection**: Watch migration folder for changes

---

## Dependencies

No new npm dependencies required for MVP. All implementation uses:
- React 19 (existing)
- React Flow (existing) 
- CSS Variables (existing)
- localStorage (existing)

Optional future dependencies:
- `diff` npm package for text diffing (if unified diff gets complex)
- `web-worker` for off-main-thread diff computation

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Data Infrastructure | 1 week | Migration data loading, diff algorithm |
| Phase 2: Migration Panel | 1 week | Side panel with navigation |
| Phase 3: Diff View | 1 week | Diff computation, canvas highlighting, unified diff |
| Phase 4: Polish | 1 week | Keyboard shortcuts, persistence, testing |
| **Total** | **4 weeks** | **Complete MVP** |

---

## Next Steps

1. **Immediate**: Create `src/migrations.js` with JSON import and diff algorithm
2. **Week 1**: Build MigrationPanel.jsx and integrate with App.jsx
3. **Week 2**: Build DiffView.jsx and diff highlighting on canvas
4. **Week 3**: Polish, test, document

Would you like me to start implementing any specific phase?
