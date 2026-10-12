import { useRef } from 'react';

const Icon = ({ d, children, style }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={style}>{d ? <path d={d} /> : children}</svg>
);

export default function Toolbar({
  databases, selectedDatabase, onSelectDatabase,
  groupsActive, onToggleGroupMenu, onRelayout,
  zoom, onZoomIn, onZoomOut, onFit,
  mode, onToggleTheme,
  onExportJson, onExportSql, onImport,
  disabled,
}) {
  const fileInput = useRef(null);
  const themeTitle = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <div id="zoom-controls" role="group" aria-label="Diagram controls">
      <div className="tool-group" role="group" aria-label="Data source">
        <select
          id="database-select"
          aria-label="Select Postgres database"
          title="Choose which Postgres database to introspect — the schema loads automatically"
          value={selectedDatabase}
          onChange={(e) => onSelectDatabase(e.target.value)}
          disabled={disabled}
        >
          <option value="">Sample data (no database)</option>
          {databases.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>

      <div className="tool-group" role="group" aria-label="Layout">
        <button
          type="button"
          data-popover-toggle
          className={`text-btn${groupsActive ? ' groups-active' : ''}`}
          title="Show or hide groups of tightly connected tables"
          onClick={(e) => { e.stopPropagation(); onToggleGroupMenu(e.currentTarget.getBoundingClientRect()); }}
          disabled={disabled}
        >
          Group Tables
        </button>
        <button type="button" className="text-btn" title="Discard dragged positions and auto-arrange all visible tables" onClick={onRelayout} disabled={disabled}>
          Auto Layout
        </button>
      </div>

      <div className="tool-group" role="group" aria-label="Zoom">
        <button type="button" aria-label="Zoom out" title="Zoom out" onClick={onZoomOut} disabled={disabled}><Icon d="M6 12h12" /></button>
        <span id="zoom-label" aria-live="polite">{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in" onClick={onZoomIn} disabled={disabled}><Icon d="M12 6v12M6 12h12" /></button>
        <button type="button" aria-label="Fit and center" title="Fit and center" onClick={onFit} disabled={disabled}>
          <Icon style={{ width: 18, height: 18 }} d="M4 10V6a2 2 0 0 1 2-2h4M4 14v4a2 2 0 0 0 2 2h4M20 10V6a2 2 0 0 0-2-2h-4M20 14v4a2 2 0 0 1-2 2h-4" />
        </button>
      </div>

      <div className="tool-group" role="group" aria-label="Appearance">
        <button type="button" aria-label={themeTitle} title={themeTitle} onClick={onToggleTheme}>
          {mode === 'dark'
            ? <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></Icon>
            : <Icon d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />}
        </button>
      </div>

      <div className="tool-group" role="group" aria-label="File">
        <button type="button" aria-label="Export diagram" title="Export the diagram (schema + table positions) as JSON" onClick={onExportJson} disabled={disabled}>
          <Icon d="M12 4v11M8 11l4 4 4-4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </button>
        <button type="button" aria-label="Export as MySQL script" title="Export as a .sql script importable by MySQL Workbench (Database → Reverse Engineer)" onClick={onExportSql} disabled={disabled}>
          <Icon><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></Icon>
        </button>
        <button type="button" aria-label="Import diagram" title="Import a diagram JSON file exported from this viewer" onClick={() => fileInput.current.click()} disabled={disabled}>
          <Icon d="M12 15V4M8 8l4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImport(f); }}
        />
      </div>
    </div>
  );
}
