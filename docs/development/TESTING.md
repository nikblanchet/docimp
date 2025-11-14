# Testing Guide

Comprehensive testing guide for DocImp contributors and maintainers.

## Overview

DocImp uses a multi-layered testing strategy to ensure code quality, reliability, and performance across our polyglot architecture (Python analysis engine, TypeScript CLI, JavaScript configuration/plugins).

### Testing Philosophy

- **Test all layers**: Unit, integration, performance, and end-to-end tests
- **Test-first validation**: Write tests before implementation when possible
- **Comprehensive coverage**: Aim for 90%+ code coverage
- **Real-world scenarios**: Tests should reflect actual user workflows
- **Fast feedback**: Unit tests run in < 1s, full suite in < 30s

### Test Coverage Goals (Phase 3.13)

- **Python tests**: 600+ passing (currently: 630)
- **TypeScript tests**: 450+ passing (currently: 884)
- **Integration tests**: 50+ passing (currently: 105+)
- **End-to-end bash scripts**: 10 scripts (currently: 10)
- **Performance benchmarks**: All targets met

## Running Tests

### Python Test Suite

**Location**: `analyzer/tests/`

**Run all tests**:
```bash
cd analyzer
uv run pytest -v
```

**Run specific test file**:
```bash
uv run pytest tests/test_analyzer.py -v
```

**Run with coverage**:
```bash
uv run pytest --cov=src --cov-report=html
```

**Performance**: Full Python test suite completes in ~40 seconds (630 tests)

### TypeScript Test Suite

**Location**: `cli/src/__tests__/`

**Run all tests**:
```bash
cd cli
npm test
```

**Run specific test file**:
```bash
npm test -- workflow-state-manager.test.ts
```

**Run integration tests only**:
```bash
npm run test:integration
```

**Run with coverage**:
```bash
npm test -- --coverage
```

**Performance**: Full TypeScript test suite completes in ~16 seconds (884 tests)

### Performance Benchmark Tests

**Location**: `cli/src/__tests__/performance.bench.test.ts`

**Run performance benchmarks**:
```bash
cd cli
npm test -- performance.bench.test.ts
```

**Targets**:
- Workflow state save/load: < 100ms
- File invalidation (1000 files): < 500ms
- Status command (TypeScript layer): < 50ms
- Incremental analysis time savings: 90%+ for 10% file changes

### End-to-End Bash Scripts

**Location**: `test-samples/`

**Run individual script**:
```bash
./test-samples/test-workflows.sh
./test-samples/test-incremental-analysis.sh
./test-samples/test-status-command.sh
```

**Scripts**:
1. `test-workflows.sh` - Workflow A & B validation
2. `test-incremental-analysis.sh` - Incremental mode testing
3. `test-status-command.sh` - Status command validation
4. `test-audit-resume.sh` - Audit resume functionality
5. `test-resume-improve.sh` - Improve resume functionality
6. `test-workflows-improve.sh` - Improve workflow validation
7. `test-undo-integration.sh` - Undo integration
8. `test-prompt-wordings.sh` - Prompt wording validation
9. `test-path-resolution.sh` - Path resolution testing
10. `test-workflow-state-integration.sh` - Workflow state integration

**Requirements**: `docimp` must be in PATH (install with `npm link` from cli/ directory)

### Linting and Formatting

**Python**:
```bash
cd analyzer
uv run ruff check .          # Lint
uv run ruff format .         # Format
uv run mypy src --ignore-missing-imports  # Type check
```

**TypeScript**:
```bash
cd cli
npm run lint                 # Lint
npm run format               # Format
npm run format:check         # Check formatting
npx tsc --noEmit            # Type check
```

## Writing Tests

### Unit Test Patterns

#### Python Unit Tests

**Location**: `analyzer/tests/test_<module>.py`

