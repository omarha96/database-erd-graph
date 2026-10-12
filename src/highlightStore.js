import { useSyncExternalStore } from 'react';

/* Tiny external store for transient highlight state (the table/column
   flashed after FK navigation, and the table under the pointer). Each
   table node and edge subscribes with a selector, so a flash or hover
   only re-renders the components whose answer actually changed instead
   of every table on the canvas. */
let state = { flash: null, hovered: null }; // flash: { table, column } | null
const listeners = new Set();

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

let flashTimer;
export function flashTable(table, column = null) {
  clearTimeout(flashTimer);
  set({ flash: { table, column } });
  flashTimer = setTimeout(() => set({ flash: null }), 1400);
}

export function setHoveredTable(table) {
  if (state.hovered !== table) set({ hovered: table });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export function useHighlight(selector) {
  return useSyncExternalStore(subscribe, () => selector(state));
}
