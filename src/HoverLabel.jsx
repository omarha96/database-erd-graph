import { useRef } from 'react';
import { useHighlight } from './highlightStore.js';

/* Fixed label in the corner of the canvas naming the table under the
   pointer — handy when zoomed out too far to read table headers. It stays
   mounted and fades in/out; while fading out it keeps showing the last
   table instead of going blank. */
export default function HoverLabel({ stats }) {
  const hovered = useHighlight((s) => s.hovered);
  const info = hovered && stats.get(hovered);
  const last = useRef(null);
  if (info) last.current = { name: hovered, info };
  const shown = last.current;
  return (
    <div id="hover-label" className={info ? 'visible' : undefined} aria-live="polite" aria-hidden={!info}>
      {shown && (
        <>
          <span className="hover-name">{shown.name}</span>
          <span className="hover-meta">
            {shown.info.columns} column{shown.info.columns !== 1 ? 's' : ''} · {shown.info.relations} relation{shown.info.relations !== 1 ? 's' : ''}
          </span>
        </>
      )}
    </div>
  );
}
