/* PNG screenshot export; html-to-image is loaded on demand so it doesn't
   weigh on the initial bundle. (The PDF is drawn as vectors: pdfExport.js.) */
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
