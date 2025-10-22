/**
 * Tests for ConfigLoader.
 *
 * Tests basic file loading behavior and integration with ConfigValidator.
 * Validation logic is tested in ConfigValidator.test.ts.
 *
 * Note: Due to Jest limitations with dynamic imports, extensive file loading
 * tests using fixtures are deferred. The validation logic is thoroughly tested
 * in ConfigValidator.test.ts, and ConfigLoader's file loading works correctly
 * in production (verified manually).
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ConfigLoader } from '../../config/ConfigLoader.js';

describe('ConfigLoader', () => {
  let configLoader: ConfigLoader;

  beforeEach(() => {
    configLoader = new ConfigLoader();
  });

  describe('load - default config', () => {
    it('should load default config when no file path provided', async () => {
      const config = await configLoader.load();

      expect(config).toBeDefined();
      expect(config.styleGuides).toBeDefined();
      expect(config.styleGuides.python).toBe('google');
      expect(config.styleGuides.javascript).toBe('jsdoc-vanilla');
      expect(config.styleGuides.typescript).toBe('tsdoc-typedoc');
      expect(config.tone).toBe('concise');
      expect(config.jsdocStyle).toBeDefined();
      expect(config.jsdocStyle.preferredTags).toBeDefined();
      expect(config.jsdocStyle.requireDescriptions).toBeDefined();
      expect(config.jsdocStyle.requireExamples).toBeDefined();
      expect(config.jsdocStyle.enforceTypes).toBeDefined();
      expect(config.impactWeights).toBeDefined();
      expect(config.impactWeights.complexity).toBeDefined();
      expect(config.impactWeights.quality).toBeDefined();
      expect(config.plugins).toBeDefined();
      expect(Array.isArray(config.plugins)).toBe(true);
      expect(config.exclude).toBeDefined();
      expect(Array.isArray(config.exclude)).toBe(true);
      expect(config.audit).toBeDefined();
      expect(config.audit.showCode).toBeDefined();
      expect(config.claude).toBeDefined();
      expect(config.claude.timeout).toBe(30.0);
      expect(config.claude.maxRetries).toBe(3);
      expect(config.claude.retryDelay).toBe(1.0);
    });
  });

  describe('load - error handling', () => {
    it('should throw error for non-existent config file', async () => {
      await expect(
        configLoader.load('/path/to/nonexistent/config.js')
      ).rejects.toThrow('Configuration file not found');
    });
  });
});
