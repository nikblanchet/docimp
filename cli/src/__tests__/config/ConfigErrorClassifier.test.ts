/**
 * Tests for ConfigErrorClassifier.
 *
 * Validates error categorization, message generation, and suggestion creation.
 */

import { ConfigErrorClassifier } from '../../config/ConfigErrorClassifier.js';
import type { ConfigErrorDetails } from '../../config/ConfigErrorClassifier.js';

describe('ConfigErrorClassifier', () => {
  describe('classify - syntax errors', () => {
    it('should detect SyntaxError instances', () => {
      const error = new SyntaxError('Unexpected token }');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
      expect(details.userMessage).toBe(
        'Configuration file has invalid JavaScript syntax'
      );
      expect(details.technicalDetails).toContain('Unexpected token }');
      expect(details.suggestions.length).toBeGreaterThan(0);
    });

    it('should detect "Unexpected token" errors', () => {
      const error = new Error('Unexpected token }');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
      expect(details.userMessage).toContain('invalid JavaScript syntax');
    });

    it('should detect "Unexpected end of input" errors', () => {
      const error = new Error('Unexpected end of input');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('unclosed brackets')])
      );
    });

    it('should detect "Invalid or unexpected token" errors', () => {
      const error = new Error('Invalid or unexpected token');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
    });

    it('should detect "Unexpected identifier" errors', () => {
      const error = new Error('Unexpected identifier');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
    });

    it('should detect "Unexpected string" errors', () => {
      const error = new Error('Unexpected string');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
    });

    it('should detect "Unexpected number" errors', () => {
      const error = new Error('Unexpected number');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
    });

    it('should provide suggestions for missing commas', () => {
      const error = new Error('Unexpected token }');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('missing comma')])
      );
    });

    it('should provide suggestions for unclosed brackets', () => {
      const error = new Error('Unexpected end of input');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('unclosed brackets')])
      );
    });

    it('should include line and column numbers when available', () => {
      const error: any = new SyntaxError('Unexpected token }');
      error.lineNumber = 5;
      error.columnNumber = 12;

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.technicalDetails).toContain('line 5');
      expect(details.technicalDetails).toContain('column 12');
    });

    it('should suggest testing config with node command', () => {
      const error = new SyntaxError('Unexpected token');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('node docimp.config.js'),
        ])
      );
    });
  });

  describe('classify - runtime errors', () => {
    it('should detect MODULE_NOT_FOUND error code', () => {
      const error: any = new Error('Cannot find module');
      error.code = 'MODULE_NOT_FOUND';

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('runtime');
      expect(details.userMessage).toBe('Configuration file failed to load');
    });

    it('should detect "Cannot find module" errors', () => {
      const error = new Error("Cannot find module './missing.js'");
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('runtime');
      expect(details.technicalDetails).toContain('./missing.js');
    });

    it('should detect export errors', () => {
      const error = new Error('does not provide an export named "default"');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('runtime');
      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('export')])
      );
    });

    it('should detect circular dependency errors', () => {
      const error = new Error('Circular dependency detected');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('runtime');
      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('circular')])
      );
    });

    it('should provide suggestions for missing modules', () => {
      const error = new Error("Cannot find module './helper.js'");
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('import/require paths'),
          expect.stringContaining('imported modules exist'),
        ])
      );
    });

    it('should provide suggestions for export mismatches', () => {
      const error = new Error('does not provide an export named "config"');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('correct export name')])
      );
    });

    it('should provide suggestions for circular dependencies', () => {
      const error = new Error('Circular dependency in imports');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([expect.stringContaining('circular')])
      );
    });

    it('should suggest testing config with node command', () => {
      const error: any = new Error('Cannot find module');
      error.code = 'MODULE_NOT_FOUND';

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('node docimp.config.js'),
        ])
      );
    });
  });

  describe('classify - unknown errors', () => {
    it('should handle non-Error objects', () => {
      const error = 'string error';
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('unknown');
      expect(details.technicalDetails).toBe('string error');
      expect(details.userMessage).toBe('Failed to load configuration file');
    });

    it('should handle null errors', () => {
      const error = null;
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('unknown');
      expect(details.technicalDetails).toBe('null');
    });

    it('should handle undefined errors', () => {
      const error = undefined;
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('unknown');
      expect(details.technicalDetails).toBe('undefined');
    });

    it('should handle unexpected Error types', () => {
      const error = new RangeError('Out of range');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('unknown');
      expect(details.technicalDetails).toContain('Out of range');
    });

    it('should provide generic suggestions for unknown errors', () => {
      const error = new TypeError('Type mismatch');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.suggestions).toEqual(
        expect.arrayContaining([
          expect.stringContaining('valid JavaScript'),
          expect.stringContaining('node docimp.config.js'),
        ])
      );
    });
  });

  describe('classify - technical details extraction', () => {
    it('should extract stack trace location information', () => {
      const error = new Error('Test error');
      // Simulate a stack trace with location
      error.stack = `Error: Test error
    at Object.<anonymous> (/path/to/config.js:10:5)
    at Module._compile (node:internal/modules/cjs/loader:1159:14)`;

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.technicalDetails).toContain('line 10');
      expect(details.technicalDetails).toContain('column 5');
    });

    it('should handle errors without stack traces', () => {
      const error = new Error('Test error');
      delete error.stack;

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.technicalDetails).toBe('Test error');
    });

    it('should prefer explicit lineNumber/columnNumber properties', () => {
      const error: any = new SyntaxError('Test error');
      error.lineNumber = 3;
      error.columnNumber = 7;
      error.stack = `SyntaxError: Test error
    at Object.<anonymous> (/path/to/config.js:10:5)`;

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      // Should use lineNumber/columnNumber, not stack trace
      expect(details.technicalDetails).toContain('line 3');
      expect(details.technicalDetails).toContain('column 7');
    });
  });

  describe('classify - comprehensive validation', () => {
    it('should return all required fields', () => {
      const error = new SyntaxError('Test error');
      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details).toHaveProperty('type');
      expect(details).toHaveProperty('userMessage');
      expect(details).toHaveProperty('technicalDetails');
      expect(details).toHaveProperty('suggestions');
    });

    it('should always return non-empty suggestions array', () => {
      const testCases = [
        new SyntaxError('Syntax error'),
        new Error('Cannot find module'),
        new RangeError('Unknown error'),
      ];

      testCases.forEach((error) => {
        const details = ConfigErrorClassifier.classify(
          error,
          '/path/to/config.js'
        );
        expect(Array.isArray(details.suggestions)).toBe(true);
        expect(details.suggestions.length).toBeGreaterThan(0);
      });
    });

    it('should handle complex error messages', () => {
      const error = new Error(
        'Unexpected token } in JSON at position 42 while parsing near "{\\"python\\": \\"google\\"}"\n' +
          'This might be related to configuration loading'
      );

      const details = ConfigErrorClassifier.classify(
        error,
        '/path/to/config.js'
      );

      expect(details.type).toBe('syntax');
      expect(details.technicalDetails).toContain('Unexpected token }');
    });
  });
});
