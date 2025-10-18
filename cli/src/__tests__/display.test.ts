/**
 * Tests for TerminalDisplay showAuditSummary method.
 */

import { TerminalDisplay } from '../display/TerminalDisplay';
import type { AuditSummary } from '../types/analysis';

// Mock ESM modules
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

describe('TerminalDisplay.showAuditSummary', () => {
  let display: TerminalDisplay;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    display = new TerminalDisplay();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('displays audit summary with all rating types', () => {
    const summary: AuditSummary = {
      totalItems: 20,
      auditedItems: 10,
      ratingCounts: {
        terrible: 2,
        ok: 3,
        good: 4,
        excellent: 1,
        skipped: 0,
      },
      auditFile: '.docimp/session-reports/audit.json',
    };

    display.showAuditSummary(summary);

    // Verify console.log was called (box is displayed)
    expect(consoleLogSpy).toHaveBeenCalled();

    // Get all logged lines
    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify key content is present
    expect(loggedLines.some((line) => line.includes('Documentation Quality Audit Complete'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Audited: 10 / 20 documented items (50.0%)'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Rating Breakdown:'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Terrible (1):  2 items'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('OK (2):        3 items'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Good (3):      4 items'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Excellent (4): 1 items'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Audit saved to:'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('.docimp/session-reports/audit.json'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Next steps:'))).toBe(true);
    expect(loggedLines.some((line) => line.includes("Run 'docimp plan .'"))).toBe(true);
  });

  it('displays audit summary with skipped items', () => {
    const summary: AuditSummary = {
      totalItems: 15,
      auditedItems: 8,
      ratingCounts: {
        terrible: 1,
        ok: 2,
        good: 3,
        excellent: 0,
        skipped: 2,
      },
      auditFile: '.docimp/session-reports/audit.json',
    };

    display.showAuditSummary(summary);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify skipped items are shown
    expect(loggedLines.some((line) => line.includes('Skipped:       2 items'))).toBe(true);
  });

  it('displays audit summary for partial audit (early quit)', () => {
    const summary: AuditSummary = {
      totalItems: 50,
      auditedItems: 10,
      ratingCounts: {
        terrible: 0,
        ok: 5,
        good: 5,
        excellent: 0,
        skipped: 0,
      },
      auditFile: '.docimp/session-reports/audit.json',
    };

    display.showAuditSummary(summary);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify partial percentage is calculated correctly
    expect(loggedLines.some((line) => line.includes('Audited: 10 / 50 documented items (20.0%)'))).toBe(true);
  });

  it('displays audit summary with only terrible ratings', () => {
    const summary: AuditSummary = {
      totalItems: 10,
      auditedItems: 5,
      ratingCounts: {
        terrible: 5,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 0,
      },
      auditFile: '.docimp/session-reports/audit.json',
    };

    display.showAuditSummary(summary);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify only terrible ratings are shown (no OK, Good, Excellent)
    expect(loggedLines.some((line) => line.includes('Terrible (1):  5 items'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('OK (2):'))).toBe(false);
    expect(loggedLines.some((line) => line.includes('Good (3):'))).toBe(false);
    expect(loggedLines.some((line) => line.includes('Excellent (4):'))).toBe(false);
  });

  it('displays box formatting correctly', () => {
    const summary: AuditSummary = {
      totalItems: 10,
      auditedItems: 5,
      ratingCounts: {
        terrible: 1,
        ok: 1,
        good: 1,
        excellent: 1,
        skipped: 1,
      },
      auditFile: '.docimp/session-reports/audit.json',
    };

    display.showAuditSummary(summary);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify box characters are present
    expect(loggedLines.some((line) => line.startsWith('┌'))).toBe(true);
    expect(loggedLines.some((line) => line.startsWith('└'))).toBe(true);
    expect(loggedLines.some((line) => line.startsWith('├'))).toBe(true);
    expect(loggedLines.filter((line) => line.startsWith('│')).length).toBeGreaterThan(5);
  });

  it('handles zero total items gracefully', () => {
    const summary: AuditSummary = {
      totalItems: 0,
      auditedItems: 0,
      ratingCounts: {
        terrible: 0,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 0,
      },
      auditFile: '.docimp/session-reports/audit.json',
    };

    display.showAuditSummary(summary);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify it doesn't crash and shows 0.0%
    expect(loggedLines.some((line) => line.includes('Audited: 0 / 0 documented items (0.0%)'))).toBe(true);
  });
});
