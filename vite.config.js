import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import path from 'path';

// Plugin to copy extension files to dist after build
function copyExtensionFiles() {
  return {
    name: 'copy-extension-files',
    closeBundle() {
      // Copy manifest.json
      fs.copyFileSync('manifest.json', 'dist/manifest.json');

      // Copy background scripts
      const scriptsDir = 'dist/src/scripts';
      if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
      fs.copyFileSync('src/scripts/background.js', `${scriptsDir}/background.js`);
      fs.copyFileSync('src/scripts/content.js', `${scriptsDir}/content.js`);
      fs.copyFileSync('src/scripts/fingerprinter-shield.js', `${scriptsDir}/fingerprinter-shield.js`);
      fs.copyFileSync('src/scripts/telemetry.js', `${scriptsDir}/telemetry.js`);

      // Copy page JS files that aren't bundled
      const pagesDir = 'dist/src/pages';
      if (fs.existsSync('src/pages/whatif.js')) {
        fs.copyFileSync('src/pages/whatif.js', `${pagesDir}/whatif.js`);
      }

      // Copy Leaflet library (CRITICAL for map)
      const libDir = 'dist/src/lib';
      if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
      fs.copyFileSync('src/lib/leaflet.js', `${libDir}/leaflet.js`);
      fs.copyFileSync('src/lib/leaflet.css', `${libDir}/leaflet.css`);

      console.log('[DataShadow] Extension files and libraries copied to dist/');
    }
  };
}

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  plugins: [copyExtensionFiles()],
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
        whatif: resolve(__dirname, 'src/pages/whatif.html'),
      },
    },
  },
});
