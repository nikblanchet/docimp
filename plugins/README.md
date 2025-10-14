# DocImp Plugin System

DocImp's plugin system enables extensible validation of AI-generated documentation. Plugins run JavaScript code to validate, enforce style rules, and provide auto-fixes before documentation is written to files.

## Overview

Plugins are JavaScript files that export validation hooks. They can:

- **Validate** generated documentation (parameter names, types, formatting)
- **Enforce** style rules (tag preferences, punctuation, examples)
- **Provide** automatic fixes for common errors
- **Block** acceptance of invalid documentation
- **Integrate** with external tools (linters, formatters, type checkers)

## Plugin Interface

A plugin is a JavaScript module (CommonJS or ESM) that exports an object with this structure:

```javascript
export default {
  name: 'my-plugin',           // Plugin identifier
  version: '1.0.0',            // Semantic version
  hooks: {
    beforeAccept: async (docstring, item, config) => {
      // Validate documentation before acceptance
      return {
        accept: true,          // or false to reject
        reason: 'Error msg',   // required if accept is false
        autoFix: 'Fixed doc',  // optional auto-fix suggestion
      };
    },
    afterWrite: async (filepath, item) => {
      // Run after documentation is written to file
      return {
        accept: true,
        reason: 'Error msg',
      };
    },
  },
};
```

### Hook Reference

#### `beforeAccept`

Runs before generated documentation is accepted in the improve workflow.

**Parameters:**
- `docstring` (string): Generated documentation text
- `item` (object): Code item metadata
  - `name`: Function/class/method name
  - `type`: 'function', 'class', or 'method'
  - `filepath`: Source file path
  - `line_number`: Line number in source
  - `language`: 'python', 'typescript', or 'javascript'
  - `complexity`: Cyclomatic complexity
  - `export_type`: 'named', 'default', 'commonjs', or 'internal'
  - `code`: Original source code (if available)
  - `parameters`: Function parameter names
- `config` (object): User configuration from docimp.config.js

**Returns:** Promise resolving to:
- `accept` (boolean): Whether to accept the documentation
- `reason` (string, optional): Error message if rejected
- `autoFix` (string, optional): Suggested fix

**Use cases:**
- Type validation
- Style enforcement
- Completeness checks
- Custom business rules

#### `afterWrite`

Runs after documentation has been written to a file.

**Parameters:**
- `filepath` (string): Path to the modified file
- `item` (object): Code item metadata (same as beforeAccept)

**Returns:** Promise resolving to:
- `accept` (boolean): Whether the write was successful
- `reason` (string, optional): Error message if failed

**Use cases:**
- Running formatters (prettier, black)
- Running linters (eslint, ruff)
- Updating related documentation
- Triggering builds

## Built-in Plugins

### validate-types.js

Performs REAL type-checking of JSDoc comments using the TypeScript compiler with `checkJs: true`.

**Validates:**
- Parameter names match function signatures
- JSDoc types are syntactically correct
- Types align with TypeScript inference

**Example:**

```javascript
// This will be REJECTED:
/**
 * Add two numbers
 * @param {number} wrongName - First number
 * @param {number} b - Second number
 */
function add(correctName, b) {
  return correctName + b;
}

// Validation error:
// "Parameter name mismatch: JSDoc says 'wrongName', function says 'correctName'"
```

**Configuration:**

```javascript
// docimp.config.js
export default {
  jsdocStyle: {
    enforceTypes: true,  // Enable type validation
  },
};
```

### jsdoc-style.js

Enforces JSDoc style conventions.

**Validates:**
- Preferred tag aliases (@returns instead of @return)
- Description formatting (must end with punctuation)
- Required @example tags for complex public APIs

**Example:**

```javascript
// This will be REJECTED:
/**
 * Calculate sum   <- Missing punctuation
 * @return {number}  <- Should be @returns
 */
export function sum(numbers) {
  return numbers.reduce((a, b) => a + b, 0);
}

// Auto-fix available:
/**
 * Calculate sum.
 * @returns {number}
 */
```

**Configuration:**

```javascript
// docimp.config.js
export default {
  jsdocStyle: {
    preferredTags: {
      return: 'returns',  // Prefer @returns over @return
      arg: 'param',       // Prefer @param over @arg
    },
    requireDescriptions: true,     // Descriptions are required
    requireExamples: 'public',     // Require @example for public APIs
  },
};
```

