import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        // API_PROXY_TARGET permite apuntar a otro backend (lo usan los E2E para no chocar con `pnpm dev`).
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000',
        changeOrigin: false,
      },
    },
  },
});
