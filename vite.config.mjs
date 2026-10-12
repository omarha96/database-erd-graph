import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/* Guard against credentials ending up in a published build:
   only VITE_* variables are exposed to the client (Vite's default),
   and a VITE_* variable whose name looks secret fails the build. */
const SECRET_NAME = /PASS|SECRET|TOKEN|KEY|CREDENTIAL|DATABASE_URL/i;

function noSecretsInBundle(env) {
  return {
    name: 'no-secrets-in-bundle',
    config() {
      const leaky = Object.keys(env).filter((k) => k.startsWith('VITE_') && SECRET_NAME.test(k));
      if (leaky.length) throw new Error(`Refusing to build: ${leaky.join(', ')} would be compiled into the app. Don't put secrets in VITE_* variables.`);
    },
  };
}

// `npm run dev` runs this alongside server.js (port 4440), proxying the
// Postgres-backed /api routes so the frontend gets hot reload.
// `--mode desktop` builds the static bundle Pake packages (relative asset
// paths, API on a separate server; see .env.desktop).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), noSecretsInBundle(env)],
    envPrefix: 'VITE_',
    base: mode === 'desktop' ? './' : '/',
    build: { outDir: mode === 'desktop' ? 'dist-desktop' : 'dist' },
    server: {
      port: 5173,
      proxy: { '/api': `http://localhost:${process.env.PORT || 4440}` },
    },
  };
});
