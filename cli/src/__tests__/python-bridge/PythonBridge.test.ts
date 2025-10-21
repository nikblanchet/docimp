/**
 * Tests for PythonBridge JSON validation.
 *
 * Tests runtime validation of JSON responses from Python subprocess
 * using Zod schemas. Ensures malformed responses are caught early
 * with helpful error messages.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { spawn } from 'child_process';
import { PythonBridge } from '../../python-bridge/PythonBridge.js';
import type { AnalysisResult, AuditListResult, PlanResult } from '../../types/analysis.js';

// Mock child_process
jest.mock('child_process');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('PythonBridge JSON Validation', () => {
  let bridge: PythonBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use mock Python path to avoid environment detection
    bridge = new PythonBridge('python3', '/mock/analyzer');
  });

  /**
   * Helper to create a mock child process that returns JSON.
   */
  function mockSuccessfulProcess(jsonOutput: string): void {
    const mockProcess = {
      stdout: {
        on: jest.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            callback(Buffer.from(jsonOutput));
          }
        }),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          callback(0);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockProcess as any);
  }

  /**
   * Helper to create a mock child process that fails.
   */
  function mockFailedProcess(exitCode: number, stderr: string): void {
    const mockProcess = {
      stdout: {
        on: jest.fn(),
      },
      stderr: {
        on: jest.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            callback(Buffer.from(stderr));
          }
        }),
      },
      on: jest.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          callback(exitCode);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockProcess as any);
  }

  describe('analyze() validation', () => {
    it('should accept valid AnalysisResult JSON', async () => {
      const validResult: AnalysisResult = {
        coverage_percent: 75.5,
        total_items: 100,
        documented_items: 75,
        by_language: {
          python: {
            language: 'python',
            total_items: 50,
            documented_items: 40,
            coverage_percent: 80.0,
            avg_complexity: 5.2,
            avg_impact_score: 42.5,
          },
        },
        items: [
          {
            name: 'test_function',
            type: 'function',
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 5,
            impact_score: 45.0,
            has_docs: true,
            export_type: 'internal',
            module_system: 'unknown',
          },
        ],
      };

      mockSuccessfulProcess(JSON.stringify(validResult));

      const result = await bridge.analyze({ path: '/test', verbose: false });

      expect(result).toEqual(validResult);
    });

    it('should reject AnalysisResult with missing required field', async () => {
      const invalidResult = {
        // Missing coverage_percent
        total_items: 100,
        documented_items: 75,
        by_language: {},
        items: [],
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.analyze({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer.*coverage_percent/s
      );
    });

    it('should reject AnalysisResult with wrong type', async () => {
      const invalidResult = {
        coverage_percent: 'not a number', // Should be number
        total_items: 100,
        documented_items: 75,
        by_language: {},
        items: [],
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.analyze({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer/
      );
    });

    it('should reject AnalysisResult with invalid nested item', async () => {
      const invalidResult = {
        coverage_percent: 75.5,
        total_items: 100,
        documented_items: 75,
        by_language: {},
        items: [
          {
            name: 'test_function',
            type: 'invalid_type', // Should be 'function', 'class', 'method', or 'interface'
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 5,
            impact_score: 45.0,
            has_docs: true,
            export_type: 'internal',
            module_system: 'unknown',
          },
        ],
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.analyze({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer/
      );
    });

    it('should allow extra fields in AnalysisResult (forward compatibility)', async () => {
      const resultWithExtraFields = {
        coverage_percent: 75.5,
        total_items: 100,
        documented_items: 75,
        by_language: {},
        items: [],
        // Extra field added in future Python version
        future_field: 'some value',
      };

      mockSuccessfulProcess(JSON.stringify(resultWithExtraFields));

      const result = await bridge.analyze({ path: '/test', verbose: false });

      expect(result).toMatchObject({
        coverage_percent: 75.5,
        total_items: 100,
        documented_items: 75,
      });
    });

    it('should reject AnalysisResult with out-of-range values', async () => {
      const invalidResult = {
        coverage_percent: 150, // Should be 0-100
        total_items: 100,
        documented_items: 75,
        by_language: {},
        items: [],
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.analyze({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer/
      );
    });
  });

  describe('audit() validation', () => {
    it('should accept valid AuditListResult JSON', async () => {
      const validResult: AuditListResult = {
        items: [
          {
            name: 'documented_function',
            type: 'function',
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 5,
            docstring: 'This is a docstring',
            audit_rating: null,
          },
        ],
      };

      mockSuccessfulProcess(JSON.stringify(validResult));

      const result = await bridge.audit({ path: '/test', verbose: false });

      expect(result).toEqual(validResult);
    });

    it('should reject AuditListResult with missing items array', async () => {
      const invalidResult = {
        // Missing items array
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.audit({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer.*items/s
      );
    });

    it('should accept AuditListResult with null docstring', async () => {
      const validResult: AuditListResult = {
        items: [
          {
            name: 'function_without_docs',
            type: 'function',
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 5,
            docstring: null, // Null is valid
            audit_rating: null,
          },
        ],
      };

      mockSuccessfulProcess(JSON.stringify(validResult));

      const result = await bridge.audit({ path: '/test', verbose: false });

      expect(result).toEqual(validResult);
    });
  });

  describe('plan() validation', () => {
    it('should accept valid PlanResult JSON', async () => {
      const validResult: PlanResult = {
        items: [
          {
            name: 'improve_function',
            type: 'function',
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 8,
            impact_score: 65.0,
            has_docs: false,
            audit_rating: null,
            parameters: ['arg1', 'arg2'],
            return_type: 'str',
            docstring: null,
            export_type: 'internal',
            module_system: 'unknown',
            reason: 'High complexity, no documentation',
          },
        ],
        total_items: 1,
        missing_docs_count: 1,
        poor_quality_count: 0,
      };

      mockSuccessfulProcess(JSON.stringify(validResult));

      const result = await bridge.plan({ path: '/test', verbose: false });

      expect(result).toEqual(validResult);
    });

    it('should reject PlanResult with missing required field', async () => {
      const invalidResult = {
        items: [],
        total_items: 0,
        // Missing missing_docs_count and poor_quality_count
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.plan({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer/
      );
    });

    it('should accept PlanResult with audit_rating as number', async () => {
      const validResult: PlanResult = {
        items: [
          {
            name: 'improve_function',
            type: 'function',
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 8,
            impact_score: 65.0,
            has_docs: true,
            audit_rating: 2, // Rating from audit
            parameters: [],
            return_type: null,
            docstring: 'Poor quality docs',
            export_type: 'internal',
            module_system: 'unknown',
            reason: 'Documentation quality needs improvement',
          },
        ],
        total_items: 1,
        missing_docs_count: 0,
        poor_quality_count: 1,
      };

      mockSuccessfulProcess(JSON.stringify(validResult));

      const result = await bridge.plan({ path: '/test', verbose: false });

      expect(result).toEqual(validResult);
    });

    it('should reject PlanResult with invalid audit_rating', async () => {
      const invalidResult = {
        items: [
          {
            name: 'improve_function',
            type: 'function',
            filepath: '/path/to/file.py',
            line_number: 10,
            end_line: 20,
            language: 'python',
            complexity: 8,
            impact_score: 65.0,
            has_docs: true,
            audit_rating: 5, // Invalid - should be 1-4 or null
            parameters: [],
            return_type: null,
            docstring: 'Poor quality docs',
            export_type: 'internal',
            module_system: 'unknown',
            reason: 'Documentation quality needs improvement',
          },
        ],
        total_items: 1,
        missing_docs_count: 0,
        poor_quality_count: 1,
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      await expect(bridge.plan({ path: '/test', verbose: false })).rejects.toThrow(
        /Invalid response from Python analyzer/
      );
    });
  });

  describe('Error handling', () => {
    it('should provide helpful error messages for validation failures', async () => {
      const invalidResult = {
        coverage_percent: 'not a number',
        total_items: -1, // Should be nonnegative
        // Missing documented_items, by_language, items
      };

      mockSuccessfulProcess(JSON.stringify(invalidResult));

      try {
        await bridge.analyze({ path: '/test', verbose: false });
        fail('Should have thrown error');
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('Invalid response from Python analyzer');
        // Should mention the specific fields that failed
        expect(errorMessage).toMatch(/coverage_percent|total_items|documented_items/);
      }
    });

    it('should still handle non-validation errors (malformed JSON)', async () => {
      mockSuccessfulProcess('not valid json');

      await expect(bridge.analyze({ path: '/test', verbose: false })).rejects.toThrow(
        /Failed to parse Python output as JSON/
      );
    });

    it('should handle Python process failures', async () => {
      mockFailedProcess(1, 'Python error occurred');

      await expect(bridge.analyze({ path: '/test', verbose: false })).rejects.toThrow(
        /Python analyzer exited with code 1/
      );
    });
  });
});
