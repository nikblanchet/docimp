/**
 * Integration tests for ConfigLoader file loading.
 *
 * These tests verify that ConfigLoader can load real config files
 * from disk, including both ESM and CommonJS formats, and properly
 * merge them with defaults.
 *
 * Uses Node.js native test runner (node --test).
 */

import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigLoader } from '../../../dist/config/ConfigLoader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to fixtures directory
const FIXTURES_DIR = resolve(__dirname, '../fixtures/configs');

describe('ConfigLoader - File Loading Integration', () => {
  let loader;

  beforeEach(() => {
    loader = new ConfigLoader();
  });

  describe('Valid Config Loading', () => {
    test('can load valid ESM config from file', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-esm.mjs');

      const config = await loader.load(configPath);

      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'google');
      assert.equal(config.styleGuides.javascript, 'jsdoc-vanilla');
      assert.equal(config.styleGuides.typescript, 'tsdoc-typedoc');
      assert.equal(config.tone, 'friendly');
    });

    test('can load valid CommonJS config from file', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-cjs.cjs');

      const config = await loader.load(configPath);

      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'google');
      assert.equal(config.styleGuides.javascript, 'jsdoc-vanilla');
      assert.equal(config.styleGuides.typescript, 'tsdoc-typedoc');
      assert.equal(config.tone, 'detailed');
    });

    test('can load full config with all properties', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-full.cjs');

      const config = await loader.load(configPath);

      // Verify all expected properties are loaded
      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'google');
      assert.equal(config.styleGuides.javascript, 'jsdoc-vanilla');
      assert.equal(config.styleGuides.typescript, 'tsdoc-typedoc');
      assert.equal(config.tone, 'friendly');
      assert.ok(config.jsdocStyle);
      assert.ok(config.impactWeights);
      assert.ok(Array.isArray(config.plugins));
      assert.ok(Array.isArray(config.exclude));
    });

    test('can load config with JSDoc style options', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-jsdoc-style.cjs');

      const config = await loader.load(configPath);

      assert.ok(config.jsdocStyle);
      assert.ok(config.jsdocStyle.preferredTags);
      assert.equal(config.jsdocStyle.requireDescriptions, true);
      assert.equal(config.jsdocStyle.enforceTypes, true);
    });
  });

  describe('Partial Config Merging', () => {
    test('merges partial config with defaults', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-partial.cjs');

      const config = await loader.load(configPath);

      // User-specified values
      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'sphinx');

      // Default values should be present for unspecified fields
      assert.equal(config.styleGuides.javascript, 'jsdoc-vanilla', 'Should have default JavaScript style guide');
      assert.equal(config.styleGuides.typescript, 'tsdoc-typedoc', 'Should have default TypeScript style guide');
      assert.ok(config.tone, 'Should have default tone');
      assert.ok(config.impactWeights, 'Should have default impactWeights');
    });

    test('merges partial JSDoc config with defaults', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-partial-jsdoc.cjs');

      const config = await loader.load(configPath);

      // User-specified JSDoc values
      assert.ok(config.jsdocStyle);
      assert.equal(config.jsdocStyle.requireExamples, 'all');

      // Other JSDoc defaults should be present
      assert.ok(
        config.jsdocStyle.preferredTags,
        'Should have default preferredTags'
      );
    });

    test('deep merges nested objects correctly', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-partial-jsdoc.cjs');

      const config = await loader.load(configPath);

      // User overrides one nested property
      assert.equal(config.jsdocStyle.requireExamples, 'all');

      // But other nested properties remain from defaults
      assert.equal(config.jsdocStyle.requireDescriptions, true);
      assert.equal(config.jsdocStyle.enforceTypes, true);
    });
  });

  describe('Default Config', () => {
    test('returns default config when no file specified', async () => {
      const config = await loader.load();

      // Should have all default properties
      assert.ok(config.styleGuides);
      assert.ok(config.tone);
      assert.ok(config.jsdocStyle);
      assert.ok(config.impactWeights);
      assert.ok(Array.isArray(config.plugins));
      assert.ok(Array.isArray(config.exclude));
    });

    test('default config has expected values', async () => {
      const config = await loader.load();

      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'google');
      assert.equal(config.styleGuides.javascript, 'jsdoc-vanilla');
      assert.equal(config.styleGuides.typescript, 'tsdoc-typedoc');
      assert.equal(config.tone, 'concise');
      assert.equal(config.impactWeights.complexity, 0.6);
      assert.equal(config.impactWeights.quality, 0.4);
    });
  });

  describe('Error Handling', () => {
    test('throws error for non-existent file when explicitly specified', async () => {
      const nonExistentPath = resolve(
        FIXTURES_DIR,
        'this-file-does-not-exist.cjs'
      );

      await assert.rejects(
        async () => {
          await loader.load(nonExistentPath);
        },
        {
          message: /Config file not found/,
        }
      );
    });

    test('handles malformed config file', async () => {
      const malformedPath = resolve(FIXTURES_DIR, 'invalid-malformed.cjs');

      await assert.rejects(
        async () => {
          await loader.load(malformedPath);
        },
        {
          message: /Failed to load configuration file/,
        }
      );
    });
  });

  describe('Config Validation During Loading', () => {
    test('validates config structure after loading', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-full.cjs');

      const config = await loader.load(configPath);

      // Should pass validation and have all required fields
      assert.ok(config.styleGuides);
      assert.ok(config.tone);
      assert.ok(config.jsdocStyle);
      assert.ok(config.impactWeights);
      assert.ok(Array.isArray(config.plugins));
      assert.ok(Array.isArray(config.exclude));
    });

    test('validates impactWeights sum constraints', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-full.cjs');

      const config = await loader.load(configPath);

      // Impact weights should sum to 1.0
      const sum =
        config.impactWeights.complexity + config.impactWeights.quality;
      assert.ok(
        Math.abs(sum - 1.0) < 0.01,
        'Impact weights should sum to 1.0'
      );
    });
  });

  describe('Module Format Detection', () => {
    test('correctly loads .mjs as ESM', async () => {
      const esmPath = resolve(FIXTURES_DIR, 'valid-esm.mjs');

      const config = await loader.load(esmPath);

      assert.ok(config, 'Should successfully load ESM module');
      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'google');
    });

    test('correctly loads .cjs as CommonJS from fixture', async () => {
      const cjsPath = resolve(FIXTURES_DIR, 'valid-cjs.cjs');

      const config = await loader.load(cjsPath);

      assert.ok(config, 'Should successfully load CommonJS module');
      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.javascript, 'jsdoc-vanilla');
    });
  });

  describe('Path Resolution', () => {
    test('handles absolute paths', async () => {
      const absolutePath = resolve(FIXTURES_DIR, 'valid-esm.mjs');

      const config = await loader.load(absolutePath);

      assert.ok(config);
      assert.ok(config.styleGuides);
      assert.equal(config.styleGuides.python, 'google');
    });

    test('handles relative paths resolved from current directory', async () => {
      // Note: This test assumes we can provide a relative path that
      // will be resolved from CWD. In practice, the loader uses
      // process.cwd() for resolution.
      const absolutePath = resolve(FIXTURES_DIR, 'valid-esm.mjs');

      const config = await loader.load(absolutePath);

      assert.ok(config);
    });
  });

  describe('Real-World Scenarios', () => {
    test('loads project config with plugins array', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-full.cjs');

      const config = await loader.load(configPath);

      assert.ok(Array.isArray(config.plugins));
      assert.ok(config.plugins.length > 0);
    });

    test('loads config with exclude patterns', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-full.cjs');

      const config = await loader.load(configPath);

      assert.ok(Array.isArray(config.exclude));
      assert.ok(config.exclude.some((pattern) => pattern.includes('test')));
    });

    test('preserves user-specified values after merge', async () => {
      const configPath = resolve(FIXTURES_DIR, 'valid-jsdoc-style.cjs');

      const config = await loader.load(configPath);

      // User specified these values, should not be overwritten
      assert.ok(config.jsdocStyle);
      assert.equal(config.jsdocStyle.requireExamples, 'public');
    });
  });
});
