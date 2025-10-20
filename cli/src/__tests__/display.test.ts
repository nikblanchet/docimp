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
    expect(loggedLines.some((line) => line.includes('Excellent (4): 1 item'))).toBe(true);
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

  it('uses singular "item" when count is 1', () => {
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

    // Verify singular "item" is used for count of 1
    expect(loggedLines.some((line) => line.includes('Terrible (1):  1 item'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('OK (2):        1 item'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Good (3):      1 item'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Excellent (4): 1 item'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Skipped:       1 item'))).toBe(true);

    // Verify plural "items" is NOT used
    expect(loggedLines.some((line) => line.includes('1 items'))).toBe(false);
  });
});

describe('TerminalDisplay.showBoxedDocstring', () => {
  let display: TerminalDisplay;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    display = new TerminalDisplay();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('displays single-line docstring with proper box', () => {
    const docstring = 'Calculate the sum of two numbers.';

    display.showBoxedDocstring(docstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify box structure
    expect(loggedLines[0]).toContain('┌');
    expect(loggedLines[0]).toContain('─');
    expect(loggedLines[0]).toContain('┐');
    expect(loggedLines[1]).toContain('CURRENT DOCSTRING');
    expect(loggedLines[2]).toContain('├');
    expect(loggedLines[2]).toContain('┤');
    expect(loggedLines[3]).toContain(docstring);
    expect(loggedLines[4]).toContain('└');
    expect(loggedLines[4]).toContain('┘');
  });

  it('displays multi-line docstring with all lines', () => {
    const docstring = 'Calculate impact score.\n\nArgs:\n  complexity: Cyclomatic complexity\n\nReturns:\n  Impact score (0-100)';

    display.showBoxedDocstring(docstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify all content lines are present
    expect(loggedLines.some((line) => line.includes('Calculate impact score.'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Args:'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('complexity: Cyclomatic complexity'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Returns:'))).toBe(true);
    expect(loggedLines.some((line) => line.includes('Impact score (0-100)'))).toBe(true);
  });

  it('uses default width of 60 characters', () => {
    const docstring = 'Short docstring.';

    display.showBoxedDocstring(docstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Top line should be ┌ + 60 dashes + ┐ = 62 chars total
    expect(loggedLines[0]).toContain('─'.repeat(60));
  });

  it('respects custom width parameter', () => {
    const docstring = 'Short docstring.';
    const customWidth = 40;

    display.showBoxedDocstring(docstring, customWidth);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Top line should use custom width
    expect(loggedLines[0]).toContain('─'.repeat(customWidth));
  });

  it('handles empty docstring gracefully', () => {
    const docstring = '';

    display.showBoxedDocstring(docstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Should still render box with header
    expect(loggedLines[0]).toContain('┌');
    expect(loggedLines[1]).toContain('CURRENT DOCSTRING');
    expect(loggedLines[2]).toContain('├');
    expect(loggedLines[4]).toContain('└');
  });

  it('handles docstring with only whitespace', () => {
    const docstring = '   ';

    display.showBoxedDocstring(docstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Should still render box
    expect(loggedLines.length).toBeGreaterThan(4);
    expect(loggedLines[1]).toContain('CURRENT DOCSTRING');
  });

  it('displays box characters correctly', () => {
    const docstring = 'Test docstring.';

    display.showBoxedDocstring(docstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify all box characters are present
    expect(loggedLines[0]).toMatch(/^┌─+┐$/);
    expect(loggedLines[1]).toMatch(/^│.*│$/);
    expect(loggedLines[2]).toMatch(/^├─+┤$/);
    expect(loggedLines[3]).toMatch(/^│.*│$/);
    expect(loggedLines[4]).toMatch(/^└─+┘$/);
  });

  it('handles very long single line by padding correctly', () => {
    const longDocstring = 'This is a very long docstring that contains many words and exceeds the typical width.';

    display.showBoxedDocstring(longDocstring);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Should still render with proper box structure
    expect(loggedLines[0]).toContain('┌');
    expect(loggedLines[1]).toContain('CURRENT DOCSTRING');
    expect(loggedLines[3]).toContain(longDocstring);
    expect(loggedLines[4]).toContain('└');
  });
});

describe('TerminalDisplay.showCodeBlock', () => {
  let display: TerminalDisplay;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    display = new TerminalDisplay();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('displays non-truncated code without truncation message', () => {
    const code = '  45 | function add(a, b) {\n  46 |   return a + b;\n  47 | }';
    const truncated = false;
    const totalLines = 3;
    const displayedLines = 3;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify code is displayed
    expect(loggedLines[0]).toBe(code);

    // Verify no truncation message
    expect(loggedLines.some((line) => line.includes('more lines'))).toBe(false);
  });

  it('displays truncated code with correct truncation message', () => {
    const code = '  45 | function add(a, b) {\n  46 |   return a + b;';
    const truncated = true;
    const totalLines = 10;
    const displayedLines = 2;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify code is displayed
    expect(loggedLines[0]).toBe(code);

    // Verify truncation message appears
    expect(loggedLines.some((line) => line.includes('... (8 more lines, press C to see full code)'))).toBe(true);
  });

  it('calculates remaining lines correctly', () => {
    const code = '  10 | def func():';
    const truncated = true;
    const totalLines = 25;
    const displayedLines = 5;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // 25 - 5 = 20 remaining lines
    expect(loggedLines.some((line) => line.includes('... (20 more lines, press C to see full code)'))).toBe(true);
  });

  it('displays code with line numbers correctly', () => {
    const code = '   1 | import sys\n   2 | import os\n   3 | \n   4 | def main():';
    const truncated = false;
    const totalLines = 4;
    const displayedLines = 4;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify code with line numbers is displayed
    expect(loggedLines[0]).toContain('   1 | import sys');
    expect(loggedLines[0]).toContain('   4 | def main():');
  });

  it('handles empty code gracefully', () => {
    const code = '';
    const truncated = false;
    const totalLines = 0;
    const displayedLines = 0;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Should log empty string
    expect(loggedLines[0]).toBe('');
  });

  it('handles single-line code', () => {
    const code = '  100 | return True';
    const truncated = false;
    const totalLines = 1;
    const displayedLines = 1;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify single line is displayed
    expect(loggedLines[0]).toBe(code);
    expect(loggedLines.some((line) => line.includes('more lines'))).toBe(false);
  });

  it('handles multi-line code with proper formatting', () => {
    const code = '  10 | class Calculator:\n  11 |   def __init__(self):\n  12 |     self.value = 0\n  13 | \n  14 |   def add(self, x):';
    const truncated = false;
    const totalLines = 5;
    const displayedLines = 5;

    display.showCodeBlock(code, truncated, totalLines, displayedLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify all lines are preserved
    expect(loggedLines[0]).toContain('class Calculator:');
    expect(loggedLines[0]).toContain('def __init__(self):');
    expect(loggedLines[0]).toContain('self.value = 0');
  });
});

describe('TerminalDisplay.showSignature', () => {
  let display: TerminalDisplay;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    display = new TerminalDisplay();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('displays signature with correct message format', () => {
    const signature = ' 134 | def connect(self, config: dict, retry: int = 3) -> Connection:';
    const totalLines = 42;

    display.showSignature(signature, totalLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify signature is displayed
    expect(loggedLines[0]).toBe(signature);

    // Verify message format is exact
    expect(loggedLines.some((line) => line === '(Full code: 42 lines, press C to see all)')).toBe(true);
  });

  it('displays total line count correctly', () => {
    const signature = '  10 | function calculateImpactScore(complexity: number): number {';
    const totalLines = 28;

    display.showSignature(signature, totalLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify total lines in message
    expect(loggedLines.some((line) => line.includes('28 lines'))).toBe(true);
  });

  it('handles single-line signature', () => {
    const signature = '  45 | def simple_func():';
    const totalLines = 5;

    display.showSignature(signature, totalLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify signature and message
    expect(loggedLines[0]).toBe(signature);
    expect(loggedLines.some((line) => line.includes('5 lines'))).toBe(true);
  });

  it('handles multi-line signature', () => {
    const signature = '  10 | function veryLongFunctionName(\n  11 |   param1: string,\n  12 |   param2: number\n  13 | ): Result {';
    const totalLines = 50;

    display.showSignature(signature, totalLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify multi-line signature is preserved
    expect(loggedLines[0]).toContain('veryLongFunctionName(');
    expect(loggedLines[0]).toContain('param1: string');
    expect(loggedLines[0]).toContain('): Result {');
    expect(loggedLines.some((line) => line.includes('50 lines'))).toBe(true);
  });

  it('displays empty line between signature and message', () => {
    const signature = '  100 | class MyClass:';
    const totalLines = 20;

    display.showSignature(signature, totalLines);

    const loggedLines = consoleLogSpy.mock.calls.map((call) => call[0]);

    // Verify empty line exists
    expect(loggedLines[1]).toBe('');
    expect(loggedLines[2]).toContain('Full code:');
  });
});
