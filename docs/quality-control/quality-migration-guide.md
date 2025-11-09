# Migration Guide: Adopting Quality Control

This guide helps you adopt the quality control setup in existing projects incrementally. You don't need to do everything at once - start small and expand over time.

## Overview

**Migration Strategy**: Incremental adoption
- Start with formatting (easiest, most visible)
- Add linting (catches bugs)
- Add type checking (prevents runtime errors)
- Add testing (prevents regressions)
- Add CI/CD (enforces quality gates)
- Add pre-commit hooks (fast feedback)

**Timeline**: 1-4 weeks depending on project size

**Team Impact**: Minimal if done incrementally

## Phase 1: Formatting (Week 1)

**Goal**: Eliminate style debates, establish consistent formatting.

**Effort**: 2-4 hours

**Impact**: High (visible consistency), Low disruption

### Python Projects

1. **Install Ruff**:
```bash
uv pip install ruff
```

2. **Create minimal config** (`pyproject.toml`):
```toml
[tool.ruff]
line-length = 88
target-version = "py310"  # Adjust to your version
```

3. **Format entire codebase** (creates big commit):
```bash
uv run ruff format .
git add .
git commit -m "Apply Ruff formatting"
```

4. **Add npm script** (optional):
```json
{
  "scripts": {
    "format:python": "ruff format ."
  }
}
```

### TypeScript/JavaScript Projects

1. **Install Prettier**:
```bash
npm install --save-dev prettier
```

2. **Create config** (`.prettierrc`):
```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 80
}
```

3. **Format entire codebase**:
```bash
npx prettier --write "src/**/*.{ts,js,json}"
git add .
git commit -m "Apply Prettier formatting"
```

4. **Add npm script**:
```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{ts,js,json}\"",
    "format:check": "prettier --check \"src/**/*.{ts,js,json}\""
  }
}
```

**Team Communication**:
```
🎨 Code Formatting Update

We've adopted [Ruff/Prettier] for automatic code formatting.

What this means:
- Code will be formatted consistently
- No more style debates in PRs
- Run `npm run format` before committing

One-time setup:
- Pull latest main: `git pull origin main`
- Rebase your branches: `git rebase main`
- Format will be auto-applied on commit (coming soon)

Questions? Ping me!
```

## Phase 2: Linting (Week 2)

**Goal**: Catch common bugs and enforce best practices.

**Effort**: 4-8 hours (fixing issues)

**Impact**: Medium (catches bugs), Medium disruption (may reveal issues)

### Python Projects

1. **Install Ruff** (if not already):
```bash
uv pip install ruff
```

2. **Create linting config** (`pyproject.toml`):
```toml
[tool.ruff.lint]
select = ["E", "F"]  # Start with just PEP 8 + basic errors
```

3. **Run linter** and review issues:
```bash
uv run ruff check .
```

4. **Fix issues incrementally**:

**Option A**: Auto-fix all (fast but risky):
```bash
uv run ruff check --fix .
git add .
git commit -m "Fix Ruff linting issues"
```

**Option B**: Fix by category (safer):
```bash
# Fix imports first
uv run ruff check --select F401 --fix .  # Unused imports
git commit -m "Remove unused imports"

# Then unused variables
uv run ruff check --select F841 --fix .
git commit -m "Remove unused variables"

# Continue with other categories...
```

**Option C**: Fix new code only (least disruptive):
```toml
[tool.ruff.lint]
select = ["E", "F"]
exclude = ["legacy/**"]  # Ignore old code
```

5. **Add npm script**:
```json
{
  "scripts": {
    "lint:python": "ruff check .",
    "lint:python:fix": "ruff check --fix ."
  }
}
```

### TypeScript/JavaScript Projects

1. **Install ESLint**:
```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

2. **Create minimal config** (`eslint.config.mjs`):
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

3. **Run linter** and review:
```bash
npx eslint src --ext .ts
```

4. **Fix issues**:

**Auto-fix**:
```bash
npx eslint src --ext .ts --fix
git add .
git commit -m "Fix ESLint issues"
```

**Or gradually**:
```bash
# Disable rules temporarily, enable incrementally
{
  "rules": {
    "@typescript-eslint/no-unused-vars": "warn",  // Warn instead of error
    "@typescript-eslint/no-explicit-any": "off"   // Disable temporarily
  }
}
```

5. **Add npm scripts**:
```json
{
  "scripts": {
    "lint": "eslint src --ext .ts",
    "lint:fix": "eslint src --ext .ts --fix"
  }
}
```

**Team Communication**:
```
🔍 Linting Enabled

