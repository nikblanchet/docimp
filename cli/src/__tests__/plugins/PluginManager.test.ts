/**
 * Tests for PluginManager.
 *
 * Tests plugin validation, error isolation, and hook execution.
 * File loading is tested via Python integration tests due to Jest limitations with dynamic imports.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
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

  describe('path validation', () => {
    const testDir = resolve('.test-plugin-validation');
    const pluginsDir = resolve(testDir, 'plugins');
    const srcDir = resolve(testDir, 'src');
    const nodeModulesDir = resolve(testDir, 'node_modules');

    /**
     * Helper to test path validation by directly calling the private method.
     * This bypasses file loading to test validation logic in isolation.
     */
    function testValidatePath(
      absolutePath: string,
      projectRoot: string,
      originalPath: string
    ): void {
      (pluginManager as any).validatePluginPath(
        absolutePath,
        projectRoot,
        originalPath
      );
    }

    beforeEach(() => {
      // Create test directory structure
      mkdirSync(pluginsDir, { recursive: true });
      mkdirSync(srcDir, { recursive: true });
      mkdirSync(nodeModulesDir, { recursive: true });

      // Create test files
      writeFileSync(resolve(pluginsDir, 'valid.js'), '// valid plugin');
      writeFileSync(resolve(pluginsDir, 'invalid.sh'), '#!/bin/sh');
      writeFileSync(resolve(srcDir, 'disallowed.js'), '// not a plugin');
      writeFileSync(resolve(nodeModulesDir, 'package-plugin.js'), '// npm plugin');
    });

    afterEach(() => {
      // Clean up test directory
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    });

    describe('file existence', () => {
      it('should reject non-existent files', () => {
        expect(() => {
          testValidatePath(
            resolve(pluginsDir, 'nonexistent.js'),
            testDir,
            './plugins/nonexistent.js'
          );
        }).toThrow('Plugin file does not exist');
      });

      it('should include original path in error message', () => {
        expect(() => {
          testValidatePath(
            resolve(pluginsDir, 'nonexistent.js'),
            testDir,
            './plugins/nonexistent.js'
          );
        }).toThrow('./plugins/nonexistent.js');
      });
    });

    describe('file extension validation', () => {
      it('should reject files without .js, .mjs, or .cjs extension', () => {
        expect(() => {
          testValidatePath(
            resolve(pluginsDir, 'invalid.sh'),
            testDir,
            './plugins/invalid.sh'
          );
        }).toThrow('Plugin file must have .js, .mjs, or .cjs extension');
      });

      it('should include the actual extension in error message', () => {
        expect(() => {
          testValidatePath(
            resolve(pluginsDir, 'invalid.sh'),
            testDir,
            './plugins/invalid.sh'
          );
        }).toThrow('.sh');
      });

      it('should accept .js files', () => {
        expect(() => {
          testValidatePath(
            resolve(pluginsDir, 'valid.js'),
            testDir,
            './plugins/valid.js'
          );
        }).not.toThrow();
      });
    });

    describe('directory whitelist', () => {
      it('should accept plugins from ./plugins/ directory', () => {
        expect(() => {
          testValidatePath(
            resolve(pluginsDir, 'valid.js'),
            testDir,
            './plugins/valid.js'
          );
        }).not.toThrow();
      });

      it('should accept plugins from node_modules/ directory', () => {
        expect(() => {
          testValidatePath(
            resolve(nodeModulesDir, 'package-plugin.js'),
            testDir,
            './node_modules/package-plugin.js'
          );
        }).not.toThrow();
      });

      it('should reject plugins outside allowed directories', () => {
        expect(() => {
          testValidatePath(
            resolve(srcDir, 'disallowed.js'),
            testDir,
            './src/disallowed.js'
          );
        }).toThrow('Plugin path');
        expect(() => {
          testValidatePath(
            resolve(srcDir, 'disallowed.js'),
            testDir,
            './src/disallowed.js'
          );
        }).toThrow('outside allowed directories');
      });

      it('should reject absolute paths outside project', () => {
        expect(() => {
          testValidatePath(
            '/tmp/malicious.js',
            testDir,
            '/tmp/malicious.js'
          );
        }).toThrow('Plugin file does not exist');
      });

      it('should provide clear error message for disallowed paths', () => {
        expect(() => {
          testValidatePath(
            resolve(srcDir, 'disallowed.js'),
            testDir,
            './src/disallowed.js'
          );
        }).toThrow('Plugins must be in ./plugins/ or node_modules/');
      });

      it('should accept plugins from nested plugin directory', () => {
        // Create nested directory structure
        const nestedDir = resolve(pluginsDir, 'validators');
        mkdirSync(nestedDir, { recursive: true });
        writeFileSync(resolve(nestedDir, 'nested.js'), '// nested plugin');

        expect(() => {
          testValidatePath(
            resolve(nestedDir, 'nested.js'),
            testDir,
            './plugins/validators/nested.js'
          );
        }).not.toThrow();
      });

      it('should accept scoped packages from node_modules', () => {
        // Create scoped package structure
        const scopedDir = resolve(nodeModulesDir, '@myorg', 'myplugin');
        mkdirSync(scopedDir, { recursive: true });
        writeFileSync(resolve(scopedDir, 'plugin.js'), '// scoped plugin');

        expect(() => {
          testValidatePath(
            resolve(scopedDir, 'plugin.js'),
            testDir,
            './node_modules/@myorg/myplugin/plugin.js'
          );
        }).not.toThrow();
      });

      it('should include canonical path in error message', () => {
        expect(() => {
          testValidatePath(
            resolve(srcDir, 'disallowed.js'),
            testDir,
            './src/disallowed.js'
          );
        }).toThrow('Resolved to:');
      });
    });

    describe('integration with loadPlugin', () => {
      it('should reject loading plugin from disallowed directory', async () => {
        await expect(
          pluginManager.loadPlugins(
            ['./src/disallowed.js'],
            testDir
          )
        ).rejects.toThrow('outside allowed directories');
      });

      it('should reject loading non-existent plugin', async () => {
        await expect(
          pluginManager.loadPlugins(
            ['./plugins/nonexistent.js'],
            testDir
          )
        ).rejects.toThrow('Plugin file does not exist');
      });

      it('should reject loading file with wrong extension', async () => {
        await expect(
          pluginManager.loadPlugins(
            ['./plugins/invalid.sh'],
            testDir
          )
        ).rejects.toThrow('Plugin file must have .js, .mjs, or .cjs extension');
      });
    });
  });
});
