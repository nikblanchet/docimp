# Git Hooks Setup with Husky and lint-staged

This guide shows how to set up automated quality control using git hooks with Husky and lint-staged. Git hooks run automatically during git operations, providing fast feedback before code leaves your machine.

## Overview

**Tools**:
- **Husky**: Manages git hook scripts (modern, npm-based)
- **lint-staged**: Runs tools only on staged files (performance optimization)

**Benefits**:
- **Fast feedback**: Catch issues in 2-10 seconds before committing
- **Auto-fix**: Formatters and linters fix issues automatically
- **Selective**: Only checks files you're committing (not entire codebase)
- **Team consistency**: Every team member gets same checks

## Why Husky + lint-staged?

**Husky** makes git hooks easy:
- Installed via npm (no manual .git/hooks scripts)
- Works across teams (everyone gets same hooks)
- Easy to configure and maintain
- Supports all git hooks (pre-commit, pre-push, commit-msg, etc.)

**lint-staged** optimizes performance:
- Runs tools only on staged files (fast)
- Prevents slow full-codebase checks on every commit
- Supports multiple file types and tools
- Parallel execution for speed

## Installation

```bash
# Install Husky and lint-staged
npm install --save-dev husky lint-staged

# Initialize Husky (creates .husky directory)
npx husky init

# Or for older npm versions:
npm pkg set scripts.prepare="husky"
npm run prepare
```

## Configuration

### package.json (lint-staged configuration)

Add lint-staged configuration to `package.json`:

**Python-only projects**:
```json
{
  "lint-staged": {
    "*.py": ["ruff format", "ruff check --fix"]
  }
}
```

**TypeScript/JavaScript-only projects**:
```json
{
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"]
  }
}
```

**Polyglot projects (Python + TypeScript/JavaScript)**:
```json
{
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"],
    "*.py": ["ruff format", "ruff check --fix"]
  }
}
```

**With additional file types**:
```json
{
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"],
    "*.py": ["ruff format", "ruff check --fix"],
    "*.{json,md,yml,yaml}": ["prettier --write"]
  }
}
```

### .husky/pre-commit (Git hook script)

Create `.husky/pre-commit` file:

```bash
#!/bin/sh
# Run lint-staged on git commit
npx lint-staged
```

Make it executable (Unix/Mac):
```bash
chmod +x .husky/pre-commit
```

**For monorepos or subdirectories**:
```bash
#!/bin/sh
# Run lint-staged from specific directory
cd cli && npx lint-staged
```

### Alternative: Standalone lint-staged config

Instead of `package.json`, create `.lintstagedrc.json`:

```json
{
  "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"],
  "*.py": ["ruff format", "ruff check --fix"]
}
```

Or `.lintstagedrc.js` for more control:

```javascript
export default {
  '*.{ts,js,mjs,cjs}': ['prettier --write', 'eslint --fix'],
  '*.py': ['ruff format', 'ruff check --fix'],
};
```

## Usage

### Normal workflow

```bash
# Stage files
git add src/index.ts src/utils.py

# Commit (triggers pre-commit hook automatically)
git commit -m "Add new features"

# Behind the scenes:
# 1. Husky runs .husky/pre-commit
# 2. lint-staged runs on src/index.ts and src/utils.py only
# 3. prettier/eslint/ruff format and fix issues
# 4. If successful, commit proceeds
# 5. If errors, commit aborts with error messages
```

### Bypassing hooks (use sparingly)

```bash
# Skip pre-commit hook
git commit --no-verify -m "WIP: bypass hooks"

# Or shorthand
git commit -n -m "WIP: bypass hooks"
```

**When to bypass**:
- Work-in-progress commits (use branches)
- Emergency hotfixes (fix later)
- Debugging hook issues

**Best practice**: Don't bypass regularly. Fix issues instead.

### Testing hooks manually

```bash
# Test lint-staged without committing
npx lint-staged

# Test specific hook
.husky/pre-commit
```

## Advanced Configuration

### Sequential vs Parallel Execution

