import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'src/pages/dashboard.html'),
        pro: resolve(__dirname, 'src/pages/pro.html'),
        onboard: resolve(__dirname, 'src/pages/onboard.html'),
        report: resolve(__dirname, 'src/pages/report.html'),
        popup: resolve(__dirname, 'src/pages/popup.html'),
      },
    },
  },
});