We've enabled [Ruff/ESLint] to catch bugs automatically.

What this means:
- Common mistakes caught before review
- Consistent code patterns enforced
- Run `npm run lint` to check your code

Action required:
- Pull latest main
- Run `npm run lint:fix` to auto-fix issues
- Review and commit fixes

Some issues may need manual fixes - ask if stuck!
```

## Phase 3: Type Checking (Week 2)

**Goal**: Add static type safety without runtime overhead.

**Effort**: 8-16 hours (adding types)

**Impact**: High (prevents bugs), Medium disruption (requires type annotations)

### Python Projects

1. **Install mypy**:
```bash
uv pip install mypy
```

2. **Create lenient config** (`pyproject.toml`):
```toml
[tool.mypy]
python_version = "3.10"
ignore_missing_imports = true  # Don't fail on untyped libraries
warn_return_any = false          # Lenient for migration
disallow_untyped_defs = false    # Allow untyped functions for now
```

3. **Run mypy** and fix critical issues:
```bash
uv run mypy src --ignore-missing-imports
```

4. **Add types gradually**:

**Strategy A**: New code only (recommended):
```python
# Add types to new functions
def process_data(items: list[dict]) -> int:
    return len(items)
```

**Strategy B**: One module at a time:
```bash
# Type-check one module
mypy src/utils.py

# Add types, then move to next module
```

**Strategy C**: Use `# type: ignore` liberally (fastest):
```python
result = complex_legacy_function()  # type: ignore
```

5. **Add npm script**:
```json
{
  "scripts": {
    "typecheck:python": "mypy src --ignore-missing-imports"
  }
}
```

### TypeScript Projects

**Good news**: TypeScript projects already have type checking! Just enforce it:

1. **Enable strict mode** (gradually):

**Current** (`tsconfig.json`):
```json
{
  "compilerOptions": {
    "strict": false
  }
}
```

**Step 1**: Enable individual checks:
```json
{
  "compilerOptions": {
    "noImplicitAny": true,      // No implicit any
    "strictNullChecks": false,  // Keep lenient for now
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

**Step 2** (later): Full strict mode:
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

2. **Run type-checking**:
```bash
npx tsc --noEmit
```

3. **Add npm script**:
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

**Team Communication**:
```
🎯 Type Checking Added

We're gradually adopting static type checking.

Current status:
- [Lenient mode / Strict mode]
- Type errors are [warnings / errors]

What to do:
- Add types to NEW code (required)
- Add types to OLD code (optional, appreciated)
- Use `# type: ignore` or `@ts-ignore` if stuck

Run `npm run typecheck` to check types locally.
```

## Phase 4: Testing (Week 3)

**Goal**: Add automated tests to prevent regressions.

**Effort**: Ongoing (write tests for new code)

**Impact**: High (prevents bugs), Low disruption (tests separate from code)

### Python Projects

1. **Install pytest**:
```bash
uv pip install pytest pytest-cov
```

2. **Create test directory**:
```bash
mkdir tests
touch tests/__init__.py
touch tests/test_example.py
```

3. **Write first test**:
```python
# tests/test_example.py
def test_basic():
    assert 1 + 1 == 2
```

4. **Run tests**:
```bash
pytest
```

5. **Add coverage** (optional):
```bash
pytest --cov=src --cov-report=term
```

6. **Add npm script**:
```json
{
  "scripts": {
    "test:python": "pytest -v",
    "test:python:cov": "pytest -v --cov=src --cov-report=term"
  }
}
```

**Testing Strategy**:
- **Phase 1**: Test new code (require tests for new features)
- **Phase 2**: Test critical paths (payment processing, auth, etc.)
- **Phase 3**: Increase coverage gradually (aim for 80%+)

### TypeScript/JavaScript Projects

1. **Install Jest**:
```bash
npm install --save-dev jest ts-jest @types/jest
```

2. **Create Jest config** (`jest.config.js`):
```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
};
```

3. **Write first test**:
```typescript
// src/__tests__/example.test.ts
test('basic test', () => {
  expect(1 + 1).toBe(2);
});
```

4. **Run tests**:
```bash
npx jest
```

5. **Add npm script**:
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

**Team Communication**:
```
🧪 Testing Framework Setup

