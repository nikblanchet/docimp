/**
 * Tests for audit command and calculateAuditSummary function.
 */

// Mock ESM modules before importing anything else
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    blue: (str: string) => str,
    cyan: (str: string) => str,
    gray: (str: string) => str,
  },
  bold: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  blue: (str: string) => str,
  cyan: (str: string) => str,
  gray: (str: string) => str,
}));
jest.mock('ora', () => ({
  default: () => ({
    start: () => ({ stop: () => {}, succeed: () => {}, fail: () => {} }),
  }),
}));
jest.mock('cli-table3', () => {
  return class MockTable {
    constructor() {}
    toString() { return ''; }
  };
});

import { calculateAuditSummary } from '../commands/audit';
import type { AuditRatings, AuditSummary } from '../types/analysis';

describe('calculateAuditSummary', () => {
  const auditFile = '.docimp/session-reports/audit.json';

  it('calculates summary with all rating types', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          'function1': 1,  // terrible
          'function2': 2,  // ok
          'function3': 3,  // good
        },
        'file2.ts': {
          'function4': 4,  // excellent
          'function5': null,  // skipped
        },
      },
    };

    const summary = calculateAuditSummary(10, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 10,
      auditedItems: 5,
      ratingCounts: {
        terrible: 1,
        ok: 1,
        good: 1,
        excellent: 1,
        skipped: 1,
      },
      auditFile,
    });
  });

  it('calculates summary with only skipped items', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          'function1': null,
          'function2': null,
          'function3': null,
        },
      },
    };

    const summary = calculateAuditSummary(5, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 5,
      auditedItems: 3,
      ratingCounts: {
        terrible: 0,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 3,
      },
      auditFile,
    });
  });

  it('calculates summary for partial audit (early quit)', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          'function1': 2,
          'function2': 3,
        },
      },
    };

    const summary = calculateAuditSummary(20, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 20,
      auditedItems: 2,
      ratingCounts: {
        terrible: 0,
        ok: 1,
        good: 1,
        excellent: 0,
        skipped: 0,
      },
      auditFile,
    });
  });

  it('calculates summary for empty audit (no ratings)', () => {
    const ratings: AuditRatings = {
      ratings: {},
    };

    const summary = calculateAuditSummary(10, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 10,
      auditedItems: 0,
      ratingCounts: {
        terrible: 0,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 0,
      },
      auditFile,
    });
  });

  it('calculates summary with multiple terrible ratings', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          'function1': 1,
          'function2': 1,
          'function3': 1,
        },
        'file2.ts': {
          'function4': 1,
        },
      },
    };

    const summary = calculateAuditSummary(10, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 10,
      auditedItems: 4,
      ratingCounts: {
        terrible: 4,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 0,
      },
      auditFile,
    });
  });

  it('calculates summary with mix of ratings and skipped', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          'function1': 1,
          'function2': null,
          'function3': 2,
          'function4': null,
          'function5': 4,
        },
      },
    };

    const summary = calculateAuditSummary(8, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 8,
      auditedItems: 5,
      ratingCounts: {
        terrible: 1,
        ok: 1,
        good: 0,
        excellent: 1,
        skipped: 2,
      },
      auditFile,
    });
  });
});
