/**
 * Unit tests for validate-types plugin.
 *
 * Tests cache behavior, LRU eviction, validation logic, and error handling.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import validateTypesPlugin, {
  clearCache,
  getCacheStats,
  getCacheSize,
  clearCacheForFile
} from '../validate-types.js';

describe('validate-types plugin', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure clean state
    clearCache();
  });

  describe('plugin structure', () => {
    it('should export valid plugin with required properties', () => {
      expect(validateTypesPlugin).toBeDefined();
      expect(validateTypesPlugin.name).toBe('validate-types');
      expect(validateTypesPlugin.version).toBe('1.0.0');
      expect(validateTypesPlugin.hooks).toBeDefined();
      expect(validateTypesPlugin.hooks.beforeAccept).toBeDefined();
      expect(typeof validateTypesPlugin.hooks.beforeAccept).toBe('function');
    });
  });

  describe('cache behavior', () => {
    it('should accept valid JSDoc with matching parameters', async () => {
      const docstring = `/**
 * Add two numbers.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum
 */`;

      const item = {
        name: 'add',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['a', 'b'],
        code: 'function add(a, b) { return a + b; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject JSDoc with mismatched parameter names', async () => {
      const docstring = `/**
 * Add two numbers.
 * @param {number} wrongName - First number
 * @param {number} b - Second number
 * @returns {number} Sum
 */`;

      const item = {
        name: 'add',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['a', 'b'],
        code: 'function add(a, b) { return a + b; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Parameter name mismatch');
      expect(result.reason).toContain('wrongName');
      expect(result.reason).toContain('a');
    });

    it('should provide auto-fix for parameter name mismatches', async () => {
      const docstring = `/**
 * Add two numbers.
 * @param {number} x - First number
 * @param {number} y - Second number
 * @returns {number} Sum
 */`;

      const item = {
        name: 'add',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['a', 'b'],
        code: 'function add(a, b) { return a + b; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(false);
      expect(result.autoFix).toBeDefined();
      expect(result.autoFix).toContain('@param {number} a');
      expect(result.autoFix).toContain('@param {number} b');
    });

    it('should skip validation for non-JavaScript/TypeScript files', async () => {
      const docstring = '"""Python docstring"""';

      const item = {
        name: 'test_function',
        type: 'function',
        filepath: 'test.py',
        line_number: 1,
        language: 'python',
        complexity: 2,
        export_type: 'named',
      };

      const config = {
        styleGuide: 'google',
        tone: 'concise',
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should skip validation when enforceTypes is false', async () => {
      const docstring = `/**
 * Add two numbers.
 * @param {number} wrongName - First number
 * @returns {number} Sum
 */`;

      const item = {
        name: 'add',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['a'],
        code: 'function add(a) { return a; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: false,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should reject JSDoc with parameter count mismatch', async () => {
      const docstring = `/**
 * Add two numbers.
 * @param {number} a - First number
 * @returns {number} Sum
 */`;

      const item = {
        name: 'add',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['a', 'b'],
        code: 'function add(a, b) { return a + b; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Parameter count mismatch');
      expect(result.reason).toContain('1 params');
      expect(result.reason).toContain('2');
    });
  });

  describe('clearCache function', () => {
    it('should clear the cache', async () => {
      // First validation creates cache entry
      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      const item = {
        name: 'test',
        type: 'function',
        filepath: 'cache-test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['x'],
        code: 'function test(x) { return x; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      // First call
      await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);

      // Clear cache
      clearCache();

      // Second call should still work (creating new cache entry)
      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should be callable multiple times without errors', () => {
      expect(() => {
        clearCache();
        clearCache();
        clearCache();
      }).not.toThrow();
    });
  });

  describe('TypeScript compiler integration', () => {
    it('should validate TypeScript files', async () => {
      const docstring = `/**
 * Calculate sum.
 * @param {number[]} numbers - Array of numbers
 * @returns {number} Sum
 */`;

      const item = {
        name: 'sum',
        type: 'function',
        filepath: 'test.ts',
        line_number: 1,
        language: 'typescript',
        complexity: 2,
        export_type: 'named',
        parameters: ['numbers'],
        code: 'function sum(numbers: number[]): number { return numbers.reduce((a, b) => a + b, 0); }',
      };

      const config = {
        styleGuide: 'tsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should handle arrow functions', async () => {
      const docstring = `/**
 * Multiply by two.
 * @param {number} x - Number
 * @returns {number} Result
 */`;

      const item = {
        name: 'double',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['x'],
        code: 'const double = (x) => x * 2;',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should handle async functions', async () => {
      const docstring = `/**
 * Fetch data.
 * @param {string} url - URL
 * @returns {Promise<any>} Data
 */`;

      const item = {
        name: 'fetchData',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['url'],
        code: 'async function fetchData(url) { return await fetch(url); }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle missing code gracefully', async () => {
      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      const item = {
        name: 'test',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['x'],
        // No code property
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      // Should not throw, but may not do full validation
      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result).toBeDefined();
      expect(result.accept).toBeDefined();
    });

    it('should handle empty parameters array', async () => {
      const docstring = `/**
 * Get timestamp.
 * @returns {number} Current timestamp
 */`;

      const item = {
        name: 'getTimestamp',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: [],
        code: 'function getTimestamp() { return Date.now(); }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should handle malformed JSDoc gracefully', async () => {
      const docstring = `/**
 * Broken JSDoc
 * @param {invalid syntax here
 */`;

      const item = {
        name: 'test',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['x'],
        code: 'function test(x) { return x; }',
      };

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      // Should handle gracefully (may accept or reject based on compiler behavior)
      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result).toBeDefined();
      expect(typeof result.accept).toBe('boolean');
    });
  });

  describe('JSDoc parameter patterns (Issue #92)', () => {
    const config = {
      styleGuide: 'jsdoc',
      tone: 'concise',
      jsdocStyle: {
        enforceTypes: true,
      },
    };

    it('should accept optional parameters with default values', async () => {
      const docstring = `/**
 * Greet a user.
 * @param {string} [name='unknown'] - User name with default
 * @returns {string} Greeting
 */`;

      const item = {
        name: 'greet',
        type: 'function',
        filepath: 'test-optional.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['name'],
        code: "function greet(name = 'unknown') { return `Hello, ${name}`; }",
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should accept rest parameters', async () => {
      const docstring = `/**
 * Sum all numbers.
 * @param {...number} args - Numbers to sum
 * @returns {number} Total
 */`;

      const item = {
        name: 'sum',
        type: 'function',
        filepath: 'test-rest.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['args'],
        code: 'function sum(...args) { return args.reduce((a, b) => a + b, 0); }',
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should accept destructured object parameters', async () => {
      const docstring = `/**
 * Create point.
 * @param {{x: number, y: number}} coords - Coordinates
 * @returns {{x: number, y: number}} Point
 */`;

      const item = {
        name: 'createPoint',
        type: 'function',
        filepath: 'test-destructure.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['coords'],
        code: 'function createPoint({ x, y }) { return { x, y }; }',
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should accept combination of optional and rest parameters', async () => {
      const docstring = `/**
 * Format message.
 * @param {string} [template='Default: %s'] - Message template
 * @param {...any} args - Arguments to format
 * @returns {string} Formatted message
 */`;

      const item = {
        name: 'format',
        type: 'function',
        filepath: 'test-combo.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['template', 'args'],
        code: "function format(template = 'Default: %s', ...args) { return template.replace(/%s/g, () => args.shift()); }",
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should accept optional parameters without default values', async () => {
      const docstring = `/**
 * Get user info.
 * @param {string} id - User ID
 * @param {string} [email] - Optional email
 * @returns {Object} User info
 */`;

      const item = {
        name: 'getUserInfo',
        type: 'function',
        filepath: 'test-optional-no-default.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['id', 'email'],
        code: 'function getUserInfo(id, email) { return { id, email }; }',
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(true);
    });

    it('should reject when optional param name does not match function signature', async () => {
      const docstring = `/**
 * Test function.
 * @param {string} [wrongName='default'] - Wrong parameter name
 * @returns {string} Result
 */`;

      const item = {
        name: 'test',
        type: 'function',
        filepath: 'test-optional-mismatch.js',
        line_number: 1,
        language: 'javascript',
        complexity: 1,
        export_type: 'named',
        parameters: ['correctName'],
        code: "function test(correctName = 'default') { return correctName; }",
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Parameter name mismatch');
      expect(result.reason).toContain('wrongName');
      expect(result.reason).toContain('correctName');
    });

    it('should reject when rest param name does not match function signature', async () => {
      const docstring = `/**
 * Multiply numbers.
 * @param {...number} wrongArgs - Wrong rest param name
 * @returns {number} Product
 */`;

      const item = {
        name: 'multiply',
        type: 'function',
        filepath: 'test-rest-mismatch.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2,
        export_type: 'named',
        parameters: ['numbers'],
        code: 'function multiply(...numbers) { return numbers.reduce((a, b) => a * b, 1); }',
      };

      const result = await validateTypesPlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Parameter name mismatch');
      expect(result.reason).toContain('wrongArgs');
      expect(result.reason).toContain('numbers');
    });
  });

  describe('LRU cache eviction', () => {
    it('should evict least recently used entry when cache exceeds MAX_CACHE_SIZE', async () => {
      // MAX_CACHE_SIZE is 50, so we'll create 51 unique files
      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      // Validate 51 files to trigger eviction
      for (let i = 0; i < 51; i++) {
        const item = {
          name: `func${i}`,
          type: 'function',
          filepath: `test${i}.js`,
          line_number: 1,
          language: 'javascript',
          complexity: 1,
          export_type: 'named',
          parameters: ['x'],
          code: `function func${i}(x) { return x; }`,
        };

        await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      }

      const stats = getCacheStats();

      // Cache should not exceed MAX_CACHE_SIZE (50)
      expect(stats.size).toBe(50);
      expect(stats.maxSize).toBe(50);

      // First file (test0.js) should be evicted (LRU)
      expect(stats.files).not.toContain('test0.js');

      // Most recent file (test50.js) should still be cached
      expect(stats.files).toContain('test50.js');
    });

    it('should update LRU order on cache hit', async () => {
      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      // Create 3 cache entries
      for (let i = 0; i < 3; i++) {
        const item = {
          name: `func${i}`,
          filepath: `test${i}.js`,
          language: 'javascript',
          code: `function func${i}(x) { return x; }`,
          parameters: ['x'],
          type: 'function',
          line_number: 1,
          complexity: 1,
          export_type: 'named',
        };
        await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      }

      // Access test0.js again (should move it to end of LRU order)
      const item0 = {
        name: 'func0',
        filepath: 'test0.js',
        language: 'javascript',
        code: 'function func0(x) { return x; }',
        parameters: ['x'],
        type: 'function',
        line_number: 1,
        complexity: 1,
        export_type: 'named',
      };
      await validateTypesPlugin.hooks.beforeAccept(docstring, item0, config);

      const initialStats = getCacheStats();
      expect(initialStats.hits).toBeGreaterThan(0);
      expect(initialStats.size).toBe(3);
    });

    it('should track cache hits and misses correctly', async () => {
      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      const item = {
        name: 'testFunc',
        filepath: 'cachehit.js',
        language: 'javascript',
        code: 'function testFunc(x) { return x; }',
        parameters: ['x'],
        type: 'function',
        line_number: 1,
        complexity: 1,
        export_type: 'named',
      };

      // First call should be a cache miss
      await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      let stats = getCacheStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);

      // Second call with same content should be a cache hit
      await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      stats = getCacheStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should invalidate cache when file content changes', async () => {
      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      const item = {
        name: 'testFunc',
        filepath: 'invalidate.js',
        language: 'javascript',
        code: 'function testFunc(x) { return x; }',
        parameters: ['x'],
        type: 'function',
        line_number: 1,
        complexity: 1,
        export_type: 'named',
      };

      // First validation
      await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      let stats = getCacheStats();
      expect(stats.misses).toBe(1);

      // Second validation with different code (should invalidate)
      const modifiedItem = {
        ...item,
        code: 'function testFunc(x) { return x * 2; }',
      };
      await validateTypesPlugin.hooks.beforeAccept(docstring, modifiedItem, config);
      stats = getCacheStats();
      expect(stats.invalidations).toBe(1);
    });
  });

  describe('cache utility functions', () => {
    it('should return accurate cache statistics', async () => {
      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      // Initially empty
      let stats = getCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.invalidations).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.maxSize).toBe(50);
      expect(Array.isArray(stats.files)).toBe(true);
      expect(stats.files.length).toBe(0);

      // Add one entry
      const item = {
        name: 'testFunc',
        filepath: 'stats-test.js',
        language: 'javascript',
        code: 'function testFunc(x) { return x; }',
        parameters: ['x'],
        type: 'function',
        line_number: 1,
        complexity: 1,
        export_type: 'named',
      };

      await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);

      stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.files).toContain('stats-test.js');
      expect(stats.misses).toBe(1);
    });

    it('should return current cache size', async () => {
      // Initially zero
      expect(getCacheSize()).toBe(0);

      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      // Add 3 entries
      for (let i = 0; i < 3; i++) {
        const item = {
          name: `func${i}`,
          filepath: `size-test-${i}.js`,
          language: 'javascript',
          code: `function func${i}(x) { return x; }`,
          parameters: ['x'],
          type: 'function',
          line_number: 1,
          complexity: 1,
          export_type: 'named',
        };
        await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      }

      expect(getCacheSize()).toBe(3);
    });

    it('should clear specific file from cache', async () => {
      const config = {
        styleGuide: 'jsdoc',
        tone: 'concise',
        jsdocStyle: {
          enforceTypes: true,
        },
      };

      const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

      const item = {
        name: 'testFunc',
        filepath: 'clear-specific.js',
        language: 'javascript',
        code: 'function testFunc(x) { return x; }',
        parameters: ['x'],
        type: 'function',
        line_number: 1,
        complexity: 1,
        export_type: 'named',
      };

      // Add to cache
      await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
      expect(getCacheSize()).toBe(1);
      expect(getCacheStats().files).toContain('clear-specific.js');

      // Clear the specific file
      const wasRemoved = clearCacheForFile('clear-specific.js');
      expect(wasRemoved).toBe(true);
      expect(getCacheSize()).toBe(0);
      expect(getCacheStats().files).not.toContain('clear-specific.js');

      // Trying to clear again should return false
      const wasRemovedAgain = clearCacheForFile('clear-specific.js');
      expect(wasRemovedAgain).toBe(false);
    });

    it('should clear non-existent file gracefully', () => {
      const removed = clearCacheForFile('non-existent.js');
      expect(removed).toBe(false);
    });
  });

  describe('dispose() verification', () => {
    it('should call dispose() when evicting LRU entry', async () => {
      // Create a spy on the dispose method
      let disposeCallCount = 0;
      const originalDispose = Object.getPrototypeOf(
        (await import('typescript')).default.createLanguageService({
          getScriptFileNames: () => [],
          getScriptVersion: () => '0',
          getScriptSnapshot: () => undefined,
          getCurrentDirectory: () => process.cwd(),
          getCompilationSettings: () => ({}),
          getDefaultLibFileName: () => 'lib.d.ts',
        })
      ).dispose;

      // Mock dispose to track calls
      const disposeSpy = jest.fn(function() {
        disposeCallCount++;
        return originalDispose.call(this);
      });

      // Patch the prototype
      const ts = (await import('typescript')).default;
      const proto = Object.getPrototypeOf(ts.createLanguageService({
        getScriptFileNames: () => [],
        getScriptVersion: () => '0',
        getScriptSnapshot: () => undefined,
        getCurrentDirectory: () => process.cwd(),
        getCompilationSettings: () => ({}),
        getDefaultLibFileName: () => 'lib.d.ts',
      }));
      const originalProtoDispose = proto.dispose;
      proto.dispose = disposeSpy;

      try {
        const config = {
          styleGuide: 'jsdoc',
          tone: 'concise',
          jsdocStyle: {
            enforceTypes: true,
          },
        };

        const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

        // Create 51 entries to trigger one eviction (MAX_CACHE_SIZE = 50)
        for (let i = 0; i < 51; i++) {
          const item = {
            name: `func${i}`,
            filepath: `dispose-test-${i}.js`,
            language: 'javascript',
            code: `function func${i}(x) { return x; }`,
            parameters: ['x'],
            type: 'function',
            line_number: 1,
            complexity: 1,
            export_type: 'named',
          };
          await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
        }

        // At least one dispose should have been called (for the evicted entry)
        expect(disposeSpy).toHaveBeenCalled();
        expect(disposeSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
      } finally {
        // Restore original dispose
        proto.dispose = originalProtoDispose;
      }
    });

    it('should call dispose() on all services when clearCache() is called', async () => {
      let disposeCallCount = 0;
      const ts = (await import('typescript')).default;
      const proto = Object.getPrototypeOf(ts.createLanguageService({
        getScriptFileNames: () => [],
        getScriptVersion: () => '0',
        getScriptSnapshot: () => undefined,
        getCurrentDirectory: () => process.cwd(),
        getCompilationSettings: () => ({}),
        getDefaultLibFileName: () => 'lib.d.ts',
      }));
      const originalDispose = proto.dispose;
      const disposeSpy = jest.fn(function() {
        disposeCallCount++;
        return originalDispose.call(this);
      });
      proto.dispose = disposeSpy;

      try {
        const config = {
          styleGuide: 'jsdoc',
          tone: 'concise',
          jsdocStyle: {
            enforceTypes: true,
          },
        };

        const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

        // Create 3 cache entries
        for (let i = 0; i < 3; i++) {
          const item = {
            name: `func${i}`,
            filepath: `clear-all-test-${i}.js`,
            language: 'javascript',
            code: `function func${i}(x) { return x; }`,
            parameters: ['x'],
            type: 'function',
            line_number: 1,
            complexity: 1,
            export_type: 'named',
          };
          await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);
        }

        // Reset spy count before clearCache
        disposeSpy.mockClear();

        // Clear the cache
        clearCache();

        // All 3 services should be disposed
        expect(disposeSpy).toHaveBeenCalledTimes(3);
      } finally {
        // Restore original dispose
        proto.dispose = originalDispose;
      }
    });

    it('should call dispose() when clearCacheForFile() is called', async () => {
      const ts = (await import('typescript')).default;
      const proto = Object.getPrototypeOf(ts.createLanguageService({
        getScriptFileNames: () => [],
        getScriptVersion: () => '0',
        getScriptSnapshot: () => undefined,
        getCurrentDirectory: () => process.cwd(),
        getCompilationSettings: () => ({}),
        getDefaultLibFileName: () => 'lib.d.ts',
      }));
      const originalDispose = proto.dispose;
      const disposeSpy = jest.fn(function() {
        return originalDispose.call(this);
      });
      proto.dispose = disposeSpy;

      try {
        const config = {
          styleGuide: 'jsdoc',
          tone: 'concise',
          jsdocStyle: {
            enforceTypes: true,
          },
        };

        const docstring = `/**
 * Test function.
 * @param {number} x - Parameter
 * @returns {number} Result
 */`;

        const item = {
          name: 'testFunc',
          filepath: 'clear-one-test.js',
          language: 'javascript',
          code: 'function testFunc(x) { return x; }',
          parameters: ['x'],
          type: 'function',
          line_number: 1,
          complexity: 1,
          export_type: 'named',
        };

        // Add to cache
        await validateTypesPlugin.hooks.beforeAccept(docstring, item, config);

        // Reset spy
        disposeSpy.mockClear();

        // Clear the specific file
        clearCacheForFile('clear-one-test.js');

        // One dispose should be called
        expect(disposeSpy).toHaveBeenCalledTimes(1);
      } finally {
        // Restore original dispose
        proto.dispose = originalDispose;
      }
    });
  });
});
