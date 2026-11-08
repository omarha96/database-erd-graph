import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * MigrationPanel - Side panel showing migration history with navigation and diff selection
 */
export default function MigrationPanel({
  migrations = [],
  currentIndex = -1,
  onLoadMigration,
  onSelectForDiff,
  onNextMigration,
  onPrevMigration,
  onCompare,
  selectedForDiff = new Set(),
  maxDiffSelection = 2,
  onClose,
  isOpen = false,
}) {
  const panelRef = useRef(null);
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // Handle keyboard navigation when panel is focused
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onPrevMigration?.();
      } else if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onNextMigration?.();
      } else if (e.key === 'Enter' && hoveredIndex !== null) {
        onLoadMigration?.(hoveredIndex);
      } else if (e.key === ' ' && hoveredIndex !== null) {
        e.preventDefault();
        onSelectForDiff?.(hoveredIndex);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hoveredIndex, onLoadMigration, onSelectForDiff, onNextMigration, onPrevMigration, onClose]);

  // Focus panel when opened
  useEffect(() => {
    if (isOpen && panelRef.current) {
      panelRef.current.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const canCompare = selectedForDiff.size === maxDiffSelection;

  return (
    <div
      id="migration-panel"
      className={isOpen ? 'open' : 'closed'}
      role="region"
      aria-label="Migration history"
      tabIndex={-1}
      ref={panelRef}
    >
      {/* Header */}
      <div className="migration-panel-header">
        <h2 className="migration-panel-title">Migration History</h2>
        <button
          className="migration-panel-close"
          onClick={onClose}
          aria-label="Close migration panel"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <div className="migration-panel-nav">
        <button
          className="migration-nav-btn"
          onClick={onPrevMigration}
          disabled={currentIndex <= 0}
          aria-label="Previous migration"
          title="Previous migration (Alt+Up)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span>Previous</span>
        </button>
        <button
          className="migration-nav-btn"
          onClick={onNextMigration}
          disabled={currentIndex >= migrations.length - 1 || currentIndex === -1}
          aria-label="Next migration"
          title="Next migration (Alt+Down)"
        >
          <span>Next</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Migration List */}
      <div className="migration-list" role="list" aria-label="Migrations">
        {migrations.length === 0 ? (
          <div className="migration-empty">
            No migrations loaded. Import a migration history JSON file to get started.
          </div>
        ) : (
          migrations.map((migration, index) => (
            <MigrationItem
              key={migration.id}
              migration={migration}
              index={index}
              isCurrent={index === currentIndex}
              isSelected={selectedForDiff.has(index)}
              isHovered={hoveredIndex === index}
              maxDiffSelection={maxDiffSelection}
              selectedCount={selectedForDiff.size}
              onClick={() => { onLoadMigration?.(index); setHoveredIndex(null); }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              onSelectDiff={() => onSelectForDiff?.(index)}
            />
          ))
        )}
      </div>

      {/* Diff Action Bar */}
      <div className="migration-diff-bar">
        <span className="diff-selected-count">
          {selectedForDiff.size}/{maxDiffSelection} selected for diff
        </span>
        <button
          className="compare-btn"
          onClick={onCompare}
          disabled={!canCompare}
          aria-label="Compare selected migrations"
        >
          Compare
        </button>
      </div>
    </div>
  );
}

function MigrationItem({
  migration,
  index,
  isCurrent,
  isSelected,
  isHovered,
  maxDiffSelection,
  selectedCount,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onSelectDiff,
}) {
  const timeAgo = formatTimeAgo(migration.timestamp);
  const canSelect = !isSelected || selectedCount < maxDiffSelection;

  return (
    <div
      className={`migration-item ${isCurrent ? 'current' : ''}`}
      role="listitem"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ cursor: 'pointer' }}
    >
      <div className="migration-item-header">
        <span className="migration-id">{migration.id}</span>
        <span className="migration-time">{timeAgo}</span>
        <span className="migration-name" title={migration.name}>{migration.name}</span>
        {isCurrent && <span className="current-badge" aria-label="Current migration">● Current</span>}
      </div>
      <div className="migration-item-actions">
        <input
          type="checkbox"
          className="diff-checkbox"
          checked={isSelected}
          onChange={onSelectDiff}
          onClick={(e) => e.stopPropagation()}
          disabled={!canSelect}
          aria-label={`Select for diff (${selectedCount}/${maxDiffSelection})`}
          title={isSelected ? 'Deselect from diff' : selectedCount >= maxDiffSelection ? `Max ${maxDiffSelection} selections` : 'Select for diff'}
        />
        <span className="diff-label">Diff</span>
        <button
          className={`load-migration-btn ${isCurrent ? 'current' : ''}`}
          onClick={(e) => { e.stopPropagation(); onClick(); }}
          disabled={isCurrent}
          aria-label={isCurrent ? 'Already loaded' : `Load migration ${migration.id}`}
        >
          {isCurrent ? 'Loaded' : 'Load'}
        </button>
      </div>
    </div>
  );
}

// Simple time formatting without date-fns dependency
function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Unknown time';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${diffYears}y ago`;
}
