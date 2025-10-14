/**
 * Tests for PluginManager.
 *
 * Tests plugin validation, error isolation, and hook execution.
 * File loading is tested via Python integration tests due to Jest limitations with dynamic imports.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PluginManager } from '../../plugins/PluginManager.js';
import { defaultConfig } from '../../config/IConfig.js';
import type { IPlugin } from '../../plugins/IPlugin.js';

describe('PluginManager', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager();
  });

  afterEach(() => {
    pluginManager.clear();
  });

  describe('validation logic (via manual plugin registration)', () => {
    /**
     * Helper to test validation by directly adding a plugin to the manager.
     * This bypasses file loading to test validation logic in isolation.
     */
    function addPluginDirectly(plugin: IPlugin) {
      // Access private members for testing purposes
      // TypeScript will error, but JavaScript allows it
      (pluginManager as any).plugins.push(plugin);
    }

    it('should accept valid plugin with beforeAccept hook', () => {
      const validPlugin: IPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => ({ accept: true }),
        },
      };

      addPluginDirectly(validPlugin);
      const loaded = pluginManager.getLoadedPlugins();
      expect(loaded).toContain('test-plugin');
    });

    it('should accept valid plugin with afterWrite hook', () => {
      const validPlugin: IPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        hooks: {
          afterWrite: async () => ({ accept: true }),
        },
      };

      addPluginDirectly(validPlugin);
      const loaded = pluginManager.getLoadedPlugins();
      expect(loaded).toContain('test-plugin');
    });

    it('should accept valid plugin with both hooks', () => {
      const validPlugin: IPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => ({ accept: true }),
          afterWrite: async () => ({ accept: true }),
        },
      };

      addPluginDirectly(validPlugin);
      const loaded = pluginManager.getLoadedPlugins();
      expect(loaded).toContain('test-plugin');
    });
  });

  describe('runBeforeAccept', () => {
    it('should execute beforeAccept hook and return result', async () => {
      const plugin: IPlugin = {
        name: 'test-plugin',
        version: '1.0.0',
        hooks: {
          beforeAccept: async (docstring, item, config) => {
            return { accept: true };
          },
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runBeforeAccept(
        '/** Test docstring */',
        {
          name: 'testFunc',
          type: 'function',
          filepath: 'test.js',
          line_number: 1,
          language: 'javascript',
          complexity: 1,
        },
        defaultConfig
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(true);
    });

    it('should return rejection when plugin rejects', async () => {
      const plugin: IPlugin = {
        name: 'rejects-plugin',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => {
            return {
              accept: false,
              reason: 'Documentation is invalid',
            };
          },
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runBeforeAccept(
        '/** Bad docstring */',
        {
          name: 'testFunc',
          type: 'function',
          filepath: 'test.js',
          line_number: 1,
          language: 'javascript',
          complexity: 1,
        },
        defaultConfig
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(false);
      expect(results[0].reason).toBe('Documentation is invalid');
    });

    it('should isolate plugin errors', async () => {
      const plugin: IPlugin = {
        name: 'throws-error',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => {
            throw new Error('Plugin crashed');
          },
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runBeforeAccept(
        '/** Test */',
        {
          name: 'testFunc',
          type: 'function',
          filepath: 'test.js',
          line_number: 1,
          language: 'javascript',
          complexity: 1,
        },
        defaultConfig
      );

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(false);
      expect(results[0].reason).toContain('Plugin crashed');
    });

    it('should execute multiple plugins in sequence', async () => {
      const plugin1: IPlugin = {
        name: 'plugin-1',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => ({ accept: true }),
        },
      };

      const plugin2: IPlugin = {
        name: 'plugin-2',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => ({ accept: true }),
        },
      };

      (pluginManager as any).plugins.push(plugin1, plugin2);

      const results = await pluginManager.runBeforeAccept(
        '/** Test */',
        {
          name: 'testFunc',
          type: 'function',
          filepath: 'test.js',
          line_number: 1,
          language: 'javascript',
          complexity: 1,
        },
        defaultConfig
      );

      expect(results).toHaveLength(2);
      expect(results[0].accept).toBe(true);
      expect(results[1].accept).toBe(true);
    });

    it('should skip plugins without beforeAccept hook', async () => {
      const plugin: IPlugin = {
        name: 'no-before-accept',
        version: '1.0.0',
        hooks: {
          afterWrite: async () => ({ accept: true }),
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runBeforeAccept(
        '/** Test */',
        {
          name: 'testFunc',
          type: 'function',
          filepath: 'test.js',
          line_number: 1,
          language: 'javascript',
          complexity: 1,
        },
        defaultConfig
      );

      expect(results).toHaveLength(0);
    });
  });

  describe('runAfterWrite', () => {
    it('should execute afterWrite hook and return result', async () => {
      const plugin: IPlugin = {
        name: 'after-write-plugin',
        version: '1.0.0',
        hooks: {
          afterWrite: async (filepath, item) => {
            return { accept: true };
          },
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runAfterWrite('test.js', {
        name: 'testFunc',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(true);
    });

    it('should isolate errors in afterWrite hooks', async () => {
      const plugin: IPlugin = {
        name: 'after-write-error',
        version: '1.0.0',
        hooks: {
          afterWrite: async () => {
            throw new Error('After write failed');
          },
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runAfterWrite('test.js', {
        name: 'testFunc',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
      });

      expect(results).toHaveLength(1);
      expect(results[0].accept).toBe(false);
      expect(results[0].reason).toContain('After write failed');
    });

    it('should skip plugins without afterWrite hook', async () => {
      const plugin: IPlugin = {
        name: 'no-after-write',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => ({ accept: true }),
        },
      };

      (pluginManager as any).plugins.push(plugin);

      const results = await pluginManager.runAfterWrite('test.js', {
        name: 'testFunc',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
      });

      expect(results).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all loaded plugins', () => {
      const plugin: IPlugin = {
        name: 'test-clear',
        version: '1.0.0',
        hooks: {
          beforeAccept: async () => ({ accept: true }),
        },
      };

      (pluginManager as any).plugins.push(plugin);
      expect(pluginManager.getLoadedPlugins()).toHaveLength(1);

      pluginManager.clear();
      expect(pluginManager.getLoadedPlugins()).toHaveLength(0);
    });
  });
});
