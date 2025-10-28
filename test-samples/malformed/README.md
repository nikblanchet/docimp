# Malformed Syntax Test Samples

This directory contains intentionally broken code files used to test how DocImp handles syntax errors in analyzed codebases.

**Location:** `test-samples/malformed/` - Separated from `examples/` to avoid interfering with tests that expect valid code.

These files are NOT meant for user consumption. They are test fixtures to ensure DocImp:
- Detects syntax errors gracefully
- Continues analyzing valid files after encountering errors
- Provides clear error messages
- Does not crash or hang on malformed input

## Python Samples

| File | Syntax Error | Description |
|------|--------------|-------------|
| `python_missing_colon.py` | Missing colon | Class definition without `:` |
| `python_unclosed_paren.py` | Unclosed parenthesis | Function parameter list not closed |
| `python_invalid_indentation.py` | Inconsistent indentation | Mixed indentation levels |
| `python_incomplete_statement.py` | Incomplete if statement | Missing colon after condition |

## TypeScript Samples

| File | Syntax Error | Description |
|------|--------------|-------------|
| `typescript_missing_brace.ts` | Missing closing brace | Function body not closed |
| `typescript_invalid_syntax.ts` | Invalid type annotation | Malformed generic syntax `>>` |
| `typescript_unclosed_string.ts` | Unclosed string literal | String not terminated |
| `typescript_missing_semicolon.ts` | Incomplete expression | Truncated return statement |

## JavaScript Samples

| File | Syntax Error | Description |
|------|--------------|-------------|
| `javascript_esm_error.js` | Missing brace | ESM export with malformed class |
| `javascript_arrow_error.js` | Incomplete expression | Arrow function with truncated body |
| `javascript_commonjs_error.cjs` | Missing comma | CommonJS exports with syntax error |
| `javascript_unclosed_bracket.mjs` | Unclosed bracket | ESM module with unclosed array |

## Expected Behavior

When analyzing this directory, DocImp should:

1. Attempt to parse each file
2. Detect the syntax error
3. Log a clear warning with file path and error description
4. Add the file to the `parse_failures` array
5. Continue analyzing remaining files
6. Complete the analysis without crashing

## Manual Testing

To manually verify error handling:

```bash
# Analyze malformed directory (should complete with warnings)
docimp analyze test-samples/malformed

# Expected output includes parse failure warnings:
# Parse Failures: 4 files could not be parsed
# - python_missing_colon.py: invalid syntax
# - python_unclosed_paren.py: invalid syntax
# - python_invalid_indentation.py: invalid syntax
# - python_incomplete_statement.py: invalid syntax

# Strict mode (should fail immediately on first error)
docimp analyze test-samples/malformed --strict

# Expected: Exits with code 1 on first parse failure
```

## Automated Testing

These fixtures are used by:
- `analyzer/tests/test_parsers.py` - Parser-level syntax error handling
- `analyzer/tests/test_typescript_parser.py` - TypeScript/JavaScript parser tests
- `analyzer/tests/test_analyzer.py` - Integration tests
- `cli/src/__tests__/analyze-command.test.ts` - CLI-level parse failure display tests

Run tests:

```bash
# Run parser-level tests for syntax error handling
pytest analyzer/tests/test_parsers.py -k malformed

# Run TypeScript/JavaScript parser tests
pytest analyzer/tests/test_typescript_parser.py -k error_recovery

# Run integration tests
pytest analyzer/tests/test_analyzer.py -k malformed

# Run CLI-level tests
npm --prefix cli test -- analyze-command.test.ts

# Run full test suite
pytest analyzer/tests/
npm --prefix cli test
```

## See Also

- `test-samples/mixed-valid-invalid/` - Mix of valid and broken files for integration testing
- Issue #199 - Original feature request for malformed syntax testing