**Pattern**:
```python
import pytest
from src.module import ClassName

def test_function_behavior():
    """Test specific behavior with clear description"""
    # Arrange
    instance = ClassName()

    # Act
    result = instance.method()

    # Assert
    assert result == expected_value

@pytest.mark.parametrize("input,expected", [
    (1, 2),
    (2, 4),
    (3, 6),
])
def test_multiple_cases(input, expected):
    """Test multiple inputs with parametrize"""
    result = double(input)
    assert result == expected
```

#### TypeScript Unit Tests

**Location**: `cli/src/__tests__/<module>.test.ts`

**Pattern**:
```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ClassName } from '../module';

describe('ClassName', () => {
  let instance: ClassName;

  beforeEach(() => {
    instance = new ClassName();
  });

  afterEach(() => {
    // Cleanup
  });

  it('should perform specific behavior', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = instance.method(input);

    // Assert
    expect(result).toBe('expected');
  });

  it('should handle edge cases', () => {
    expect(() => instance.method('')).toThrow();
  });
});
```

### Integration Test Patterns

**Location**: `cli/src/__tests__/integration/`

**Pattern**:
```typescript
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';

describe('Feature Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    process.chdir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should complete full workflow', async () => {
    // Create test files
    await fs.writeFile('test.py', 'def foo(): pass');

    // Run command
    const result = await runCommand('analyze', ['./']);

    // Verify results
    expect(result.success).toBe(true);
    expect(await fs.access('.docimp/workflow-state.json')).resolves;
  });
});
```

### Performance Benchmark Patterns

**Location**: `cli/src/__tests__/performance.bench.test.ts`

**Pattern**:
```typescript
it('should complete operation within target time', async () => {
  // Setup
  const data = generateTestData(1000);

  // Measure
  const start = Date.now();
  await performOperation(data);
  const duration = Date.now() - start;

  // Assert
  expect(duration).toBeLessThan(100); // Target: < 100ms
});
```

### End-to-End Bash Script Patterns

**Location**: `test-samples/test-<feature>.sh`

**Pattern**:
```bash
#!/bin/bash
set -e  # Exit on error

# Load colors
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/scripts/colors.sh"

# Counters
TESTS_PASSED=0
TESTS_FAILED=0

print_success() {
    echo -e "${GREEN}✓${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

print_failure() {
    echo -e "${RED}✗${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

# Change to test directory
cd "$(dirname "$0")/example-project"

# Clean state
rm -rf .docimp

# Test
docimp analyze ./src
if [ -f .docimp/workflow-state.json ]; then
    print_success "Workflow state created"
else
    print_failure "Workflow state not created"
fi

# Summary
if [ $TESTS_FAILED -gt 0 ]; then
    exit 1
fi
```

## CI/CD Integration

### GitHub Actions Workflow

**File**: `.github/workflows/ci.yml`

**Jobs**:
1. **python-tests**: Python 3.13 testing, linting, type checking
2. **typescript-tests**: TypeScript testing, linting, type checking
3. **integration-test**: End-to-end analysis test
4. **module-system-matrix**: ESM/CommonJS detection tests
5. **workflow-validation**: Bash test script execution

**Status**: All jobs must pass for PR approval

### Test Execution Order

1. Unit tests (Python & TypeScript in parallel)
2. Integration tests (after unit tests pass)
3. End-to-end tests (after integration tests pass)
4. Performance benchmarks (part of unit tests)

### Coverage Reporting

- Python coverage reported to terminal
- TypeScript coverage in `cli/coverage/` directory
- Coverage goals: 90%+ for core modules

## Performance Benchmarks

### Targets (Phase 3.13)

1. **Workflow State Save/Load**: < 100ms
   - Tested in: `performance.bench.test.ts`
   - Current: 5-15ms (save), 10-25ms (load)

2. **File Invalidation**: < 500ms for 1000 files
   - Tested in: `performance.bench.test.ts`
   - Current: 50-100ms (100 files), 400-600ms (1000 files)

3. **Status Command**: < 50ms (TypeScript layer)
   - Tested in: `performance.bench.test.ts`, `test-status-command.sh`
   - Current: 2-10ms (TypeScript only)

