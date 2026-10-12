import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/* Guards against credentials ending up in a published build:
   1. only VITE_* variables are exposed to the client (Vite's default),
      and a VITE_* variable whose name looks secret fails the build;
   2. after bundling, every emitted file is scanned for the values of the
      server-side credential variables (PGPASSWORD, DATABASE_URL, ...). */
const SECRET_NAME = /PASS|SECRET|TOKEN|KEY|CREDENTIAL|DATABASE_URL/i;
const SERVER_SECRETS = ['PGPASSWORD', 'DATABASE_URL'];

function noSecretsInBundle(env) {
  const values = SERVER_SECRETS
    .map((k) => (Object.hasOwn(env, k) ? env[k] : process.env[k]))
    .filter((v) => v && v.length >= 4);
  return {
    name: 'no-secrets-in-bundle',
    config() {
      const leaky = Object.keys(env).filter((k) => k.startsWith('VITE_') && SECRET_NAME.test(k));
      if (leaky.length) throw new Error(`Refusing to build: ${leaky.join(', ')} would be compiled into the app. Don't put secrets in VITE_* variables.`);
    },
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        const text = file.type === 'chunk' ? file.code : typeof file.source === 'string' ? file.source : '';
        if (values.some((v) => text.includes(v))) {
          this.error(`Refusing to build: ${file.fileName} contains a database credential from the environment.`);
        }
      }
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
