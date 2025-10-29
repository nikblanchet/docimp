/**
 * Tests for analyze command auto-clean functionality.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analyzeCore } from '../commands/analyze';
import type { IPythonBridge } from '../python-bridge/IPythonBridge';
import type { IDisplay } from '../display/IDisplay';
import type { IConfigLoader } from '../config/IConfigLoader';
import type { AnalysisResult } from '../types/AnalysisResult';
import { defaultConfig } from '../config/IConfig';

// Mock ESM modules that Jest can't handle
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    blue: (str: string) => str,
    cyan: (str: string) => str,
  },
  bold: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  blue: (str: string) => str,
  cyan: (str: string) => str,
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

describe('analyze command auto-clean', () => {
  let tempDir: string;
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockConfigLoader: IConfigLoader;
  let mockResult: AnalysisResult;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'docimp-analyze-test-'));

    // Mock analysis result
    mockResult = {
      items: [],
      coverage_percent: 0,
      total_items: 0,
      documented_items: 0,
      by_language: {},
    };

    // Mock PythonBridge
    mockBridge = {
      analyze: jest.fn().mockResolvedValue(mockResult),
      audit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    // Mock ConfigLoader
    mockConfigLoader = {
      load: jest.fn().mockResolvedValue(defaultConfig),
    };

    // Mock Display
    mockDisplay = {
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showConfig: jest.fn(),
      showAnalysisResult: jest.fn(),
      showAuditSummary: jest.fn(),
      startSpinner: jest.fn().mockReturnValue(() => {}),
    };

    // Change working directory to temp dir for StateManager
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('path validation', () => {
    it('throws friendly error for non-existent path', async () => {
      const nonExistentPath = join(tempDir, 'does-not-exist');

      await expect(
        analyzeCore(
          nonExistentPath,
          { format: 'json', verbose: false },
          mockBridge,
          mockDisplay
        )
      ).rejects.toThrow('Path not found');

      await expect(
        analyzeCore(
          nonExistentPath,
          { format: 'json', verbose: false },
          mockBridge,
          mockDisplay
        )
      ).rejects.toThrow('Please check that the path exists and try again');

      // Verify Python bridge was NOT called
      expect(mockBridge.analyze).not.toHaveBeenCalled();
    });

    it('passes absolute path to Python bridge', async () => {
      // Run analyze with valid temp directory
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify Python bridge was called with absolute path
      expect(mockBridge.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          path: tempDir,
        })
      );
    });

    it('throws error for empty string path', async () => {
      await expect(
        analyzeCore('', { format: 'json', verbose: false }, mockBridge, mockDisplay)
      ).rejects.toThrow('Path cannot be empty');

      // Verify Python bridge was NOT called
      expect(mockBridge.analyze).not.toHaveBeenCalled();
    });

    it('warns when analyzing empty directory', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const emptyDir = join(tempDir, 'empty');
      const fs = require('fs');
      fs.mkdirSync(emptyDir);

      try {
        await analyzeCore(
          emptyDir,
          { format: 'json', verbose: false },
          mockBridge,
          mockDisplay,
          mockConfigLoader
        );

        // Verify warning was issued
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Warning: Directory is empty')
        );

        // Verify Python bridge was still called (warning, not error)
        expect(mockBridge.analyze).toHaveBeenCalled();
      } finally {
        consoleWarnSpy.mockRestore();
      }
    });
  });

  describe('auto-clean behavior', () => {
    it('clears session reports by default', async () => {
      // Setup: Create state directory with old reports
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const auditFile = join(sessionDir, 'audit.json');
      const planFile = join(sessionDir, 'plan.json');

      // Create directories
      const stateDir = join(tempDir, '.docimp');
      const historyDir = join(tempDir, '.docimp', 'history');

      // Use require to avoid import issues with fs
      const fs = require('fs');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.mkdirSync(historyDir, { recursive: true });

      // Create old report files
      writeFileSync(auditFile, '{"ratings": {}}');
      writeFileSync(planFile, '{"items": []}');

      // Verify files exist before
      expect(existsSync(auditFile)).toBe(true);
      expect(existsSync(planFile)).toBe(true);

      // Run analyze without --keep-old-reports
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify files were cleared
      expect(existsSync(auditFile)).toBe(false);
      expect(existsSync(planFile)).toBe(false);

      // Verify analyze was called
      expect(mockBridge.analyze).toHaveBeenCalled();
    });

    it('preserves session reports with --keep-old-reports flag', async () => {
      // Setup: Create state directory with old reports
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const auditFile = join(sessionDir, 'audit.json');
      const planFile = join(sessionDir, 'plan.json');

      // Create directories
      const stateDir = join(tempDir, '.docimp');
      const historyDir = join(tempDir, '.docimp', 'history');

      const fs = require('fs');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.mkdirSync(historyDir, { recursive: true });

      // Create old report files
      writeFileSync(auditFile, '{"ratings": {"test": "data"}}');
      writeFileSync(planFile, '{"items": [{"name": "test"}]}');

      // Verify files exist before
      expect(existsSync(auditFile)).toBe(true);
      expect(existsSync(planFile)).toBe(true);

      // Run analyze with --keep-old-reports
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false, keepOldReports: true },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify files were preserved
      expect(existsSync(auditFile)).toBe(true);
      expect(existsSync(planFile)).toBe(true);

      // Verify content is unchanged
      const auditContent = JSON.parse(readFileSync(auditFile, 'utf-8'));
      const planContent = JSON.parse(readFileSync(planFile, 'utf-8'));
      expect(auditContent.ratings.test).toBe('data');
      expect(planContent.items[0].name).toBe('test');

      // Verify analyze was called
      expect(mockBridge.analyze).toHaveBeenCalled();
    });

    it('displays message when clearing reports', async () => {
      // Setup: Create state directory with old reports
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const auditFile = join(sessionDir, 'audit.json');

      const fs = require('fs');
      fs.mkdirSync(join(tempDir, '.docimp'), { recursive: true });
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.mkdirSync(join(tempDir, '.docimp', 'history'), { recursive: true });

      writeFileSync(auditFile, '{"ratings": {}}');

      // Run analyze
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify message was displayed
      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('Cleared')
      );
    });

    it('displays message when keeping reports in verbose mode', async () => {
      // Setup: Create state directory
      const fs = require('fs');
      fs.mkdirSync(join(tempDir, '.docimp', 'session-reports'), { recursive: true });
      fs.mkdirSync(join(tempDir, '.docimp', 'history'), { recursive: true });

      // Run analyze with --keep-old-reports and --verbose
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: true, keepOldReports: true },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify message was displayed
      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        'Keeping previous session reports'
      );
    });
  });

  describe('saving analysis results', () => {
    it('saves result to analyze-latest.json', async () => {
      // Run analyze
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify analyze-latest.json was created
      const analyzeFile = join(tempDir, '.docimp', 'session-reports', 'analyze-latest.json');
      expect(existsSync(analyzeFile)).toBe(true);

      // Verify content
      const content = JSON.parse(readFileSync(analyzeFile, 'utf-8'));
      expect(content).toEqual(mockResult);
    });

    it('displays save location in verbose mode', async () => {
      // Run analyze with --verbose
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: true },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify message was displayed
      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('Analysis saved to:')
      );
    });
  });

  describe('parse failures display', () => {
    it('displays parse failures in terminal output', async () => {
      // Mock analysis result with parse failures
      const mockResultWithFailures: AnalysisResult = {
        items: [],
        coverage_percent: 0,
        total_items: 0,
        documented_items: 0,
        by_language: {},
        parse_failures: [
          { filepath: 'broken.py', error: 'SyntaxError: invalid syntax (missing colon)' },
          { filepath: 'malformed.ts', error: 'SyntaxError: Unexpected token' }
        ]
      };

      // Update mock bridge to return failures
      mockBridge.analyze = jest.fn().mockResolvedValue(mockResultWithFailures);

      // Run analyze
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify showAnalysisResult was called with parse failures
      expect(mockDisplay.showAnalysisResult).toHaveBeenCalledWith(
        expect.objectContaining({
          parse_failures: expect.arrayContaining([
            expect.objectContaining({ filepath: 'broken.py' }),
            expect.objectContaining({ filepath: 'malformed.ts' })
          ])
        }),
        expect.any(String) // format parameter
      );
    });

    it('continues analysis when some files fail to parse', async () => {
      // Mock result with successful items AND parse failures
      const mockResultWithMixedOutcome: AnalysisResult = {
        items: [
          {
            name: 'validFunction',
            type: 'function',
            filepath: 'valid.py',
            line_number: 1,
            end_line: 5,
            language: 'python',
            complexity: 2,
            impact_score: 10,
            has_docs: false,
            parameters: [],
            return_type: null,
            docstring: null,
            export_type: 'internal',
            module_system: 'unknown',
            audit_rating: null
          }
        ],
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: { python: { total: 1, documented: 0, coverage_percent: 0 } },
        parse_failures: [
          { filepath: 'broken.py', error: 'SyntaxError: invalid syntax' }
        ]
      };

      mockBridge.analyze = jest.fn().mockResolvedValue(mockResultWithMixedOutcome);

      // Run analyze
      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify analysis completed successfully despite parse failure
      expect(mockDisplay.showAnalysisResult).toHaveBeenCalled();
      expect(mockBridge.analyze).toHaveBeenCalled();

      // Verify both successful items and failures are present in result
      const callArg = (mockDisplay.showAnalysisResult as jest.Mock).mock.calls[0][0];
      expect(callArg.items.length).toBe(1);
      expect(callArg.parse_failures.length).toBe(1);
    });
  });
});
