# Configuration System

DocImp uses a JavaScript-based configuration system to provide flexibility and allow custom logic in your configuration files.

## Configuration File

The configuration file is `docimp.config.js` in your project root. It's written in JavaScript (not JSON) to allow you to:

- Use functions and custom logic
- Import other modules
- Define complex patterns
- Keep configuration maintainable with comments

### File Format

Both CommonJS and ESM formats are supported:

**ESM (recommended):**
```javascript
export default {
  styleGuide: 'jsdoc',
  tone: 'concise',
  // ... other options
};
```

**CommonJS:**
```javascript
module.exports = {
  styleGuide: 'jsdoc',
  tone: 'concise',
  // ... other options
};
```

## Configuration Options

### Style Guide

Controls the documentation format:

```javascript
{
  styleGuide: 'jsdoc'  // 'numpy', 'google', 'sphinx', or 'jsdoc'
}
```

- **numpy**: NumPy-style docstrings (Python)
- **google**: Google-style docstrings (Python)
- **sphinx**: Sphinx-style docstrings (Python)
- **jsdoc**: JSDoc comments (JavaScript/TypeScript)

### Tone

Controls the writing style of generated documentation:

```javascript
{
  tone: 'concise'  // 'concise', 'detailed', or 'friendly'
}
```

- **concise**: Brief, to-the-point descriptions
- **detailed**: Comprehensive explanations with examples
- **friendly**: Conversational, approachable language

### JSDoc Style Options

Specific configuration for JavaScript/TypeScript documentation:

```javascript
{
  jsdocStyle: {
    preferredTags: {
      return: 'returns',  // Prefer @returns over @return
      arg: 'param',       // Prefer @param over @arg
    },
    requireDescriptions: true,    // Require text descriptions, not just types
    requireExamples: 'public',    // 'all', 'public', or 'none'
    enforceTypes: true,           // Validate JSDoc types with TypeScript
  }
}
```

#### Preferred Tags

Map alternative JSDoc tag names to your preferred forms:

```javascript
preferredTags: {
  return: 'returns',    // Use @returns instead of @return
  arg: 'param',         // Use @param instead of @arg
  property: 'prop',     // Use @prop instead of @property
}
```

#### Require Examples

Control when @example tags are required:

- **'all'**: Every documented function needs an example
- **'public'**: Only exported/public APIs need examples
- **'none'**: Examples are never required

#### Enforce Types

When `enforceTypes: true`, the TypeScript compiler validates JSDoc:

- Parameter names must match function signatures
- Types must be syntactically correct
- Types are checked against TypeScript inference

This provides **real type-checking**, not just parsing.

### Impact Weights

Controls how DocImp prioritizes undocumented code:

```javascript
{
  impactWeights: {
    complexity: 0.6,  // 60% based on code complexity
    quality: 0.4,     // 40% based on audit quality (if available)
  }
}
```

Weights should sum to 1.0. The impact score formula:

```
score = (complexity_weight × complexity_score) +
        (quality_weight × quality_penalty)
```

#### Complexity Score

Based on cyclomatic complexity:
- Simple function (complexity 1): score = 5
- Complex function (complexity 15): score = 75
- Very complex (complexity 20+): score = 100

#### Quality Penalty

Based on user audit ratings (after running `docimp audit`):
- No documentation: 100
- Terrible (1 star): 80
- OK (2 stars): 40
- Good (3 stars): 20
- Excellent (4 stars): 0

### Plugins

Array of paths to validation plugins:

```javascript
{
  plugins: [
    './plugins/validate-types.js',
    './plugins/jsdoc-style.js',
  ]
}
```

Plugins are JavaScript files that export validation hooks. They can:
- Validate generated documentation before acceptance
- Enforce style rules
- Provide auto-fix suggestions
- Block acceptance if validation fails

**Security Warning**: Plugins have full Node.js access with no sandboxing. Only load plugins you trust.

See [Plugin System](../../plugins/README.md) for details on writing plugins.

### Exclude Patterns

