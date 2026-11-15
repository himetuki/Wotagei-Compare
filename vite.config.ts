import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as { version?: string };

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '1.0.0'),
  },
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
      interval: 100,
    },
  },
  build: {
    target: 'es2018',
  },
});
