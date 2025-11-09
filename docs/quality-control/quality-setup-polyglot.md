# Polyglot Integration (Python + TypeScript/JavaScript)

This guide shows how to combine Python and TypeScript/JavaScript quality control tooling in a single project. Perfect for projects with Python backends and TypeScript frontends, or Python analysis engines with TypeScript CLIs.

## Overview

**Polyglot projects** use multiple programming languages:
- Python for data processing, ML, scientific computing
- TypeScript/JavaScript for web UIs, CLIs, tooling
- Both languages working together in one repository

**Challenges**:
- Different tooling ecosystems (pip vs npm)
- Different configuration files (pyproject.toml vs package.json)
- Coordinating git hooks, CI/CD, and development workflows

**This guide solves**:
- Unified git hooks (one pre-commit for all languages)
- Coordinated CI/CD pipelines (test both languages)
- Monorepo structure patterns
- Development workflow best practices

## Project Structure

### Monorepo Layout

```
my-project/
├── python-backend/          # Python code
│   ├── src/
│   ├── tests/
│   ├── pyproject.toml
│   ├── pytest.ini
│   └── requirements.txt
├── typescript-cli/          # TypeScript code
│   ├── src/
│   ├── dist/
│   ├── tsconfig.json
│   ├── package.json
│   └── jest.config.js
├── .github/
│   └── workflows/
│       └── ci.yml           # Combined CI/CD
├── .husky/
│   └── pre-commit           # Combined git hooks
├── package.json             # Root package.json for npm scripts
└── README.md
```

### DocImp Example Structure

```
docimp/
├── analyzer/                # Python analysis engine
│   ├── src/
│   ├── tests/
│   ├── pyproject.toml       # Ruff, mypy config
│   └── pytest.ini           # pytest config
├── cli/                     # TypeScript CLI
│   ├── src/
│   ├── dist/
│   ├── eslint.config.mjs    # ESLint config
│   ├── tsconfig.json        # TypeScript config
│   ├── jest.config.js       # Jest config
│   └── package.json         # CLI dependencies
├── plugins/                 # JavaScript plugins
│   └── *.js
├── .github/workflows/
│   └── ci.yml               # Polyglot CI/CD
├── .husky/pre-commit        # Combined hooks
├── .prettierrc              # Shared Prettier config
├── package.json             # Root scripts + lint-staged
└── requirements.txt         # Python dependencies
```

## Unified Git Hooks

### Root package.json Configuration

Create root `package.json` with combined lint-staged:

```json
{
  "name": "my-polyglot-project",
  "private": true,
  "scripts": {
    "prepare": "husky",
    "lint": "npm run lint:python && npm run lint:ts",
    "lint:python": "cd python-backend && ruff check .",
    "lint:ts": "cd typescript-cli && npm run lint",
    "format": "npm run format:python && npm run format:ts",
    "format:python": "cd python-backend && ruff format .",
    "format:ts": "cd typescript-cli && npm run format",
    "test": "npm run test:python && npm run test:ts",
    "test:python": "cd python-backend && pytest -v",
    "test:ts": "cd typescript-cli && npm test"
  },
  "devDependencies": {
    "husky": "^9.1.0",
    "lint-staged": "^16.2.0"
  },
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": [
      "prettier --write",
      "eslint --fix"
    ],
    "*.py": [
      "ruff format",
      "ruff check --fix"
    ]
  }
}
```

### Pre-commit Hook

Create `.husky/pre-commit`:

```bash
#!/bin/sh
# Unified pre-commit hook for Python + TypeScript/JavaScript
npx lint-staged
```

**How it works**:
1. User runs `git commit`
2. Husky triggers `.husky/pre-commit`
3. lint-staged identifies staged files
4. TypeScript/JavaScript files → prettier + eslint
5. Python files → ruff format + ruff check
6. All languages processed in one hook

## Unified CI/CD Pipeline

