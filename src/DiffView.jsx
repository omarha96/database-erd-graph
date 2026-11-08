import { useRef, useEffect, useCallback } from 'react';

/**
 * DiffView - Unified diff panel showing Git-style diff output
 * Clickable entries navigate to tables on the canvas
 */
export default function DiffView({
  diffResult,
  fromMigration,
  toMigration,
  onNavigateToTable,
  onClose,
  isOpen = false,
}) {
  const contentRef = useRef(null);

  // Auto-scroll to first change when opened
  useEffect(() => {
    if (isOpen && contentRef.current) {
      const firstChange = contentRef.current.querySelector('.diff-line.added, .diff-line.removed, .diff-line.modified');
      if (firstChange) {
        firstChange.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isOpen, diffResult]);

  if (!isOpen || !diffResult) return null;

  const summary = getDiffSummary(diffResult);

  return (
    <div
      id="diff-panel"
      className={isOpen ? 'open' : 'closed'}
      role="region"
      aria-label="Schema diff"
    >
      {/* Header */}
      <div className="diff-panel-header">
        <div>
          <div className="diff-panel-title">
            Schema Diff: <span style={{ fontWeight: 'normal', color: 'var(--fb-text-sec)' }}>{fromMigration?.id}</span> → <span style={{ fontWeight: 'normal', color: 'var(--fb-text-sec)' }}>{toMigration?.id}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--fb-text-sec)', marginTop: '2px' }}>
            {fromMigration?.name} → {toMigration?.name}
          </div>
        </div>
        <div className="diff-panel-summary">
          {summary.tablesAdded > 0 && (
            <span className="diff-summary-item">
              <span className="diff-summary-dot added" aria-hidden="true"></span>
              +{summary.tablesAdded} tables
            </span>
          )}
          {summary.tablesRemoved > 0 && (
            <span className="diff-summary-item">
              <span className="diff-summary-dot removed" aria-hidden="true"></span>
              -{summary.tablesRemoved} tables
            </span>
          )}
          {summary.tablesModified > 0 && (
            <span className="diff-summary-item">
              <span className="diff-summary-dot modified" aria-hidden="true"></span>
              ~{summary.tablesModified} tables
            </span>
          )}
          {summary.relationshipsAdded > 0 && (
            <span className="diff-summary-item">
              <span className="diff-summary-dot added" aria-hidden="true"></span>
              +{summary.relationshipsAdded} rels
            </span>
          )}
          {summary.relationshipsRemoved > 0 && (
            <span className="diff-summary-item">
              <span className="diff-summary-dot removed" aria-hidden="true"></span>
              -{summary.relationshipsRemoved} rels
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close diff panel"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            color: 'var(--fb-text-sec)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Diff Content */}
      <div className="diff-panel-content" ref={contentRef} role="log" aria-live="polite">
        {renderDiffLines(diffResult).map((line, i) => (
          <div key={i} className={`diff-line ${line.className}`} onClick={line.onClick}>
            {line.prefix}{line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderDiffLines(diffResult) {
  const lines = [];

  // Header
  lines.push({ className: 'header', text: `# Schema Diff`, prefix: '' });
  lines.push({ className: 'header', text: `# Tables: +${diffResult.summary.tablesAdded} -${diffResult.summary.tablesRemoved} ~${diffResult.summary.tablesModified}`, prefix: '' });
  lines.push({ className: 'header', text: `# Relationships: +${diffResult.summary.relationshipsAdded} -${diffResult.summary.relationshipsRemoved} ~${diffResult.summary.relationshipsModified}`, prefix: '' });
  lines.push({ className: 'context', text: '', prefix: '' });

  // Table diffs
  for (const t of diffResult.tables) {
    if (t.type === 'added') {
      lines.push({ className: 'added', text: `Table ${t.table.name} (added)`, prefix: '+ ', onClick: () => navigateToTable(t.table.name) });
      for (const col of t.table.columns) {
        lines.push({ className: 'added', text: `  ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`, prefix: '+ ', onClick: () => navigateToTable(t.table.name, col.name) });
      }
      lines.push({ className: 'context', text: '', prefix: '' });
    } else if (t.type === 'removed') {
      lines.push({ className: 'removed', text: `Table ${t.table.name} (removed)`, prefix: '- ', onClick: () => navigateToTable(t.table.name) });
      for (const col of t.table.columns) {
        lines.push({ className: 'removed', text: `  ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`, prefix: '- ', onClick: () => navigateToTable(t.table.name, col.name) });
      }
      lines.push({ className: 'context', text: '', prefix: '' });
    } else if (t.type === 'modified') {
      lines.push({ className: 'modified', text: `Table ${t.tableName} (modified)`, prefix: '~ ', onClick: () => navigateToTable(t.tableName) });
      for (const col of t.added) {
        lines.push({ className: 'added', text: `  ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`, prefix: '+ ', onClick: () => navigateToTable(t.tableName, col.name) });
      }
      for (const col of t.removed) {
        lines.push({ className: 'removed', text: `  ${col.type} ${col.name}${col.pk ? ' PK' : ''}${col.fk ? ' FK' : ''}`, prefix: '- ', onClick: () => navigateToTable(t.tableName, col.name) });
      }
      for (const col of t.modified) {
        const changes = [];
        if (col.from.type !== col.to.type) changes.push(`type: ${col.from.type} → ${col.to.type}`);
        if (col.from.pk !== col.to.pk) changes.push(`PK: ${col.from.pk} → ${col.to.pk}`);
        if (col.from.fk !== col.to.fk) changes.push(`FK: ${col.from.fk} → ${col.to.fk}`);
        if (JSON.stringify(col.from.ref) !== JSON.stringify(col.to.ref)) changes.push(`ref: ${JSON.stringify(col.from.ref)} → ${JSON.stringify(col.to.ref)}`);
        lines.push({ className: 'modified', text: `  ${col.columnName}: ${changes.join(', ')}`, prefix: '~ ', onClick: () => navigateToTable(t.tableName, col.columnName) });
      }
      lines.push({ className: 'context', text: '', prefix: '' });
    }
  }

  // Relationship diffs
  if (diffResult.relationships.added.length > 0) {
    lines.push({ className: 'header', text: '# Relationships added:', prefix: '' });
    for (const r of diffResult.relationships.added) {
      lines.push({ className: 'added', text: `  ${r.source}.${r.sourceColumn} → ${r.target}.${r.targetColumn}`, prefix: '+ ', onClick: () => navigateToTable(r.source) });
    }
    lines.push({ className: 'context', text: '', prefix: '' });
  }
  if (diffResult.relationships.removed.length > 0) {
    lines.push({ className: 'header', text: '# Relationships removed:', prefix: '' });
    for (const r of diffResult.relationships.removed) {
      lines.push({ className: 'removed', text: `  ${r.source}.${r.sourceColumn} → ${r.target}.${r.targetColumn}`, prefix: '- ', onClick: () => navigateToTable(r.source) });
    }
    lines.push({ className: 'context', text: '', prefix: '' });
  }
  if (diffResult.relationships.modified.length > 0) {
    lines.push({ className: 'header', text: '# Relationships modified:', prefix: '' });
    for (const r of diffResult.relationships.modified) {
      lines.push({ className: 'modified', text: `  ${r.from.source}.${r.from.sourceColumn} → ${r.from.target}.${r.from.targetColumn}`, prefix: '~ ' });
      lines.push({ className: 'modified', text: `    to ${r.to.source}.${r.to.sourceColumn} → ${r.to.target}.${r.to.targetColumn}`, prefix: '  ' });
    }
    lines.push({ className: 'context', text: '', prefix: '' });
  }

  return lines;
}

// This will be replaced by the parent's onNavigateToTable
function navigateToTable(tableName, columnName) {
  onNavigateToTable?.(tableName, columnName);
}

function getDiffSummary(diffResult) {
  return {
    tablesAdded: diffResult.summary.tablesAdded,
    tablesRemoved: diffResult.summary.tablesRemoved,
    tablesModified: diffResult.summary.tablesModified,
    relationshipsAdded: diffResult.summary.relationshipsAdded,
    relationshipsRemoved: diffResult.summary.relationshipsRemoved,
    relationshipsModified: diffResult.summary.relationshipsModified,
  };
}
