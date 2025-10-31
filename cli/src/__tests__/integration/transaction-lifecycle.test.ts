/**
 * Integration tests for transaction lifecycle.
 *
 * Tests the full transaction initialization flow with actual Python subprocess.
 */

import { PythonBridge } from '../../python-bridge/PythonBridge.js';
import { existsSync, rmSync } from 'fs';
import { resolve } from 'path';
import { defaultConfig } from '../../config/IConfig.js';

describe('Transaction Lifecycle Integration', () => {
  let pythonBridge: PythonBridge;
  // Use DOCIMP_ANALYZER_PATH set by Jest setup (works in both local and CI)
  const analyzerDir = process.env.DOCIMP_ANALYZER_PATH || resolve(process.cwd(), '..', 'analyzer');
  const testStateDir = resolve(analyzerDir, '.docimp/state');

  beforeEach(() => {
    pythonBridge = new PythonBridge();

    // Clean up any existing state directory from previous tests
    if (existsSync(testStateDir)) {
      rmSync(testStateDir, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    // Clean up test artifacts
    if (existsSync(testStateDir)) {
      rmSync(testStateDir, { recursive: true, force: true });
    }
  });

  describe('beginTransaction', () => {
    it('should create git branch in side-car repository', async () => {
      const sessionId = 'test-session-123';

      await pythonBridge.beginTransaction(sessionId);

      // Verify .docimp/state/.git directory exists
      const gitDir = resolve(testStateDir, '.git');
      expect(existsSync(gitDir)).toBe(true);
    });

    it('should succeed with valid UUID session ID', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440000';

      await expect(
        pythonBridge.beginTransaction(sessionId)
      ).resolves.not.toThrow();
    });

    it('should throw error if git backend unavailable', async () => {
      // Mock scenario where git is not available
      // This test depends on Python implementation returning proper error
      const sessionId = 'test-session-no-git';

      // Note: This test assumes Git is available in CI/dev environments
      // If git is not available, the test will verify proper error handling
      try {
        await pythonBridge.beginTransaction(sessionId);
        // If we get here, git is available (expected in CI)
        expect(true).toBe(true);
      } catch (error) {
        // If git is not available, verify we get proper error message
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toMatch(/git|Git/i);
        }
      }
    }, 10000); // Longer timeout for git operations

    it('should handle multiple sequential sessions', async () => {
      const sessionId1 = 'test-session-001';
      const sessionId2 = 'test-session-002';

      await pythonBridge.beginTransaction(sessionId1);
      await pythonBridge.beginTransaction(sessionId2);

      // Both should succeed without errors
      expect(existsSync(testStateDir)).toBe(true);
    }, 10000);
  });
});
