# Malformed Syntax Test Samples

This directory contains intentionally broken code files used to test how DocImp handles syntax errors in analyzed codebases.

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

## Testing

These files are used by:
- `analyzer/tests/test_parsers.py` - Parser-level syntax error handling
- `analyzer/tests/test_typescript_parser.py` - TypeScript/JavaScript parser tests
- `analyzer/tests/test_analyzer.py` - Integration tests
- `cli/src/__tests__/` - CLI and display tests

## See Also

- `examples/mixed-valid-invalid/` - Mix of valid and broken files for integration testing
- Issue #199 - Original feature request for malformed syntax testing