By default, lint-staged runs commands in sequence. For parallel:

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"],
    "*.py": ["ruff format"]
  },
  "parallel": true
}
```

**Trade-off**: Parallel is faster but harder to debug on failure.

### Conditional Commands

Run different commands based on conditions:

```javascript
// .lintstagedrc.js
export default {
  '*.ts': (filenames) => [
    `prettier --write ${filenames.join(' ')}`,
    `eslint --fix ${filenames.join(' ')}`,
    `tsc --noEmit ${filenames.join(' ')}`,  // Type-check changed files only
  ],
};
```

### Ignoring Patterns

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"],
    "!(dist|node_modules)/**/*.ts": ["jest --findRelatedTests"]
  }
}
```

### Multiple Hooks

Create additional hooks:

**.husky/pre-push** (runs on `git push`):
```bash
#!/bin/sh
# Run full test suite before push
npm test
```

**.husky/commit-msg** (validates commit messages):
```bash
#!/bin/sh
# Validate conventional commit format
npx --no -- commitlint --edit "$1"
```

## Common Patterns

### Pattern 1: Format then Lint

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

Order matters: Format first (Prettier), then lint (ESLint).

### Pattern 2: Multi-Language Projects

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
    "*.{js,jsx}": ["prettier --write", "eslint --fix"],
    "*.py": ["ruff format", "ruff check --fix"],
    "*.{css,scss}": ["prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

### Pattern 3: Type-Checking Changed Files

```javascript
// .lintstagedrc.js
export default {
  '*.ts': (filenames) => [
    `prettier --write ${filenames.join(' ')}`,
    `eslint --fix ${filenames.join(' ')}`,
    'tsc --noEmit',  // Type-check entire project (fast with --incremental)
  ],
};
```

### Pattern 4: Test Related Files

```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix", "jest --bail --findRelatedTests"]
  }
}
```

`--findRelatedTests`: Jest runs only tests related to changed files.

### Pattern 5: Monorepo Setup

```json
{
  "lint-staged": {
    "packages/frontend/**/*.ts": "cd packages/frontend && npm run lint",
    "packages/backend/**/*.py": "cd packages/backend && ruff check --fix"
  }
}
```

## Troubleshooting

### "Husky command not found"

Ensure Husky is installed and initialized:
```bash
npm install --save-dev husky
npx husky init
```

### "lint-staged command not found"

Install lint-staged:
```bash
npm install --save-dev lint-staged
```

### Pre-commit hook not running

1. Check if `.husky/pre-commit` exists and is executable:
```bash
ls -la .husky/pre-commit
chmod +x .husky/pre-commit
```

2. Verify `prepare` script in package.json:
```json
{
  "scripts": {
    "prepare": "husky"
  }
}
```

3. Run prepare script:
```bash
npm run prepare
```

### Hooks running on wrong directory

For monorepos, ensure hook navigates to correct directory:
```bash
#!/bin/sh
cd cli && npx lint-staged
```

### Slow pre-commit hook

Lint-staged should be fast (2-10 seconds). If slow:

1. Check if running on entire codebase (should only run on staged files)
2. Remove expensive operations (full test suite → related tests only)
3. Use parallel execution:
```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  },
  "parallel": true
}
```

### Hook fails with "command not found"

Ensure tools are installed as devDependencies:
```bash
npm install --save-dev prettier eslint ruff
```

Or use absolute paths:
```json
{
  "lint-staged": {
    "*.py": ["./node_modules/.bin/ruff format"]
  }
}
```

### Windows path issues

Use cross-platform paths and commands:
```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

Avoid Unix-specific commands (chmod, sh, etc.) in lint-staged config.

## IDE Integration

### VSCode

Hooks work automatically, no configuration needed. For better DX:

1. Install extensions (ESLint, Prettier, Ruff)
2. Enable format-on-save (see IDE Integration in language guides)
3. Hooks provide safety net for manual saves

### WebStorm / IntelliJ IDEA

Hooks work automatically. Enable "Reformat code" on commit:
- Settings → Version Control → Commit
- Check "Reformat code"
- Check "Optimize imports"

## Alternative: Without Husky

Use git hooks directly (less portable, but simpler for single-dev projects):

**.git/hooks/pre-commit**:
```bash
#!/bin/sh
npx lint-staged
```

Make executable:
```bash
chmod +x .git/hooks/pre-commit
```

**Downside**: Not committed to repo, each developer must set up manually.

## Migrating from Other Tools

### From pre-commit (Python)

**Before** (`.pre-commit-config.yaml`):
```yaml
repos:
  - repo: https://github.com/pre-commit/mirrors-prettier
    hooks:
      - id: prettier
```

**After** (`package.json`):
```json
{
  "lint-staged": {
    "*.ts": ["prettier --write"]
  }
}
```

### From Git hooks (manual)

**Before** (`.git/hooks/pre-commit`):
```bash
#!/bin/sh
prettier --write src/**/*.ts
eslint --fix src/**/*.ts
```

**After** (Husky + lint-staged):
1. Install Husky and lint-staged
2. Configure lint-staged in package.json
3. Create `.husky/pre-commit` (see above)

Benefits: Runs only on staged files, team-wide consistency.

## Best Practices

### 1. Keep Hooks Fast

**Goal**: < 10 seconds for pre-commit

**Good**:
```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix"]
  }
}
```

**Bad** (slow):
```json
{
  "lint-staged": {
    "*.ts": ["prettier --write", "eslint --fix", "npm test", "npm run build"]
  }
}
```

Move slow operations to pre-push or CI/CD.

### 2. Auto-fix, Don't Block

Use auto-fix modes for formatters and linters:
- `prettier --write` (not `--check`)
- `eslint --fix` (not just `eslint`)
- `ruff check --fix` (not `ruff check`)

Hooks should fix issues, not just report them.

### 3. Document Bypass Procedure

Add to README:
```markdown
## Bypassing pre-commit hooks

