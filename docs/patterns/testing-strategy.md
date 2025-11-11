# Testing Strategy

**Commands**: `cd analyzer && pytest -v` (Python), `cd cli && npm test` (TypeScript/Jest)

**CI/CD**: GitHub Actions with Python 3.13, Node 22, CommonJS/ESM matrix, ruff/eslint linting, mypy/tsc type-checking

## Test Organization (CRITICAL)

**Always create permanent test files, never ad-hoc validation scripts.** Tests must run in CI/CD, catch regressions, and document expected behavior.

### Python Tests (`analyzer/tests/test_*.py`)

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))  # Enable src.* imports
from src.parsers.python_parser import PythonParser
```

**Guidelines:**
- Import from `src.*` not `analyzer.src.*`
- Use `Path(__file__).parent.parent.parent` for project root in fixtures
- Focus: Parsers, scorer monotonicity, coverage calc, JSDoc writer patterns

### TypeScript Tests (`cli/src/__tests__/*.test.ts`)

```typescript
import { PythonBridge } from '../python-bridge/PythonBridge';
```

**Guidelines:**
- Mock external dependencies (Python bridge, file system)
- Focus: Config loader (CommonJS/ESM), plugin manager, JSDoc validation (checkJs), Python bridge

### JavaScript/Plugin Tests (`plugins/__tests__/*.test.js`)

```javascript
import validateTypesPlugin from '../validate-types.js';
```

**Guidelines:**
- Plugin-specific tests co-located with plugin code
- Jest configured to handle .js test files (jest.config.js includes .test.js patterns)
- Focus: Plugin hook implementations, JSDoc parsing, validation logic

### Bash Scripts (`test-samples/*.sh`)

For manual testing with API keys/interactive input:
- Use `set -e`, validate prerequisites, color-coded output
- Progressive workflow: cleanup → execute → validate → restore
- See `test-samples/test-workflows-improve.sh` for examples
- Document conversion path to automated tests (mock API, programmatic input)

## Malformed Syntax Testing

DocImp gracefully handles syntax errors in user codebases being analyzed. Test samples with intentional syntax errors are located in `test-samples/malformed/` and `test-samples/mixed-valid-invalid/`.

### Error Handling Guarantees

- Parsers raise `SyntaxError` for malformed code
- Analyzer catches syntax errors and tracks them in `parse_failures` array
- Analysis continues with remaining valid files (non-strict mode)
- Parse failures are displayed to users with clear error messages
- Analysis completes without crashing

### Test Samples

- `test-samples/malformed/` - 12 intentionally broken files (4 Python, 4 TypeScript, 4 JavaScript)
- `test-samples/mixed-valid-invalid/` - 6 files (3 valid, 3 broken) to test "continue on error" behavior
- See `test-samples/malformed/README.md` for detailed description of each syntax error
- Separated from `examples/` to avoid interfering with tests expecting valid code

### Testing Layers

1. **Parser level** (`analyzer/tests/test_parsers.py`, `test_typescript_parser.py`): Verify parsers raise `SyntaxError`
2. **Analyzer level** (`analyzer/tests/test_analyzer.py`): Verify failures tracked in `parse_failures`, analysis continues
3. **Display level** (`cli/src/__tests__/display.test.ts`): Verify failures displayed correctly

**Strict Mode**: Use `--strict` flag to fail immediately on first syntax error (useful for CI/CD).
