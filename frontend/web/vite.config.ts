import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

// Builds into ../public, which frontend/server.py serves. The dev server
// proxies API calls to the same agent the production proxy uses.
const AGENT = process.env.AGENT_URL ?? 'https://sq7-stabilization-navigator-530357188502.us-central1.run.app';

export default defineConfig({
  plugins: [react()],
  build: {outDir: '../public', emptyOutDir: true},
  server: {
    proxy: {
      '/run': {target: AGENT, changeOrigin: true},
      '/apps': {target: AGENT, changeOrigin: true},
    },
  },
});
