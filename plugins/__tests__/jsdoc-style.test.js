/**
 * Unit tests for jsdoc-style plugin.
 *
 * Tests multi-line parsing, punctuation validation, and style enforcement.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import jsdocStylePlugin from '../jsdoc-style.js';
import { parse as commentParserParse } from 'comment-parser';

// Create dependencies object to inject into plugin hooks
const dependencies = {
  commentParser: {
    parse: commentParserParse,
  },
};

describe('jsdoc-style plugin', () => {
  describe('plugin structure', () => {
    it('should export valid plugin with required properties', () => {
      expect(jsdocStylePlugin).toBeDefined();
      expect(jsdocStylePlugin.name).toBe('jsdoc-style');
      expect(jsdocStylePlugin.version).toBe('1.0.0');
      expect(jsdocStylePlugin.hooks).toBeDefined();
      expect(jsdocStylePlugin.hooks.beforeAccept).toBeDefined();
      expect(typeof jsdocStylePlugin.hooks.beforeAccept).toBe('function');
    });
  });

  describe('multi-line content parsing (Issue #95)', () => {
    const config = {
      jsdocStyle: {
        enforceTypes: true,
        requireDescriptions: false,
        preferredTags: {},
      },
    };

    const item = {
      name: 'testFunc',
      type: 'function',
      filepath: 'test.js',
      line_number: 1,
      language: 'javascript',
      complexity: 1,
      export_type: 'named',
    };

    it('should preserve multi-line @example content', async () => {
      const docstring = `/**
 * Calculate sum.
 * @example
 * const result = calculate(
 *   param1,
 *   param2
 * );
 * @returns {number} Result
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      // Should accept without mangling the example
      expect(result.accept).toBe(true);
    });

    it('should preserve code blocks in descriptions', async () => {
      const docstring = `/**
 * Helper function.
 *
 * Usage:
 * \`\`\`js
 * const x = foo();
 * const y = bar();
 * \`\`\`
 * @returns {void}
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });

    it('should preserve lists in tag descriptions', async () => {
      const docstring = `/**
 * Process items.
 * @param {Array} items - Array of items:
 *   - item 1
 *   - item 2
 *   - item 3
 * @returns {Array} Processed items
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('punctuation validation (Issue #96)', () => {
    const config = {
      jsdocStyle: {
        enforceTypes: true,
        requireDescriptions: true,
      },
    };

    const item = {
      name: 'testFunc',
      type: 'function',
      filepath: 'test.js',
      line_number: 1,
      language: 'javascript',
      complexity: 1,
      export_type: 'named',
    };

    it('should accept descriptions ending with period', async () => {
      const docstring = `/**
 * This is a valid description.
 * @returns {void}
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });

    it('should reject descriptions without punctuation', async () => {
      const docstring = `/**
 * This description has no punctuation
 * @returns {void}
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain(
        'Description should end with punctuation'
      );
    });

    it('should NOT offer auto-fix for punctuation (Issue #96)', async () => {
      const docstring = `/**
 * Description without punctuation
 * @returns {void}
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(false);
      // Auto-fix should NOT be provided for punctuation
      expect(result.autoFix).toBeUndefined();
    });

    it('should accept descriptions ending with exclamation mark', async () => {
      const docstring = `/**
 * Important function!
 * @returns {void}
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });

    it('should accept descriptions ending with question mark', async () => {
      const docstring = `/**
 * Is this valid?
 * @returns {boolean}
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('tag alias checking', () => {
    const config = {
      jsdocStyle: {
        preferredTags: {
          return: 'returns',
          arg: 'param',
        },
        requireDescriptions: false,
      },
    };

    const item = {
      name: 'testFunc',
      type: 'function',
      filepath: 'test.js',
      line_number: 1,
      language: 'javascript',
      complexity: 1,
      export_type: 'named',
    };

    it('should reject deprecated @return tag', async () => {
      const docstring = `/**
 * Test function.
 * @param {number} x - Input
 * @return {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Use @returns instead of @return');
    });

    it('should offer auto-fix for tag aliases', async () => {
      const docstring = `/**
 * Test function.
 * @param {number} x - Input
 * @return {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(false);
      expect(result.autoFix).toBeDefined();
      expect(result.autoFix).toContain('@returns');
      expect(result.autoFix).not.toContain('@return');
    });

    it('should accept preferred @returns tag', async () => {
      const docstring = `/**
 * Test function.
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('required @example tags', () => {
    const config = {
      jsdocStyle: {
        requireExamples: 'public',
        requireDescriptions: false,
      },
    };

    it('should require @example for complex public APIs', async () => {
      const item = {
        name: 'complexFunc',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 10, // High complexity
        export_type: 'named', // Public
      };

      const docstring = `/**
 * Complex function.
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Missing @example tag');
    });

    it('should accept @example when provided', async () => {
      const item = {
        name: 'complexFunc',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 10,
        export_type: 'named',
      };

      const docstring = `/**
 * Complex function.
 * @param {number} x - Input
 * @returns {number} Output
 * @example
 * complexFunc(42);
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });

    it('should not require @example for simple functions', async () => {
      const item = {
        name: 'simpleFunc',
        type: 'function',
        filepath: 'test.js',
        line_number: 1,
        language: 'javascript',
        complexity: 2, // Low complexity
        export_type: 'named',
      };

      const docstring = `/**
 * Simple function.
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('description requirements', () => {
    const config = {
      jsdocStyle: {
        requireDescriptions: true,
      },
    };

    const item = {
      name: 'testFunc',
      type: 'function',
      filepath: 'test.js',
      line_number: 1,
      language: 'javascript',
      complexity: 1,
      export_type: 'named',
    };

    it('should reject JSDoc without description', async () => {
      const docstring = `/**
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain('Description is required but missing');
    });

    it('should accept JSDoc with description', async () => {
      const docstring = `/**
 * This function does something.
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('skip non-JavaScript/TypeScript files', () => {
    const config = {
      jsdocStyle: {
        enforceTypes: true,
        requireDescriptions: true,
      },
    };

    it('should skip Python files', async () => {
      const item = {
        name: 'testFunc',
        type: 'function',
        filepath: 'test.py',
        line_number: 1,
        language: 'python',
        complexity: 1,
      };

      const docstring = '"""Python docstring without period"""';

      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });

  describe('dependency requirement validation', () => {
    const config = {
      jsdocStyle: {
        requireDescriptions: false,
      },
    };

    const item = {
      name: 'testFunc',
      type: 'function',
      filepath: 'test.js',
      line_number: 1,
      language: 'javascript',
      complexity: 1,
      export_type: 'named',
    };

    it('should reject when no dependencies provided', async () => {
      const docstring = `/**
 * Simple function.
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      // Call without dependencies - should now reject
      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config
      );

      expect(result.accept).toBe(false);
      expect(result.reason).toContain(
        'comment-parser dependency not available'
      );
    });

    it('should accept when dependencies are provided', async () => {
      const docstring = `/**
 * Simple function.
 * @param {number} x - Input
 * @returns {number} Output
 */`;

      // Call with dependencies - should accept
      const result = await jsdocStylePlugin.hooks.beforeAccept(
        docstring,
        item,
        config,
        dependencies
      );

      expect(result.accept).toBe(true);
    });
  });
});
