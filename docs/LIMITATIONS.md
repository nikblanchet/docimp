# TypeScript/JavaScript Parser Limitations

This document describes known limitations and edge cases of the TypeScript/JavaScript parser implementation.

## Overview

The TypeScript parser uses the TypeScript Compiler API via a Node.js subprocess to parse TypeScript and JavaScript files. While comprehensive, there are some known limitations in metadata tracking and complexity calculation.

## Decorator Metadata

**Status**: Not Implemented

**Description**: The parser currently does not track decorator metadata on classes, methods, or properties.

**Example**:
```typescript
@Component({ selector: 'app-user' })
class UserComponent {
    @Input()
    userId: number;
}
```

**Current Behavior**: The class and properties are extracted correctly, but decorator information (type, arguments) is not captured in the `CodeItem` structure.

**Impact**: Low - Decorators do not prevent parsing, and the code items are still extracted. Decorator presence does not affect documentation coverage calculations.

**Future Enhancement**: Consider adding `decorators: List[str]` field to `CodeItem` to track decorator names (Issue #TBD).

## Namespace Flattening

**Status**: Expected Behavior

**Description**: Functions and classes defined within TypeScript namespaces are extracted as top-level items. Namespace hierarchy is not preserved in the extracted structure.

**Example**:
```typescript
namespace Utils {
    export function helper() {
        return 42;
    }
}
```

**Current Behavior**: The `helper` function is extracted as a top-level function. The namespace context is not stored.

**Impact**: Low - All code items within namespaces are still extracted and documented. The namespace name does not appear in the filepath or item name.

**Rationale**: The current data model focuses on documentable items (functions, classes, methods) rather than organizational structures (namespaces, modules).

**Future Enhancement**: Consider adding `namespace: Optional[str]` field to track namespace context (Issue #TBD).

## Computed Property Names

**Status**: Partial Support

**Description**: Classes with computed property names (using bracket notation) may have methods with special or non-standard names.

**Example**:
```typescript
class Example {
    [Symbol.iterator]() {}
    ['computed' + 'Name']() {}
}
```

**Current Behavior**: The class is extracted correctly. Methods with computed names may appear with special naming (e.g., `[Symbol.iterator]`) or may not be extracted depending on complexity.

**Impact**: Low - Most computed properties use runtime expressions that cannot be statically analyzed. Standard methods in the same class are extracted normally.

**Workaround**: Use explicit method names for methods requiring documentation.

## Complexity Calculation

### Yield Statements

**Status**: Expected Behavior

**Description**: Simple generator functions with only `yield` statements (no branching logic) have base complexity of 1.

**Example**:
```typescript
function* generateSequence() {
    yield 1;
    yield 2;
    yield 3;
}
```

**Current Behavior**: Complexity = 1 (base complexity, no decision points).

**Impact**: Low - Impact scoring still works correctly. Generator functions without branching are genuinely simple.

**Rationale**: Cyclomatic complexity measures decision points, not statement count. Linear `yield` statements do not add branching paths.

### Await Expressions

**Status**: Expected Behavior

**Description**: Simple async functions with only `await` expressions (no branching logic) have base complexity of 1.

**Example**:
```typescript
async function loadModule() {
    const mod = await import('./other');
    return mod.default;
}
```

**Current Behavior**: Complexity = 1 (base complexity, no decision points).

**Impact**: Low - Async/await syntax does not inherently add complexity unless combined with conditional logic.

**Rationale**: Same as yield statements - linear execution without branching is not complex.

## Unicode Identifiers

**Status**: Fully Supported

**Description**: JavaScript and TypeScript allow Unicode characters in identifiers. The parser correctly handles non-ASCII function and variable names.

**Example**:
```javascript
function 你好() {
    return 'Hello';
}

const π = 3.14159;
```

**Current Behavior**: Unicode identifiers are extracted correctly and stored in `CodeItem.name` field.

**Impact**: None - Full support for all valid ECMAScript identifiers.

**Note**: Unicode support depends on the database/storage layer used for persisting analysis results. JSON serialization handles Unicode correctly.

## Module System Detection

### Mixed ESM/CommonJS

**Status**: Expected Behavior

**Description**: Files that mix ES Module syntax (`export`/`import`) with CommonJS patterns (`module.exports`) are classified as ESM.

**Example**:
```javascript
export function esm() {}
module.exports = { cjs: true };  // Mixed pattern
```

**Current Behavior**: Module system = `esm` (export keyword takes precedence).

**Impact**: None - This is correct behavior per ECMAScript specification.

**Rationale**: The presence of `export` or `import` keywords definitively indicates ES Module syntax. Any `module.exports` in the same file is likely legacy code or a compatibility shim.

### Dynamic Imports

**Status**: Handled Correctly

**Description**: Dynamic `import()` expressions do not create false `CodeItem` entries. Only the containing function is extracted.

**Example**:
```javascript
async function loadPlugin() {
    const plugin = await import('./plugin');
}
```

**Current Behavior**: One `CodeItem` for `loadPlugin` function. No item for the `import()` expression.

**Impact**: None - Correct behavior.

## JSDoc Type Validation

**Status**: By Design

**Description**: The parser extracts JSDoc comments but does not validate type correctness. Type validation is performed by the `validate-types.js` plugin.

**Example**:
```javascript
/**
 * @param {NonexistentType} foo - Invalid type
 */
function test(foo) {}
```

**Current Behavior**: Function is extracted with `has_docs = True`. The invalid type is not flagged during parsing.

**Impact**: None - Type validation is intentionally delegated to plugins, allowing users to choose validation rules.

**Rationale**: Separation of concerns. Parser extracts structure, plugins validate semantics.

## Error Recovery

**Status**: Feature

**Description**: The TypeScript compiler uses error recovery to parse files with syntax errors. This allows analysis to continue even with broken code.

**Example**:
```typescript
function broken( {  // Missing closing parenthesis
    return 42;
}
```

**Current Behavior**: Parser may extract partial items or skip the broken function, but does not crash. No `SyntaxError` is raised.

**Impact**: Positive - Analysis continues on large codebases even with some broken files.

**Note**: Use `--strict` flag in CI/CD to fail on syntax errors if desired.

## File System Edge Cases

### Permission Denied

**Status**: Platform Dependent

**Description**: Behavior when encountering files without read permissions varies by platform (Windows vs. Unix).

**Current Behavior**: Parser raises `FileNotFoundError`, `PermissionError`, or `RuntimeError` depending on the platform and exact error condition.

**Impact**: Low - Uncommon in practice. Most projects do not have permission-restricted source files.

### Empty Files

**Status**: Handled Correctly

**Description**: Empty source files are valid and return an empty list of items.

**Example**: `empty.ts` with 0 bytes.

**Current Behavior**: Returns `[]` (empty list). No error raised.

**Impact**: None - Correct behavior.

## Subprocess Dependencies

### Node.js Requirement

**Status**: Hard Requirement

**Description**: The TypeScript parser requires Node.js to be installed and available in PATH.

**Current Behavior**: If Node.js is not found, `FileNotFoundError` or `RuntimeError` is raised with a descriptive message.

**Impact**: Medium - Users must install Node.js before using TypeScript/JavaScript analysis.

**Documentation**: Installation instructions in README.md specify Node.js as a dependency.

### Timeout Handling

**Status**: Configurable (Future)

**Description**: The parser uses a hardcoded 30-second timeout for subprocess calls.

**Current Behavior**: Files that take > 30 seconds to parse raise `RuntimeError` with timeout message.

**Impact**: Low - Most files parse in < 1 second. Only extremely large generated files might hit the timeout.

**Future Enhancement**: Make timeout configurable via `docimp.config.js` (Issue #316).

## Test Coverage

As of the implementation of comprehensive edge case tests (Issue #105):

- Total tests: 59 (34 existing + 25 new edge case tests)
- TypeScript parser coverage: 96%
- All edge cases documented in this file have corresponding test coverage

See `analyzer/tests/test_typescript_parser_edge_cases.py` for test implementation.

## Summary

The TypeScript/JavaScript parser provides comprehensive coverage of modern JavaScript and TypeScript syntax. The documented limitations are primarily in metadata tracking (decorators, namespaces) rather than core functionality. Most limitations have minimal impact on documentation coverage analysis.

For questions or to report undocumented limitations, please file an issue on GitHub.
