import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build can be dropped on any host or sub-path
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 2048,
    chunkSizeWarningLimit: 900,
  },
  server: { host: true, port: 5173 },
});