## Creating Custom Plugins

### Basic Plugin Template

```javascript
// plugins/my-custom-plugin.js

/**
 * Custom validation plugin.
 */
async function beforeAccept(docstring, item, config) {
  // Your validation logic here
  const isValid = validateDocstring(docstring);

  if (!isValid) {
    return {
      accept: false,
      reason: 'Validation failed: ...',
      autoFix: generateFix(docstring),  // Optional
    };
  }

  return { accept: true };
}

export default {
  name: 'my-custom-plugin',
  version: '1.0.0',
  hooks: {
    beforeAccept,
  },
};
```

### Example: Linter Integration

Here's an example of integrating an external linter as an afterWrite hook:

```javascript
// plugins/lint-docstrings.js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function afterWrite(filepath, item) {
  try {
    // Run linter on the file
    if (item.language === 'python') {
      await execAsync(`ruff check ${filepath}`);
    } else if (item.language === 'javascript' || item.language === 'typescript') {
      await execAsync(`npx eslint ${filepath}`);
    }

    return { accept: true };
  } catch (error) {
    return {
      accept: false,
      reason: `Linter failed: ${error.stderr}`,
    };
  }
}

export default {
  name: 'lint-docstrings',
  version: '1.0.0',
  hooks: {
    afterWrite,
  },
};
```

Note: This example is provided for reference. Linter integration is not included in the MVP to keep scope focused, but demonstrates how the plugin system can be extended.

### Example: Custom Business Rules

```javascript
// plugins/company-standards.js

/**
 * Enforce company documentation standards.
 */
async function beforeAccept(docstring, item, config) {
  const violations = [];

  // Require author tags for public APIs
  if (item.export_type !== 'internal') {
    if (!docstring.includes('@author')) {
      violations.push('Public APIs must include @author tag');
    }
  }

  // Require @throws documentation for complex functions
  if (item.complexity > 10 && !docstring.includes('@throws')) {
    violations.push('Complex functions should document exceptions with @throws');
  }

  if (violations.length > 0) {
    return {
      accept: false,
      reason: 'Company standards violations:\n  ' + violations.join('\n  '),
    };
  }

  return { accept: true };
}

export default {
  name: 'company-standards',
  version: '1.0.0',
  hooks: {
    beforeAccept,
  },
};
```

## Configuration

Register plugins in your `docimp.config.js`:

```javascript
// docimp.config.js
export default {
  plugins: [
    './plugins/validate-types.js',
    './plugins/jsdoc-style.js',
    './plugins/my-custom-plugin.js',
  ],
};
```

Paths are relative to the project root.

## Plugin Execution

### Execution Order

Plugins run in the order they are listed in the configuration. All plugins execute even if earlier plugins fail, allowing you to see all validation issues at once.

### Error Isolation

If a plugin throws an exception (crashes), the error is caught and reported as a validation failure. Other plugins continue to run.

```javascript
// This plugin crashes:
async function beforeAccept() {
  throw new Error('Something went wrong');
}

// Result:
// {
//   accept: false,
//   reason: "Plugin my-plugin threw an error: Something went wrong"
// }
```

### Result Aggregation

When multiple plugins validate the same documentation:

- If **any** plugin rejects (accept: false), the documentation is rejected
- Error messages from all rejecting plugins are combined
- The first auto-fix is used (if multiple plugins provide fixes)

## Security

### Trust Model

**CRITICAL: Plugins run with full Node.js access. There is NO sandboxing.**

Plugins have unrestricted access to:
- File system (read, write, delete)
- Network (make HTTP requests)
- Environment variables (including API keys)
- Child processes (execute any command)

**Only load plugins you trust.**

### Risk Mitigation

DocImp implements these safety measures:

1. **Default-safe loading**: Only loads plugins from:
   - `./plugins/` directory
   - Paths explicitly listed in `docimp.config.js`

2. **No remote loading**: Plugins cannot be loaded from URLs or npm packages directly

3. **Explicit configuration**: All plugins must be explicitly listed in config

4. **Error isolation**: Plugin crashes don't take down the entire application

### Future: Sandboxing Flag

