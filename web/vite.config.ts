import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Public base path, set per host: "/" locally and at a root host,
  // "/transcriber-web/" for the GitHub Pages deploy (VITE_BASE env at build time).
  base: process.env.VITE_BASE || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
  build: { outDir: 'dist' },
});