### Complete GitHub Actions Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  # Python quality checks
  python-quality:
    name: Python Quality Checks
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.13
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - name: Install uv
        run: pip install uv

      - name: Install dependencies
        run: |
          uv venv
          uv pip sync requirements-dev.lock

      - name: Lint Python
        run: |
          cd python-backend
          uv run ruff check .

      - name: Check Python formatting
        run: |
          cd python-backend
          uv run ruff format --check .

      - name: Type check Python
        run: |
          cd python-backend
          uv run mypy src --ignore-missing-imports

      - name: Test Python
        run: |
          cd python-backend
          uv run pytest -v --cov=src --cov-report=term

  # TypeScript/JavaScript quality checks
  typescript-quality:
    name: TypeScript/JavaScript Quality Checks
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: typescript-cli/package-lock.json

      - name: Install dependencies
        run: |
          cd typescript-cli
          npm ci

      - name: Lint TypeScript/JavaScript
        run: |
          cd typescript-cli
          npm run lint

      - name: Check TypeScript/JavaScript formatting
        run: |
          cd typescript-cli
          npm run format:check

      - name: Type check TypeScript
        run: |
          cd typescript-cli
          npx tsc --noEmit

      - name: Build TypeScript
        run: |
          cd typescript-cli
          npm run build

      - name: Test TypeScript/JavaScript
        run: |
          cd typescript-cli
          npm test

  # Integration test (both languages together)
  integration-test:
    name: Integration Test
    runs-on: ubuntu-latest
    needs: [python-quality, typescript-quality]

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python 3.13
        uses: actions/setup-python@v5
        with:
          python-version: '3.13'
          cache: 'pip'

      - name: Set up Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'
          cache-dependency-path: typescript-cli/package-lock.json

      - name: Install Python dependencies
        run: |
          pip install uv
          uv venv
          uv pip sync requirements-dev.lock

      - name: Install Node dependencies
        run: |
          cd typescript-cli
          npm ci
          npm run build

      - name: Run end-to-end test
        run: |
          # Test that TypeScript CLI can call Python backend
          cd typescript-cli
          node dist/index.js --help
          echo "✓ Integration test passed"
```

## Shared Configuration

### Prettier (Shared Formatter)

Prettier works for both TypeScript/JavaScript and JSON/Markdown files used across the project.

Create `.prettierrc` in root:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
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

**Rationale**: 88 chars for Markdown matches Python's line length (Ruff default), maintaining visual consistency.

### EditorConfig (Shared Editor Settings)

Create `.editorconfig` in root:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{py}]
indent_style = space
indent_size = 4
max_line_length = 88

[*.{ts,js,mjs,cjs,json}]
indent_style = space
indent_size = 2

[*.{yml,yaml}]
indent_style = space
indent_size = 2
```

## Development Workflows

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/you/polyglot-project.git
cd polyglot-project

# 2. Install Python dependencies
uv venv
uv pip sync requirements-dev.lock
uv pip install -e .

# 3. Install Node dependencies (triggers Husky setup)
npm install

# 4. Build TypeScript CLI
cd typescript-cli
npm run build
cd ..

# 5. Verify setup
npm run lint    # Lints both Python and TypeScript
npm test        # Tests both Python and TypeScript
```

### Daily Development

```bash
# Make changes to Python and TypeScript files
vim python-backend/src/analyzer.py
vim typescript-cli/src/index.ts

# Stage and commit (hooks run automatically)
git add .
git commit -m "Add new feature"

# Behind the scenes:
# 1. Husky triggers pre-commit hook
# 2. lint-staged formats Python files with Ruff
# 3. lint-staged formats TypeScript files with Prettier + ESLint
# 4. Commit succeeds if all checks pass
```

### Running Quality Checks Manually

```bash
# Lint all code
npm run lint

# Format all code
npm run format

# Run all tests
npm test