We've set up [pytest/Jest] for automated testing.

Current policy:
- All NEW code requires tests
- Old code: add tests opportunistically
- PRs without tests need justification

How to write tests:
- [Link to testing guide]
- Examples in tests/ directory
- Ask if you need help!

Run tests: `npm test`
```

## Phase 5: CI/CD (Week 3)

**Goal**: Automate quality checks on every push/PR.

**Effort**: 4-8 hours

**Impact**: High (enforces quality), Low disruption (runs automatically)

### Create GitHub Actions Workflow

1. **Create workflow file** (`.github/workflows/ci.yml`):

**Python only**:
```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.10'
      - run: pip install uv
      - run: uv venv
      - run: uv pip sync requirements-dev.lock
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src --ignore-missing-imports
      - run: uv run pytest -v --cov=src
```

**TypeScript only**:
```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check
      - run: npm run typecheck
      - run: npm test
```

**Polyglot** (see [CI/CD Setup Guide](quality-setup-cicd.md))

2. **Push and verify**:
```bash
git add .github/workflows/ci.yml
git commit -m "Add CI/CD pipeline"
git push origin main

# Check GitHub Actions tab for results
```

3. **Enable branch protection**:
- GitHub Settings → Branches → Add rule
- Branch name pattern: `main`
- Check "Require status checks to pass before merging"
- Select your CI workflow

**Team Communication**:
```
🤖 CI/CD Pipeline Active

All PRs now run automated quality checks.

What this means:
- Linting, formatting, type-checking, tests run on every PR
- PRs must pass checks before merging
- No manual "did you run the linter?" questions

Green checkmark = good to merge
Red X = fix issues before merging

See results in GitHub Actions tab on your PR.
```

## Phase 6: Pre-commit Hooks (Week 4)

**Goal**: Catch issues before pushing to GitHub.

**Effort**: 2-4 hours

**Impact**: High (fast feedback), Low disruption (auto-fixes most issues)

### Setup Husky + lint-staged

1. **Install tools**:
```bash
npm install --save-dev husky lint-staged
```

2. **Initialize Husky**:
```bash
npx husky init
```

3. **Configure lint-staged** (`package.json`):

**Python only**:
```json
{
  "lint-staged": {
    "*.py": ["ruff format", "ruff check --fix"]
  }
}
```

**TypeScript only**:
```json
{
  "lint-staged": {
    "*.{ts,js}": ["prettier --write", "eslint --fix"]
  }
}
```

**Polyglot**:
```json
{
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"],
    "*.py": ["ruff format", "ruff check --fix"]
  }
}
```

4. **Create pre-commit hook** (`.husky/pre-commit`):
```bash
#!/bin/sh
npx lint-staged
```

5. **Test**:
```bash
# Make a change
echo "export const x = 1" > test.ts

# Commit (hook runs automatically)
git add test.ts
git commit -m "Test hooks"

# Hook should format and lint automatically
```

**Team Communication**:
```
⚡ Pre-commit Hooks Enabled

Git will now automatically format and lint your code on commit.

What to expect:
- Commit takes 2-5 seconds longer (runs formatters)
- Code is auto-fixed if possible
- Commit fails if unfixable errors found

Setup required:
- Pull latest main: `git pull origin main`
- Reinstall dependencies: `npm install`
- Hooks activate automatically

