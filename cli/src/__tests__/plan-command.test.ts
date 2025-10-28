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
    toString() { return ''; }
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
        planCore(
          nonExistentPath,
          { verbose: false },
          mockBridge,
          mockDisplay
        )
      ).rejects.toThrow('Path not found');

      await expect(
        planCore(
          nonExistentPath,
          { verbose: false },
          mockBridge,
          mockDisplay
        )
      ).rejects.toThrow('Please check that the path exists and try again');

      // Verify Python bridge was NOT called
      expect(mockBridge.plan).not.toHaveBeenCalled();
    });

    it('passes absolute path to Python bridge', async () => {
      // Run plan with valid temp directory
      await planCore(
        tempDir,
        { verbose: false },
        mockBridge,
        mockDisplay
      );

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
        await planCore(
          emptyDir,
          { verbose: false },
          mockBridge,
          mockDisplay
        );

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
});
