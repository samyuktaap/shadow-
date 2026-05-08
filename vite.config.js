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

      // Copy background script
      const scriptsDir = 'dist/src/scripts';
      if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true });
      fs.copyFileSync('src/scripts/background.js', `${scriptsDir}/background.js`);
      fs.copyFileSync('src/scripts/content.js', `${scriptsDir}/content.js`);
      fs.copyFileSync('src/scripts/fingerprinter-shield.js', `${scriptsDir}/fingerprinter-shield.js`);

      console.log('[DataShadow] Extension files copied to dist/');
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
      },
    },
  },
});
