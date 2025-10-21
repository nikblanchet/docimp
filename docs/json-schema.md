# JSON Schema Documentation

This document provides the explicit JSON schema contract between the Python analyzer and the TypeScript CLI.

## Overview

DocImp uses JSON as the serialization format for communication between the Python analysis engine (`analyzer/`) and the TypeScript CLI (`cli/`). This boundary is validated using Zod schemas in `cli/src/python-bridge/schemas.ts`.

**Key Principles:**
- Python serializes data structures to JSON using `json.dumps()`
- TypeScript validates JSON using Zod schemas before parsing
- Malformed JSON is caught early with helpful error messages
- All field names use snake_case (Python convention)

---

## Analyze Command

The `docimp analyze` command returns a complete analysis of the codebase.

### Example JSON Output

```json
{
  "coverage_percent": 66.67,
  "total_items": 3,
  "documented_items": 2,
  "by_language": {
    "python": {
      "language": "python",
      "total_items": 2,
      "documented_items": 1,
      "coverage_percent": 50.0,
      "avg_complexity": 7.5,
      "avg_impact_score": 37.5
    },
    "typescript": {
      "language": "typescript",
      "total_items": 1,
      "documented_items": 1,
      "coverage_percent": 100.0,
      "avg_complexity": 12.0,
      "avg_impact_score": 60.0
    }
  },
  "items": [
    {
      "name": "calculate_score",
      "type": "function",
      "filepath": "/path/to/scorer.py",
      "line_number": 45,
      "end_line": 58,
      "language": "python",
      "complexity": 5,
      "impact_score": 25.0,
      "has_docs": true,
      "export_type": "named",
      "module_system": "esm"
    },
    {
      "name": "process_data",
      "type": "function",
      "filepath": "/path/to/processor.py",
      "line_number": 102,
      "end_line": 150,
      "language": "python",
      "complexity": 10,
      "impact_score": 50.0,
      "has_docs": false,
      "export_type": "named",
      "module_system": "esm"
    },
    {
      "name": "DataService",
      "type": "class",
      "filepath": "/path/to/service.ts",
      "line_number": 12,
      "end_line": 89,
      "language": "typescript",
      "complexity": 12,
      "impact_score": 60.0,
      "has_docs": true,
      "export_type": "default",
      "module_system": "esm"
    }
  ]
}
```

### Field Descriptions

#### Top-Level Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `coverage_percent` | number | Overall documentation coverage percentage | 0-100 |
| `total_items` | integer | Total number of code items analyzed | >= 0 |
| `documented_items` | integer | Number of items with documentation | >= 0 |
| `by_language` | object | Metrics broken down by language | `Record<string, LanguageMetrics>` |
| `items` | array | All parsed code items | `Array<CodeItem>` |

#### LanguageMetrics Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `language` | string | Programming language | Any string (e.g., "python", "typescript", "javascript") |
| `total_items` | integer | Total items for this language | >= 0 |
| `documented_items` | integer | Documented items for this language | >= 0 |
| `coverage_percent` | number | Coverage percentage for this language | 0-100 |
| `avg_complexity` | number | Average cyclomatic complexity | >= 0 |
| `avg_impact_score` | number | Average impact score | 0-100 |

#### CodeItem Fields

| Field | Type | Description | Required? | Constraints |
|-------|------|-------------|-----------|-------------|
| `name` | string | Function/class/method name | Required | Non-empty string |
| `type` | string | Type of code element | Required | "function", "class", "method", or "interface" |
| `filepath` | string | Absolute path to source file | Required | Non-empty string |
| `line_number` | integer | Line where definition starts | Required | > 0 |
| `end_line` | integer | Line where definition ends (inclusive) | Required | > 0 |
| `language` | string | Source language | Required | "python", "typescript", "javascript", or "skipped" |
| `complexity` | integer | Cyclomatic complexity score | Required | >= 0 |
| `impact_score` | number | Calculated impact score | Required | 0-100 |
| `has_docs` | boolean | Whether item has documentation | Required | true or false |
| `export_type` | string | Export style | Required | "named", "default", "commonjs", or "internal" |
| `module_system` | string | Module system | Required | "esm", "commonjs", or "unknown" |
| `audit_rating` | integer or null | Quality rating if audited | Optional | 1-4 or undefined (field may be missing) |

