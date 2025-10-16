/**
 * Tests for state directory management.
 */

import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, isAbsolute } from 'path';
import { StateManager } from '../utils/StateManager';

describe('StateManager', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'docimp-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getStateDir', () => {
    it('returns correct path', () => {
      const stateDir = StateManager.getStateDir(tempDir);
      const expected = resolve(tempDir, '.docimp');
      expect(stateDir).toBe(expected);
    });

    it('returns absolute path', () => {
      const stateDir = StateManager.getStateDir(tempDir);
      expect(isAbsolute(stateDir)).toBe(true);
    });

    it('works without basePath parameter', () => {
      const stateDir = StateManager.getStateDir();
      expect(isAbsolute(stateDir)).toBe(true);
      expect(stateDir).toContain('.docimp');
    });
  });

  describe('getSessionReportsDir', () => {
    it('returns correct path', () => {
      const sessionDir = StateManager.getSessionReportsDir(tempDir);
      const expected = resolve(tempDir, '.docimp', 'session-reports');
      expect(sessionDir).toBe(expected);
    });

    it('returns absolute path', () => {
      const sessionDir = StateManager.getSessionReportsDir(tempDir);
      expect(isAbsolute(sessionDir)).toBe(true);
    });
  });

  describe('getHistoryDir', () => {
    it('returns correct path', () => {
      const historyDir = StateManager.getHistoryDir(tempDir);
      const expected = resolve(tempDir, '.docimp', 'history');
      expect(historyDir).toBe(expected);
    });

    it('returns absolute path', () => {
      const historyDir = StateManager.getHistoryDir(tempDir);
      expect(isAbsolute(historyDir)).toBe(true);
    });
  });

  describe('getAuditFile', () => {
    it('returns correct path', () => {
      const auditFile = StateManager.getAuditFile(tempDir);
      const expected = resolve(tempDir, '.docimp', 'session-reports', 'audit.json');
      expect(auditFile).toBe(expected);
    });

    it('returns absolute path', () => {
      const auditFile = StateManager.getAuditFile(tempDir);
      expect(isAbsolute(auditFile)).toBe(true);
    });
  });

  describe('getPlanFile', () => {
    it('returns correct path', () => {
      const planFile = StateManager.getPlanFile(tempDir);
      const expected = resolve(tempDir, '.docimp', 'session-reports', 'plan.json');
      expect(planFile).toBe(expected);
    });

    it('returns absolute path', () => {
      const planFile = StateManager.getPlanFile(tempDir);
      expect(isAbsolute(planFile)).toBe(true);
    });
  });

  describe('getAnalyzeFile', () => {
    it('returns correct path', () => {
      const analyzeFile = StateManager.getAnalyzeFile(tempDir);
      const expected = resolve(tempDir, '.docimp', 'session-reports', 'analyze-latest.json');
      expect(analyzeFile).toBe(expected);
    });

    it('returns absolute path', () => {
      const analyzeFile = StateManager.getAnalyzeFile(tempDir);
      expect(isAbsolute(analyzeFile)).toBe(true);
    });
  });

  describe('ensureStateDir', () => {
    it('creates all required directories', () => {
      StateManager.ensureStateDir(tempDir);

      const stateDir = join(tempDir, '.docimp');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const historyDir = join(tempDir, '.docimp', 'history');

      expect(existsSync(stateDir)).toBe(true);
      expect(existsSync(sessionDir)).toBe(true);
      expect(existsSync(historyDir)).toBe(true);
    });

    it('is idempotent', () => {
      // Call multiple times
      StateManager.ensureStateDir(tempDir);
      StateManager.ensureStateDir(tempDir);
      StateManager.ensureStateDir(tempDir);

      // Should still work fine
      const stateDir = join(tempDir, '.docimp');
      expect(existsSync(stateDir)).toBe(true);
    });
  });

  describe('clearSessionReports', () => {
    it('removes all files from session-reports', () => {
      // Setup: Create state directory with files
      StateManager.ensureStateDir(tempDir);
      const sessionDir = StateManager.getSessionReportsDir(tempDir);

      // Create test files
      writeFileSync(join(sessionDir, 'audit.json'), '{"test": "data"}');
      writeFileSync(join(sessionDir, 'plan.json'), '{"test": "data"}');
      writeFileSync(join(sessionDir, 'analyze-latest.json'), '{"test": "data"}');

      // Verify files exist
      expect(existsSync(join(sessionDir, 'audit.json'))).toBe(true);
      expect(existsSync(join(sessionDir, 'plan.json'))).toBe(true);
      expect(existsSync(join(sessionDir, 'analyze-latest.json'))).toBe(true);

      // Clear
      const filesRemoved = StateManager.clearSessionReports(tempDir);

      // Verify files removed
      expect(filesRemoved).toBe(3);
      expect(existsSync(join(sessionDir, 'audit.json'))).toBe(false);
      expect(existsSync(join(sessionDir, 'plan.json'))).toBe(false);
      expect(existsSync(join(sessionDir, 'analyze-latest.json'))).toBe(false);

      // Verify directory still exists
      expect(existsSync(sessionDir)).toBe(true);
    });

    it('preserves history directory', () => {
      // Setup: Create state directory with files in both session and history
      StateManager.ensureStateDir(tempDir);
      const sessionDir = StateManager.getSessionReportsDir(tempDir);
      const historyDir = StateManager.getHistoryDir(tempDir);

      // Create files in session-reports
      writeFileSync(join(sessionDir, 'audit.json'), '{"test": "data"}');

      // Create files in history
      writeFileSync(join(historyDir, 'old-audit.json'), '{"test": "old"}');

      // Clear session reports
      StateManager.clearSessionReports(tempDir);

      // Verify session file removed
      expect(existsSync(join(sessionDir, 'audit.json'))).toBe(false);

      // Verify history file preserved
      expect(existsSync(join(historyDir, 'old-audit.json'))).toBe(true);
    });

    it('creates directory if missing', () => {
      // Don't call ensureStateDir first
      const filesRemoved = StateManager.clearSessionReports(tempDir);

      // Should not error, and should create the directory
      expect(filesRemoved).toBe(0);
      expect(existsSync(StateManager.getSessionReportsDir(tempDir))).toBe(true);
    });
  });

  describe('stateDirExists', () => {
    it('returns true when directory exists', () => {
      StateManager.ensureStateDir(tempDir);
      expect(StateManager.stateDirExists(tempDir)).toBe(true);
    });

    it('returns false when directory missing', () => {
      expect(StateManager.stateDirExists(tempDir)).toBe(false);
    });
  });

  describe('path consistency', () => {
    it('all returned paths are absolute', () => {
      const paths = [
        StateManager.getStateDir(tempDir),
        StateManager.getSessionReportsDir(tempDir),
        StateManager.getHistoryDir(tempDir),
        StateManager.getAuditFile(tempDir),
        StateManager.getPlanFile(tempDir),
        StateManager.getAnalyzeFile(tempDir),
      ];

      paths.forEach(path => {
        expect(isAbsolute(path)).toBe(true);
      });
    });
  });
});
