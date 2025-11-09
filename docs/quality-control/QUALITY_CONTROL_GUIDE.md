# Quality Control Setup Guide

This guide documents a comprehensive, battle-tested quality control setup extracted from DocImp. It provides automated code quality enforcement through linting, formatting, type-checking, and testing across Python, TypeScript, and JavaScript.

## Why This Setup?

**Automated Quality Enforcement**: Quality checks run automatically on git commit and in CI/CD, catching issues before they reach production.

**Multi-Layer Defense**:
1. **Pre-commit hooks** - Fast feedback on staged changes (seconds)
2. **CI/CD pipelines** - Comprehensive validation before merge (minutes)
3. **IDE integration** - Real-time feedback while coding

**Polyglot Support**: Works seamlessly with Python, TypeScript, and JavaScript in the same project or independently.

## Terminology

Understanding the categories of quality tools:

### 1. **Linters** (Code Quality Checkers)
Analyze code for errors, style issues, and anti-patterns WITHOUT modifying files.

**Examples**:
- **ESLint** (JavaScript/TypeScript) - Detects bugs, enforces coding standards
- **Ruff** (Python) - Fast all-in-one linter replacing flake8, isort, pyupgrade

**When they run**: Pre-commit (auto-fix mode), CI/CD (check mode)

### 2. **Formatters** (Code Style Enforcers)
Automatically rewrite code to match style rules. No debates about spacing or commas.

**Examples**:
- **Prettier** (JavaScript/TypeScript/JSON/Markdown) - Opinionated formatter
- **Ruff format** (Python) - Black-compatible formatter

**When they run**: Pre-commit (auto-fix), CI/CD (check mode), on-demand

### 3. **Type Checkers** (Static Analysis)
Verify type correctness without running code. Catch type errors at compile time.

**Examples**:
- **TypeScript compiler** (`tsc`) - Types for TypeScript + JSDoc validation for JavaScript
- **mypy** (Python) - Optional static typing for Python

**When they run**: CI/CD, build step, on-demand

### 4. **Test Runners** (Automated Testing)
Execute test suites and report results. Essential for regression prevention.

**Examples**:
- **Jest** (JavaScript/TypeScript) - Fast, batteries-included test framework
- **pytest** (Python) - Flexible, plugin-rich testing framework

**When they run**: CI/CD, on-demand, watch mode during development

### 5. **Git Hooks** (Client-Side Automation)
Scripts that run automatically during git operations. Enforces quality before commit.

**Examples**:
- **Husky** - Manages git hook scripts
- **lint-staged** - Runs tools only on staged files (performance optimization)

**When they run**: `git commit`, `git push` (configurable)

### 6. **CI/CD Pipelines** (Server-Side Automation)
Automated workflows that run on every push/PR. Final quality gate before merge.

**Examples**:
- **GitHub Actions** - Run all quality checks on GitHub's infrastructure
- **Other CI systems** - GitLab CI, CircleCI, Jenkins (same patterns apply)