---

## Audit Command

The `docimp audit` command returns items with existing documentation for quality rating.

### Example JSON Output

```json
{
  "items": [
    {
      "name": "calculate_score",
      "type": "function",
      "filepath": "/path/to/scorer.py",
      "line_number": 45,
      "end_line": 58,
      "language": "python",
      "complexity": 5,
      "docstring": "Calculate impact score based on complexity.\n\nArgs:\n    complexity: Cyclomatic complexity value.\n\nReturns:\n    Impact score (0-100).",
      "audit_rating": null
    },
    {
      "name": "DataService",
      "type": "class",
      "filepath": "/path/to/service.ts",
      "line_number": 12,
      "end_line": 89,
      "language": "typescript",
      "complexity": 12,
      "docstring": "/**\n * Service for managing data operations.\n * Handles CRUD operations and caching.\n */",
      "audit_rating": 3
    }
  ]
}
```

### Field Descriptions

#### AuditItem Fields

| Field | Type | Description | Required? | Constraints |
|-------|------|-------------|-----------|-------------|
| `name` | string | Function/class/method name | Required | Non-empty string |
| `type` | string | Type of code element | Required | "function", "class", "method", or "interface" |
| `filepath` | string | Absolute path to source file | Required | Non-empty string |
| `line_number` | integer | Line where definition starts | Required | > 0 |
| `end_line` | integer | Line where definition ends (inclusive) | Required | > 0 |
| `language` | string | Source language | Required | "python", "typescript", "javascript", or "skipped" |
| `complexity` | integer | Cyclomatic complexity score | Required | >= 0 |
| `docstring` | string or null | Existing documentation | Required | String or null |
| `audit_rating` | integer or null | Previous quality rating if exists | Required | 1-4 or null (not undefined) |

**Note:** Unlike `CodeItem.audit_rating` which is optional (field may be missing), `AuditItem.audit_rating` is a required field that can be `null`.

---

## Plan Command

The `docimp plan` command returns a prioritized list of items needing documentation improvements.

### Example JSON Output

```json
{
  "items": [
    {
      "name": "process_data",
      "type": "function",
      "filepath": "/path/to/processor.py",
      "line_number": 102,
      "language": "python",
      "complexity": 10,
      "impact_score": 50.0,
      "has_docs": false,
      "audit_rating": null,
      "parameters": ["data", "options"],
      "return_type": "ProcessedData",
      "docstring": null,
      "export_type": "named",
      "module_system": "esm",
      "reason": "Missing documentation (complexity: 10, impact: 50.0)"
    },
    {
      "name": "calculate_score",
      "type": "function",
      "filepath": "/path/to/scorer.py",
      "line_number": 45,
      "language": "python",
      "complexity": 5,
      "impact_score": 45.0,
      "has_docs": true,
      "audit_rating": 1,
      "parameters": ["complexity"],
      "return_type": "float",
      "docstring": "Calculates score.",
      "export_type": "named",
      "module_system": "esm",
      "reason": "Poor quality documentation (rated: Terrible)"
    }
  ],
  "total_items": 2,
  "missing_docs_count": 1,
  "poor_quality_count": 1
}
```

### Field Descriptions

#### Top-Level Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| `items` | array | Prioritized items to improve | `Array<PlanItem>` |
| `total_items` | integer | Total items in plan | >= 0 |
| `missing_docs_count` | integer | Items with no documentation | >= 0 |
| `poor_quality_count` | integer | Items with poor quality docs | >= 0 |

#### PlanItem Fields

