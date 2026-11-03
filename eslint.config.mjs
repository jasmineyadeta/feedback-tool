import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.wrangler/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'apps/proxy/fixtures/**',
      '**/next-env.d.ts',
      'supabase/**',
      'docs/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
    },
  },
  {
    files: ['apps/web/**/*.tsx', 'apps/web/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Server modules must never be imported from client components (CLAUDE.md conventions).
    files: ['apps/web/components/**', 'apps/web/lib/client/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['@/lib/server/*', '**/lib/server/**'] }],
    },
  },
  {
    files: ['scripts/**', 'e2e/**', '**/test/**', '**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
);
