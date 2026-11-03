import { defineConfig } from 'vitest/config';
import path from 'node:path';

const webAlias = { '@': path.resolve(import.meta.dirname, 'apps/web') };

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'packages',
          include: ['packages/*/test/**/*.test.ts'],
          exclude: ['**/*.dom.test.ts', '**/node_modules/**'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'overlay-dom',
          include: ['packages/*/test/**/*.dom.test.ts'],
          environment: 'jsdom',
        },
      },
      {
        resolve: { alias: webAlias },
        test: {
          name: 'web',
          include: ['apps/web/test/**/*.test.ts'],
          exclude: ['apps/web/test/**/*.db.test.ts', 'apps/web/test/live/**'],
          environment: 'node',
        },
      },
      {
        resolve: { alias: webAlias },
        test: {
          name: 'db',
          include: ['apps/web/test/**/*.db.test.ts'],
          environment: 'node',
          fileParallelism: false,
          testTimeout: 30000,
        },
      },
      { test: { name: 'proxy', include: ['apps/proxy/test/**/*.test.ts'], environment: 'node' } },
      {
        resolve: { alias: webAlias },
        test: {
          name: 'live-ai',
          include: ['apps/web/test/live/**/*.test.ts'],
          testTimeout: 180000,
        },
      },
    ],
  },
});
