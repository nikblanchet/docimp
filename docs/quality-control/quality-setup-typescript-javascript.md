# TypeScript and JavaScript Quality Control Setup

This guide shows how to set up comprehensive quality control for TypeScript and JavaScript projects using ESLint, Prettier, TypeScript compiler, and Jest.

## Overview

**Tools**:
- **ESLint**: Comprehensive linter with 6 plugins for modern best practices
- **Prettier**: Opinionated code formatter
- **TypeScript**: Type checker for TypeScript + JSDoc validation for JavaScript
- **Jest**: Fast, batteries-included test framework

**Target**: Node.js 24+ (adjust `n/no-unsupported-features` for older versions)

## Why This Stack?

**ESLint + 6 Plugins** provides comprehensive quality checking:
- **@typescript-eslint**: TypeScript-specific rules and type-aware linting
- **eslint-plugin-jsdoc**: JSDoc validation (strict for JS, relaxed for TS)
- **eslint-plugin-unicorn**: Modern JavaScript best practices (aggressive)
- **eslint-plugin-n**: Node.js compatibility and best practices
- **eslint-plugin-promise**: Promise handling patterns
- **eslint-plugin-import**: Import/export organization and validation

**Prettier** eliminates style debates with opinionated formatting.

**TypeScript `checkJs: true`** enables REAL JSDoc type-checking for JavaScript files, not just cosmetic validation.

**Jest** provides fast testing with built-in coverage, mocking, and snapshots.

## Installation

```bash
# Core tools
npm install --save-dev eslint prettier typescript

# ESLint plugins
npm install --save-dev @typescript-eslint/eslint-plugin @typescript-eslint/parser
npm install --save-dev eslint-plugin-jsdoc eslint-plugin-unicorn
npm install --save-dev eslint-plugin-n eslint-plugin-promise eslint-plugin-import
npm install --save-dev eslint-config-prettier

# Testing
npm install --save-dev jest ts-jest @types/jest

# Optional: TypeScript types for Node
npm install --save-dev @types/node
```

Or use one command:
```bash
npm install --save-dev eslint prettier typescript \
  @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-plugin-jsdoc eslint-plugin-unicorn eslint-plugin-n \
  eslint-plugin-promise eslint-plugin-import eslint-config-prettier \
  jest ts-jest @types/jest @types/node
```

## Configuration

### ESLint Configuration (Flat Config)

Create `eslint.config.mjs` in your project root:

```javascript
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
      // Unicorn: Downgrade truly problematic rules
      'unicorn/no-array-reduce': 'warn',  // Reduce is sometimes clearest
      'unicorn/prefer-top-level-await': 'warn',  // Not always possible
      'unicorn/no-null': 'off',  // External APIs use null

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

  // TypeScript files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
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
      'jsdoc/check-param-names': 'warn',
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

  // JavaScript files (strict JSDoc validation)
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
      // JSDoc rules for JavaScript files (STRICT)
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

  // Ignore patterns
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '**/*.test.ts',
      '**/__tests__/**',
      '**/__mocks__/**'
    ],
  },

  // Prettier config must be last to disable conflicting rules
  prettierConfig,
];
```

**Simpler config for beginners**:
```javascript
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint },
    rules: tseslint.configs.recommended.rules,
  },
];
```

### Prettier Configuration

