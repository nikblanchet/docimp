# CI/CD Setup with GitHub Actions

This guide shows how to set up continuous integration and continuous deployment (CI/CD) pipelines using GitHub Actions. CI/CD provides comprehensive quality validation before code reaches production.

## Overview

**What is CI/CD?**
- **Continuous Integration**: Automatically test and validate every push/PR
- **Continuous Deployment**: Automatically deploy passing code to production

**Why GitHub Actions?**
- Built into GitHub (no external service needed)
- Free for public repos, generous free tier for private
- Matrix builds (test multiple versions in parallel)
- Rich marketplace of reusable actions

**What we'll cover**:
- Python quality checks (Ruff, mypy, pytest)
- TypeScript/JavaScript quality checks (ESLint, Prettier, tsc, Jest)
- Polyglot integration testing
- Matrix testing strategies

## Python CI/CD Job

### Basic Python Job

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  python-quality:
    name: Python Quality Checks
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

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

      - name: Lint with Ruff
        run: uv run ruff check .

      - name: Check formatting with Ruff
        run: uv run ruff format --check .

      - name: Type check with mypy
        run: uv run mypy src --ignore-missing-imports

      - name: Run tests with coverage
        run: uv run pytest -v --cov=src --cov-report=term
```

### Matrix Testing (Multiple Python Versions)

```yaml
jobs:
  python-quality:
    name: Python ${{ matrix.python-version }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12', '3.13']

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python ${{ matrix.python-version }}
        uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}

      - name: Install uv
        run: pip install uv

      - name: Install dependencies
        run: |
          uv venv
          uv pip sync requirements-dev.lock

      - name: Lint with Ruff
        run: uv run ruff check .

      - name: Check formatting with Ruff
        run: uv run ruff format --check .

      - name: Type check with mypy
        run: uv run mypy src --ignore-missing-imports

      - name: Run tests with coverage
        run: uv run pytest -v --cov=src --cov-report=term
```

### With Coverage Upload

```yaml
- name: Run tests with coverage
  run: uv run pytest -v --cov=src --cov-report=xml --cov-report=term

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    file: ./coverage.xml
    flags: python
    name: python-coverage
```

## TypeScript/JavaScript CI/CD Job

### Basic TypeScript/JavaScript Job

```yaml
jobs:
  typescript-quality:
    name: TypeScript/JavaScript Quality Checks
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Node.js 24
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint with ESLint
        run: npm run lint

      - name: Check formatting with Prettier
        run: npm run format:check

      - name: Type check with TypeScript
        run: npx tsc --noEmit

      - name: Build
        run: npm run build

      - name: Run tests
        run: npm test

      - name: Run integration tests
        run: npm run test:integration
```

### Matrix Testing (Multiple Node Versions)

```yaml
jobs:
  typescript-quality:
    name: Node ${{ matrix.node-version }}
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: ['20', '22', '24']

    steps:
      - uses: actions/checkout@v4

      - name: Set up Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Lint with ESLint
        run: npm run lint

      - name: Check formatting with Prettier
        run: npm run format:check

      - name: Type check with TypeScript
        run: npx tsc --noEmit

      - name: Build
        run: npm run build

      - name: Run tests
        run: npm test
```

### With Coverage Upload

```yaml
- name: Run tests with coverage
  run: npm run test:coverage

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    file: ./coverage/lcov.info
    flags: typescript
    name: typescript-coverage
```

## Polyglot CI/CD (Python + TypeScript/JavaScript)

### Complete Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  python-tests:
    name: Python Tests (3.13)
    runs-on: ubuntu-latest

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
          cache-dependency-path: cli/package-lock.json

      - name: Install Python dependencies
        run: |
          pip install uv
          uv venv
          uv pip sync requirements-dev.lock

      - name: Install Node dependencies and build CLI
        run: |
          cd cli
          npm ci
          npm run build

      - name: Lint with Ruff
        run: |
          cd analyzer
          uv run ruff check .

      - name: Check Python formatting
        run: |
          cd analyzer
          uv run ruff format --check .

      - name: Type check with mypy
        run: |
          cd analyzer
          uv run mypy src --ignore-missing-imports

      - name: Run tests
        run: |
          cd analyzer
          uv run pytest -v --cov=src --cov-report=term

  typescript-tests:
    name: TypeScript Tests
    runs-on: ubuntu-latest

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
          cache-dependency-path: cli/package-lock.json

      - name: Install Python dependencies
        run: |
          pip install uv
          uv venv
          uv pip sync requirements-dev.lock

      - name: Install dependencies
        run: |
          cd cli
          npm ci

      - name: Lint TypeScript
        run: |
          cd cli
          npm run lint

      - name: Check TypeScript/JavaScript formatting
        run: |
          cd cli
          npm run format:check

      - name: Type check
        run: |
          cd cli
          npx tsc --noEmit

      - name: Build
        run: |
          cd cli
          npm run build

      - name: Run tests
        run: |
          cd cli
          npm test

      - name: Run integration tests
        run: |
          cd cli
          npm run test:integration

  integration-test:
    name: Integration Test (Python + TypeScript)
    runs-on: ubuntu-latest
    needs: [python-tests, typescript-tests]

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
          cache-dependency-path: cli/package-lock.json

      - name: Install Python dependencies
        run: |
          pip install uv
          uv venv
          uv pip sync requirements-dev.lock

      - name: Install Node dependencies and build
        run: |
          cd cli
          npm ci
          npm run build

      - name: Run end-to-end test
        run: |
          cd cli
          node dist/index.js analyze ../examples --format json > /dev/null
          echo "✓ End-to-end test completed successfully"
```