To bypass (emergencies only): `git commit --no-verify`
```

## Common Issues During Migration

### Issue: Too many linting errors

**Problem**: 1000+ errors on first run

**Solution**:
1. **Use `--fix` flags**: Auto-fix what you can
2. **Ignore legacy code**: Add to exclude patterns
3. **Disable strict rules**: Start lenient, tighten later
4. **Fix incrementally**: One category at a time

**Example** (Ruff):
```toml
[tool.ruff.lint]
select = ["E", "F"]  # Just basics
exclude = ["legacy/**", "vendor/**"]
```

### Issue: Tests failing in CI but passing locally

**Problem**: Environment differences

**Solution**:
1. **Use same Python/Node versions** in CI as local
2. **Pin dependencies** (requirements.txt, package-lock.json)
3. **Set environment variables** in CI
4. **Use `npm ci`** instead of `npm install` in CI

### Issue: Pre-commit hooks too slow

**Problem**: Commit takes 30+ seconds

**Solution**:
1. **Remove expensive operations** (full test suite → related tests only)
2. **Use parallel execution** (`parallel: true` in lint-staged)
3. **Cache dependencies** (not applicable to pre-commit, but helps CI)

**Example** (fast hooks):
```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"],  // Fast
    // Don't include "npm test" here - too slow
  }
}
```

### Issue: Team resistance

**Problem**: "Why are we changing everything?"

**Solution**:
1. **Explain benefits**: Consistency, fewer bugs, faster reviews
2. **Show examples**: Before/after comparisons
3. **Make it easy**: Provide clear docs and one-command setup
4. **Iterate**: Don't do everything at once

**Sample Announcement**:
```
📢 Quality Control Improvements

Why we're doing this:
- 40% less time in code review (no style debates)
- Catch bugs before production (linting + types)
- Onboarding easier (automated checks guide new devs)

What's changing:
- Week 1: Auto-formatting (one-time reformat)
- Week 2: Linting (auto-fixes most issues)
- Week 3: CI/CD (automated checks on PRs)
- Week 4: Pre-commit hooks (optional, recommended)

Questions? Concerns? Let's discuss!
```

## Rollback Plan

If things go wrong, you can rollback easily:

### Remove Formatting

```bash
git revert <commit-hash>  # Revert formatting commit
```

### Remove Linting

```bash
rm pyproject.toml  # or eslint.config.mjs
git add .
git commit -m "Remove linting config"
```

### Remove CI/CD

```bash
rm .github/workflows/ci.yml
git add .github/workflows/ci.yml
git commit -m "Remove CI/CD"
```

### Remove Pre-commit Hooks

```bash
rm -rf .husky
npm uninstall husky lint-staged
git add .
git commit -m "Remove pre-commit hooks"
```

## Success Metrics

Track these metrics to measure success:

**Before Quality Control**:
- Time in code review: X hours/week
- Bugs found in production: Y/month
- Style-related PR comments: Z/week

**After Quality Control** (3 months):
- Time in code review: ↓ 30-50%
- Bugs found in production: ↓ 20-40%
- Style-related PR comments: ↓ 90%+

**Other Benefits**:
- Faster onboarding (new devs get instant feedback)
- Fewer "why is this broken?" moments
- More confidence in refactoring

## Timeline Summary

**Week 1: Formatting**
- Install Ruff/Prettier
- Format entire codebase (one commit)
- Add npm scripts

**Week 2: Linting + Type Checking**
- Install Ruff/ESLint/mypy
- Fix linting issues incrementally
- Add lenient type checking

**Week 3: Testing + CI/CD**
- Set up pytest/Jest
- Require tests for new code
- Create GitHub Actions workflow
- Enable branch protection

**Week 4: Pre-commit Hooks**
- Install Husky + lint-staged
- Create pre-commit hook
- Test and announce to team

**Total**: 4 weeks, ~20-40 hours effort

## Resources

**This Guide**:
- [Python Setup](quality-setup-python.md)
- [TypeScript/JavaScript Setup](quality-setup-typescript-javascript.md)
- [Git Hooks Setup](quality-setup-git-hooks.md)
- [CI/CD Setup](quality-setup-cicd.md)
- [Polyglot Integration](quality-setup-polyglot.md)

**External Resources**:
- [Ruff Migration Guide](https://docs.astral.sh/ruff/migrating-from-flake8/)
- [ESLint Migration Guide](https://eslint.org/docs/latest/use/migrate-to-9.0.0)
- [Introducing Prettier to an Existing Project](https://prettier.io/docs/en/integrating-with-linters.html)

## Conclusion

Quality control adoption is a journey, not a destination. Start small, iterate, and adjust based on team feedback. The tools are flexible - use what works for your team.

**Key Principles**:
1. **Incremental adoption**: Don't do everything at once
2. **Team communication**: Explain why, show benefits
3. **Auto-fix over block**: Help developers, don't frustrate them
4. **Iterate**: Adjust rules based on team needs

**Next Steps**: Pick a phase and get started! Start with formatting (easiest, highest impact).