If you need to bypass hooks (WIP commits, emergencies):

\`\`\`bash
git commit --no-verify -m "WIP: bypass hooks"
\`\`\`

Fix issues in next commit.
```

### 4. Test Hooks in CI

Ensure hooks don't silently fail:

```yaml
# .github/workflows/ci.yml
- name: Validate hooks work
  run: |
    git add .
    npx lint-staged
```

### 5. Use Pre-Push for Expensive Checks

**Pre-commit**: Fast checks (format, lint)
**Pre-push**: Slow checks (tests, build)

```bash
# .husky/pre-push
#!/bin/sh
npm test
npm run build
```

## Performance Comparison

**Without lint-staged** (entire codebase):
- Format 1000 files: 30-60 seconds
- Lint 1000 files: 45-90 seconds
- Total: 75-150 seconds

**With lint-staged** (5 changed files):
- Format 5 files: 0.5-1 seconds
- Lint 5 files: 1-2 seconds
- Total: 2-5 seconds

**Speedup**: 15-30x faster

## Resources

**Official Documentation**:
- [Husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/okonet/lint-staged)
- [Git Hooks Documentation](https://git-scm.com/docs/githooks)

**Community Resources**:
- [Husky Migration Guide](https://typicode.github.io/husky/migrating.html)
- [lint-staged Examples](https://github.com/okonet/lint-staged#examples)

## Example: Complete Setup

**1. Install tools**:
```bash
npm install --save-dev husky lint-staged prettier eslint
```

**2. Initialize Husky**:
```bash
npx husky init
```

**3. Configure lint-staged** (`package.json`):
```json
{
  "scripts": {
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{ts,js,mjs,cjs}": ["prettier --write", "eslint --fix"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

**4. Create pre-commit hook** (`.husky/pre-commit`):
```bash
#!/bin/sh
npx lint-staged
```

**5. Test**:
```bash
# Make a change
echo "export const x = 1" > src/test.ts

# Stage and commit
git add src/test.ts
git commit -m "Test hooks"

# Hooks run automatically!
```

## Next Steps

- **Add CI/CD validation**: [CI/CD Setup →](quality-setup-cicd.md)
- **Integrate with Python**: [Python Setup →](quality-setup-python.md)
- **Integrate with TypeScript/JavaScript**: [TypeScript/JavaScript Setup →](quality-setup-typescript-javascript.md)
- **Polyglot projects**: [Polyglot Integration →](quality-setup-polyglot.md)
