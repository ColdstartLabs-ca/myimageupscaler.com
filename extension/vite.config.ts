import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@extension': path.resolve(__dirname, './src'),
      '@extension/shared': path.resolve(__dirname, './src/shared'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: 'src/popup/index.html',
        options: 'src/options/index.html',
        background: 'src/background/index.ts',
      },
    },
  },
  define: {
    __EXTENSION_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
});
