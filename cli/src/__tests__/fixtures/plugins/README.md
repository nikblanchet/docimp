# Plugin Test Fixtures

This directory contains plugin fixture files for testing the PluginManager.

## Why These Files Exist But Aren't Used in Jest Tests

These fixture files were created to test plugin loading, but **Jest cannot handle
dynamic `import()` statements** for runtime-created or fixture files. This is a known
Jest limitation with ESM dynamic imports.

## Current Testing Approach

Instead of loading fixture files, the PluginManager tests use **direct plugin
registration** to test the core business logic:

- Hook execution (`beforeAccept`, `afterWrite`)
- Error isolation (plugin exceptions are caught and returned as rejections)
- Multiple plugin coordination
- Plugin skipping when hooks are missing

See `PluginManager.test.ts` for details.

## Actual Plugin Loading Testing

**Plugin file loading is tested via Python integration tests**, which can successfully
load and execute real plugin files in production mode.

## Fixture Files

### Valid Plugins (ESM)

- `valid-before-accept.mjs` - Plugin with only beforeAccept hook
- `valid-after-write.mjs` - Plugin with only afterWrite hook
- `valid-both-hooks.mjs` - Plugin with both hooks
- `plugin-1.mjs`, `plugin-2.mjs` - For testing multiple plugin loading
- `plugin-rejects.mjs` - Plugin that rejects documentation
- `plugin-throws-error.mjs` - Plugin that throws an error (for error isolation testing)
- `plugin-after-write-error.mjs` - Plugin that throws in afterWrite hook

### Valid Plugins (CommonJS)

- `valid-before-accept.cjs` - CommonJS version for future use

### Invalid Plugins (for validation testing)

- `invalid-not-object.mjs` - Exports a string instead of an object
- `invalid-no-name.mjs` - Missing name property
- `invalid-no-version.mjs` - Missing version property
- `invalid-no-hooks.mjs` - Missing hooks property
- `invalid-empty-hooks.mjs` - Has hooks property but no valid hooks inside
- `invalid-beforeaccept-not-function.mjs` - beforeAccept is not a function
- `invalid-afterwrite-not-function.mjs` - afterWrite is not a function

## Future Use

These fixtures may be useful for:

- Manual testing of the plugin system
- Integration testing with alternative test runners (e.g., Vitest)
- Documentation examples
- Debugging plugin loading issues