**When they run**: On push, on pull request, scheduled

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Developer writes code and runs `git commit`                │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  Git Hook Layer (Husky + lint-staged)                       │
│  - Runs formatters in auto-fix mode (Prettier, Ruff format) │
│  - Runs linters in auto-fix mode (ESLint, Ruff check)       │
│  - FAST: Only checks staged files                           │
│  - Result: Commit succeeds or fails                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v (if commit succeeds)
┌─────────────────────────────────────────────────────────────┐
│  Code pushed to remote (GitHub, GitLab, etc.)               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     v
┌─────────────────────────────────────────────────────────────┐
│  CI/CD Pipeline (GitHub Actions)                            │
│  - Runs formatters in CHECK mode (no modifications)         │
│  - Runs linters in CHECK mode                               │
│  - Runs type checkers (mypy, tsc)                           │
│  - Runs full test suite (pytest, Jest)                      │
│  - COMPREHENSIVE: Checks entire codebase                    │
│  - Result: PR can merge or must fix issues                  │
└─────────────────────────────────────────────────────────────┘
```

## What's Included

This setup provides:

**For Python**:
- Ruff (linting + formatting, replaces 10+ tools)
- mypy (type checking)
- pytest (testing with coverage)

**For TypeScript/JavaScript**:
- ESLint with 6 plugins (including aggressive JSDoc validation)
- Prettier (formatting)
- TypeScript compiler (type checking for TS + JSDoc validation for JS)
- Jest (testing with coverage)

**For All Languages**:
- Husky + lint-staged (pre-commit hooks)
- GitHub Actions workflows (CI/CD)
- NPM scripts (task orchestration)

## Modular Documentation

Choose the modules you need:

### Language-Specific Setup

📘 **[Python Setup](quality-setup-python.md)** - Ruff, mypy, pytest
- Standalone Python quality control
- Works with pure Python projects
- No TypeScript/JavaScript dependencies

📗 **[TypeScript/JavaScript Setup](quality-setup-typescript-javascript.md)** - ESLint, Prettier, Jest, TypeScript
- Standalone TypeScript/JavaScript quality control
- Works with Node.js projects
- No Python dependencies

### Integration Modules

🔗 **[Git Hooks Setup](quality-setup-git-hooks.md)** - Husky, lint-staged
- Pre-commit automation
- Language-agnostic patterns
- Works with Python, TypeScript/JavaScript, or both

🔗 **[CI/CD Setup](quality-setup-cicd.md)** - GitHub Actions
- Continuous integration workflows
- Language-specific job patterns
- Matrix testing strategies

🔗 **[Polyglot Integration](quality-setup-polyglot.md)** - Combining Python + TypeScript/JavaScript
- Monorepo structure
- Unified pre-commit hooks
- Combined CI/CD pipelines

### Adoption Guide

📚 **[Migration Guide](quality-migration-guide.md)** - How to adopt this setup
- Incremental adoption strategy
- Existing project integration
- Common pitfalls and solutions

## Quick Start

**For Python-only projects**:
1. Read [Python Setup](quality-setup-python.md)
2. Add [Git Hooks](quality-setup-git-hooks.md#python-hooks)
3. Add [CI/CD](quality-setup-cicd.md#python-job)

**For TypeScript/JavaScript-only projects**:
1. Read [TypeScript/JavaScript Setup](quality-setup-typescript-javascript.md)
2. Add [Git Hooks](quality-setup-git-hooks.md#typescript-javascript-hooks)
3. Add [CI/CD](quality-setup-cicd.md#typescript-javascript-job)

**For polyglot projects (Python + TypeScript/JavaScript)**:
1. Read [Python Setup](quality-setup-python.md) and [TypeScript/JavaScript Setup](quality-setup-typescript-javascript.md)
2. Read [Polyglot Integration](quality-setup-polyglot.md)
3. Add [Git Hooks](quality-setup-git-hooks.md#polyglot-hooks)
4. Add [CI/CD](quality-setup-cicd.md#polyglot-pipeline)

## Benefits of This Setup

**Consistency**: All code formatted the same way, no style debates.

**Early Error Detection**: Catch issues at commit time, not in production.

**Automated Enforcement**: No manual code review for style issues.

**Fast Feedback Loop**:
- Pre-commit: 2-10 seconds (staged files only)
- CI/CD: 2-5 minutes (full codebase)

**Team Scalability**: New contributors get instant feedback without senior review.

**Maintainability**: Tools maintain themselves (auto-update via Dependabot).

## Tool Selection Rationale

### Why Ruff (Python)?
- **Fast**: 10-100x faster than flake8/pylint (Rust-based)
- **Comprehensive**: Replaces flake8, isort, pyupgrade, and 10+ plugins
- **Modern**: Built for Python 3.13+ with aggressive modernization
- **Batteries-included**: Linting + formatting in one tool

### Why ESLint (JavaScript/TypeScript)?
- **Ecosystem**: Massive plugin ecosystem (6 plugins in this setup)
- **Configurable**: Granular rule control
- **JSDoc validation**: Real type-checking for JavaScript (with TypeScript compiler)
- **Industry standard**: Used by most JavaScript projects

### Why Prettier?
- **Opinionated**: Minimal configuration, no debates
- **Multi-language**: JS/TS/JSON/Markdown/CSS/HTML
- **Fast**: Instant formatting
- **Editor integration**: Works in VSCode, Vim, Emacs, etc.

### Why TypeScript Compiler for JavaScript?
- **Real validation**: Not just parsing, actual type-checking
- **`checkJs: true`**: Validates JSDoc types against implementation
- **No separate tool**: TypeScript already installed, no new dependency

### Why Jest/pytest?
- **Fast**: Parallel test execution
- **Batteries-included**: Coverage, mocking, snapshots built-in
- **Developer experience**: Watch mode, interactive debugging
- **Community**: Massive ecosystem of plugins and extensions

## Common Patterns

### Pre-commit vs CI/CD

**Pre-commit hooks** (Husky + lint-staged):
- **Goal**: Fast feedback, auto-fix issues
- **Mode**: Auto-fix (modify files)
- **Scope**: Staged files only
- **Time**: 2-10 seconds
- **Bypassable**: `git commit --no-verify` (use sparingly)

**CI/CD pipelines** (GitHub Actions):
- **Goal**: Comprehensive validation, prevent bad merges
- **Mode**: Check only (no modifications)
- **Scope**: Entire codebase
- **Time**: 2-5 minutes
- **Not bypassable**: Must pass to merge

### Auto-fix vs Check Mode

Most tools support both modes:

**Auto-fix mode** (pre-commit):
```bash
prettier --write src/**/*.ts        # Rewrites files
eslint --fix src/**/*.ts            # Applies automatic fixes
ruff format .                       # Formats Python files
ruff check --fix .                  # Fixes Python issues
```

**Check mode** (CI/CD):
```bash
prettier --check src/**/*.ts        # Exits non-zero if not formatted
eslint src/**/*.ts                  # Exits non-zero if issues found
ruff format --check .               # Exits non-zero if not formatted
ruff check .                        # Exits non-zero if issues found
```

### Incremental Adoption

You don't need to adopt everything at once:

**Phase 1: Formatting only**
- Add Prettier (JS/TS) or Ruff format (Python)
- Run once on entire codebase
- Add pre-commit hook
- Result: No more style debates

**Phase 2: Linting**
- Add ESLint (JS/TS) or Ruff check (Python)
- Fix existing issues incrementally
- Add pre-commit hook
- Result: Catch common bugs automatically

**Phase 3: Type checking**
- Add TypeScript or mypy
- Add types incrementally (start with new code)
- Add to CI/CD
- Result: Type safety without runtime overhead

**Phase 4: Testing**
- Add Jest or pytest
- Write tests for new code
- Add coverage requirements
- Result: Regression prevention

## Resources

**Official Documentation**:
- [Ruff](https://docs.astral.sh/ruff/)
- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)
- [TypeScript](https://www.typescriptlang.org/)
- [mypy](https://mypy-lang.org/)
- [Jest](https://jestjs.io/)
- [pytest](https://docs.pytest.org/)
- [Husky](https://typicode.github.io/husky/)
- [lint-staged](https://github.com/okonet/lint-staged)

**Community Resources**:
- [awesome-eslint](https://github.com/dustinspecker/awesome-eslint)
- [awesome-pytest](https://github.com/augustogoulart/awesome-pytest)
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/)

## License

This guide documents patterns from DocImp (AGPL-3.0). Quality control tool configurations are generally not subject to copyright (they're functional settings), but check each tool's license for distribution requirements.

## Contributing

Found an issue or have a suggestion? This is extracted documentation from DocImp - contribute improvements there and they'll flow back to this guide.

## Next Steps

Choose a module to get started:
- [Python Setup →](quality-setup-python.md)
- [TypeScript/JavaScript Setup →](quality-setup-typescript-javascript.md)
- [Git Hooks Setup →](quality-setup-git-hooks.md)
- [CI/CD Setup →](quality-setup-cicd.md)
- [Polyglot Integration →](quality-setup-polyglot.md)
- [Migration Guide →](quality-migration-guide.md)
