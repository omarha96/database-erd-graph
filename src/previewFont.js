/* One shared font size (in canvas units) for the Ctrl names preview, so
   every table name renders at the same size:

   - aim for TARGET_SCREEN_PX on screen at the current zoom,
   - but never larger than what lets the longest name fit its table in at
     most MAX_LINES lines, inside the padding.

   Text widths are measured once per schema with a canvas at 100px. */
export const PREVIEW_PADDING = 14;
export const PREVIEW_LINE_HEIGHT = 1.15;
const PREVIEW_FONT = "600 100px 'Space Grotesk Variable', system-ui, sans-serif";
const TARGET_SCREEN_PX = 14;
const MAX_LINES = 2;
// Breaking only at underscores never fills lines perfectly.
const WRAP_EFFICIENCY = 0.85;

let ctx;
function textWidthAt100(text) {
  ctx ||= document.createElement('canvas').getContext('2d');
  ctx.font = PREVIEW_FONT;
  return ctx.measureText(text).width;
}

/* Largest font size (canvas px) at which every table's name fits. */
export function maxFittingFontSize(nodes) {
  let max = Infinity;
  for (const n of nodes) {
    if (n.hidden) continue;
    const name = n.data.table.name;
    const innerW = n.width - PREVIEW_PADDING * 2;
    const innerH = n.height - PREVIEW_PADDING * 2;
    const w100 = textWidthAt100(name);
    // A name with no underscores can't wrap, so it must fit on one line.
    const lines = name.includes('_') ? MAX_LINES : 1;
    const byWidth = (innerW * lines * (lines > 1 ? WRAP_EFFICIENCY : 1) * 100) / w100;
    // The longest underscore-free segment must fit on a line by itself.
    const longestSegment = Math.max(...name.split('_').map((s, i, a) => textWidthAt100(s + (i < a.length - 1 ? '_' : ''))));
    const bySegment = (innerW * 100) / longestSegment;
    const byHeight = innerH / (lines * PREVIEW_LINE_HEIGHT);
    max = Math.min(max, byWidth, bySegment, byHeight);
  }
  return Number.isFinite(max) ? max : 16;
}

export function previewFontSize(zoom, fitMax) {
  return Math.round(Math.min(TARGET_SCREEN_PX / zoom, fitMax) * 4) / 4;
}

// Measurements are only right once the web font has loaded.
export const previewFontReady = document.fonts.load(PREVIEW_FONT.replace('100px', '16px'));
