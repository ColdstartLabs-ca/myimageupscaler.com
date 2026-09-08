import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      BASE_URL: 'http://localhost:3000',
      ENV: 'test',
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
    },
    include: ['services/upscale-executor/**/*.spec.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@server': `${root}server`,
      '@shared': `${root}shared`,
      '@client': `${root}client`,
      '@lib': `${root}lib`,
      '@': root,
    },
  },
});
