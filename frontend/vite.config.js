import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Reads the API target from an env var so it can be changed at deploy time
// without touching code (12-factor config).
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:5000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
});
