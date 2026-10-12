import { createContext } from 'react';

// Stable callbacks shared with every table node (see App.jsx).
export const ErdActions = createContext({
  goToTable: () => {},
  showReferences: () => {},
});
