/* eslint-disable import/no-default-export */
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    files: ['eslint.config.js'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['app/**/*'], // Next.js App Router requires default exports
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
      // Prevent direct process.env usage - use @/config/env instead
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
          message:
            'Direct process.env access is forbidden. Import from "@shared/config/env" instead: `import { clientEnv, serverEnv } from "@shared/config/env"`',
        },
      ],
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
      ...js.configs.recommended.rules,
      ...typescriptEslint.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'import/no-default-export': 'off', // Next.js requires default exports
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
      // Prevent direct process.env usage - use @/config/env instead
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.object.name="process"][object.property.name="env"]',
          message:
            'Direct process.env access is forbidden. Import from "@shared/config/env" instead: `import { clientEnv, serverEnv } from "@shared/config/env"`',
        },
      ],
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
  // Test files - relax process.env restriction since tests can't use @/config/env
  {
    files: ['tests/**/*.ts', 'tests/**/*.tsx', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      'react-hooks/rules-of-hooks': 'off', // Playwright fixtures use 'use' function that triggers this
    },
  },
];
