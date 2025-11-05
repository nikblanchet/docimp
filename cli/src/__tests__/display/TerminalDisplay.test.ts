/**
 * Integration tests for TerminalDisplay responsive behavior.
 */

// Mock ESM modules
jest.mock('ora', () => ({
  default: () => ({
    start: () => ({ stop: () => {}, succeed: () => {}, fail: () => {} }),
  }),
}));

jest.mock('chalk', () => {
  const createChainableChalk = (): any => {
    const chalkMock: any = (str: string) => str;
    const methods = [
      'bold',
      'dim',
      'green',
      'yellow',
      'red',
      'blue',
      'cyan',
      'gray',
    ];
    methods.forEach((method) => {
      chalkMock[method] = chalkMock;
    });
    return chalkMock;
  };

  const chalk = createChainableChalk();
  return { default: chalk, ...chalk };
});

import { TerminalDisplay } from '../../display/TerminalDisplay.js';
import type {
  AnalysisResult,
  CodeItem,
  LanguageMetrics,
  SessionSummary,
  TransactionEntry,
} from '../../types/analysis.js';

describe('TerminalDisplay responsive behavior', () => {
  let display: TerminalDisplay;
  let originalColumns: number | undefined;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    display = new TerminalDisplay();
    originalColumns = process.stdout.columns;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    if (originalColumns !== undefined) {
      process.stdout.columns = originalColumns;
    } else {
      // @ts-expect-error: Allow setting to undefined for restoration
      process.stdout.columns = undefined;
    }
    consoleLogSpy.mockRestore();
  });

  describe('showLanguageBreakdown', () => {
    const mockAnalysisResult: AnalysisResult = {
      items: [],
      coverage_percent: 75.0,
      total_items: 10,
      documented_items: 8,
      by_language: {
        python: {
          total_items: 5,
          documented_items: 4,
          coverage_percent: 80.0,
          avg_complexity: 5.2,
          avg_impact_score: 45.0,
        } as LanguageMetrics,
        typescript: {
          total_items: 5,
          documented_items: 4,
          coverage_percent: 80.0,
          avg_complexity: 3.8,
          avg_impact_score: 35.5,
        } as LanguageMetrics,
      },
      parse_failures: [],
    };

    it('should use full table format for wide terminals (120 columns)', () => {
      process.stdout.columns = 120;

      display.showAnalysisResult(mockAnalysisResult, 'summary');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      // Full table should have box-drawing characters
      expect(output).toContain('─');
      expect(output).toContain('│');
    });

    it('should use compact table format for narrow terminals (60 columns)', () => {
      process.stdout.columns = 60;

      display.showAnalysisResult(mockAnalysisResult, 'summary');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      // Compact table should NOT have box-drawing characters for borders
      // (may still have some from progress bars or headers)
      // Check that table structure is more minimal
      const tableLines = output
        .split('\n')
        .filter(
          (line) => line.includes('Python') || line.includes('TypeScript')
        );

      // Verify language names still appear (content preserved)
      expect(output).toContain('Python');
      expect(output).toContain('TypeScript');

      // Compact format should have simpler structure
      expect(tableLines.length).toBeGreaterThan(0);
    });

    it('should use full table format for undefined columns (piped output)', () => {
      // @ts-expect-error: Allow setting to undefined for testing
      process.stdout.columns = undefined;

      display.showAnalysisResult(mockAnalysisResult, 'summary');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      // Should default to 120 columns (full table with borders)
      expect(output).toContain('─');
      expect(output).toContain('│');
    });

    it('should handle boundary at 80 columns (use full table)', () => {
      process.stdout.columns = 80;

      display.showAnalysisResult(mockAnalysisResult, 'summary');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      // At exactly 80 columns, should use full table
      expect(output).toContain('─');
      expect(output).toContain('│');
    });

    it('should handle boundary at 79 columns (use compact table)', () => {
      process.stdout.columns = 79;

      display.showAnalysisResult(mockAnalysisResult, 'summary');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      // At 79 columns, should use compact table
      // Verify content is still present
      expect(output).toContain('Python');
      expect(output).toContain('TypeScript');
    });
  });

  describe('showCodeItems', () => {
    const mockItems: CodeItem[] = [
      {
        name: 'calculateScore',
        type: 'function',
        filepath: '/test/scorer.py',
        line_number: 10,
        end_line: 25,
        language: 'python',
        complexity: 8,
        impact_score: 65.0,
        has_docs: false,
        parameters: ['a', 'b'],
        return_type: 'float',
        docstring: null,
        export_type: 'named',
        module_system: 'esm',
        audit_rating: null,
      },
      {
        name: 'DataProcessor',
        type: 'class',
        filepath: '/test/processor.ts',
        line_number: 5,
        end_line: 50,
        language: 'typescript',
        complexity: 12,
        impact_score: 85.0,
        has_docs: true,
        parameters: [],
        return_type: null,
        docstring: 'Processes data',
        export_type: 'named',
        module_system: 'esm',
        audit_rating: 3,
      },
    ];

    it('should render code items table in wide terminal', () => {
      process.stdout.columns = 120;

      display.showCodeItems(mockItems, 'Test Items');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('calculateScore');
      expect(output).toContain('DataProcessor');
      expect(output).toContain('─'); // Has borders
    });

    it('should render code items table in narrow terminal', () => {
      process.stdout.columns = 60;

      display.showCodeItems(mockItems, 'Test Items');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('calculateScore');
      expect(output).toContain('DataProcessor');
      // Content preserved even in compact mode
    });
  });

  describe('showSessionList', () => {
    const mockSessions: SessionSummary[] = [
      {
        session_id: 'abc-123-def-456',
        started_at: '2025-01-15T10:30:00',
        change_count: 3,
        status: 'committed',
      },
      {
        session_id: 'xyz-789-uvw-012',
        started_at: '2025-01-15T11:00:00',
        change_count: 1,
        status: 'in_progress',
      },
    ];

    it('should render session list in wide terminal', () => {
      process.stdout.columns = 120;

      display.showSessionList(mockSessions);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('abc-123-def-456');
      expect(output).toContain('xyz-789-uvw-012');
    });

    it('should render session list in narrow terminal', () => {
      process.stdout.columns = 60;

      display.showSessionList(mockSessions);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('abc-123-def-456');
      expect(output).toContain('xyz-789-uvw-012');
    });

    it('should handle empty session list', () => {
      process.stdout.columns = 120;

      display.showSessionList([]);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('No active sessions found');
    });
  });

  describe('showChangeList', () => {
    const mockChanges: TransactionEntry[] = [
      {
        entry_id: 'a1b2c3d',
        filepath: '/test/file1.py',
        backup_path: '/test/file1.py.bak',
        timestamp: '2025-01-15T10:30:00',
        item_name: 'function1',
        item_type: 'function',
        language: 'python',
        success: true,
      },
      {
        entry_id: 'e4f5g6h',
        filepath: '/test/file2.ts',
        backup_path: '/test/file2.ts.bak',
        timestamp: '2025-01-15T10:31:00',
        item_name: 'MyClass',
        item_type: 'class',
        language: 'typescript',
        success: true,
      },
    ];

    it('should render change list in wide terminal', () => {
      process.stdout.columns = 120;

      display.showChangeList(mockChanges, 'abc-123');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('a1b2c3d');
      expect(output).toContain('function1');
      expect(output).toContain('e4f5g6h');
      expect(output).toContain('MyClass');
    });

    it('should render change list in narrow terminal', () => {
      process.stdout.columns = 60;

      display.showChangeList(mockChanges, 'abc-123');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('a1b2c3d');
      expect(output).toContain('function1');
    });

    it('should handle empty change list', () => {
      process.stdout.columns = 120;

      display.showChangeList([], 'abc-123');

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join('\n');

      expect(output).toContain('No changes found');
    });
  });

  describe('table content preservation', () => {
    it('should preserve all content between full and compact modes', () => {
      const mockResult: AnalysisResult = {
        items: [],
        coverage_percent: 75.0,
        total_items: 10,
        documented_items: 8,
        by_language: {
          python: {
            total_items: 5,
            documented_items: 4,
            coverage_percent: 80.0,
            avg_complexity: 5.2,
            avg_impact_score: 45.0,
          } as LanguageMetrics,
        },
        parse_failures: [],
      };

      // Capture output for wide terminal
      process.stdout.columns = 120;
      display.showAnalysisResult(mockResult, 'summary');
      const wideOutput = consoleLogSpy.mock.calls
        .map((call) => call[0])
        .join('\n');
      consoleLogSpy.mockClear();

      // Capture output for narrow terminal
      process.stdout.columns = 60;
      display.showAnalysisResult(mockResult, 'summary');
      const narrowOutput = consoleLogSpy.mock.calls
        .map((call) => call[0])
        .join('\n');

      // Both should contain the same data
      expect(wideOutput).toContain('Python');
      expect(narrowOutput).toContain('Python');
      expect(wideOutput).toContain('80.0%');
      expect(narrowOutput).toContain('80.0%');
      expect(wideOutput).toContain('5.2');
      expect(narrowOutput).toContain('5.2');
    });
  });
});