| Field | Type | Description | Required? | Constraints |
|-------|------|-------------|-----------|-------------|
| `name` | string | Function/class/method name | Required | Non-empty string |
| `type` | string | Type of code element | Required | "function", "class", "method", or "interface" |
| `filepath` | string | Absolute path to source file | Required | Non-empty string |
| `line_number` | integer | Line where definition starts | Required | > 0 |
| `language` | string | Source language | Required | "python", "typescript", or "javascript" |
| `complexity` | integer | Cyclomatic complexity score | Required | >= 0 |
| `impact_score` | number | Calculated impact score | Required | 0-100 |
| `has_docs` | boolean | Whether item has documentation | Required | true or false |
| `audit_rating` | integer or null | Quality rating if audited | Required | 1-4 or null (not undefined) |
| `parameters` | array | Parameter names | Required | Array of strings |
| `return_type` | string or null | Return type annotation if available | Required | String or null |
| `docstring` | string or null | Existing documentation if present | Required | String or null |
| `export_type` | string | Export style | Required | "named", "default", "commonjs", or "internal" |
| `module_system` | string | Module system | Required | "esm", "commonjs", or "unknown" |
| `reason` | string | Human-readable reason for inclusion | Required | Non-empty string |

---

## Field Type Reference

### Optional vs Nullable vs Required

Understanding the semantic difference between these patterns is critical for correct JSON serialization:

#### Required Field

The field must be present in the JSON object. TypeScript type does not include `undefined` or `?`.

**Python:**
```python
@dataclass
class Example:
    name: str  # Required
```

**JSON:**
```json
{
  "name": "value"  // Must be present
}
```

**TypeScript:**
```typescript
interface Example {
  name: string;  // Required, cannot be undefined
}
```

**Zod:**
```typescript
z.object({
  name: z.string()  // Required
})
```

#### Nullable Field

The field must be present, but its value can be `null`. TypeScript type includes `| null`.

**Python:**
```python
@dataclass
class Example:
    docstring: Optional[str]  # Can be None
```

**JSON:**
```json
{
  "docstring": null  // Present, but null
}
```

**TypeScript:**
```typescript
interface Example {
  docstring: string | null;  // Required field, nullable value
}
```

**Zod:**
```typescript
z.object({
  docstring: z.string().nullable()  // Field required, value can be null
})
```

#### Optional Field

The field may be missing from the JSON object entirely. TypeScript type includes `?` or `| undefined`.

**Python:**
```python
@dataclass
class Example:
    audit_rating: Optional[int] = None
```

**JSON (field missing):**
```json
{
  // audit_rating not present
}
```

**JSON (field present as null):**
```json
{
  "audit_rating": null  // Also valid if using .nullable()
}
```

**TypeScript:**
```typescript
interface Example {
  audit_rating?: number;  // Optional field
}
```

**Zod:**
```typescript
z.object({
  audit_rating: z.number().optional()  // Field can be missing
})
```

### Current DocImp Patterns

**CodeItem.audit_rating:**
- Python: `Optional[int] = None`
- JSON: Field may be missing or present as `null`
- TypeScript: `audit_rating?: number`
- Zod: `.optional()` (field can be missing)

**AuditItem.audit_rating:**
- Python: `Optional[int]`
- JSON: Field always present, value is `null` if not audited
- TypeScript: `audit_rating: number | null`
- Zod: `.nullable()` (field required, value can be null)

**PlanItem.audit_rating:**
- Python: `Optional[int]`
- JSON: Field always present, value is `null` if not audited
- TypeScript: `audit_rating: number | null`
- Zod: `.nullable()` (field required, value can be null)

---

## Common Pitfalls and Edge Cases

### 1. Unicode Handling

**Problem:** Non-ASCII characters in code or file paths can cause encoding errors.

**Solution:** Python's `json.dumps()` handles Unicode correctly by default (UTF-8). TypeScript parses UTF-8 JSON without issues.

**Example:**
```python
item = CodeItem(
    name='函数',  # Chinese characters
    filepath='/test/测试.py',
    docstring='Documentation with 日本語 and emoji: ✓'
)
```

```json
{
  "name": "函数",
  "filepath": "/test/测试.py",
  "docstring": "Documentation with 日本語 and emoji: ✓"
}
```

### 2. Large Numbers

**Problem:** JavaScript `Number.MAX_SAFE_INTEGER` is 2^53 - 1 (9,007,199,254,740,991). Larger integers may lose precision.

**Solution:** DocImp's `complexity` field uses reasonable values (<1000 in practice). If you encounter very large values, they serialize as integers but may lose precision in JavaScript.

**Example:**
```python
# Extremely high complexity (unrealistic)
item.complexity = 999999999999  # Larger than JS safe integer
```

