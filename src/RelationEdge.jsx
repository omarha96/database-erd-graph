import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, Position, useInternalNode } from '@xyflow/react';
import { rowCenterY } from './model.js';
import { useHighlight } from './highlightStore.js';

const near = (a, b) => a && b && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

/* Orthogonal polyline with rounded corners through ELK's route points. */
function roundedPath(points, radius = 8) {
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [p0, p1, p2] = [points[i - 1], points[i], points[i + 1]];
    const r = Math.min(radius, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2);
    const a = { x: p1.x + (Math.sign(p0.x - p1.x) * r), y: p1.y + (Math.sign(p0.y - p1.y) * r) };
    const b = { x: p1.x + (Math.sign(p2.x - p1.x) * r), y: p1.y + (Math.sign(p2.y - p1.y) * r) };
    d += ` L ${a.x} ${a.y} Q ${p1.x} ${p1.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last.x} ${last.y}`;
}

/* Midpoint of the route's longest segment, for the hover label. */
function labelPoint(points) {
  let best = { len: -1, x: points[0].x, y: points[0].y };
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (len > best.len) best = { len, x: (points[i].x + points[i - 1].x) / 2, y: (points[i].y + points[i - 1].y) / 2 };
  }
  return [best.x, best.y];
}

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
  // Tables still where the last tidy layout put them: use ELK's route,
  // which keeps every line in its own lane. Otherwise route on the fly.
  const route = data.route;
  const useRoute = route && near(route.source, sPos) && near(route.target, tPos);
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

  const [path, labelX, labelY] = useRoute
    ? [roundedPath(route.points), ...labelPoint(route.points)]
    : getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, borderRadius: 10, offset: 24 });

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
