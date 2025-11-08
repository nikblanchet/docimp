# Python Quality Control Setup

This guide shows how to set up comprehensive quality control for Python projects using Ruff, mypy, and pytest.

## Overview

**Tools**:
- **Ruff**: All-in-one linter + formatter (replaces flake8, isort, pyupgrade, Black)
- **mypy**: Optional static type checking
- **pytest**: Testing framework with coverage

**Target**: Python 3.13+ (works with 3.9+, adjust `target-version`)

## Prerequisites

### Installing uv

**macOS** (Homebrew):
```bash
brew install uv
```

**Linux/macOS** (official installer):
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**Windows** (PowerShell):
```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**With pip** (all platforms):
```bash
pip install uv
```

**Verify installation**:
```bash
uv --version
```

## Why Ruff?

Ruff is a modern, Rust-based tool that combines 10+ Python tools into one:

**Replaces**:
- flake8 (linting)
- isort (import sorting)
- pyupgrade (syntax modernization)
- Black (formatting)
- And 50+ flake8 plugins

**Benefits**:
- **10-100x faster** than traditional Python tools
- **Single tool** for linting + formatting
- **Zero config** works well, full customization available
- **Drop-in replacement** for existing tools

## Installation

```bash
# Install Ruff
uv pip install ruff

# Optional: Install mypy for type checking
uv pip install mypy

# Optional: Install pytest for testing
uv pip install pytest pytest-cov
```

Or add to `requirements-dev.in`:
```
ruff>=0.1.0
mypy>=1.7.0
pytest>=7.4.0
pytest-cov>=4.1.0
```

Then compile and sync:
```bash
uv pip compile requirements-dev.in -o requirements-dev.lock
uv pip sync requirements-dev.lock
```

## Configuration

### pyproject.toml (Ruff Configuration)

Create `pyproject.toml` in your project root:

```toml
[tool.ruff]
# Exclude test directories and virtual environments
exclude = [
    ".venv",
    "venv",
    "__pycache__",
    ".pytest_cache",
]

# Python 3.13+ required (adjust as needed)
target-version = "py313"

# Line length limit (88 chars is Black default)
line-length = 88

[tool.ruff.lint]
# Enable comprehensive rule set for modern Python 3.13+
#
# Rule Groups:
# E: pycodestyle errors (PEP 8 violations)
# F: pyflakes (undefined names, unused imports, etc.)
# DTZ: flake8-datetimez (timezone-naive datetime usage)
# UP: pyupgrade (modernize syntax - dict vs Dict, | vs Union, etc.)
# PTH: flake8-use-pathlib (prefer pathlib.Path over os.path)
# I: isort (import sorting and organization)
# SIM: flake8-simplify (remove unnecessary complexity)
# PERF: perflint (performance anti-patterns)
# YTT: flake8-2020 (modern sys.version_info checks)
select = [
    "E",     # pycodestyle errors
    "F",     # pyflakes
    "DTZ",   # flake8-datetimez - timezone-aware datetime
    "UP",    # pyupgrade - modernize syntax (Python 3.9+ type hints)
    "PTH",   # flake8-use-pathlib - prefer Path over os.path
    "I",     # isort - import sorting
    "SIM",   # flake8-simplify - code simplification
    "PERF",  # perflint - performance anti-patterns
    "YTT",   # flake8-2020 - modern version checks
]

# Don't ignore any rules - we want strict enforcement
ignore = []
```

**Customization options**:

For **less strict** projects, start with just E and F:
```toml
[tool.ruff.lint]
select = ["E", "F"]  # Just PEP 8 + basic errors
```

For **maximum strictness**, add more rule categories:
```toml
[tool.ruff.lint]
select = [
    "E", "F", "DTZ", "UP", "PTH", "I", "SIM", "PERF", "YTT",
    "B",     # flake8-bugbear - likely bugs
    "C90",   # mccabe - complexity checking
    "N",     # pep8-naming - naming conventions
    "RUF",   # Ruff-specific rules
]
```

### pytest.ini (Testing Configuration)

Create `pytest.ini` in your project root:

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*

addopts =
    -v
    --strict-markers
    --tb=short

markers =
    unit: Unit tests
    integration: Integration tests
    slow: Tests that take a long time to run
```

**Explanation**:
- `testpaths`: Where pytest looks for tests
- `python_files`: Test file naming pattern
- `-v`: Verbose output
- `--strict-markers`: Fail on typos in test markers
- `--tb=short`: Short traceback format
- `markers`: Custom test categories

### mypy Configuration (Optional)

For type checking, add to `pyproject.toml`:

```toml
[tool.mypy]
python_version = "3.13"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
```

Or use CLI flags (simpler for starting out):
```bash
mypy src --ignore-missing-imports
```

## Usage

### Linting

Check for issues without modifying files:
```bash
ruff check .
```

Auto-fix issues (safe fixes only):
```bash
ruff check --fix .
```

Check specific directory:
```bash
ruff check src/
```