# Or language-specific:
npm run lint:python
npm run lint:ts
npm run test:python
npm run test:ts
```

## Common Patterns

### Pattern 1: TypeScript CLI Calling Python Backend

**Use case**: TypeScript CLI spawns Python subprocess for analysis.

**TypeScript CLI** (`typescript-cli/src/python-bridge.ts`):
```typescript
import { spawn } from 'child_process';

export async function callPythonAnalyzer(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const python = spawn('python', [
      '-m', 'analyzer',
      'analyze', filePath
    ]);

    let output = '';
    python.stdout.on('data', (data) => output += data.toString());
    python.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`Python exited with code ${code}`));
    });
  });
}
```

**Python Backend** (`python-backend/analyzer/__main__.py`):
```python
import sys
import json

def main():
    if sys.argv[1] == 'analyze':
        filepath = sys.argv[2]
        result = analyze_file(filepath)
        print(json.dumps(result))

if __name__ == '__main__':
    main()
```

### Pattern 2: Shared Data Models

Use JSON schemas for type safety across languages.

**JSON Schema** (`schemas/analysis-result.json`):
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "items": { "type": "array" },
    "coverage": { "type": "number" }
  },
  "required": ["items", "coverage"]
}
```

**Python** (use `dataclass` + JSON serialization):
```python
from dataclasses import dataclass, asdict

@dataclass
class AnalysisResult:
    items: list
    coverage: float

    def to_json(self):
        return asdict(self)
```

**TypeScript** (use Zod for validation):
```typescript
import { z } from 'zod';

const AnalysisResultSchema = z.object({
  items: z.array(z.any()),
  coverage: z.number(),
});

type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
```

### Pattern 3: Environment Variables

Share configuration via environment variables.

**.env.example**:
```bash
# Shared configuration
LOG_LEVEL=info
DEBUG=false

# Python-specific
PYTHONPATH=python-backend/src

# TypeScript-specific
NODE_ENV=development
```

**Python** (`python-backend/src/config.py`):
```python
import os

LOG_LEVEL = os.getenv('LOG_LEVEL', 'info')
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'
```

**TypeScript** (`typescript-cli/src/config.ts`):
```typescript
export const config = {
  logLevel: process.env.LOG_LEVEL || 'info',
  debug: process.env.DEBUG === 'true',
};
```

### Pattern 4: Shared Documentation

Use Markdown for documentation accessible from both languages.

```
docs/
├── api/
│   ├── python-api.md
│   ├── typescript-api.md
│   └── data-models.md       # Shared data structures
├── setup/
│   ├── development.md
│   └── deployment.md
└── README.md
```

## Troubleshooting

### Issue: Git hooks not running on Python files

**Symptom**: Ruff doesn't run on commit

**Solution**: Ensure Ruff is installed in the uv environment and use `uv run`:
```bash
# Make sure Ruff is in requirements-dev.in
uv pip install ruff

# Update .husky/pre-commit to use uv run:
uv run ruff check .
npx lint-staged
```

Or update lint-staged config to use `uv run`:
```json
{
  "*.py": ["uv run ruff format", "uv run ruff check --fix"]
}
```

### Issue: TypeScript CLI can't find Python backend

**Symptom**: `python -m analyzer` fails

**Solution**: Set `PYTHONPATH` environment variable:
```bash
# In .env or .envrc
export PYTHONPATH="$PWD/python-backend"

# Or in TypeScript code:
const python = spawn('python', ['-m', 'analyzer'], {
  env: { ...process.env, PYTHONPATH: path.join(__dirname, '../python-backend') }
});
```

### Issue: Different line endings (Windows)

**Symptom**: Git shows all files as modified

**Solution**: Configure git to use LF:
```bash
git config core.autocrlf false
git config core.eol lf

# Re-checkout files
git rm --cached -r .
git reset --hard
```

Also add to `.gitattributes`:
```
* text=auto eol=lf
*.py text eol=lf
*.ts text eol=lf
*.js text eol=lf
```

### Issue: CI/CD runs too long

**Symptom**: Pipeline takes 15+ minutes

