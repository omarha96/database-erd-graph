import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` runs this alongside server.js (port 4440), proxying the
// Postgres-backed /api routes so the frontend gets hot reload.
// `--mode desktop` builds the static bundle Pake packages (relative asset
// paths, API on a separate server; see .env.desktop).
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === 'desktop' ? './' : '/',
  build: { outDir: mode === 'desktop' ? 'dist-desktop' : 'dist' },
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.PORT || 4440}` },
  },
}));
