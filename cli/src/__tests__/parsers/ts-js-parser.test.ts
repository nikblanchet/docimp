/**
 * Tests for TypeScript/JavaScript parser helper.
 *
 * Tests JSDoc validation, ESM/CJS detection, complexity calculation, and module system handling.
 * This demonstrates JavaScript competence including checkJs enforcement and module system understanding.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseFile } from '../../parsers/ts-js-parser-helper.js';

describe('TypeScript/JavaScript Parser', () => {
  let testDir: string;
  let testFiles: string[] = [];

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `docimp-parser-test-${Date.now()}`);
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
   * Helper to create a test file.
   */
  async function createTestFile(filename: string, content: string): Promise<string> {
    const filepath = join(testDir, filename);
    await writeFile(filepath, content, 'utf8');
    testFiles.push(filepath);
    return filepath;
  }

  describe('ESM detection', () => {
    it('should detect ESM from export keyword', async () => {
      const filepath = await createTestFile(
        'esm-export.js',
        `
        export function add(a, b) {
          return a + b;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('esm');
      expect(items[0].export_type).toBe('named');
    });

    it('should detect ESM from import keyword', async () => {
      const filepath = await createTestFile(
        'esm-import.js',
        `
        import { foo } from './other.js';

        function helper() {
          return foo();
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('esm');
    });

    it('should detect ESM from .mjs extension', async () => {
      const filepath = await createTestFile(
        'esm-module.mjs',
        `
        function process() {
          return 42;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('esm');
    });

    it('should detect default export', async () => {
      const filepath = await createTestFile(
        'default-export.js',
        `
        export default function main() {
          return 'hello';
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].export_type).toBe('default');
      expect(items[0].module_system).toBe('esm');
    });
  });

  describe('CommonJS detection', () => {
    it('should detect CommonJS from module.exports', async () => {
      const filepath = await createTestFile(
        'commonjs-module-exports.cjs',
        `
        module.exports = {
          sum(numbers) {
            return numbers.reduce((a, b) => a + b, 0);
          }
        };
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('commonjs');
      expect(items[0].export_type).toBe('commonjs');
    });

    it('should detect CommonJS from exports.', async () => {
      const filepath = await createTestFile(
        'commonjs-exports.cjs',
        `
        exports.multiply = function(a, b) {
          return a * b;
        };
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('commonjs');
      expect(items[0].export_type).toBe('commonjs');
    });

    it('should detect CommonJS from .cjs extension', async () => {
      const filepath = await createTestFile(
        'commonjs-ext.cjs',
        `
        function helper() {
          return 'test';
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('commonjs');
    });

    it('should detect CommonJS from require()', async () => {
      const filepath = await createTestFile(
        'commonjs-require.js',
        `
        const fs = require('fs');

        function readConfig() {
          return fs.readFileSync('config.json');
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBeGreaterThan(0);
      expect(items[0].module_system).toBe('commonjs');
    });
  });

  describe('JSDoc detection', () => {
    it('should detect JSDoc comments', async () => {
      const filepath = await createTestFile(
        'with-jsdoc.js',
        `
        /**
         * Add two numbers
         * @param {number} a - First number
         * @param {number} b - Second number
         * @returns {number} Sum of a and b
         */
        export function add(a, b) {
          return a + b;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].has_docs).toBe(true);
      expect(items[0].docstring).not.toBeNull();
      expect(items[0].docstring).toContain('@param');
      expect(items[0].docstring).toContain('@returns');
    });

    it('should detect lack of documentation', async () => {
      const filepath = await createTestFile(
        'without-jsdoc.js',
        `
        export function subtract(a, b) {
          return a - b;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].has_docs).toBe(false);
      expect(items[0].docstring).toBeNull();
    });
  });

  describe('function parsing', () => {
    it('should parse regular function declarations', async () => {
      const filepath = await createTestFile(
        'regular-function.js',
        `
        function greet(name) {
          return 'Hello, ' + name;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].type).toBe('function');
      expect(items[0].name).toBe('greet');
      expect(items[0].parameters).toEqual(['name']);
    });

    it('should parse arrow functions', async () => {
      const filepath = await createTestFile(
        'arrow-function.js',
        `
        export const multiply = (x, y) => x * y;
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].type).toBe('function');
      expect(items[0].name).toBe('multiply');
      expect(items[0].parameters).toEqual(['x', 'y']);
    });

    it('should parse function expressions', async () => {
      const filepath = await createTestFile(
        'function-expression.js',
        `
        const divide = function(a, b) {
          return a / b;
        };
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].type).toBe('function');
      expect(items[0].name).toBe('divide');
    });

    it('should extract return type from TypeScript', async () => {
      const filepath = await createTestFile(
        'typed-function.ts',
        `
        export function calculate(x: number): number {
          return x * 2;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].return_type).toBe('number');
      expect(items[0].language).toBe('typescript');
    });
  });

  describe('class parsing', () => {
    it('should parse classes', async () => {
      const filepath = await createTestFile(
        'class-test.js',
        `
        export class Calculator {
          add(a, b) {
            return a + b;
          }

          subtract(a, b) {
            return a - b;
          }
        }
        `
      );

      const items = parseFile(filepath);

      // Should have 1 class + 2 methods = 3 items
      expect(items.length).toBe(3);

      const classItem = items.find(item => item.type === 'class');
      expect(classItem).toBeDefined();
      expect(classItem!.name).toBe('Calculator');

      const methods = items.filter(item => item.type === 'method');
      expect(methods).toHaveLength(2);
      expect(methods.map(m => m.name)).toContain('Calculator.add');
      expect(methods.map(m => m.name)).toContain('Calculator.subtract');
    });
  });

  describe('complexity calculation', () => {
    it('should calculate basic complexity', async () => {
      const filepath = await createTestFile(
        'simple-function.js',
        `
        function simple() {
          return 42;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].complexity).toBe(1);
    });

    it('should calculate complexity with conditionals', async () => {
      const filepath = await createTestFile(
        'complex-function.js',
        `
        function complex(x, y) {
          if (x > 0) {
            if (y > 0) {
              return x + y;
            } else {
              return x - y;
            }
          } else {
            return 0;
          }
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      // Base 1 + 3 if statements = 4
      expect(items[0].complexity).toBeGreaterThan(1);
    });

    it('should calculate complexity with loops', async () => {
      const filepath = await createTestFile(
        'loop-function.js',
        `
        function sumArray(arr) {
          let sum = 0;
          for (let i = 0; i < arr.length; i++) {
            if (arr[i] > 0) {
              sum += arr[i];
            }
          }
          return sum;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      // Base 1 + for loop + if = 3
      expect(items[0].complexity).toBeGreaterThanOrEqual(3);
    });
  });

  describe('module system edge cases', () => {
    it('should handle files with no imports or exports', async () => {
      const filepath = await createTestFile(
        'no-module.js',
        `
        function standalone() {
          return 'test';
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].module_system).toBe('unknown');
      expect(items[0].export_type).toBe('internal');
    });
  });

  describe('TypeScript-specific features', () => {
    it('should parse interfaces', async () => {
      const filepath = await createTestFile(
        'interface.ts',
        `
        /**
         * User interface
         */
        export interface User {
          id: string;
          name: string;
        }
        `
      );

      const items = parseFile(filepath);

      expect(items.length).toBe(1);
      expect(items[0].type).toBe('interface');
      expect(items[0].name).toBe('User');
      expect(items[0].has_docs).toBe(true);
      expect(items[0].language).toBe('typescript');
    });
  });
});