A future version may add an `--unsafe-plugins` flag to explicitly acknowledge when loading plugins from untrusted sources. For now, all plugins are considered trusted.

### Security Best Practices

When writing or using plugins:

1. **Audit plugin code** before adding it to your configuration
2. **Pin plugin versions** (store plugins in your repo, don't pull from external sources)
3. **Review changes** when updating plugins
4. **Limit access** to sensitive files (plugins can read your .env, API keys, etc.)
5. **Test in isolation** before using in production

### Why No Sandboxing?

The decision to not sandbox plugins was intentional:

**Pros:**
- Full access to Node.js ecosystem (TypeScript compiler, linters, formatters)
- Real type-checking (not just pattern matching)
- Can integrate with existing tools in your workflow
- Simpler implementation, fewer bugs

**Cons:**
- Security risk if loading untrusted plugins
- No protection from malicious code

**Trade-off:** For DocImp's use case (validating documentation in your own projects), the benefits of full Node.js access outweigh the risks. Sandboxing would prevent the validate-types plugin from using the TypeScript compiler, which is a core feature.

## Testing Plugins

### Unit Testing

Test plugins in isolation:

```javascript
// plugins/__tests__/my-plugin.test.js
import plugin from '../my-plugin.js';

describe('my-plugin', () => {
  test('accepts valid documentation', async () => {
    const result = await plugin.hooks.beforeAccept(
      '/** Valid doc */',
      { name: 'test', type: 'function', language: 'javascript' },
      {}
    );

    expect(result.accept).toBe(true);
  });

  test('rejects invalid documentation', async () => {
    const result = await plugin.hooks.beforeAccept(
      '/** Invalid */',
      { name: 'test', type: 'function', language: 'javascript' },
      {}
    );

    expect(result.accept).toBe(false);
    expect(result.reason).toContain('error message');
  });
});
```

### Integration Testing

Test with the PluginManager:

```javascript
import { PluginManager } from '../cli/src/plugins/PluginManager.js';

const manager = new PluginManager();
await manager.loadPlugins(['./plugins/my-plugin.js']);

const results = await manager.runBeforeAccept(
  '/** Doc */',
  { name: 'test', type: 'function', language: 'javascript' },
  {}
);

console.log(results);
```

## Troubleshooting

### Plugin Not Loading

**Error:** "Failed to load plugin from ./plugins/my-plugin.js"

**Solutions:**
- Check the file path is correct (relative to project root)
- Verify the file exists
- Check for syntax errors in the plugin code
- Ensure the plugin exports the required structure

### Plugin Validation Failing

**Error:** "Plugin at ... must have a 'name' property"

**Solution:** Ensure your plugin exports an object with `name`, `version`, and `hooks`:

```javascript
export default {
  name: 'my-plugin',        // Required
  version: '1.0.0',         // Required
  hooks: {                  // Required
    beforeAccept: async () => ({ accept: true }),
  },
};
```

### TypeScript Import Errors

If you see import errors in validate-types.js:

**Solution:** Ensure TypeScript is installed:

```bash
cd cli
npm install
```

The plugin uses the TypeScript compiler from the CLI's node_modules.

## API Reference

### PluginResult

```typescript
interface PluginResult {
  accept: boolean;      // Whether to accept the documentation
  reason?: string;      // Error message if rejected
  autoFix?: string;     // Suggested fix
}
```

### CodeItemMetadata

```typescript
interface CodeItemMetadata {
  name: string;                    // Function/class/method name
  type: 'function' | 'class' | 'method';
  filepath: string;                // Source file path
  line_number: number;             // Line number
  language: 'python' | 'typescript' | 'javascript';
  complexity: number;              // Cyclomatic complexity
  export_type?: 'named' | 'default' | 'commonjs' | 'internal';
  module_system?: 'esm' | 'commonjs' | 'unknown';
  code?: string;                   // Original source code
  parameters?: string[];           // Parameter names
  return_type?: string;            // Return type (if available)
}
```

## Contributing

When contributing new plugins:

1. Add comprehensive JSDoc comments
2. Include unit tests
3. Update this README with usage examples
4. Consider security implications
5. Provide configuration examples

## License

All built-in plugins are licensed under the same license as DocImp (MIT).
