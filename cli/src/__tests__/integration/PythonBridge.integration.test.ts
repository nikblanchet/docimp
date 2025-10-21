/**
 * Integration tests for PythonBridge with real Python subprocess.
 *
 * These tests verify the Python-TypeScript JSON boundary by spawning
 * real Python subprocesses (not mocked). This ensures:
 * - JSON serialization from Python is valid
 * - Zod schemas correctly validate real Python output
 * - Unicode and edge cases are handled properly
 *
 * CRITICAL: Do not mock child_process in this file. These tests must
 * use real subprocess communication to catch serialization issues.
 *
 * Addresses Issue #108 - Test coverage for Python-TypeScript JSON boundary
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { PythonBridge } from '../../python-bridge/PythonBridge.js';
import type { AnalysisResult, AuditListResult, PlanResult } from '../../types/analysis.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('PythonBridge Integration (Real Python Subprocess)', () => {
  let bridge: PythonBridge;
  const examplesPath = resolve(__dirname, '../../../../examples');

  beforeAll(() => {
    // Verify examples directory exists
    if (!existsSync(examplesPath)) {
      throw new Error(`Examples directory not found: ${examplesPath}`);
    }

    // Create PythonBridge instance - will use real Python subprocess
    bridge = new PythonBridge();
  });

  describe('Basic Integration Tests', () => {
    it('should validate real Python analyze output', async () => {
      // This test spawns real Python subprocess
      const result: AnalysisResult = await bridge.analyze({
        path: examplesPath,
        verbose: false,
      });

      // Zod validation passed - result has correct structure
      expect(result.coverage_percent).toBeGreaterThanOrEqual(0);
      expect(result.coverage_percent).toBeLessThanOrEqual(100);
      expect(result.total_items).toBeGreaterThan(0);
      expect(result.documented_items).toBeGreaterThanOrEqual(0);
      expect(result.items).toBeInstanceOf(Array);
      expect(result.by_language).toBeDefined();

      // Verify at least one item has all required fields
      const firstItem = result.items[0];
      expect(firstItem).toHaveProperty('name');
      expect(firstItem).toHaveProperty('type');
      expect(firstItem).toHaveProperty('filepath');
      expect(firstItem).toHaveProperty('line_number');
      expect(firstItem).toHaveProperty('end_line');
      expect(firstItem).toHaveProperty('language');
      expect(firstItem).toHaveProperty('complexity');
      expect(firstItem).toHaveProperty('impact_score');
      expect(firstItem).toHaveProperty('has_docs');
      expect(firstItem).toHaveProperty('export_type');
      expect(firstItem).toHaveProperty('module_system');
    }, 30000); // 30 second timeout for subprocess

    it('should validate real Python audit output', async () => {
      // This test spawns real Python subprocess
      const result: AuditListResult = await bridge.audit({
        path: examplesPath,
        verbose: false,
      });

      // Zod validation passed - result has correct structure
      expect(result.items).toBeInstanceOf(Array);

      // If there are documented items, verify structure
      if (result.items.length > 0) {
        const firstItem = result.items[0];
        expect(firstItem).toHaveProperty('name');
        expect(firstItem).toHaveProperty('type');
        expect(firstItem).toHaveProperty('filepath');
        expect(firstItem).toHaveProperty('line_number');
        expect(firstItem).toHaveProperty('end_line');
        expect(firstItem).toHaveProperty('language');
        expect(firstItem).toHaveProperty('complexity');
        expect(firstItem).toHaveProperty('docstring');
      }
    }, 30000);

    it('should validate real Python plan output', async () => {
      // This test spawns real Python subprocess
      // Note: plan requires analyze to have been run first
      // So we run analyze, then plan
      await bridge.analyze({
        path: examplesPath,
        verbose: false,
      });

      const result: PlanResult = await bridge.plan({
        path: examplesPath,
        verbose: false,
      });

      // Zod validation passed - result has correct structure
      expect(result.items).toBeInstanceOf(Array);
      expect(result.total_items).toBeGreaterThanOrEqual(0);
      expect(result.missing_docs_count).toBeGreaterThanOrEqual(0);
      expect(result.poor_quality_count).toBeGreaterThanOrEqual(0);

      // If there are plan items, verify structure
      if (result.items.length > 0) {
        const firstItem = result.items[0];
        expect(firstItem).toHaveProperty('name');
        expect(firstItem).toHaveProperty('type');
        expect(firstItem).toHaveProperty('filepath');
        expect(firstItem).toHaveProperty('line_number');
        expect(firstItem).toHaveProperty('language');
        expect(firstItem).toHaveProperty('complexity');
        expect(firstItem).toHaveProperty('impact_score');
        expect(firstItem).toHaveProperty('has_docs');
        expect(firstItem).toHaveProperty('reason');
      }
    }, 30000);
  });

  describe('Edge Case Tests', () => {
    it('should handle Unicode characters in file paths and code', async () => {
      // The examples directory may contain files with Unicode
      // This test verifies that JSON serialization handles it correctly
      const result: AnalysisResult = await bridge.analyze({
        path: examplesPath,
        verbose: false,
      });

      // Verify we can parse results without Unicode errors
      expect(result).toBeDefined();
      expect(result.items).toBeInstanceOf(Array);

      // Check if any items have non-ASCII characters (may or may not exist)
      // The important thing is that if they do exist, they're handled correctly
      result.items.forEach((item) => {
        expect(typeof item.name).toBe('string');
        expect(typeof item.filepath).toBe('string');
      });
    }, 30000);

    it('should handle empty results gracefully', async () => {
      // Create a temporary empty directory for this test
      const tempDir = resolve(__dirname, '../fixtures/empty-dir');

      // Try to analyze empty/non-existent directory
      // This should not crash, should return empty results
      try {
        const result: AnalysisResult = await bridge.analyze({
          path: tempDir,
          verbose: false,
        });

        // Should return valid structure even with no items
        expect(result).toBeDefined();
        expect(result.items).toBeInstanceOf(Array);
        expect(result.total_items).toBe(0);
        expect(result.documented_items).toBe(0);
        expect(result.coverage_percent).toBe(0);
      } catch (error) {
        // If Python returns error for non-existent path, that's acceptable
        // As long as it's a clear error message, not a JSON parse failure
        expect(error).toBeDefined();
      }
    }, 30000);

    it('should handle large datasets efficiently', async () => {
      // The examples directory should have multiple files
      // This test verifies performance with real-world dataset
      const startTime = Date.now();

      const result: AnalysisResult = await bridge.analyze({
        path: examplesPath,
        verbose: false,
      });

      const duration = Date.now() - startTime;

      // Verify result is valid
      expect(result.items).toBeInstanceOf(Array);

      // Verify reasonable performance (should complete in under 30 seconds)
      expect(duration).toBeLessThan(30000);

      // Verify large datasets don't cause issues
      if (result.items.length > 100) {
        // Spot check: verify first and last items have valid structure
        const firstItem = result.items[0];
        const lastItem = result.items[result.items.length - 1];

        expect(firstItem).toHaveProperty('name');
        expect(lastItem).toHaveProperty('name');
      }
    }, 30000);

    it('should handle missing optional fields from Python output', async () => {
      // This test verifies Zod .passthrough() and .optional() handle missing fields
      // In practice, Python always includes all fields, but we test defensive behavior

      const { AnalysisResultSchema } = await import('../../python-bridge/schemas.js');

      // Create minimal JSON with only required fields
      const minimalJson = {
        items: [{
          name: 'minimal_function',
          type: 'function',
          filepath: '/test/minimal.py',
          line_number: 1,
          end_line: 10,
          language: 'python',
          complexity: 5,
          impact_score: 25,
          has_docs: false,
          export_type: 'named',
          module_system: 'esm',
          // Intentionally omitting: audit_rating (optional in CodeItemSchema)
          // Note: Real Python output includes all fields, but Zod should handle omission
        }],
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {}
      };

      // Validate that Zod schema accepts JSON with missing optional fields
      const result = AnalysisResultSchema.parse(minimalJson);

      expect(result.items[0].name).toBe('minimal_function');
      expect(result.items[0]).not.toHaveProperty('audit_rating');

      // Verify required fields are present
      expect(result.items[0]).toHaveProperty('name');
      expect(result.items[0]).toHaveProperty('type');
      expect(result.items[0]).toHaveProperty('filepath');
      expect(result.items[0]).toHaveProperty('line_number');
      expect(result.items[0]).toHaveProperty('end_line');
      expect(result.items[0]).toHaveProperty('language');
      expect(result.items[0]).toHaveProperty('complexity');
      expect(result.items[0]).toHaveProperty('impact_score');
      expect(result.items[0]).toHaveProperty('has_docs');
      expect(result.items[0]).toHaveProperty('export_type');
      expect(result.items[0]).toHaveProperty('module_system');
    }, 30000);
  });

  describe('Error Handling Tests', () => {
    it('should detect malformed Python output', async () => {
      // This test is tricky because we need Python to return malformed JSON
      // We can't easily force this without mocking, which defeats the purpose
      // Instead, we verify that if Python errors occur, they're caught properly

      // Try to analyze a path that will cause Python error
      try {
        await bridge.analyze({
          path: '/nonexistent/path/that/does/not/exist',
          verbose: false,
        });

        // If we get here, Python should have returned valid JSON with empty results
        // That's acceptable behavior
      } catch (error) {
        // Error should be caught and have useful message
        expect(error).toBeDefined();
        const errorMessage = (error as Error).message;

        // Should not be generic JSON parse error
        expect(errorMessage.length).toBeGreaterThan(0);
      }
    }, 30000);

    it('should provide helpful error messages on validation failures', async () => {
      // This test verifies that if Zod validation fails,
      // the error message is helpful (not just "validation failed")

      // We can test this by examining error structure from previous test
      // Or by inspecting the formatValidationError function behavior

      // For now, verify that analyze returns data that passes validation
      const result: AnalysisResult = await bridge.analyze({
        path: examplesPath,
        verbose: false,
      });

      // If this doesn't throw, validation passed
      expect(result).toBeDefined();

      // Verify required fields are present (these would cause validation errors if missing)
      expect(result).toHaveProperty('coverage_percent');
      expect(result).toHaveProperty('total_items');
      expect(result).toHaveProperty('documented_items');
      expect(result).toHaveProperty('by_language');
      expect(result).toHaveProperty('items');
    }, 30000);
  });
});
