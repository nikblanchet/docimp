/**
 * Tests for analyze command --incremental --dry-run functionality.
 *
 * Tests the dry-run preview mode for incremental analysis, which shows
 * what files would be re-analyzed without actually running the analysis.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import { analyzeCommand } from '../../commands/analyze.js';
import type { IPythonBridge } from '../../python-bridge/i-python-bridge.js';
import type { IDisplay } from '../../display/i-display.js';
import type { IConfigLoader } from '../../config/i-config-loader.js';
import type { IConfig } from '../../config/i-config.js';
import type { AnalysisResult } from '../../types/analysis.js';
import { StateManager } from '../../utils/state-manager.js';
import { WorkflowStateManager } from '../../utils/workflow-state-manager.js';
import { FileTracker } from '../../utils/file-tracker.js';
import { PathValidator } from '../../utils/path-validator.js';
import { EXIT_CODE } from '../../constants/exit-codes.js';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock filesystem operations
jest.mock('node:fs');
jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));
jest.mock('../../utils/state-manager.js');
jest.mock('../../utils/workflow-state-manager.js');
jest.mock('../../utils/file-tracker.js');
jest.mock('../../utils/path-validator.js');
jest.mock('prompts', () => ({
  default: jest.fn().mockResolvedValue({ confirm: false }),
}));

describe('analyze --incremental --dry-run', () => {
  let mockBridge: jest.Mocked<IPythonBridge>;
  let mockDisplay: jest.Mocked<IDisplay>;
  let mockConfigLoader: jest.Mocked<IConfigLoader>;
  let mockConfig: IConfig;
  let mockPreviousResult: AnalysisResult;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock Python bridge
    mockBridge = {
      analyze: jest.fn(),
      audit: jest.fn(),
      plan: jest.fn(),
      improve: jest.fn(),
      generateDocstring: jest.fn(),
      writeDocstring: jest.fn(),
      beginTransaction: jest.fn(),
      recordWrite: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackSession: jest.fn(),
      rollbackChange: jest.fn(),
      listSessions: jest.fn(),
      listChanges: jest.fn(),
      cleanup: jest.fn(),
    };

    // Mock display with all required methods
    mockDisplay = {
      showAnalysisResult: jest.fn(),
      showConfig: jest.fn(),
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showSuccess: jest.fn(),
      showCodeItems: jest.fn(),
      startSpinner: jest.fn(() => jest.fn()),
      showProgress: jest.fn(),
      showAuditSummary: jest.fn(),
      showBoxedDocstring: jest.fn(),
      showCodeBlock: jest.fn(),
      showSignature: jest.fn(),
      showSessionList: jest.fn(),
      showChangeList: jest.fn(),
      showRollbackResult: jest.fn(),
      showWorkflowStatus: jest.fn(),
      showIncrementalDryRun: jest.fn(),
    };

    // Mock config loader
    mockConfig = {
      styleGuides: {},
      tone: 'concise',
      claude: {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        temperature: 0,
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
      },
      pythonBridge: {
        timeout: 120000,
        analyzeTimeout: 300000,
        auditTimeout: 300000,
        planTimeout: 60000,
        improveTimeout: 300000,
        killEscalationDelay: 5000,
      },
      audit: {
        showCode: 'auto',
        maxLines: 20,
      },
      impactWeights: {
        complexity: 0.6,
        quality: 0.4,
      },
      plugins: [],
      exclude: [],
      jsdocStyle: {
        tagAliases: {},
        requireDescription: true,
        requireParamDescription: true,
        requireReturnDescription: true,
        requireExample: false,
      },
    };

    mockConfigLoader = {
      load: jest.fn().mockResolvedValue(mockConfig),
    };

    // Mock previous analysis result
    mockPreviousResult = {
      items: [
        {
          name: 'function1',
          type: 'function',
          filepath: '/test/file1.ts',
          line_number: 1,
          end_line: 10,
          language: 'typescript',
          complexity: 5,
          impact_score: 25,
          has_docs: false,
          parameters: [],
          return_type: 'void',
          docstring: null,
          export_type: 'named',
          module_system: 'esm',
          audit_rating: null,
        },
        {
          name: 'function2',
          type: 'function',
          filepath: '/test/file2.ts',
          line_number: 1,
          end_line: 15,
          language: 'typescript',
          complexity: 8,
          impact_score: 40,
          has_docs: true,
          parameters: [],
          return_type: 'string',
          docstring: 'Test function',
          export_type: 'named',
          module_system: 'esm',
          audit_rating: null,
        },
        {
          name: 'function3',
          type: 'function',
          filepath: '/test/file3.ts',
          line_number: 1,
          end_line: 20,
          language: 'typescript',
          complexity: 3,
          impact_score: 15,
          has_docs: false,
          parameters: [],
          return_type: 'number',
          docstring: null,
          export_type: 'named',
          module_system: 'esm',
          audit_rating: null,
        },
      ],
      coverage_percent: 33.33,
      total_items: 3,
      documented_items: 1,
      by_language: {},
      parse_failures: [],
    };

    // Mock StateManager
    (StateManager.getAnalyzeFile as jest.Mock).mockReturnValue(
      '/test/.docimp/session-reports/analyze-latest.json'
    );
    (StateManager.getAuditFile as jest.Mock).mockReturnValue(
      '/test/.docimp/audit.json'
    );
    (StateManager.ensureStateDir as jest.Mock).mockReturnValue(undefined);
    (StateManager.clearSessionReports as jest.Mock).mockReturnValue(0);

    // Mock WorkflowStateManager
    (WorkflowStateManager.loadWorkflowState as jest.Mock).mockResolvedValue({
      schema_version: '1.0',
      migration_log: [],
      last_analyze: {
        timestamp: new Date().toISOString(),
        item_count: 3,
        file_checksums: {
          '/test/file1.ts': 'checksum1',
          '/test/file2.ts': 'checksum2',
          '/test/file3.ts': 'checksum3',
        },
      },
      last_audit: null,
      last_plan: null,
      last_improve: null,
    });

    // Mock existsSync - analyze-latest.json exists, audit.json doesn't
    (existsSync as unknown as Mock).mockImplementation((path: string) => {
      if (path === '/test/.docimp/session-reports/analyze-latest.json') {
        return true;
      }
      if (path === '/test/.docimp/audit.json') {
        return false;
      }
      return false;
    });

    // Mock readFile (fs/promises) to return previous result
    (readFile as unknown as Mock).mockResolvedValue(
      JSON.stringify(mockPreviousResult)
    );

    // Mock PathValidator
    (PathValidator.validatePathExists as jest.Mock).mockReturnValue('/test');
    (PathValidator.validatePathReadable as jest.Mock).mockReturnValue(
      undefined
    );
    (PathValidator.warnIfEmpty as jest.Mock).mockReturnValue(undefined);
  });

  it('should show preview without running analysis when --dry-run is used', async () => {
    // Mock FileTracker to detect 2 changed files
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file1.ts',
      '/test/file2.ts',
    ]);

    const exitCode = await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should NOT call bridge.analyze (no actual analysis)
    expect(mockBridge.analyze).not.toHaveBeenCalled();

    // Should call showIncrementalDryRun with correct data
    expect(mockDisplay.showIncrementalDryRun).toHaveBeenCalledWith({
      changedFiles: ['/test/file1.ts', '/test/file2.ts'],
      unchangedFiles: expect.arrayContaining([
        '/test/file1.ts',
        '/test/file2.ts',
        '/test/file3.ts',
      ]),
      previousResult: expect.objectContaining({
        total_items: 3,
        documented_items: 1,
      }),
    });

    // Should return success
    expect(exitCode).toBe(EXIT_CODE.SUCCESS);
  });

  it('should show "no changes" when no files modified in dry-run', async () => {
    // Mock FileTracker to detect 0 changed files
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([]);

    const exitCode = await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should NOT call bridge.analyze
    expect(mockBridge.analyze).not.toHaveBeenCalled();

    // Should call showIncrementalDryRun with empty changedFiles
    expect(mockDisplay.showIncrementalDryRun).toHaveBeenCalledWith({
      changedFiles: [],
      unchangedFiles: expect.any(Array),
      previousResult: expect.any(Object),
    });

    expect(exitCode).toBe(EXIT_CODE.SUCCESS);
  });

  it('should not update workflow state in dry-run mode', async () => {
    // Mock FileTracker to detect 1 changed file
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file1.ts',
    ]);

    const updateSpy = jest.spyOn(WorkflowStateManager, 'updateCommandState');

    await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should NOT update workflow state
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('should not write analyze-latest.json in dry-run mode', async () => {
    // Mock FileTracker to detect 1 changed file
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file1.ts',
    ]);

    await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // writeFileSync should not be called (no file writes)
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it('should warn when --dry-run used without --incremental', async () => {
    // Mock successful analysis
    mockBridge.analyze.mockResolvedValue(mockPreviousResult);

    await analyzeCommand(
      '/test',
      {
        incremental: false,
        dryRun: true, // dry-run without incremental
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should show warning
    expect(mockDisplay.showWarning).toHaveBeenCalledWith(
      expect.stringContaining('--dry-run requires --incremental')
    );

    // Should run normal analysis (ignoring dry-run)
    expect(mockBridge.analyze).toHaveBeenCalled();
  });

  it('should fall back to full analysis message if no previous analysis exists', async () => {
    // Mock existsSync to return false (no previous analysis)
    (existsSync as unknown as Mock).mockReturnValue(false);

    // Mock successful analysis
    mockBridge.analyze.mockResolvedValue(mockPreviousResult);

    await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should show message about no previous analysis
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('No previous analysis found')
    );

    // Should run full analysis (can't do incremental without previous)
    expect(mockBridge.analyze).toHaveBeenCalled();

    // Should NOT call showIncrementalDryRun (no incremental analysis possible)
    expect(mockDisplay.showIncrementalDryRun).not.toHaveBeenCalled();
  });

  it('should return previous result unchanged in dry-run mode', async () => {
    // Mock FileTracker to detect 1 changed file
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file1.ts',
    ]);

    await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should display analysis result with previous data
    expect(mockDisplay.showAnalysisResult).toHaveBeenCalledWith(
      expect.objectContaining({
        total_items: 3,
        documented_items: 1,
        coverage_percent: 33.33,
      }),
      'summary'
    );
  });

  it('should handle workflow state missing gracefully in dry-run', async () => {
    // Mock WorkflowStateManager to return null last_analyze
    (WorkflowStateManager.loadWorkflowState as jest.Mock).mockResolvedValue({
      schema_version: '1.0',
      migration_log: [],
      last_analyze: null,
      last_audit: null,
      last_plan: null,
      last_improve: null,
    });

    // Mock successful analysis
    mockBridge.analyze.mockResolvedValue(mockPreviousResult);

    await analyzeCommand(
      '/test',
      {
        incremental: true,
        dryRun: true,
        format: 'summary',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should show message about workflow state missing
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Workflow state missing')
    );

    // Should run full analysis
    expect(mockBridge.analyze).toHaveBeenCalled();
  });
});
