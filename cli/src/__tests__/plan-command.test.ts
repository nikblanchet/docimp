/**
 * Tests for plan command path validation.
 */

import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { planCore } from '../commands/plan';
import type { IPythonBridge } from '../python-bridge/IPythonBridge';
import type { IDisplay } from '../display/IDisplay';
import type { PlanResult } from '../types/analysis';

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
    toString() {
      return '';
    }
  };
});

describe('plan command path validation', () => {
  let tempDir: string;
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockResult: PlanResult;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'docimp-plan-test-'));

    // Mock plan result
    mockResult = {
      items: [],
      total_items: 0,
      missing_docs_count: 0,
      poor_quality_count: 0,
    };

    // Mock PythonBridge
    mockBridge = {
      analyze: jest.fn(),
      audit: jest.fn(),
      plan: jest.fn().mockResolvedValue(mockResult),
      suggest: jest.fn(),
      apply: jest.fn(),
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

    // Create required workflow state files for WorkflowValidator
    const fs = require('fs');
    fs.mkdirSync(join(tempDir, '.docimp/session-reports'), { recursive: true });
    fs.writeFileSync(
      join(tempDir, '.docimp/session-reports/analyze-latest.json'),
      JSON.stringify({
        items: [],
        coverage_percent: 0,
        total_items: 0,
        documented_items: 0,
        by_language: {},
      }),
      'utf8'
    );
    fs.writeFileSync(
      join(tempDir, '.docimp/workflow-state.json'),
      JSON.stringify({
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 0,
          file_checksums: {},
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      }),
      'utf8'
    );
  });

  afterEach(() => {
    // Clean up temporary directory
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('path validation', () => {
    it('throws friendly error for non-existent path', async () => {
      const nonExistentPath = join(tempDir, 'does-not-exist');

      await expect(
        planCore(nonExistentPath, { verbose: false }, mockBridge, mockDisplay)
      ).rejects.toThrow('Path not found');

      await expect(
        planCore(nonExistentPath, { verbose: false }, mockBridge, mockDisplay)
      ).rejects.toThrow('Please check that the path exists and try again');

      // Verify Python bridge was NOT called
      expect(mockBridge.plan).not.toHaveBeenCalled();
    });

    it('passes absolute path to Python bridge', async () => {
      // Run plan with valid temp directory
      await planCore(tempDir, { verbose: false }, mockBridge, mockDisplay);

      // Verify Python bridge was called with absolute path
      expect(mockBridge.plan).toHaveBeenCalledWith(
        expect.objectContaining({
          path: tempDir,
        })
      );
    });

    it('throws error for empty string path', async () => {
      await expect(
        planCore('', { verbose: false }, mockBridge, mockDisplay)
      ).rejects.toThrow('Path cannot be empty');

      // Verify Python bridge was NOT called
      expect(mockBridge.plan).not.toHaveBeenCalled();
    });

    it('warns when planning for empty directory', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      const emptyDir = join(tempDir, 'empty');
      const fs = require('fs');
      fs.mkdirSync(emptyDir);

      try {
        await planCore(emptyDir, { verbose: false }, mockBridge, mockDisplay);

        // Verify warning was issued
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Warning: Directory is empty')
        );

        // Verify Python bridge was still called (warning, not error)
        expect(mockBridge.plan).toHaveBeenCalled();
      } finally {
        consoleWarnSpy.mockRestore();
      }
    });
  });

  describe('stale detection warnings', () => {
    beforeEach(() => {
      // Setup state directory for WorkflowValidator
      const fs = require('fs');
      const stateDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(stateDir, { recursive: true });

      // Create analyze-latest.json (prerequisite for plan)
      fs.writeFileSync(
        join(stateDir, 'analyze-latest.json'),
        JSON.stringify({ items: [], total_items: 0 })
      );
    });

    it('displays warning when audit is stale', async () => {
      // Mock WorkflowValidator to return true for isAuditStale
      jest.doMock('../utils/workflow-validator.js', () => ({
        WorkflowValidator: {
          validatePlanPrerequisites: jest
            .fn()
            .mockResolvedValue({ valid: true }),
          isAuditStale: jest
            .fn()
            .mockResolvedValue({ isStale: true, changedCount: 3 }),
        },
      }));

      // Re-import planCore to get mocked WorkflowValidator
      jest.resetModules();
      const { planCore: freshPlanCore } = await import('../commands/plan.js');

      await freshPlanCore(tempDir, {}, mockBridge, mockDisplay);

      // Verify warning was displayed with file count
      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('Audit data may be stale')
      );
      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('3 file(s) modified since audit')
      );
    });

    it('does not display warning when audit is current', async () => {
      // Mock WorkflowValidator to return false for isAuditStale
      jest.doMock('../utils/workflow-validator.js', () => ({
        WorkflowValidator: {
          validatePlanPrerequisites: jest
            .fn()
            .mockResolvedValue({ valid: true }),
          isAuditStale: jest
            .fn()
            .mockResolvedValue({ isStale: false, changedCount: 0 }),
        },
      }));

      jest.resetModules();
      const { planCore: freshPlanCore } = await import('../commands/plan.js');

      await freshPlanCore(tempDir, {}, mockBridge, mockDisplay);

      // Verify no warning was displayed
      const showMessageCalls = (mockDisplay.showMessage as jest.Mock).mock
        .calls;
      const staleWarnings = showMessageCalls.filter((call) =>
        call[0].includes('Audit data may be stale')
      );
      expect(staleWarnings).toHaveLength(0);
    });
  });
});
