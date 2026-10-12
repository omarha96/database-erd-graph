import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, useInternalNode } from '@xyflow/react';
import { rowCenterY } from './model.js';
import { useHighlight } from './highlightStore.js';

/* A foreign key: from the referencing column (many side, crow's foot) to
   the referenced column (one side). It picks whichever sides of the two
   tables face each other, so edges stay sensible while tables are dragged. */
function RelationEdge({ id, source, target, data }) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const hovered = useHighlight((st) => st.hovered === source || st.hovered === target);
  if (!s || !t) return null;

  const sPos = s.internals.positionAbsolute;
  const tPos = t.internals.positionAbsolute;
  const sW = s.measured?.width ?? s.width ?? 0;
  const tW = t.measured?.width ?? t.width ?? 0;
  const sCenter = sPos.x + sW / 2;
  const tCenter = tPos.x + tW / 2;

  let sourcePosition, targetPosition;
  if (sPos.x > tPos.x + tW + 30) {
    sourcePosition = Position.Left; targetPosition = Position.Right;
  } else if (tPos.x > sPos.x + sW + 30) {
    sourcePosition = Position.Right; targetPosition = Position.Left;
  } else {
    // Horizontally overlapping tables: loop around the side they lean towards.
    sourcePosition = targetPosition = sCenter <= tCenter ? Position.Left : Position.Right;
  }

  const sourceX = sourcePosition === Position.Left ? sPos.x : sPos.x + sW;
  const targetX = targetPosition === Position.Left ? tPos.x : tPos.x + tW;
  const sourceY = sPos.y + rowCenterY(data.sourceRow);
  const targetY = tPos.y + rowCenterY(data.targetRow);

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 10, offset: 24,
  });

  const active = hovered || s.selected || t.selected;
  const suffix = active ? '-active' : '';
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={`erd-edge${active ? ' active' : ''}`}
        markerStart={`url(#erd-many${suffix})`}
        markerEnd={`url(#erd-one${suffix})`}
        interactionWidth={12}
      />
      {active && (
        <EdgeLabelRenderer>
          <div className="erd-edge-label" style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(RelationEdge);
