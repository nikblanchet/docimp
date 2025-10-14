/**
 * Tests for PluginManager.
 *
 * Tests plugin loading, validation, error isolation, and hook execution.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PluginManager } from '../../plugins/PluginManager.js';
import type { IPlugin } from '../../plugins/IPlugin.js';
import { defaultConfig } from '../../config/IConfig.js';

describe('PluginManager', () => {
  let pluginManager: PluginManager;
  let testDir: string;
  let testFiles: string[] = [];

  beforeEach(async () => {
    pluginManager = new PluginManager();
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `docimp-plugin-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFiles = [];
  });

  afterEach(async () => {
    pluginManager.clear();

    // Clean up test files
    for (const file of testFiles) {
      try {
        await unlink(file);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
  });

  /**
   * Helper to create a test plugin file.
   */
  async function createPluginFile(filename: string, content: string): Promise<string> {
    const filepath = join(testDir, filename);
    await writeFile(filepath, content, 'utf8');
    testFiles.push(filepath);
    return filepath;
  }

  describe('loadPlugins', () => {
    it('should load a valid plugin with beforeAccept hook', async () => {
      const pluginPath = await createPluginFile(
        'test-plugin-before.mjs',
        `
        export default {
          name: 'test-plugin',
          version: '1.0.0',
          hooks: {
            beforeAccept: async (docstring, item, config) => {
              return { accept: true };
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const loadedPlugins = pluginManager.getLoadedPlugins();
      expect(loadedPlugins).toHaveLength(1);
      expect(loadedPlugins[0]).toBe('test-plugin');
    });

    it('should load a valid plugin with afterWrite hook', async () => {
      const pluginPath = await createPluginFile(
        'test-plugin-after.mjs',
        `
        export default {
          name: 'test-plugin',
          version: '1.0.0',
          hooks: {
            afterWrite: async (filepath, item) => {
              return { accept: true };
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const loadedPlugins = pluginManager.getLoadedPlugins();
      expect(loadedPlugins).toHaveLength(1);
      expect(loadedPlugins[0]).toBe('test-plugin');
    });

    it('should load multiple plugins', async () => {
      const plugin1 = await createPluginFile(
        'plugin1.mjs',
        `
        export default {
          name: 'plugin-1',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      const plugin2 = await createPluginFile(
        'plugin2.mjs',
        `
        export default {
          name: 'plugin-2',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await pluginManager.loadPlugins([plugin1, plugin2], testDir);

      const loadedPlugins = pluginManager.getLoadedPlugins();
      expect(loadedPlugins).toHaveLength(2);
      expect(loadedPlugins).toContain('plugin-1');
      expect(loadedPlugins).toContain('plugin-2');
    });

    it('should not load the same plugin twice', async () => {
      const pluginPath = await createPluginFile(
        'duplicate-plugin.mjs',
        `
        export default {
          name: 'duplicate',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath, pluginPath], testDir);

      const loadedPlugins = pluginManager.getLoadedPlugins();
      expect(loadedPlugins).toHaveLength(1);
    });
  });

  describe('plugin validation', () => {
    it('should throw error if plugin does not export an object', async () => {
      const pluginPath = await createPluginFile(
        'invalid-export.mjs',
        `
        export default 'not an object';
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'must export an object'
      );
    });

    it('should throw error if plugin has no name', async () => {
      const pluginPath = await createPluginFile(
        'no-name.mjs',
        `
        export default {
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'must have a \'name\' property'
      );
    });

    it('should throw error if plugin has no version', async () => {
      const pluginPath = await createPluginFile(
        'no-version.mjs',
        `
        export default {
          name: 'test',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'must have a \'version\' property'
      );
    });

    it('should throw error if plugin has no hooks', async () => {
      const pluginPath = await createPluginFile(
        'no-hooks.mjs',
        `
        export default {
          name: 'test',
          version: '1.0.0',
        };
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'must have a \'hooks\' property'
      );
    });

    it('should throw error if plugin has no valid hooks', async () => {
      const pluginPath = await createPluginFile(
        'empty-hooks.mjs',
        `
        export default {
          name: 'test',
          version: '1.0.0',
          hooks: {},
        };
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'must implement at least one hook'
      );
    });

    it('should throw error if beforeAccept is not a function', async () => {
      const pluginPath = await createPluginFile(
        'invalid-before-accept.mjs',
        `
        export default {
          name: 'test',
          version: '1.0.0',
          hooks: {
            beforeAccept: 'not a function',
          },
        };
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'beforeAccept hook must be a function'
      );
    });

    it('should throw error if afterWrite is not a function', async () => {
      const pluginPath = await createPluginFile(
        'invalid-after-write.mjs',
        `
        export default {
          name: 'test',
          version: '1.0.0',
          hooks: {
            afterWrite: 'not a function',
          },
        };
        `
      );

      await expect(pluginManager.loadPlugins([pluginPath], testDir)).rejects.toThrow(
        'afterWrite hook must be a function'
      );
    });
  });

  describe('runBeforeAccept', () => {
    it('should execute beforeAccept hook and return result', async () => {
      const pluginPath = await createPluginFile(
        'accepts-all.mjs',
        `
        export default {
          name: 'accepts-all',
          version: '1.0.0',
          hooks: {
            beforeAccept: async (docstring, item, config) => {
              return { accept: true };
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runBeforeAccept(
        '/** Test docstring */',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' },
        defaultConfig
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(true);
    });

    it('should return rejection when plugin rejects', async () => {
      const pluginPath = await createPluginFile(
        'rejects-all.mjs',
        `
        export default {
          name: 'rejects-all',
          version: '1.0.0',
          hooks: {
            beforeAccept: async (docstring, item, config) => {
              return {
                accept: false,
                reason: 'Documentation is invalid',
              };
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runBeforeAccept(
        '/** Bad docstring */',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' },
        defaultConfig
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(false);
      expect(results[0].reason).toBe('Documentation is invalid');
    });

    it('should isolate plugin errors', async () => {
      const pluginPath = await createPluginFile(
        'throws-error.mjs',
        `
        export default {
          name: 'throws-error',
          version: '1.0.0',
          hooks: {
            beforeAccept: async (docstring, item, config) => {
              throw new Error('Plugin crashed');
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runBeforeAccept(
        '/** Test */',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' },
        defaultConfig
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(false);
      expect(results[0].reason).toContain('Plugin crashed');
    });

    it('should execute multiple plugins in sequence', async () => {
      const plugin1 = await createPluginFile(
        'plugin-1.mjs',
        `
        export default {
          name: 'plugin-1',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      const plugin2 = await createPluginFile(
        'plugin-2.mjs',
        `
        export default {
          name: 'plugin-2',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await pluginManager.loadPlugins([plugin1, plugin2], testDir);

      const results = await pluginManager.runBeforeAccept(
        '/** Test */',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' },
        defaultConfig
      );

      expect(results).toHaveLength(2);
      expect(results[0].accept).toBe(true);
      expect(results[1].accept).toBe(true);
    });

    it('should skip plugins without beforeAccept hook', async () => {
      const pluginPath = await createPluginFile(
        'no-before-accept.mjs',
        `
        export default {
          name: 'no-before-accept',
          version: '1.0.0',
          hooks: {
            afterWrite: async () => ({ accept: true }),
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runBeforeAccept(
        '/** Test */',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' },
        defaultConfig
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('runAfterWrite', () => {
    it('should execute afterWrite hook and return result', async () => {
      const pluginPath = await createPluginFile(
        'after-write-plugin.mjs',
        `
        export default {
          name: 'after-write-plugin',
          version: '1.0.0',
          hooks: {
            afterWrite: async (filepath, item) => {
              return { accept: true };
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runAfterWrite(
        'test.js',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(true);
    });

    it('should isolate errors in afterWrite hooks', async () => {
      const pluginPath = await createPluginFile(
        'after-write-error.mjs',
        `
        export default {
          name: 'after-write-error',
          version: '1.0.0',
          hooks: {
            afterWrite: async (filepath, item) => {
              throw new Error('After write failed');
            },
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runAfterWrite(
        'test.js',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' }
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(false);
      expect(results[0].reason).toContain('After write failed');
    });

    it('should skip plugins without afterWrite hook', async () => {
      const pluginPath = await createPluginFile(
        'no-after-write.mjs',
        `
        export default {
          name: 'no-after-write',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);

      const results = await pluginManager.runAfterWrite(
        'test.js',
        { name: 'testFunc', type: 'function', filepath: 'test.js', language: 'javascript' }
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all loaded plugins', async () => {
      const pluginPath = await createPluginFile(
        'test-clear.mjs',
        `
        export default {
          name: 'test-clear',
          version: '1.0.0',
          hooks: {
            beforeAccept: async () => ({ accept: true }),
          },
        };
        `
      );

      await pluginManager.loadPlugins([pluginPath], testDir);
      expect(pluginManager.getLoadedPlugins()).toHaveLength(1);

      pluginManager.clear();
      expect(pluginManager.getLoadedPlugins()).toHaveLength(0);
    });
  });
});
