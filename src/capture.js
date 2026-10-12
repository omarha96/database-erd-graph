import { getNodesBounds, getViewportForBounds } from '@xyflow/react';

/* Image/PDF export. html-to-image and jsPDF are loaded on demand so they
   don't weigh on the initial bundle. */
const MAX_SIDE_PX = 8000; // keep canvases within browser limits
const PAD = 40;

const background = () => getComputedStyle(document.documentElement).getPropertyValue('--fb-surface1').trim() || '#fff';
// Leave chrome (minimap, banner, hover label) out of the picture.
const keep = (node) => !(node.classList && (
  node.classList.contains('react-flow__minimap')
  || node.classList.contains('react-flow__panel')
));

function save(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

/* PNG of exactly what is visible in the canvas right now. */
export async function exportViewPng(flowEl, filename) {
  const { toPng } = await import('html-to-image');
  const dataUrl = await toPng(flowEl, { backgroundColor: background(), pixelRatio: 2, filter: keep });
  save(dataUrl, filename);
}

/* PDF of the whole diagram (every visible table), on one page sized to fit. */
export async function exportDiagramPdf(viewportEl, nodes, filename) {
  const [{ toPng }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  const bounds = getNodesBounds(nodes.filter((n) => !n.hidden));
  const width = Math.ceil(bounds.width + PAD * 2);
  const height = Math.ceil(bounds.height + PAD * 2);
  const vp = getViewportForBounds(bounds, width, height, 1, 1, 0);
  const pixelRatio = Math.max(0.5, Math.min(2, MAX_SIDE_PX / Math.max(width, height)));
  const dataUrl = await toPng(viewportEl, {
    backgroundColor: background(),
    width,
    height,
    pixelRatio,
    style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
  });
  const pdf = new jsPDF({ orientation: width >= height ? 'landscape' : 'portrait', unit: 'px', format: [width, height], hotfixes: ['px_scaling'] });
  pdf.addImage(dataUrl, 'PNG', 0, 0, width, height, undefined, 'FAST');
  pdf.save(filename);
}
