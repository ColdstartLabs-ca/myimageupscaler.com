import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.tsx'],
    include: ['client/**/*.{test,spec}.{ts,tsx}', 'server/**/*.{test,spec}.{ts,tsx}', 'shared/**/*.{test,spec}.{ts,tsx}', 'tests/unit/**/*.unit.spec.{ts,tsx}'],
    exclude: ['node_modules'], // Playwright tests are in tests/api, tests/e2e, tests/integration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '**/*.d.ts', '**/*.config.*', '**/types/*'],
    },
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './client'),
      '@server': path.resolve(__dirname, './server'),
      '@shared': path.resolve(__dirname, './shared'),
      '@app': path.resolve(__dirname, './app'),
    },
  },
});
