/**
 * Unit tests for improve command resume helper functions.
 *
 * Tests formatElapsedTime, filterUnprocessedItems, and other utility functions.
 */

import type { PlanItem } from '../../types/analysis.js';
import type {
  ImproveSessionState,
  ImproveStatusRecord,
} from '../../types/improve-session-state.js';
import {
  formatElapsedTime,
  filterUnprocessedItems,
} from '../../commands/improve.js';

describe('improve resume helper functions', () => {
  describe('formatElapsedTime', () => {
    it('should format seconds ago', () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);
      expect(formatElapsedTime(fiveSecondsAgo.toISOString())).toBe('5s ago');
    });

    it('should format minutes ago', () => {
      const now = new Date();
      const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
      expect(formatElapsedTime(fiveMinutesAgo.toISOString())).toBe('5m ago');
    });

    it('should format hours ago', () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatElapsedTime(twoHoursAgo.toISOString())).toBe('2h ago');
    });

    it('should format days ago', () => {
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      expect(formatElapsedTime(threeDaysAgo.toISOString())).toBe('3d ago');
    });

    it('should prefer larger units (days over hours)', () => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours
      expect(formatElapsedTime(oneDayAgo.toISOString())).toBe('1d ago');
    });
  });

  describe('filterUnprocessedItems', () => {
    const mockPlanItem = (name: string, filepath: string): PlanItem => ({
      name,
      filepath,
      type: 'function',
      line_number: 1,
      end_line: 10,
      language: 'python',
      complexity: 5,
      impact_score: 25,
      has_docs: false,
      reason: 'Missing documentation',
      parameters: [],
      return_type: null,
      docstring: null,
    });

    it('should filter items with no status records (empty dicts)', () => {
      const items: PlanItem[] = [
        mockPlanItem('foo', 'file1.py'),
        mockPlanItem('bar', 'file1.py'),
        mockPlanItem('baz', 'file2.py'),
      ];

      const partialImprovements: Record<
        string,
        Record<string, ImproveStatusRecord | Record<string, never>>
      > = {
        'file1.py': {
          foo: {}, // Empty dict = not yet processed
          bar: {
            status: 'accepted',
            timestamp: '2025-01-01T00:00:00Z',
            suggestion: 'doc',
          },
        },
        'file2.py': {
          baz: {}, // Empty dict = not yet processed
        },
      };

      const result = filterUnprocessedItems(items, partialImprovements);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('foo');
      expect(result[1].name).toBe('baz');
    });

    it('should filter items with undefined status records', () => {
      const items: PlanItem[] = [
        mockPlanItem('foo', 'file1.py'),
        mockPlanItem('bar', 'file1.py'),
      ];

      const partialImprovements: Record<
        string,
        Record<string, ImproveStatusRecord | Record<string, never>>
      > = {
        'file1.py': {
          bar: { status: 'skipped', timestamp: '2025-01-01T00:00:00Z' },
          // foo is not in partial_improvements - undefined
        },
      };

      const result = filterUnprocessedItems(items, partialImprovements);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('foo');
    });

    it('should return empty array when all items are processed', () => {
      const items: PlanItem[] = [
        mockPlanItem('foo', 'file1.py'),
        mockPlanItem('bar', 'file1.py'),
      ];

      const partialImprovements: Record<
        string,
        Record<string, ImproveStatusRecord | Record<string, never>>
      > = {
        'file1.py': {
          foo: { status: 'accepted', timestamp: '2025-01-01T00:00:00Z' },
          bar: { status: 'skipped', timestamp: '2025-01-01T00:00:00Z' },
        },
      };

      const result = filterUnprocessedItems(items, partialImprovements);

      expect(result).toHaveLength(0);
    });

    it('should handle items with error status', () => {
      const items: PlanItem[] = [
        mockPlanItem('foo', 'file1.py'),
        mockPlanItem('bar', 'file1.py'),
      ];

      const partialImprovements: Record<
        string,
        Record<string, ImproveStatusRecord | Record<string, never>>
      > = {
        'file1.py': {
          foo: {}, // Not processed
          bar: { status: 'error', timestamp: '2025-01-01T00:00:00Z' }, // Error status = processed
        },
      };

      const result = filterUnprocessedItems(items, partialImprovements);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('foo');
    });

    it('should handle mixed files', () => {
      const items: PlanItem[] = [
        mockPlanItem('foo', 'file1.py'),
        mockPlanItem('bar', 'file2.py'),
        mockPlanItem('baz', 'file3.py'),
      ];

      const partialImprovements: Record<
        string,
        Record<string, ImproveStatusRecord | Record<string, never>>
      > = {
        'file1.py': {
          foo: {}, // Not processed
        },
        'file2.py': {
          bar: { status: 'accepted', timestamp: '2025-01-01T00:00:00Z' }, // Processed
        },
        'file3.py': {
          baz: {}, // Not processed
        },
      };

      const result = filterUnprocessedItems(items, partialImprovements);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('foo');
      expect(result[1].name).toBe('baz');
    });
  });
});
