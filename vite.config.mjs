import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` runs this alongside server.js (port 4440), proxying the
// Postgres-backed /api routes so the frontend gets hot reload.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.PORT || 4440}` },
  },
});
