import { edgeGeometry } from './RelationEdge.jsx';
import { HEADER_HEIGHT, ROW_HEIGHT } from './model.js';

/* Vector PDF of the whole diagram: tables, lines and crow's-foot markers
   are drawn as PDF shapes and every name is real text, so the file stays
   sharp at any zoom and its text can be selected and searched. Uses the
   same geometry as the canvas (sizes from model.js, paths from
   edgeGeometry), with the current theme's colors. */
const PAD = 40;
const PT = 0.75; // jsPDF font sizes are in pt; the page is laid out in px

function cssColor(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}
// Blend hex color a over b by t (0..1), for the translucent touches.
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((c, i) => Math.round(c * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;
}

/* Parses the M/L/Q paths produced by edgeGeometry into jsPDF path ops. */
function toPdfPath(d, dx, dy) {
  const toks = d.match(/[MLQ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const ops = [];
  const pts = [];
  let cur = null;
  let i = 0;
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    const cmd = toks[i++].toUpperCase();
    if (cmd === 'M' || cmd === 'L') {
      cur = { x: num() + dx, y: num() + dy };
      ops.push({ op: cmd === 'M' ? 'm' : 'l', c: [cur.x, cur.y] });
      pts.push(cur);
    } else if (cmd === 'Q') {
      const q = { x: num() + dx, y: num() + dy };
      const end = { x: num() + dx, y: num() + dy };
      // Quadratic -> cubic Bézier.
      ops.push({ op: 'c', c: [
        cur.x + (2 / 3) * (q.x - cur.x), cur.y + (2 / 3) * (q.y - cur.y),
        end.x + (2 / 3) * (q.x - end.x), end.y + (2 / 3) * (q.y - end.y),
        end.x, end.y,
      ] });
      pts.push(q, end);
      cur = end;
    }
  }
  return { ops, pts };
}

function unit(from, to) {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
}

// Crow's foot ("many") at the referencing end: prongs meet the table.
function drawMany(pdf, tip, next) {
  const u = unit(tip, next);
  const n = { x: -u.y, y: u.x };
  const c = { x: tip.x + u.x * 12, y: tip.y + u.y * 12 };
  for (const k of [-6, 0, 6]) pdf.line(c.x, c.y, tip.x + n.x * k, tip.y + n.y * k);
}
// Two bars ("exactly one") at the referenced end.
function drawOne(pdf, tip, prev) {
  const u = unit(tip, prev);
  const n = { x: -u.y, y: u.x };
  for (const d of [4, 8]) {
    const b = { x: tip.x + u.x * d, y: tip.y + u.y * d };
    pdf.line(b.x + n.x * 6, b.y + n.y * 6, b.x - n.x * 6, b.y - n.y * 6);
  }
}

function fit(pdf, text, maxWidth) {
  if (pdf.getTextWidth(text) <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && pdf.getTextWidth(`${s}…`) > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

export async function exportDiagramVectorPdf(nodes, edges, filename) {
  const { jsPDF } = await import('jspdf');
  const visible = nodes.filter((n) => !n.hidden);
  if (!visible.length) throw new Error('No visible tables to export.');
  const byId = new Map(visible.map((n) => [n.id, n]));

  const minX = Math.min(...visible.map((n) => n.position.x));
  const minY = Math.min(...visible.map((n) => n.position.y));
  const maxX = Math.max(...visible.map((n) => n.position.x + n.width));
  const maxY = Math.max(...visible.map((n) => n.position.y + n.height));
  const width = Math.ceil(maxX - minX + PAD * 2);
  const height = Math.ceil(maxY - minY + PAD * 2);
  const dx = PAD - minX;
  const dy = PAD - minY;

  const colors = {
    page: cssColor('--fb-surface1', '#F8FAFC'),
    header: cssColor('--erd-header', '#5146B8'),
    headerText: cssColor('--erd-header-text', '#FFFFFF'),
    row: cssColor('--erd-row', '#FFFFFF'),
    rowAlt: cssColor('--erd-row-alt', '#F8FAFC'),
    text: cssColor('--erd-row-text', '#111827'),
    type: cssColor('--erd-type', '#64748B'),
    edge: cssColor('--erd-edge', '#94A3B8'),
    pk: cssColor('--erd-pk', '#B45309'),
    fk: cssColor('--erd-fk', '#4338CA'),
  };

  const pdf = new jsPDF({
    orientation: width >= height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
    hotfixes: ['px_scaling'],
    compress: true,
  });
  pdf.setProperties({ title: filename.replace(/\.pdf$/, ''), creator: 'ERD Viewer' });
  pdf.setFillColor(colors.page);
  pdf.rect(0, 0, width, height, 'F');

  /* Lines first, so tables sit on top of them. */
  pdf.setDrawColor(colors.edge);
  pdf.setLineWidth(1.4);
  pdf.setLineCap('round');
  pdf.setLineJoin('round');
  for (const e of edges) {
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    const { path } = edgeGeometry(
      { x: s.position.x, y: s.position.y, width: s.width },
      { x: t.position.x, y: t.position.y, width: t.width },
      e.data,
    );
    const { ops, pts } = toPdfPath(path, dx, dy);
    if (pts.length < 2) continue;
    pdf.path(ops).stroke();
    drawMany(pdf, pts[0], pts[1]);
    drawOne(pdf, pts[pts.length - 1], pts[pts.length - 2]);
  }

  /* Tables. */
  const border = mix(colors.header, colors.page, 0.55);
  for (const n of visible) {
    const { table } = n.data;
    const x = n.position.x + dx;
    const y = n.position.y + dy;
    const w = n.width;
    const h = n.height;

    pdf.setFillColor(colors.row);
    pdf.roundedRect(x, y, w, h, 8, 8, 'F');
    table.columns.forEach((_, i) => {
      if (i % 2 === 1) {
        pdf.setFillColor(colors.rowAlt);
        pdf.rect(x, y + HEADER_HEIGHT + i * ROW_HEIGHT, w, ROW_HEIGHT, 'F');
      }
    });
    // Header: rounded on top, square where it meets the rows.
    pdf.setFillColor(colors.header);
    pdf.roundedRect(x, y, w, HEADER_HEIGHT, 8, 8, 'F');
    pdf.rect(x, y + HEADER_HEIGHT - 8, w, 8, 'F');
    pdf.setDrawColor(border);
    pdf.setLineWidth(1);
    pdf.roundedRect(x, y, w, h, 8, 8, 'S');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13 * PT);
    pdf.setTextColor(colors.headerText);
    pdf.text(fit(pdf, table.name, w - 24), x + w / 2, y + HEADER_HEIGHT / 2, { align: 'center', baseline: 'middle' });

    table.columns.forEach((col, i) => {
      const cy = y + HEADER_HEIGHT + i * ROW_HEIGHT + ROW_HEIGHT / 2;
      // Key badges, right-aligned.
      let right = x + w - 10;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9.5 * PT);
      for (const [on, label, color] of [[col.fk, 'FK', colors.fk], [col.pk, 'PK', colors.pk]]) {
        if (!on) continue;
        const bw = pdf.getTextWidth(label) + 8;
        right -= bw;
        pdf.setFillColor(mix(color, i % 2 ? colors.rowAlt : colors.row, 0.14));
        pdf.roundedRect(right, cy - 7, bw, 14, 4, 4, 'F');
        pdf.setTextColor(color);
        pdf.text(label, right + bw / 2, cy, { align: 'center', baseline: 'middle' });
        right -= 3;
      }
      pdf.setFont('courier', 'normal');
      pdf.setFontSize(11 * PT);
      pdf.setTextColor(colors.type);
      const typeText = fit(pdf, col.type, w * 0.4);
      pdf.text(typeText, x + 10, cy, { baseline: 'middle' });
      const nameX = x + 10 + pdf.getTextWidth(typeText) + 10;
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12.5 * PT);
      pdf.setTextColor(colors.text);
      pdf.text(fit(pdf, col.name, right - 6 - nameX), nameX, cy, { baseline: 'middle' });
    });
  }

  pdf.save(filename);
}
