import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import jsdoc from 'eslint-plugin-jsdoc';
import prettierConfig from 'eslint-config-prettier';
import unicorn from 'eslint-plugin-unicorn';
import n from 'eslint-plugin-n';
import promise from 'eslint-plugin-promise';
import importPlugin from 'eslint-plugin-import';

export default [
  eslint.configs.recommended,

  // Modern JavaScript/Node.js best practices
  unicorn.configs['flat/recommended'],
  n.configs['flat/recommended-module'],
  promise.configs['flat/recommended'],
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,

  // Customize aggressive rules
  {
    rules: {
      // Unicorn: Only downgrade truly problematic rules per Issue #354
      'unicorn/no-array-reduce': 'warn',  // Reduce is sometimes clearest
      'unicorn/prefer-top-level-await': 'warn',  // Not always possible
      'unicorn/no-null': 'off',  // External APIs like prompts use null
      'unicorn/prevent-abbreviations': ['error', {
        replacements: {
          i: false,  // "i" in i-config.ts means "interface" not "index"
        }
      }],

      // Node: Target Node 24+
      'n/no-unsupported-features/node-builtins': ['error', {
        version: '>=24.0.0'
      }],

      // Import: Consistent ordering
      'import/order': ['error', {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        'newlines-between': 'never',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }],
      'import/no-unresolved': 'off',  // TypeScript handles this
    }
  },

  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        // Node.js runtime globals and timer functions
        NodeJS: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Jest globals (for test files)
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      jsdoc: jsdoc,
    },
    rules: {
      ...tseslint.configs.recommended.rules,

      // TypeScript-specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      // JSDoc rules (relaxed for TypeScript since it has its own type system)
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-indentation': 'warn',
      'jsdoc/check-param-names': 'warn',  // Warn instead of error for object properties
      'jsdoc/check-tag-names': 'error',
      'jsdoc/check-types': 'off',  // TypeScript handles this
      'jsdoc/require-description': 'warn',
      'jsdoc/require-param': 'off',  // Too strict for nested object properties
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-param-type': 'off',  // TypeScript provides types
      'jsdoc/require-returns': 'warn',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/require-returns-type': 'off',  // TypeScript provides types
      'jsdoc/valid-types': 'off',  // TypeScript handles this
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: {
      jsdoc: jsdoc,
    },
    rules: {
      // JSDoc rules for JavaScript files
      'jsdoc/check-alignment': 'warn',
      'jsdoc/check-indentation': 'warn',
      'jsdoc/check-param-names': 'error',
      'jsdoc/check-tag-names': 'error',
      'jsdoc/check-types': 'error',
      'jsdoc/require-description': 'warn',
      'jsdoc/require-param': 'error',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-param-name': 'error',
      'jsdoc/require-param-type': 'error',
      'jsdoc/require-returns': 'error',
      'jsdoc/require-returns-description': 'warn',
      'jsdoc/require-returns-type': 'error',
      'jsdoc/valid-types': 'error',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.test.ts', '**/__tests__/**', '**/__mocks__/**'],
  },
  // Prettier config must be last to disable conflicting rules
  prettierConfig,
];