## Advanced Patterns

### Pattern 1: Job Dependencies

Run jobs sequentially using `needs`:

```yaml
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint

  test:
    runs-on: ubuntu-latest
    needs: lint  # Runs only if lint succeeds
    steps:
      - run: npm test

  deploy:
    runs-on: ubuntu-latest
    needs: [lint, test]  # Runs only if both succeed
    steps:
      - run: npm run deploy
```

### Pattern 2: Conditional Steps

```yaml
- name: Lint JSDoc
  run: npm run lint:jsdoc
  continue-on-error: true  # Don't fail job if this step fails

- name: Deploy to production
  if: github.ref == 'refs/heads/main' && github.event_name == 'push'
  run: npm run deploy
```

### Pattern 3: Caching Dependencies

```yaml
- name: Cache Python dependencies
  uses: actions/cache@v4
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('requirements.txt') }}

- name: Cache Node modules
  uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('package-lock.json') }}
```

Or use built-in caching:

```yaml
- name: Set up Python
  uses: actions/setup-python@v5
  with:
    python-version: '3.13'
    cache: 'pip'  # Automatic caching

- name: Set up Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'npm'  # Automatic caching
```

### Pattern 4: Matrix Testing (Multiple Dimensions)

```yaml
strategy:
  matrix:
    os: [ubuntu-latest, macos-latest, windows-latest]
    python-version: ['3.10', '3.11', '3.12', '3.13']

steps:
  - name: Set up Python ${{ matrix.python-version }} on ${{ matrix.os }}
    uses: actions/setup-python@v5
    with:
      python-version: ${{ matrix.python-version }}
```

### Pattern 5: Environment Variables

```yaml
env:
  NODE_ENV: test
  PYTHON_VERSION: 3.13

jobs:
  test:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: postgresql://localhost/test

    steps:
      - name: Run tests
        env:
          API_KEY: ${{ secrets.API_KEY }}  # From GitHub Secrets
        run: npm test
```

### Pattern 6: Artifacts and Reports

```yaml
- name: Generate coverage report
  run: pytest --cov=src --cov-report=html

- name: Upload coverage report
  uses: actions/upload-artifact@v4
  with:
    name: coverage-report
    path: htmlcov/
    retention-days: 30
```

### Pattern 7: Status Badges

Add to README.md:

```markdown
![CI Status](https://github.com/username/repo/workflows/CI/badge.svg)
```

## Common Issues and Solutions

### Issue: Slow CI/CD Pipeline

**Problem**: Jobs take 10+ minutes