Glob patterns for files to exclude from analysis:

```javascript
{
  exclude: [
    '**/test_*.py',
    '**/*.test.ts',
    '**/node_modules/**',
    '**/dist/**',
  ]
}
```

Supports standard glob syntax:
- `*` matches any characters (except `/`)
- `**` matches any characters (including `/`)
- `?` matches a single character
- `[abc]` matches any character in the set

## Using Configuration

### Automatic Loading

DocImp automatically looks for `docimp.config.js` in the current directory:

```bash
docimp analyze ./src
```

### Explicit Path

Specify a configuration file path:

```bash
docimp analyze ./src --config ./my-config.js
```

### Configuration in Different Directories

If running DocImp from a subdirectory, you can reference the root config:

```bash
cd packages/frontend
docimp analyze . --config ../../docimp.config.js
```

## Examples

### Python Project

```javascript
export default {
  styleGuide: 'numpy',
  tone: 'detailed',
  impactWeights: {
    complexity: 0.7,
    quality: 0.3,
  },
  exclude: [
    '**/test_*.py',
    '**/venv/**',
  ],
};
```

### TypeScript/JavaScript Project

```javascript
export default {
  styleGuide: 'jsdoc',
  tone: 'concise',
  jsdocStyle: {
    preferredTags: { return: 'returns' },
    requireDescriptions: true,
    requireExamples: 'public',
    enforceTypes: true,
  },
  plugins: [
    './plugins/validate-types.js',
    './plugins/jsdoc-style.js',
  ],
  exclude: [
    '**/*.test.ts',
    '**/node_modules/**',
  ],
};
```

### Mixed Polyglot Project

```javascript
export default {
  styleGuide: 'jsdoc',  // Will use JSDoc for JS/TS, NumPy for Python
  tone: 'concise',
  jsdocStyle: {
    enforceTypes: true,
  },
  impactWeights: {
    complexity: 0.6,
    quality: 0.4,
  },
  plugins: [
    './plugins/validate-types.js',
  ],
  exclude: [
    '**/*.test.*',
    '**/node_modules/**',
    '**/venv/**',
  ],
};
```

## Default Values

If you don't provide a configuration file, DocImp uses these defaults:

```javascript
{
  styleGuide: 'numpy',
  tone: 'concise',
  jsdocStyle: {
    preferredTags: {
      return: 'returns',
      arg: 'param',
    },
    requireDescriptions: true,
    requireExamples: 'public',
    enforceTypes: true,
  },
  impactWeights: {
    complexity: 0.6,
    quality: 0.4,
  },
  plugins: [],
  exclude: [
    '**/test_*.py',
    '**/*.test.ts',
    '**/*.test.js',
    '**/node_modules/**',
    '**/venv/**',
    '**/__pycache__/**',
    '**/dist/**',
    '**/build/**',
  ],
}
```

## Troubleshooting

### Configuration Not Loading

1. Check file name is exactly `docimp.config.js`
2. Verify it's in the current directory or use `--config` flag
3. Check for syntax errors in the JavaScript
4. Ensure proper export (CommonJS or ESM)

### Validation Errors

If DocImp reports validation errors:

1. Check the error message for specific issues
2. Verify values match allowed options (see above)
3. Ensure weights sum to ~1.0
4. Check that arrays contain only strings

### Plugin Loading Fails

1. Verify plugin paths are correct (relative to project root)
2. Check plugins export the correct interface
3. Ensure plugin files have no syntax errors
4. Review security warnings about plugin trust

## Schema Validation

The TypeScript interface provides type-checking for configuration:

```typescript
interface IConfig {
  styleGuide: 'numpy' | 'google' | 'sphinx' | 'jsdoc';
  tone: 'concise' | 'detailed' | 'friendly';
  jsdocStyle?: IJSDocStyle;
  impactWeights?: IImpactWeights;
  plugins?: string[];
  exclude?: string[];
}
```

See `cli/src/config/IConfig.ts` for the complete TypeScript definitions.
