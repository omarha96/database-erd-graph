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
const MAX_LINES = 3;
// Word wrapping never fills lines perfectly.
const WRAP_EFFICIENCY = 0.8;

// snake_case table names read better as words in the map preview.
export const displayName = (name) => name.replace(/_+/g, ' ').trim() || name;

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
    const name = displayName(n.data.table.name);
    const innerW = n.width - PREVIEW_PADDING * 2;
    const innerH = n.height - PREVIEW_PADDING * 2;
    const w100 = textWidthAt100(name);
    // A single word can't wrap, so it must fit on one line.
    const words = name.split(' ');
    const lines = Math.min(MAX_LINES, words.length);
    const byWidth = (innerW * lines * (lines > 1 ? WRAP_EFFICIENCY : 1) * 100) / w100;
    // The longest word must fit on a line by itself.
    const longestSegment = Math.max(...words.map(textWidthAt100));
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