**Solutions**:
1. Use caching (pip, npm, build outputs)
2. Parallelize jobs (don't use `needs` unless necessary)
3. Skip unnecessary steps (build once, reuse artifacts)
4. Use faster runners (GitHub-hosted or self-hosted)

**Example optimization**:
```yaml
# Before: Sequential, no caching
- run: npm ci
- run: npm run build
- run: npm test

# After: Cached dependencies
- uses: actions/setup-node@v4
  with:
    node-version: '24'
    cache: 'npm'  # Cache npm dependencies
- run: npm ci
- run: npm run build
- run: npm test
```

### Issue: Flaky Tests

**Problem**: Tests pass locally but fail in CI

**Solutions**:
1. Use deterministic test data (not system time, random values)
2. Increase timeouts for async operations
3. Run tests in isolation (--forceExit for Jest)
4. Set environment variables consistently

**Example**:
```yaml
- name: Run tests
  env:
    TZ: UTC  # Consistent timezone
    NODE_ENV: test
  run: npm test -- --forceExit --detectOpenHandles
```

### Issue: Dependency Installation Failures

**Problem**: `pip install` or `npm install` fails

**Solutions**:
1. Pin dependency versions in requirements.txt / package-lock.json
2. Use lockfile commands (`npm ci`, not `npm install`)
3. Retry on failure (use actions with retry logic)

**Example**:
```yaml
- name: Install dependencies (with retry)
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 5
    max_attempts: 3
    command: npm ci
```

### Issue: Matrix Build Explosion

**Problem**: 4 Python versions × 3 Node versions = 12 jobs (slow, expensive)

**Solutions**:
1. Test latest version thoroughly, older versions lightly
2. Use `include` and `exclude` in matrix

**Example**:
```yaml
strategy:
  matrix:
    python-version: ['3.13']  # Only latest for main tests
    node-version: ['24']
    include:
      - python-version: '3.10'  # Minimal test for older version
        node-version: '20'
        fast-tests-only: true
```

## Best Practices

### 1. Fail Fast

Stop on first failure to save time:

```yaml
strategy:
  fail-fast: true  # Stop all jobs if one fails (default: false)
```

### 2. Required Status Checks

Configure in GitHub Settings → Branches → Branch protection:
- Require status checks to pass before merging
- Require branches to be up to date before merging

### 3. Run CI on All PRs

```yaml
on:
  push:
    branches: [ main ]
  pull_request:  # All PRs, any target branch
```

### 4. Use Check Mode for Formatters

Don't modify files in CI, only check:

```yaml
- run: ruff format --check .  # Not: ruff format .
- run: prettier --check .     # Not: prettier --write .
```

### 5. Test Coverage Thresholds

Fail if coverage drops:

```yaml
# pytest.ini
[pytest]
addopts = --cov=src --cov-fail-under=80

# jest.config.js
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
  }
}
```

### 6. Separate Linting and Testing

```yaml
jobs:
  lint:
    steps:
      - run: npm run lint
      - run: npm run format:check

  test:
    needs: lint  # Don't run tests if linting fails
    steps:
      - run: npm test
```

### 7. Minimal Dependencies

Install only what's needed for each job:

```yaml
# Don't install test dependencies for linting
jobs:
  lint:
    steps:
      - run: pip install uv
      - run: uv venv
      - run: uv pip install ruff  # Only linter

  test:
    steps:
      - run: pip install uv
      - run: uv venv
      - run: uv pip sync requirements-dev.lock  # Full dependencies
```

## Performance Benchmarks

**Typical CI/CD times**:
- Python lint + format check: 30-60 seconds
- Python tests (100 tests): 1-3 minutes
- TypeScript lint + format check: 45-90 seconds
- TypeScript tests (200 tests): 2-4 minutes
- Full polyglot pipeline: 5-8 minutes

**With optimizations** (caching, parallelization):
- Python lint + format check: 15-30 seconds
- Python tests: 45-120 seconds
- TypeScript lint + format check: 20-45 seconds
- TypeScript tests: 60-180 seconds
- Full polyglot pipeline: 3-5 minutes

## Alternative CI/CD Platforms

### GitLab CI

Similar patterns work in `.gitlab-ci.yml`:

```yaml
python-quality:
  image: python:3.13
  before_script:
    - pip install uv
    - uv venv
    - uv pip sync requirements-dev.lock
  script:
    - uv run ruff check .
    - uv run ruff format --check .
    - uv run mypy src --ignore-missing-imports
    - uv run pytest -v --cov=src
```

### CircleCI

Similar patterns work in `.circleci/config.yml`:

```yaml
jobs:
  python-quality:
    docker:
      - image: cimg/python:3.13
    steps:
      - checkout
      - run: pip install uv
      - run: uv venv
      - run: uv pip sync requirements-dev.lock
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src --ignore-missing-imports
      - run: uv run pytest -v --cov=src
```

## Resources

**Official Documentation**:
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Actions Marketplace](https://github.com/marketplace?type=actions)

**Popular Actions**:
- [actions/checkout](https://github.com/actions/checkout)
- [actions/setup-python](https://github.com/actions/setup-python)
- [actions/setup-node](https://github.com/actions/setup-node)
- [codecov/codecov-action](https://github.com/codecov/codecov-action)

**Community Resources**:
- [Awesome Actions](https://github.com/sdras/awesome-actions)
- [GitHub Actions by Example](https://www.actionsbyexample.com/)

## Next Steps

- **Add local pre-commit hooks**: [Git Hooks Setup →](quality-setup-git-hooks.md)
- **Configure Python quality tools**: [Python Setup →](quality-setup-python.md)
- **Configure TypeScript/JavaScript tools**: [TypeScript/JavaScript Setup →](quality-setup-typescript-javascript.md)
- **Polyglot integration patterns**: [Polyglot Integration →](quality-setup-polyglot.md)
