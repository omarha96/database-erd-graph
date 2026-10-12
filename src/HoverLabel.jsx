import { useHighlight } from './highlightStore.js';

/* Fixed label in the corner of the canvas naming the table under the
   pointer — handy when zoomed out too far to read table headers. */
export default function HoverLabel({ stats }) {
  const hovered = useHighlight((s) => s.hovered);
  const info = hovered && stats.get(hovered);
  if (!info) return null;
  return (
    <div id="hover-label" aria-live="polite">
      <span className="hover-name">{hovered}</span>
      <span className="hover-meta">
        {info.columns} column{info.columns !== 1 ? 's' : ''} · {info.relations} relation{info.relations !== 1 ? 's' : ''}
      </span>
    </div>
  );
}