4. **Incremental Analysis**: 90%+ time savings for 10% file changes
   - Tested in: `test-incremental-analysis.sh`
   - Current: 90-95% savings (typical)

### Measuring Performance

**TypeScript**:
```typescript
const start = Date.now();
await operation();
const duration = Date.now() - start;
expect(duration).toBeLessThan(TARGET_MS);
```

**Bash**:
```bash
START_TIME=$(date +%s%3N)  # Milliseconds
docimp analyze ./src
DURATION=$(( $(date +%s%3N) - START_TIME ))
echo "Duration: ${DURATION}ms"
```

## Troubleshooting

### Common Test Failures

**"docimp command not found"** (bash scripts):
```bash
cd cli
npm link  # Make docimp available globally
```

**"Module not found" (TypeScript)**:
```bash
cd cli
npm run build  # Rebuild TypeScript
```

**"Python version mismatch"**:
```bash
# Ensure uv uses Python 3.13
uv python list
uv run python --version
```

**"Jest duplicate mock warning"**:
- Fixed in jest.config.js with `modulePathIgnorePatterns: ['<rootDir>/dist/']`

### Debugging Tests

**Python**:
```bash
# Run single test with verbose output
uv run pytest tests/test_module.py::test_function -vv

# Drop into debugger on failure
uv run pytest --pdb
```

**TypeScript**:
```bash
# Run single test with verbose output
npm test -- specific.test.ts --verbose

# Run in watch mode
npm test -- --watch

# Debug with Node inspector
node --inspect-brk node_modules/.bin/jest specific.test.ts
```

**Bash**:
```bash
# Add set -x for command tracing
set -x  # At top of script

# Run with bash verbose mode
bash -x ./test-samples/test-script.sh
```

### Test Data Management

**Python**: Mock data in `analyzer/tests/fixtures/`
**TypeScript**: Mock data in `cli/src/__tests__/__fixtures__/`
**Bash**: Test project in `test-samples/example-project/`

## Test Maintenance

### When to Update Tests

- After adding new features (add tests first when possible)
- After fixing bugs (add regression tests)
- After refactoring (ensure tests still pass)
- After updating dependencies (check for breaking changes)
- Quarterly review of test coverage

### Deprecation Warnings

**Critical**: Address deprecation warnings immediately when they appear in test output. Never suppress warnings without fixing the underlying issue.

**Process**:
1. Read the warning message
2. Check migration guides
3. Update code to use recommended APIs
4. Re-run tests to verify fix

### Adding New Test Files

**Python**:
1. Create `analyzer/tests/test_<module>.py`
2. Import pytest and module under test
3. Write test functions starting with `test_`
4. Run `uv run pytest tests/test_<module>.py`

**TypeScript**:
1. Create `cli/src/__tests__/<module>.test.ts`
2. Import test framework and module under test
3. Write test cases in describe/it blocks
4. Run `npm test -- <module>.test.ts`

**Bash**:
1. Create `test-samples/test-<feature>.sh`
2. Make executable: `chmod +x test-samples/test-<feature>.sh`
3. Follow existing pattern (colors, counters, summary)
4. Test locally before committing

## Best Practices

1. **One assertion per test** (or closely related assertions)
2. **Clear test names** describing what is being tested
3. **Arrange-Act-Assert** pattern for clarity
4. **Mock external dependencies** (API calls, file system)
5. **Clean up after tests** (temp files, state changes)
6. **Fast tests** (avoid sleep/wait unless necessary)
7. **Deterministic tests** (no random values unless seeded)
8. **Isolated tests** (tests should not depend on each other)

## Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Jest Documentation](https://jestjs.io/)
- [Testing Best Practices](https://testingjavascript.com/)
- DocImp Test Examples: Browse `analyzer/tests/` and `cli/src/__tests__/`

## Getting Help

- Check existing tests for patterns
- Review this guide
- Ask in PR comments or discussions
- File issues for test infrastructure problems