Create `.prettierrc` in your project root:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf",
  "overrides": [
    {
      "files": "*.json",
      "options": {
        "printWidth": 100
      }
    },
    {
      "files": "*.md",
      "options": {
        "printWidth": 88,
        "proseWrap": "always"
      }
    }
  ]
}
```

Create `.prettierignore`:
```
node_modules
dist
build
coverage
*.min.js
package-lock.json
```

### TypeScript Configuration

Create `tsconfig.json` in your project root:

```json
{
  "compilerOptions": {
    /* Language and Environment */
    "target": "ES2024",
    "lib": ["ES2024"],

    /* Modules */
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "resolveJsonModule": true,

    /* JavaScript Support - CRITICAL */
    "allowJs": true,           // Parse JavaScript files
    "checkJs": true,           // Type-check JSDoc in .js files (REAL validation)

    /* Emit */
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,

    /* Interop Constraints */
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,

    /* Type Checking */
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,

    /* Completeness */
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/__tests__/**",
    "**/__mocks__/**"
  ]
}
```

**Key setting**: `"checkJs": true` enables real JSDoc type-checking for JavaScript files, not just parsing.

### Jest Configuration

Create `jest.config.js` in your project root:

```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],

  // Force sequential execution to avoid race conditions
  maxWorkers: 1,

  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          isolatedModules: true,
        },
      },
    ],
  },

  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).ts',
  ],

  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
  ],

  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
```

## Usage

### Linting

Check for issues without modifying files:
```bash
eslint src --ext .ts,.js
```

Auto-fix issues:
```bash
eslint src --ext .ts,.js --fix
```

Lint specific files:
```bash
eslint src/index.ts src/utils/*.ts
```

### Formatting

Format files (modifies in-place):
```bash
prettier --write src/**/*.ts
prettier --write src/**/*.js
```

Check formatting without modifying:
```bash
prettier --check src/**/*.ts
```

Format specific files:
```bash
prettier --write src/index.ts
```

### Type Checking

Type-check TypeScript and JavaScript files:
```bash
npx tsc --noEmit
```

Watch mode (for development):
```bash
npx tsc --noEmit --watch
```

Check specific files:
```bash
npx tsc --noEmit src/index.ts
```

### Testing

Run all tests:
```bash
npm test
# or
jest
```

Run with coverage:
```bash
jest --coverage
```

Run in watch mode:
```bash
jest --watch
```

Run specific test files:
```bash
jest src/__tests__/utils.test.ts
```

## NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",

    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix",
    "lint:js": "eslint src --ext .js,.mjs,.cjs",
    "lint:jsdoc": "eslint src --ext .ts,.js,.mjs,.cjs",

    "format": "prettier --write \"src/**/*.{ts,js,mjs,cjs,json,md}\"",
    "format:check": "prettier --check \"src/**/*.{ts,js,mjs,cjs,json,md}\"",
    "format:ts": "prettier --write \"src/**/*.ts\"",
    "format:js": "prettier --write \"src/**/*.{js,mjs,cjs}\"",

    "typecheck": "tsc --noEmit",

    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --testMatch '**/__tests__/integration/**/*.test.ts'",

    "quality": "npm run lint && npm run format:check && npm run typecheck && npm test"
  }
}
```

Then run:
```bash
npm run lint
npm run format
npm run typecheck
npm test
npm run quality  # Run all quality checks
```

## IDE Integration

### VSCode

Install extensions:
- **ESLint** (dbaeumer.vscode-eslint)
- **Prettier** (esbenp.prettier-vscode)
- **Jest** (orta.vscode-jest) - Optional

Add to `.vscode/settings.json`:
```json
{
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": "explicit"
    }
  },
  "[javascript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.eslint": "explicit"
    }
  },
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "editor.formatOnSave": true
}
```

### WebStorm / IntelliJ IDEA

1. Enable ESLint:
   - Settings → Languages & Frameworks → JavaScript → Code Quality Tools → ESLint
   - Check "Automatic ESLint configuration"
   - Check "Run eslint --fix on save"

2. Enable Prettier:
   - Settings → Languages & Frameworks → JavaScript → Prettier
   - Check "On code reformat" and "On save"

3. TypeScript is enabled by default.

## Pre-commit Integration

See [Git Hooks Setup](quality-setup-git-hooks.md#typescript-javascript-hooks) for pre-commit hook configuration.

Quick example using lint-staged:
```json
{
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"]
  }
}
```

## CI/CD Integration

See [CI/CD Setup](quality-setup-cicd.md#typescript-javascript-job) for GitHub Actions configuration.

Quick example:
```yaml
jobs:
  typescript-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: npm install
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm test
```

## Common Workflows

### First-Time Setup

```bash
# 1. Install all tools
npm install --save-dev eslint prettier typescript jest ts-jest \
  @typescript-eslint/eslint-plugin @typescript-eslint/parser \
  eslint-plugin-jsdoc eslint-config-prettier

# 2. Create configuration files (see above)
# eslint.config.mjs, .prettierrc, tsconfig.json, jest.config.js

# 3. Format entire codebase
npm run format

# 4. Fix linting issues
npm run lint:fix

# 5. Commit the formatting
git add .
git commit -m "Apply ESLint and Prettier formatting"
```

### Daily Development

```bash
# Before committing
npm run format
npm run lint:fix
npm test

# Or use pre-commit hooks (see Git Hooks guide)
git commit  # Runs ESLint and Prettier automatically
```

### CI/CD Workflow

```bash
# Check formatting (don't modify)
npm run format:check

# Check linting (don't modify)
npm run lint

# Type checking
npm run typecheck

# Run tests with coverage
npm run test:coverage
```

## Plugin Explanations

### @typescript-eslint
TypeScript-specific rules and type-aware linting:
- `@typescript-eslint/no-unused-vars`: Detect unused variables
- `@typescript-eslint/no-explicit-any`: Discourage `any` type
- `@typescript-eslint/explicit-function-return-type`: Require return types

### eslint-plugin-jsdoc
JSDoc comment validation:
- `jsdoc/check-param-names`: Verify parameter names match
- `jsdoc/require-returns`: Require `@returns` tag
- `jsdoc/check-types`: Validate JSDoc types (JavaScript only)

### eslint-plugin-unicorn
Modern JavaScript best practices (aggressive):
- `unicorn/prefer-module`: Prefer ES modules over CommonJS
- `unicorn/prefer-node-protocol`: Use `node:` protocol (`import fs from 'node:fs'`)
- `unicorn/prevent-abbreviations`: Expand abbreviations for clarity

### eslint-plugin-n
Node.js compatibility and best practices:
- `n/no-unsupported-features/node-builtins`: Target specific Node version
- `n/prefer-node-protocol`: Prefer `node:` import protocol

### eslint-plugin-promise
Promise handling patterns:
- `promise/catch-or-return`: Always handle promise rejections
- `promise/always-return`: Always return from promise chains

### eslint-plugin-import
Import/export organization:
- `import/order`: Enforce consistent import ordering
- `import/no-duplicates`: Combine duplicate imports

## TypeScript `checkJs: true` - Real JSDoc Validation

With `checkJs: true`, TypeScript validates JSDoc types in JavaScript files:

**JavaScript file** (`utils.js`):
```javascript
/**
 * Add two numbers
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
export function add(a, b) {
  return a + b;
}

// Type error caught: 'string' is not assignable to 'number'
add('1', '2');  // TypeScript error!
```

This is REAL type-checking, not just parsing. The TypeScript compiler validates:
- Parameter types match function signature
- Return types are correct
- Types are valid TypeScript types

## Troubleshooting

### "ESLint not found"
Install ESLint:
```bash
npm install --save-dev eslint
```

### "Prettier not found"
Install Prettier:
```bash
npm install --save-dev prettier
```

### Conflicts between ESLint and Prettier
Install `eslint-config-prettier` and add as last item in config:
```javascript
import prettierConfig from 'eslint-config-prettier';

export default [
  // ... other configs
  prettierConfig,  // Must be last
];
```

### "Too many errors" from eslint-plugin-unicorn
Unicorn is aggressive. Downgrade problematic rules to warnings:
```javascript
{
  rules: {
    'unicorn/no-array-reduce': 'warn',
    'unicorn/prefer-top-level-await': 'warn',
    'unicorn/no-null': 'off',
  }
}
```

### TypeScript "Cannot find module"
Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "moduleResolution": "NodeNext"
  }
}
```

### Jest "Cannot use import statement"
Ensure `jest.config.js` has ESM preset:
```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
};
```

## Advanced Configuration

### Per-File Rule Overrides

```javascript
{
  files: ['**/*.test.ts'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',  // Allow any in tests
  }
}
```

### Custom Import Groups

```javascript
{
  rules: {
    'import/order': ['error', {
      groups: [
        'builtin',      // node:fs, node:path
        'external',     // lodash, react
        'internal',     // @/utils
        'parent',       // ../
        'sibling',      // ./
        'index'         // ./index
      ],
      'newlines-between': 'always',
      alphabetize: { order: 'asc' }
    }]
  }
}
```

### Coverage Thresholds

```javascript
// jest.config.js
export default {
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

## Performance Tips

**ESLint**:
- Use `--cache` flag: `eslint --cache src/`
- Ignore build outputs: Add `dist/` to ignores

**Prettier**:
- Use `--cache` flag: `prettier --write --cache src/`
- Format only changed files (use lint-staged)

**TypeScript**:
- Use `--incremental` flag: `tsc --incremental`
- Enable project references for monorepos

**Jest**:
- Use `--onlyChanged` flag: `jest --onlyChanged`
- Adjust `maxWorkers`: `jest --maxWorkers=4`

## Resources

**Official Documentation**:
- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)
- [TypeScript](https://www.typescriptlang.org/)
- [Jest](https://jestjs.io/)

**Plugin Documentation**:
- [@typescript-eslint](https://typescript-eslint.io/)
- [eslint-plugin-jsdoc](https://github.com/gajus/eslint-plugin-jsdoc)
- [eslint-plugin-unicorn](https://github.com/sindresorhus/eslint-plugin-unicorn)
- [eslint-plugin-n](https://github.com/eslint-community/eslint-plugin-n)

**Guides**:
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files-new)
- [TypeScript JSDoc Reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)

## Next Steps

- **Add git hooks**: [Git Hooks Setup →](quality-setup-git-hooks.md#typescript-javascript-hooks)
- **Add CI/CD**: [CI/CD Setup →](quality-setup-cicd.md#typescript-javascript-job)
- **Combine with Python**: [Polyglot Integration →](quality-setup-polyglot.md)
