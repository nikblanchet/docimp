/**
 * Unit tests for audit command helper functions.
 *
 * Tests pure utility functions used in audit resume functionality.
 */

import prompts from 'prompts';
import {
  filterUnratedItems,
  formatElapsedTime,
  promptYesNo,
} from '../../commands/audit.js';
import type { AuditItem } from '../../types/audit-result.js';

// Mock prompts module
jest.mock('prompts');

describe('formatElapsedTime', () => {
  it('should format seconds correctly', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 30 * 1000); // 30 seconds ago
    const result = formatElapsedTime(past.toISOString());
    expect(result).toBe('30s ago');
  });

  it('should format minutes correctly', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 5 * 60 * 1000); // 5 minutes ago
    const result = formatElapsedTime(past.toISOString());
    expect(result).toBe('5m ago');
  });

  it('should format hours correctly', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 3 * 60 * 60 * 1000); // 3 hours ago
    const result = formatElapsedTime(past.toISOString());
    expect(result).toBe('3h ago');
  });

  it('should format days correctly', () => {
    const now = new Date();
    const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const result = formatElapsedTime(past.toISOString());
    expect(result).toBe('2d ago');
  });
});

describe('promptYesNo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when user selects yes (defaultYes true)', async () => {
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      value: true,
    });

    const result = await promptYesNo('Continue?', true);

    expect(result).toBe(true);
    expect(prompts).toHaveBeenCalledWith({
      type: 'confirm',
      name: 'value',
      message: 'Continue?',
      initial: true,
    });
  });

  it('should return false when user selects no (defaultYes false)', async () => {
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      value: false,
    });

    const result = await promptYesNo('Continue?', false);

    expect(result).toBe(false);
    expect(prompts).toHaveBeenCalledWith({
      type: 'confirm',
      name: 'value',
      message: 'Continue?',
      initial: false,
    });
  });

  it('should return false when user cancels (Ctrl+C)', async () => {
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      value: undefined,
    });

    const result = await promptYesNo('Continue?', true);

    expect(result).toBe(false);
  });
});

describe('filterUnratedItems', () => {
  const mockItems: AuditItem[] = [
    {
      name: 'function1',
      type: 'function',
      filepath: '/test/file1.ts',
      line_number: 10,
      end_line: 20,
      language: 'typescript',
      complexity: 5,
      has_docs: false,
      audit_rating: null,
    },
    {
      name: 'function2',
      type: 'function',
      filepath: '/test/file1.ts',
      line_number: 30,
      end_line: 40,
      language: 'typescript',
      complexity: 3,
      has_docs: false,
      audit_rating: null,
    },
    {
      name: 'function3',
      type: 'function',
      filepath: '/test/file2.ts',
      line_number: 10,
      end_line: 20,
      language: 'typescript',
      complexity: 2,
      has_docs: false,
      audit_rating: null,
    },
  ];

  it('should filter out rated items', () => {
    const partialRatings = {
      '/test/file1.ts': {
        function1: 3, // Rated
        function2: null, // Not rated
      },
      '/test/file2.ts': {
        function3: null, // Not rated
      },
    };

    const result = filterUnratedItems(mockItems, partialRatings);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('function2');
    expect(result[1].name).toBe('function3');
  });

  it('should return all items when none are rated', () => {
    const partialRatings = {
      '/test/file1.ts': {
        function1: null,
        function2: null,
      },
      '/test/file2.ts': {
        function3: null,
      },
    };

    const result = filterUnratedItems(mockItems, partialRatings);

    expect(result).toHaveLength(3);
  });

  it('should return empty array when all items are rated', () => {
    const partialRatings = {
      '/test/file1.ts': {
        function1: 3,
        function2: 4,
      },
      '/test/file2.ts': {
        function3: 2,
      },
    };

    const result = filterUnratedItems(mockItems, partialRatings);

    expect(result).toHaveLength(0);
  });

  it('should handle undefined ratings', () => {
    const partialRatings = {
      '/test/file1.ts': {
        function1: 3,
        // function2 not present (undefined)
      },
      // file2 not present
    };

    const result = filterUnratedItems(mockItems, partialRatings);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('function2');
    expect(result[1].name).toBe('function3');
  });
});
