/**
 * Integration tests for PluginManager file loading.
 *
 * These tests verify that PluginManager can load real plugin files
 * from disk, including both ESM and CommonJS formats.
 *
 * Uses Node.js native test runner (node --test).
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PluginManager } from '../../../dist/plugins/PluginManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to fixtures directory
const FIXTURES_DIR = resolve(__dirname, '../fixtures/plugins');

describe('PluginManager - File Loading Integration', () => {
  let manager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('Valid Plugin Loading', () => {
    test('can load valid ESM plugin from file', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'valid-before-accept.mjs');

      await manager.loadPlugins([pluginPath]);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(loadedPlugins.length, 1);
      assert.equal(loadedPlugins[0], 'test-before-accept');
    });

    test('can load valid CommonJS plugin from file', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'valid-before-accept.cjs');

      await manager.loadPlugins([pluginPath]);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(loadedPlugins.length, 1);
      assert.equal(loadedPlugins[0], 'test-before-accept-cjs');
    });

    test('can load multiple plugins', async () => {
      const pluginPaths = [
        resolve(FIXTURES_DIR, 'valid-before-accept.mjs'),
        resolve(FIXTURES_DIR, 'valid-after-write.mjs'),
      ];

      await manager.loadPlugins(pluginPaths);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(loadedPlugins.length, 2);
      assert.ok(loadedPlugins.includes('test-before-accept'));
      assert.ok(loadedPlugins.includes('test-after-write'));
    });

    test('can load plugin with both hooks', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'valid-both-hooks.mjs');

      await manager.loadPlugins([pluginPath]);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(loadedPlugins.length, 1);
      assert.equal(loadedPlugins[0], 'test-both-hooks');
    });
  });

  describe('Path Resolution', () => {
    test('handles absolute paths', async () => {
      const absolutePath = resolve(FIXTURES_DIR, 'valid-before-accept.mjs');

      await manager.loadPlugins([absolutePath]);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(loadedPlugins.length, 1);
    });

    test('handles relative paths with project root', async () => {
      const relativePath = 'valid-before-accept.mjs';

      await manager.loadPlugins([relativePath], FIXTURES_DIR);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(loadedPlugins.length, 1);
    });
  });

  describe('Duplicate Prevention', () => {
    test('prevents loading same plugin twice via same path', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'valid-before-accept.mjs');

      await manager.loadPlugins([pluginPath]);
      await manager.loadPlugins([pluginPath]); // Load again

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(
        loadedPlugins.length,
        1,
        'Should only load plugin once'
      );
    });

    test('prevents loading same plugin via relative and absolute paths', async () => {
      const absolutePath = resolve(FIXTURES_DIR, 'valid-before-accept.mjs');
      const relativePath = 'valid-before-accept.mjs';

      await manager.loadPlugins([absolutePath]);
      await manager.loadPlugins([relativePath], FIXTURES_DIR);

      const loadedPlugins = manager.getLoadedPlugins();
      assert.equal(
        loadedPlugins.length,
        1,
        'Should recognize same file via different path formats'
      );
    });
  });

  describe('Validation Errors', () => {
    test('rejects plugin with no name', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'invalid-no-name.mjs');

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /must have a 'name' property/,
        }
      );
    });

    test('rejects plugin with no version', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'invalid-no-version.mjs');

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /must have a 'version' property/,
        }
      );
    });

    test('rejects plugin with no hooks', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'invalid-no-hooks.mjs');

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /must have a 'hooks' property/,
        }
      );
    });

    test('rejects plugin with empty hooks object', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'invalid-empty-hooks.mjs');

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /must implement at least one hook/,
        }
      );
    });

    test('rejects plugin with non-function beforeAccept', async () => {
      const pluginPath = resolve(
        FIXTURES_DIR,
        'invalid-beforeaccept-not-function.mjs'
      );

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /beforeAccept hook must be a function/,
        }
      );
    });

    test('rejects plugin with non-function afterWrite', async () => {
      const pluginPath = resolve(
        FIXTURES_DIR,
        'invalid-afterwrite-not-function.mjs'
      );

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /afterWrite hook must be a function/,
        }
      );
    });

    test('rejects plugin that is not an object', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'invalid-not-object.mjs');

      await assert.rejects(
        async () => {
          await manager.loadPlugins([pluginPath]);
        },
        {
          message: /must export an object/,
        }
      );
    });
  });

  describe('File System Errors', () => {
    test('handles missing plugin file', async () => {
      const nonExistentPath = resolve(
        FIXTURES_DIR,
        'this-file-does-not-exist.mjs'
      );

      await assert.rejects(
        async () => {
          await manager.loadPlugins([nonExistentPath]);
        },
        {
          message: /Failed to load plugin/,
        }
      );
    });
  });

  describe('Hook Execution After Loading', () => {
    test('loaded plugin hooks can be executed', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'valid-before-accept.mjs');

      await manager.loadPlugins([pluginPath]);

      // Execute the loaded plugin's hook
      const results = await manager.runBeforeAccept(
        '/** Test docstring */',
        { name: 'test', type: 'function' },
        { styleGuide: 'jsdoc', tone: 'concise' }
      );

      assert.equal(results.length, 1);
      assert.equal(results[0].accept, true);
    });

    test('loaded plugin can reject documentation', async () => {
      const pluginPath = resolve(FIXTURES_DIR, 'plugin-rejects.mjs');

      await manager.loadPlugins([pluginPath]);

      const results = await manager.runBeforeAccept(
        '/** Bad docstring */',
        { name: 'test', type: 'function' },
        { styleGuide: 'jsdoc', tone: 'concise' }
      );

      assert.equal(results.length, 1);
      assert.equal(results[0].accept, false);
      assert.ok(results[0].reason);
    });
  });
});
