/* eslint-disable import/no-default-export */
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  // Global ignores must be in their own object with only ignores property
  {
    ignores: [
      '.next/**',
      '.next-test-*/**', // Parallel test instance build directories
      '.open-next/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.turbo/**',
      '.wrangler/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'next.config.js', // Next.js config file
      'open-next.config.ts', // OpenNext config file
    ],
  },
  {
    files: ['eslint.config.js'],
    rules: {
      'import/no-default-export': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      import: importPlugin,
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        JSX: true,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Prevent inline require/import - must be at module top level
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Inline require() is forbidden. Use static imports at the top of the file.',
        },
        {
          selector: 'ImportExpression',
          message: 'Dynamic import() is forbidden. Use static imports at the top of the file.',
        },
        {
          selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
          message:
            'Direct process.env access is forbidden. Import from "@shared/config/env" instead: `import { clientEnv, serverEnv } from "@shared/config/env"`',
        },
      ],
      ...js.configs.recommended.rules,
      ...typescriptEslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'interface',
          format: ['PascalCase'],
          prefix: ['I'],
        },
      ],
      'import/no-default-export': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+
      'react/jsx-uses-react': 'off', // Not needed with React 17+
    },
  },
  {
    files: ['app/**/*'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      '@typescript-eslint': typescriptEslint,
    },
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        JSX: true,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // Prevent inline require/import - must be at module top level
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Inline require() is forbidden. Use static imports at the top of the file.',
        },
        {
          selector: 'ImportExpression',
          message: 'Dynamic import() is forbidden. Use static imports at the top of the file.',
        },
        {
          selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
          message:
            'Direct process.env access is forbidden. Import from "@shared/config/env" instead: `import { clientEnv, serverEnv } from "@shared/config/env"`',
        },
      ],
      ...js.configs.recommended.rules,
      ...typescriptEslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'import/no-default-export': 'off', // Next.js requires default exports
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
  },
  // OVERRIDES - These MUST come after main config to take precedence
  // Allow process.env in specific files where it's necessary
  {
    files: [
      'shared/config/env.ts', // Centralized env config
      'next.config.js', // Next.js config (runs at build time)
      'playwright.config.ts', // Test config
    ],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  // Client files - allow dynamic imports for code splitting
  {
    files: ['client/**/*.ts', 'client/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Inline require() is forbidden. Use static imports at the top of the file.',
        },
        {
          selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
          message:
            'Direct process.env access is forbidden. Import from "@shared/config/env" instead: `import { clientEnv, serverEnv } from "@shared/config/env"`',
        },
        // Note: Dynamic import() is allowed in client code for code splitting
      ],
    },
  },
  // i18n and data loader files - allow dynamic imports for locale/data file loading
  {
    files: ['i18n.config.ts', 'lib/seo/data-loader.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="require"]',
          message: 'Inline require() is forbidden. Use static imports at the top of the file.',
        },
        {
          selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
          message:
            'Direct process.env access is forbidden. Import from "@shared/config/env" instead: `import { clientEnv, serverEnv } from "@shared/config/env"`',
        },
        // Note: Dynamic import() is allowed for locale/data file loading
      ],
    },
  },
  // Test files - relax process.env restriction since tests can't use @/config/env
  {
    files: [
      'tests/**/*.ts',
      'tests/**/*.tsx',
      '**/*.spec.ts',
      '**/*.test.ts',
      '**/vitest.config.ts',
      '**/playwright.config.ts',
    ],
    rules: {
      'no-restricted-syntax': 'off',
      'react-hooks/rules-of-hooks': 'off', // Playwright fixtures use 'use' function that triggers this
      '@typescript-eslint/no-explicit-any': 'warn', // Allow 'any' in tests for mocking
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ], // Allow unused vars like fixture params and underscore-prefixed variables
      'import/no-default-export': 'off', // Test configs often need default exports
      '@typescript-eslint/explicit-module-boundary-types': 'off', // Not needed for test functions
      '@typescript-eslint/no-require-imports': 'off', // Some tests use require() for dynamic imports
      'no-undef': 'warn', // Workers tests may have globals like ScheduledEvent
      'no-empty-pattern': 'off', // Test fixtures may have empty destructuring
      '@typescript-eslint/no-empty-function': 'off', // Empty functions are fine in test mocks
    },
  },
  // Scripts - relax TypeScript rules since they're often simple utility scripts
  {
    files: ['scripts/**/*.js', 'scripts/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-restricted-syntax': 'off',
      'import/no-default-export': 'off',
    },
  },
  // Repository files - allow 'any' for TypeScript generic workarounds with Supabase types
  {
    files: ['shared/repositories/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Allow 'any' for Supabase type constraints
    },
  },
];