```json
{
  "complexity": 999999999999  // Valid JSON, but may lose precision in JS
}
```

### 3. Special Float Values

**Problem:** `NaN`, `Infinity`, and `-Infinity` are not valid JSON values.

**Solution:** Python's `json.dumps()` default behavior (Python 3.10+) is to raise `ValueError` for special floats unless `allow_nan=True` is specified. DocImp uses the default behavior.

In practice, `impact_score` is always capped at 100 using `min(100, ...)`, so `Infinity` should never occur.

**Example:**
```python
# This would raise ValueError with default json.dumps()
item.impact_score = float('inf')  # NOT allowed

# This works fine
item.impact_score = min(100, complexity * 5)  # Always finite
```

### 4. Null vs None vs Missing

**Problem:** TypeScript distinguishes between `null`, `undefined`, and missing fields. Python uses `None` for both null and missing.

**Solution:** DocImp uses this pattern:
- Python `None` → JSON `null`
- Optional Python fields with `None` default → JSON field with `null` value
- Use Zod `.nullable()` when field is always present but can be `null`
- Use Zod `.optional()` when field may be missing entirely

**Example:**
```python
# Python
item.docstring = None  # None value
item.audit_rating = None  # None value
```

```json
{
  "docstring": null,  // Present as null
  "audit_rating": null  // Present as null
}
```

### 5. Empty Collections

**Problem:** Empty dictionaries and arrays need to serialize correctly.

**Solution:** Python's `json.dumps()` converts empty collections correctly:
- Empty list `[]` → JSON `[]`
- Empty dict `{}` → JSON `{}`

**Example:**
```python
result = AnalysisResult(
    items=[],  # Empty list
    by_language={},  # Empty dict
    coverage_percent=0.0,
    total_items=0,
    documented_items=0
)
```

```json
{
  "items": [],
  "by_language": {},
  "coverage_percent": 0.0,
  "total_items": 0,
  "documented_items": 0
}
```

### 6. Zod Passthrough Mode

**Important:** All Zod schemas use `.passthrough()` to allow extra fields for forward compatibility.

This means:
- Extra fields in JSON are allowed and preserved
- JSON can have fields not defined in the schema
- This enables adding new fields without breaking old TypeScript code

**Example:**
```json
{
  "name": "test",
  "type": "function",
  "new_field_from_future_version": "value",  // Allowed by .passthrough()
  ...
}
```

---

## Testing the JSON Boundary

See `analyzer/tests/test_json_serialization.py` for Python-side tests and `cli/src/__tests__/integration/PythonBridge.integration.test.ts` for TypeScript integration tests.

**Key test cases:**
1. Unicode characters in names, paths, and docstrings
2. Large complexity values
3. Null vs None field handling
4. Empty collections (by_language, items)
5. Complete JSON roundtrip with realistic data
6. Real subprocess communication (integration tests)
7. Zod validation with real Python output

---

## Schema Maintenance

When adding new fields to the JSON schema:

1. **Python side:**
   - Update dataclass in `analyzer/src/models/`
   - Update `format_json()` or `to_dict()` method
   - Add test case in `analyzer/tests/test_json_serialization.py`

2. **TypeScript side:**
   - Update interface in `cli/src/types/analysis.ts`
   - Update Zod schema in `cli/src/python-bridge/schemas.ts`
   - Add test case in integration tests

3. **Documentation:**
   - Update this file (`docs/json-schema.md`)
   - Update `CLAUDE.md` if needed

4. **Testing:**
   - Run all tests: `pytest` (Python) and `npm test` (TypeScript)
   - Integration tests will catch serialization mismatches

---

## References

- **Zod Schemas:** `cli/src/python-bridge/schemas.ts`
- **TypeScript Types:** `cli/src/types/analysis.ts`
- **Python Models:** `analyzer/src/models/`
- **Python JSON Output:** `analyzer/src/main.py` (`format_json()`, `cmd_audit()`, `cmd_plan()`)
- **Integration Tests:** `cli/src/__tests__/integration/PythonBridge.integration.test.ts`
- **Python Tests:** `analyzer/tests/test_json_serialization.py`
