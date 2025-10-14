/**
 * Tests for ConfigLoader.
 *
 * Tests configuration loading, validation, and merging with defaults.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigLoader } from '../../config/ConfigLoader.js';

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;
  let testDir: string;
  let testFiles: string[] = [];

  beforeEach(async () => {
    configLoader = new ConfigLoader();
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `docimp-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFiles = [];
  });

  afterEach(async () => {
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
   * Helper to create a test config file.
   */
  async function createConfigFile(filename: string, content: string): Promise<string> {
    const filepath = join(testDir, filename);
    await writeFile(filepath, content, 'utf8');
    testFiles.push(filepath);
    return filepath;
  }

  describe('load', () => {
    it('should load default config when no file exists', async () => {
      const config = await configLoader.load();

      expect(config).toBeDefined();
      expect(config.styleGuide).toBe('numpy');
      expect(config.tone).toBe('concise');
      expect(config.jsdocStyle).toBeDefined();
      expect(config.impactWeights).toBeDefined();
      expect(config.plugins).toBeDefined();
      expect(config.exclude).toBeDefined();
    });

    it('should load CommonJS config file', async () => {
      const configPath = await createConfigFile(
        'test-config-cjs.js',
        `
        module.exports = {
          styleGuide: 'jsdoc',
          tone: 'detailed',
        };
        `
      );

      const config = await configLoader.load(configPath);

      expect(config.styleGuide).toBe('jsdoc');
      expect(config.tone).toBe('detailed');
    });

    it('should load ESM config file', async () => {
      const configPath = await createConfigFile(
        'test-config-esm.mjs',
        `
        export default {
          styleGuide: 'google',
          tone: 'friendly',
        };
        `
      );

      const config = await configLoader.load(configPath);

      expect(config.styleGuide).toBe('google');
      expect(config.tone).toBe('friendly');
    });

    it('should merge user config with defaults', async () => {
      const configPath = await createConfigFile(
        'test-config-partial.js',
        `
        module.exports = {
          styleGuide: 'sphinx',
        };
        `
      );

      const config = await configLoader.load(configPath);

      // User-provided value
      expect(config.styleGuide).toBe('sphinx');

      // Default values should still be present
      expect(config.tone).toBe('concise');
      expect(config.plugins).toBeDefined();
      expect(config.exclude).toBeDefined();
    });

    it('should throw error for non-existent config file', async () => {
      const nonExistentPath = join(testDir, 'does-not-exist.js');

      await expect(configLoader.load(nonExistentPath)).rejects.toThrow(
        'Configuration file not found'
      );
    });

    it('should throw error for malformed config file', async () => {
      const configPath = await createConfigFile(
        'test-config-malformed.js',
        `
        this is not valid JavaScript
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'Failed to load configuration file'
      );
    });
  });

  describe('validation', () => {
    it('should validate styleGuide field', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-style.js',
        `
        module.exports = {
          styleGuide: 'invalid-style',
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow('Invalid styleGuide');
    });

    it('should validate tone field', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-tone.js',
        `
        module.exports = {
          tone: 'invalid-tone',
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow('Invalid tone');
    });

    it('should validate jsdocStyle.requireExamples field', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-examples.js',
        `
        module.exports = {
          jsdocStyle: {
            requireExamples: 'invalid-value',
          },
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'Invalid jsdocStyle.requireExamples'
      );
    });

    it('should validate impactWeights.complexity range', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-complexity.js',
        `
        module.exports = {
          impactWeights: {
            complexity: 1.5,
            quality: 0.4,
          },
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'Invalid impactWeights.complexity'
      );
    });

    it('should validate impactWeights.quality range', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-quality.js',
        `
        module.exports = {
          impactWeights: {
            complexity: 0.6,
            quality: -0.2,
          },
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'Invalid impactWeights.quality'
      );
    });

    it('should warn if impactWeights do not sum to 1.0', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const configPath = await createConfigFile(
        'test-config-weights-mismatch.js',
        `
        module.exports = {
          impactWeights: {
            complexity: 0.5,
            quality: 0.3,
          },
        };
        `
      );

      await configLoader.load(configPath);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('impactWeights')
      );

      consoleWarnSpy.mockRestore();
    });

    it('should validate plugins is an array', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-plugins.js',
        `
        module.exports = {
          plugins: 'not-an-array',
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'plugins must be an array'
      );
    });

    it('should validate plugin array items are strings', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-plugin-item.js',
        `
        module.exports = {
          plugins: ['./valid-plugin.js', 123],
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'Each plugin must be a string'
      );
    });

    it('should validate exclude is an array', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-exclude.js',
        `
        module.exports = {
          exclude: 'not-an-array',
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'exclude must be an array'
      );
    });

    it('should validate exclude array items are strings', async () => {
      const configPath = await createConfigFile(
        'test-config-invalid-exclude-item.js',
        `
        module.exports = {
          exclude: ['**/*.test.js', 123],
        };
        `
      );

      await expect(configLoader.load(configPath)).rejects.toThrow(
        'Each exclude pattern must be a string'
      );
    });
  });

  describe('jsdocStyle configuration', () => {
    it('should load jsdocStyle configuration', async () => {
      const configPath = await createConfigFile(
        'test-config-jsdoc-style.js',
        `
        module.exports = {
          jsdocStyle: {
            preferredTags: { return: 'returns', arg: 'param' },
            requireDescriptions: true,
            requireExamples: 'public',
            enforceTypes: true,
          },
        };
        `
      );

      const config = await configLoader.load(configPath);

      expect(config.jsdocStyle).toBeDefined();
      expect(config.jsdocStyle.preferredTags).toEqual({
        return: 'returns',
        arg: 'param',
      });
      expect(config.jsdocStyle.requireDescriptions).toBe(true);
      expect(config.jsdocStyle.requireExamples).toBe('public');
      expect(config.jsdocStyle.enforceTypes).toBe(true);
    });

    it('should merge jsdocStyle with defaults', async () => {
      const configPath = await createConfigFile(
        'test-config-partial-jsdoc.js',
        `
        module.exports = {
          jsdocStyle: {
            requireExamples: 'all',
          },
        };
        `
      );

      const config = await configLoader.load(configPath);

      // User-provided value
      expect(config.jsdocStyle.requireExamples).toBe('all');

      // Defaults should be present
      expect(config.jsdocStyle.preferredTags).toBeDefined();
      expect(config.jsdocStyle.requireDescriptions).toBeDefined();
      expect(config.jsdocStyle.enforceTypes).toBeDefined();
    });
  });

  describe('complex configuration', () => {
    it('should load full configuration with all options', async () => {
      const configPath = await createConfigFile(
        'test-config-full.js',
        `
        module.exports = {
          styleGuide: 'jsdoc',
          tone: 'friendly',
          jsdocStyle: {
            preferredTags: { return: 'returns' },
            requireDescriptions: true,
            requireExamples: 'public',
            enforceTypes: true,
          },
          impactWeights: {
            complexity: 0.7,
            quality: 0.3,
          },
          plugins: ['./plugins/validate-types.js', './plugins/jsdoc-style.js'],
          exclude: ['**/test_*.py', '**/node_modules/**', '**/__pycache__/**'],
        };
        `
      );

      const config = await configLoader.load(configPath);

      expect(config.styleGuide).toBe('jsdoc');
      expect(config.tone).toBe('friendly');
      expect(config.jsdocStyle.requireExamples).toBe('public');
      expect(config.impactWeights.complexity).toBe(0.7);
      expect(config.impactWeights.quality).toBe(0.3);
      expect(config.plugins).toHaveLength(2);
      expect(config.exclude).toHaveLength(3);
    });
  });
});
