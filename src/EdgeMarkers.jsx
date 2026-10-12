/* Crow's-foot notation markers, drawn as if sitting at the end of a line
   that runs into the table along +x; `auto-start-reverse` flips them for
   the many side, which sits at the start of the path. */
const VARIANTS = [
  { suffix: '', color: 'var(--erd-edge)' },
  { suffix: '-active', color: 'var(--erd-accent)' },
];

export default function EdgeMarkers() {
  return (
    <svg className="erd-marker-defs" aria-hidden="true">
      <defs>
        {VARIANTS.map(({ suffix, color }) => (
          <g key={suffix}>
            <marker id={`erd-many${suffix}`} viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14"
              markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M1 7 L13 1 M1 7 L13 7 M1 7 L13 13" fill="none" stroke={color} strokeWidth="1.5" />
            </marker>
            <marker id={`erd-one${suffix}`} viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14"
              markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path d="M5 1 L5 13 M9 1 L9 13" fill="none" stroke={color} strokeWidth="1.5" />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  );
}
