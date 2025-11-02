# TypeScript/JavaScript Parser Edge Case Test Fixtures

This directory contains test fixtures for validating edge case handling in the TypeScript/JavaScript parser.

## Purpose

These files demonstrate advanced language features and patterns that the parser should handle correctly:
- Generic type parameters
- Decorators
- Namespace declarations
- Unicode identifiers
- Complex JSDoc patterns
- Mixed module systems

## Fixtures

### typescript_generics.ts

Demonstrates generic type parameters in TypeScript:
- Generic functions with single and multiple type parameters
- Generic classes
- Constrained generics (`T extends ...`)
- Generic interfaces
- Classes implementing generic interfaces

### typescript_decorators.ts

Demonstrates TypeScript decorator patterns:
- Class decorators
- Property decorators
- Method decorators
- Multiple decorators on single elements
- Decorator factories with parameters

**Note**: Decorator metadata tracking is not currently implemented (see `docs/LIMITATIONS.md`). This fixture verifies that decorators do not prevent parsing.

### typescript_namespaces.ts

Demonstrates namespace and module declarations:
- Basic namespaces with exported functions
- Nested namespaces
- Namespaces with classes
- Legacy `module` keyword syntax

**Note**: Namespace hierarchy is not preserved in extracted items (see `docs/LIMITATIONS.md`). Functions within namespaces are extracted as top-level items.

### javascript_unicode.js

Demonstrates Unicode identifier support:
- Chinese characters (你好, 計算)
- Japanese characters (計算)
- Greek letters (π, Σ, Δ)
- Russian Cyrillic (данные)
- Arabic script (حساب)
- Accented Latin characters (salutación, transforméTexte)
- Mathematical symbols

**Note**: Full Unicode support per ECMAScript specification.

### javascript_complex_jsdoc.js

Demonstrates advanced JSDoc patterns:
- Nested generic types (`Array<Promise<T>>`)
- Type imports from external modules (`import('./types')`)
- Union types (`string | number | boolean`)
- Object shape definitions with nested properties
- Template types (`@template T`)
- Callback types (`@callback`)
- Rest parameters with spread types
- Destructured parameters
- Utility types (`Readonly<T>`, `Partial<T>`, `Record<K,V>`)

### mixed_module_systems.js

Demonstrates mixed ESM/CommonJS patterns:
- ES Module exports (`export function ...`)
- Default exports (`export default class ...`)
- CommonJS exports (`module.exports`, `exports.foo`)
- Mixed patterns in single file

**Expected**: Parser classifies as ESM since `export` keyword takes precedence (see `docs/LIMITATIONS.md`).

## Usage

These fixtures are referenced by tests in `analyzer/tests/test_typescript_parser_edge_cases.py`.

### Running Tests

```bash
cd analyzer
pytest tests/test_typescript_parser_edge_cases.py -v
```

### Using Fixtures in Tests

```python
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent
EDGE_CASES_DIR = PROJECT_ROOT / 'test-samples' / 'edge-cases'

def test_example(parser):
    fixture_file = EDGE_CASES_DIR / 'typescript_generics.ts'
    items = parser.parse_file(str(fixture_file))
    # Assertions...
```

## Contributing

When adding new edge case tests:

1. Create a new fixture file with clear comments explaining the pattern
2. Update this README with a description of the new fixture
3. Add corresponding test cases in `test_typescript_parser_edge_cases.py`
4. Document any limitations discovered in `docs/LIMITATIONS.md`

## Coverage

These fixtures contribute to the TypeScript parser's 96% test coverage (as of Issue #105).

See `docs/LIMITATIONS.md` for known limitations and edge cases.
