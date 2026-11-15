import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1100 },
  server: {
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/tmp/**', '**/test-results/**', '**/playwright-report/**'] },
  },
});