### Formatting

Format files (modifies in-place):
```bash
ruff format .
```

Check formatting without modifying:
```bash
ruff format --check .
```

Show diff of what would change:
```bash
ruff format --diff .
```

### Type Checking

Run mypy on your source code:
```bash
mypy src --ignore-missing-imports
```

With stricter settings:
```bash
mypy src --strict
```

### Testing

Run all tests:
```bash
pytest
```

Run with coverage:
```bash
pytest --cov=src --cov-report=term
```

Run specific test categories:
```bash
pytest -m unit        # Only unit tests
pytest -m integration # Only integration tests
pytest -m "not slow"  # Skip slow tests
```

Run in watch mode (requires pytest-watch):
```bash
uv pip install pytest-watch
ptw
```

## NPM Scripts (Optional)

If using npm/yarn for task orchestration (common in polyglot projects), add to `package.json`:

```json
{
  "scripts": {
    "lint:python": "ruff check analyzer/",
    "format:python": "ruff format analyzer/",
    "format:python:check": "ruff format --check analyzer/",
    "test:python": "pytest analyzer/tests/ -v",
    "test:python:cov": "pytest analyzer/tests/ -v --cov=analyzer/src --cov-report=term",
    "typecheck:python": "mypy analyzer/src --ignore-missing-imports"
  }
}
```

Then run:
```bash
npm run lint:python
npm run format:python
npm run test:python
```

## IDE Integration

### VSCode

Install extensions:
- **Ruff** (charliermarsh.ruff) - Official Ruff extension
- **Python** (ms-python.python) - Python IntelliSense
- **Mypy Type Checker** (ms-python.mypy-type-checker) - Optional

Add to `.vscode/settings.json`:
```json
{
  "[python]": {
    "editor.defaultFormatter": "charliermarsh.ruff",
    "editor.formatOnSave": true,
    "editor.codeActionsOnSave": {
      "source.fixAll.ruff": "explicit",
      "source.organizeImports.ruff": "explicit"
    }
  },
  "python.linting.enabled": false,  // Disable default linter
  "ruff.enable": true
}
```

### PyCharm

1. Install Ruff as external tool:
   - Settings → Tools → External Tools → Add
   - Program: `ruff`
   - Arguments: `check --fix $FilePath$`

2. Configure File Watcher for auto-format:
   - Settings → Tools → File Watchers → Add
   - File type: Python
   - Program: `ruff`
   - Arguments: `format $FilePath$`

## Pre-commit Integration