**Solution**: Parallelize jobs and use caching:
```yaml
jobs:
  python-quality:
    # ... Python checks (runs in parallel)

  typescript-quality:
    # ... TypeScript checks (runs in parallel)

  integration-test:
    needs: [python-quality, typescript-quality]  # Only after both pass
```

## Best Practices

### 1. Keep Languages Loosely Coupled

**Good**: JSON over stdio, clear interfaces
```typescript
const result = await callPythonAnalyzer(file);
const data = JSON.parse(result);
```

**Bad**: Tight coupling, shared memory
```typescript
// Don't do this - language coupling
import { analyzePython } from './python-binding.node';
```

### 2. Version Constraints

Pin versions to avoid compatibility issues.

**requirements.txt**:
```
ruff>=0.1.0,<0.2.0
mypy>=1.7.0,<2.0.0
```

**package.json**:
```json
{
  "engines": {
    "node": ">=24.0.0",
    "npm": ">=10.0.0"
  }
}
```

### 3. Consistent Error Handling

**Python** (exit codes):
```python
sys.exit(0)  # Success
sys.exit(1)  # Error
```

**TypeScript** (same exit codes):
```typescript
process.exit(0);  // Success
process.exit(1);  // Error
```

### 4. Shared Test Fixtures

```
test-fixtures/
├── sample.json          # Used by both Python and TypeScript tests
├── valid-python.py
└── valid-typescript.ts
```

**Python test**:
```python
def test_analyzer():
    result = analyze('test-fixtures/sample.json')
    assert result.coverage > 0.8
```

**TypeScript test**:
```typescript
test('analyzer', async () => {
  const result = await analyze('test-fixtures/sample.json');
  expect(result.coverage).toBeGreaterThan(0.8);
});
```

### 5. Unified Versioning

Use semantic versioning across all components:
- `package.json`: `"version": "1.2.3"`
- `pyproject.toml`: `version = "1.2.3"`
- Git tags: `v1.2.3`

## Example: DocImp Integration

DocImp demonstrates full polyglot integration:

**Repository Structure**:
- `analyzer/`: Python analysis engine
- `cli/`: TypeScript CLI
- `plugins/`: JavaScript validation plugins
- Root: Unified git hooks, CI/CD, documentation

**Key Integration Points**:
1. **CLI → Analyzer**: TypeScript CLI spawns Python subprocess
2. **CLI → Plugins**: TypeScript loads JavaScript plugins dynamically
3. **Data Flow**: JSON over stdio (Python → TypeScript → Plugins)
4. **Quality Control**: Unified pre-commit hooks, parallel CI/CD jobs

**See**: [DocImp repository](https://github.com/you/docimp) for full example.

## Resources

**Polyglot Tools**:
- [Bazel](https://bazel.build/) - Multi-language build system
- [Nx](https://nx.dev/) - Monorepo tooling (focus on TypeScript/JavaScript)
- [Turborepo](https://turbo.build/) - High-performance monorepo build system

**Communication Patterns**:
- [gRPC](https://grpc.io/) - Language-agnostic RPC
- [JSON-RPC](https://www.jsonrpc.org/) - Simple JSON-based RPC
- [MessagePack](https://msgpack.org/) - Efficient binary serialization

**Best Practices**:
- [Monorepo.tools](https://monorepo.tools/) - Monorepo strategies
- [Google's Monorepo Practices](https://cacm.acm.org/magazines/2016/7/204032-why-google-stores-billions-of-lines-of-code-in-a-single-repository/fulltext)

## Next Steps

- **Python setup**: [Python Setup →](quality-setup-python.md)
- **TypeScript/JavaScript setup**: [TypeScript/JavaScript Setup →](quality-setup-typescript-javascript.md)
- **Git hooks**: [Git Hooks Setup →](quality-setup-git-hooks.md)
- **CI/CD**: [CI/CD Setup →](quality-setup-cicd.md)
- **Migration guide**: [Migration Guide →](quality-migration-guide.md)
