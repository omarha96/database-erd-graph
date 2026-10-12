import { memo, useContext } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useHighlight } from './highlightStore.js';
import { ErdActions } from './ErdActions.js';

/* One database table. Edges are drawn by RelationEdge, which anchors to
   individual rows using the fixed row height from model.js, so the two
   handles here only exist to satisfy React Flow and are invisible. */
function TableNode({ data, selected }) {
  const { table, width, referencedColumns } = data;
  const actions = useContext(ErdActions);
  const flash = useHighlight((s) => (s.flash?.table === table.name ? s.flash.column ?? '' : null));

  return (
    <div
      className={`erd-table${selected ? ' selected' : ''}${flash !== null ? ' flash' : ''}`}
      style={{ width }}
    >
      <Handle type="target" position={Position.Left} className="erd-handle" isConnectable={false} />
      <Handle type="source" position={Position.Right} className="erd-handle" isConnectable={false} />
      <div className="erd-table-header" title={table.name}>{table.name}</div>
      {table.columns.map((col) => {
        const fkLink = !!col.ref;
        const pkLink = col.pk && referencedColumns.has(col.name);
        const onActivate = fkLink
          ? (e) => { e.stopPropagation(); actions.goToTable(col.ref.table, col.ref.column); }
          : pkLink
            ? (e) => { e.stopPropagation(); actions.showReferences(e.currentTarget, table.name, col.name); }
            : undefined;
        return (
          <div
            key={col.name}
            className={`erd-row${flash === col.name ? ' flash' : ''}${fkLink ? ' fk-link' : ''}${pkLink ? ' pk-link' : ''}`}
            onClick={onActivate}
            onKeyDown={onActivate && ((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e); } })}
            tabIndex={onActivate ? 0 : undefined}
            role={onActivate ? 'button' : undefined}
            title={fkLink ? `${col.name} → ${col.ref.table}.${col.ref.column}` : pkLink ? `Show tables referencing ${table.name}.${col.name}` : undefined}
          >
            <span className="erd-col-type">{col.type}</span>
            <span className="erd-col-name">{col.name}</span>
            <span className="erd-col-keys">
              {col.pk && <span className="key pk">PK</span>}
              {col.fk && <span className="key fk">FK</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default memo(TableNode);