See [Git Hooks Setup](quality-setup-git-hooks.md#python-hooks) for pre-commit hook configuration.

Quick example using lint-staged:
```json
{
  "lint-staged": {
    "*.py": ["uv run ruff format", "uv run ruff check --fix"]
  }
}
```

## CI/CD Integration

See [CI/CD Setup](quality-setup-cicd.md#python-job) for GitHub Actions configuration.

Quick example:
```yaml
jobs:
  python-quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.13'
      - run: pip install uv
      - run: uv venv
      - run: uv pip sync requirements-dev.lock
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run mypy src --ignore-missing-imports
      - run: uv run pytest -v --cov=src --cov-report=term
```

## Common Workflows

### First-Time Setup

```bash
# 1. Install Ruff
uv pip install ruff

# 2. Create configuration
cat > pyproject.toml << 'EOF'
[tool.ruff]
target-version = "py313"
line-length = 88

[tool.ruff.lint]
select = ["E", "F"]
EOF

# 3. Run formatter on entire codebase
uv run ruff format .

# 4. Fix linting issues
uv run ruff check --fix .

# 5. Commit the formatting
git add .
git commit -m "Apply Ruff formatting"
```

### Daily Development

```bash
# Before committing
uv run ruff format .
uv run ruff check --fix .
uv run pytest

# Or use pre-commit hooks (see Git Hooks guide)
git commit  # Runs Ruff automatically
```

### CI/CD Workflow

```bash
# Check formatting (don't modify)
uv run ruff format --check .

# Check linting (don't modify)
uv run ruff check .

# Type checking
uv run mypy src --ignore-missing-imports

# Run tests with coverage
uv run pytest -v --cov=src --cov-report=term
```

## Rule Explanations

### E: pycodestyle errors
PEP 8 style guide violations:
- E501: Line too long
- E203: Whitespace before ':'
- E231: Missing whitespace after ','

### F: pyflakes
Basic error detection:
- F401: Imported but unused
- F841: Local variable assigned but never used
- F821: Undefined name

### DTZ: flake8-datetimez
Timezone-aware datetime usage:
- DTZ001: Use `datetime.now(tz=...)` instead of `datetime.now()`
- DTZ005: Use `datetime.now(tz=timezone.utc)` instead of `datetime.utcnow()`

### UP: pyupgrade
Modernize Python syntax:
- UP006: Use `list[str]` instead of `List[str]` (Python 3.9+)
- UP007: Use `X | Y` instead of `Union[X, Y]` (Python 3.10+)
- UP035: Deprecated import (e.g., `collections.abc` instead of `collections`)

### PTH: flake8-use-pathlib
Prefer pathlib over os.path:
- PTH118: Use `Path.joinpath()` instead of `os.path.join()`
- PTH123: Use `Path.open()` instead of `open()`

### I: isort
Import sorting and organization:
- I001: Import block is unsorted or unformatted

### SIM: flake8-simplify
Simplify complex code:
- SIM102: Use single `if` instead of nested `if`
- SIM108: Use ternary operator instead of if-else
- SIM117: Use single `with` statement

### PERF: perflint
Performance anti-patterns:
- PERF401: Use list comprehension instead of for loop with append
- PERF402: Use list/dict/set comprehension instead of for loop

### YTT: flake8-2020
Modern version checks:
- YTT101: Use `sys.version_info >= (3, 10)` instead of string comparison

## Troubleshooting

### "Ruff not found"
Make sure Ruff is installed in the uv environment:
```bash
uv pip install ruff
which ruff  # Should print path to ruff executable in .venv
```

### "Too many errors"
Start with minimal rules and add incrementally:
```toml
[tool.ruff.lint]
select = ["E", "F"]  # Just basics
```

Fix issues, then add more rules:
```toml
select = ["E", "F", "UP", "I"]  # Add modernization + imports
```

### "Line too long" everywhere
Increase line length:
```toml
[tool.ruff]
line-length = 120  # Default is 88
```

Or disable E501:
```toml
[tool.ruff.lint]
ignore = ["E501"]
```

### Conflicts with Black
Ruff format is Black-compatible by default. If migrating from Black:
```bash
# Remove Black
uv pip uninstall black

# Use Ruff format instead
uv run ruff format .
```

### Slow on large codebases
Exclude unnecessary directories:
```toml
[tool.ruff]
exclude = [
    ".venv",
    "build",
    "dist",
    "*.egg-info",
]
```

## Migration from Other Tools

### From flake8
```bash
# Before (flake8)
flake8 src/

# After (Ruff)
uv run ruff check src/
```

Configuration mapping:
- `.flake8` → `pyproject.toml [tool.ruff.lint]`
- `--max-line-length` → `line-length`
- `--select` → `select`
- `--ignore` → `ignore`

### From Black
```bash
# Before (Black)
black src/

# After (Ruff)
uv run ruff format src/
```

Ruff format is Black-compatible, no config changes needed.

### From isort
```bash
# Before (isort)
isort src/

# After (Ruff)
uv run ruff check --fix src/  # Includes import sorting
```

### From pyupgrade
```bash
# Before (pyupgrade)
pyupgrade --py313-plus src/**/*.py

# After (Ruff)
uv run ruff check --fix src/  # UP rules included
```

## Advanced Configuration

### Per-file Ignores

Ignore specific rules in specific files:
```toml
[tool.ruff.lint.per-file-ignores]
"__init__.py" = ["F401"]  # Allow unused imports in __init__.py
"tests/*.py" = ["DTZ"]    # Allow naive datetime in tests
```

### Custom Complexity Limits

```toml
[tool.ruff.lint.mccabe]
max-complexity = 10  # Default is 10
```

### Custom Import Rules

```toml
[tool.ruff.lint.isort]
known-first-party = ["myproject"]
section-order = ["future", "standard-library", "third-party", "first-party", "local-folder"]
```

## Performance Tips

Ruff is already fast, but you can optimize further:

**1. Run on changed files only** (pre-commit):
```bash
git diff --name-only --cached | grep '\.py$' | xargs uv run ruff check
```

**2. Use lint-staged** (automatic):
```json
{
  "lint-staged": {
    "*.py": ["uv run ruff check --fix", "uv run ruff format"]
  }
}
```

**3. Parallelize in CI** (if needed):
```yaml
# Usually not needed - Ruff is already parallel
- run: uv run ruff check . --output-format github
```

## Resources

**Official Documentation**:
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [Ruff Rules Reference](https://docs.astral.sh/ruff/rules/)
- [mypy Documentation](https://mypy-lang.org/)
- [pytest Documentation](https://docs.pytest.org/)

**Migration Guides**:
- [Migrating from flake8](https://docs.astral.sh/ruff/faq/#how-does-ruff-compare-to-flake8)
- [Migrating from Black](https://docs.astral.sh/ruff/formatter/#black-compatibility)

**Community**:
- [Ruff GitHub](https://github.com/astral-sh/ruff)
- [pytest Plugins](https://docs.pytest.org/en/stable/reference/plugin_list.html)

## Next Steps

- **Add git hooks**: [Git Hooks Setup →](quality-setup-git-hooks.md#python-hooks)
- **Add CI/CD**: [CI/CD Setup →](quality-setup-cicd.md#python-job)
- **Combine with TypeScript/JavaScript**: [Polyglot Integration →](quality-setup-polyglot.md)
