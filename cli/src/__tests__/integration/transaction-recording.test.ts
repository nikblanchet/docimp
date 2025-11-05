/**
 * Integration tests for transaction recording.
 *
 * Tests the full change tracking flow with actual Python subprocess calls.
 */

import { PythonBridge } from '../../python-bridge/python-bridge.js';
import { existsSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Transaction Recording Integration', () => {
  let pythonBridge: PythonBridge;
  // Use DOCIMP_ANALYZER_PATH set by Jest setup (works in both local and CI)
  const analyzerDir =
    process.env.DOCIMP_ANALYZER_PATH ||
    resolve(process.cwd(), '..', 'analyzer');
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

  describe('recordWrite', () => {
    it('should create git commit after recording write', async () => {
      const sessionId = 'test-session-record-write';

      // Begin transaction
      await pythonBridge.beginTransaction(sessionId);

      // Create a test file in analyzer directory
      const testFile = resolve(analyzerDir, 'test_example.py');
      writeFileSync(testFile, 'def example():\n    pass\n');

      try {
        // Write documentation (simulating what InteractiveSession does)
        const backupPath = `${testFile}.20251030-120000.bak`;
        await pythonBridge.apply({
          filepath: testFile,
          item_name: 'example',
          item_type: 'function',
          docstring: 'Example function.',
          language: 'python',
          backup_path: backupPath,
        });

        // Record the write
        await pythonBridge.recordWrite(
          sessionId,
          testFile,
          backupPath,
          'example',
          'function',
          'python'
        );

        // Verify git commit was created
        const { stdout } = await execAsync(
          `git --git-dir=${testStateDir}/.git --work-tree=${analyzerDir} log --format=%H -1`,
          { cwd: analyzerDir }
        );

        expect(stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
      } finally {
        // Clean up test file
        if (existsSync(testFile)) {
          rmSync(testFile);
        }
        const backupFile = `${testFile}.20251030-120000.bak`;
        if (existsSync(backupFile)) {
          rmSync(backupFile);
        }
      }
    }, 15000);

    it('should include metadata in commit message', async () => {
      const sessionId = 'test-session-metadata';

      // Begin transaction
      await pythonBridge.beginTransaction(sessionId);

      // Create a test file
      const testFile = resolve(analyzerDir, 'test_metadata.py');
      writeFileSync(testFile, 'def calculate():\n    pass\n');

      try {
        // Write and record
        const backupPath = `${testFile}.20251030-120001.bak`;
        await pythonBridge.apply({
          filepath: testFile,
          item_name: 'calculate',
          item_type: 'function',
          docstring: 'Calculate something.',
          language: 'python',
          backup_path: backupPath,
        });

        await pythonBridge.recordWrite(
          sessionId,
          testFile,
          backupPath,
          'calculate',
          'function',
          'python'
        );

        // Get commit message
        const { stdout } = await execAsync(
          `git --git-dir=${testStateDir}/.git --work-tree=${analyzerDir} log --format=%B -1`,
          { cwd: analyzerDir }
        );

        // Verify metadata is present
        expect(stdout).toContain('docimp: Add docs to calculate');
        expect(stdout).toContain('Metadata-Version: 1');
        expect(stdout).toContain('item_name: calculate');
        expect(stdout).toContain('item_type: function');
        expect(stdout).toContain('language: python');
        expect(stdout).toContain(`filepath: ${testFile}`);
        expect(stdout).toContain(`backup_path: ${backupPath}`);
      } finally {
        // Clean up
        if (existsSync(testFile)) {
          rmSync(testFile);
        }
        const backupFile = `${testFile}.20251030-120001.bak`;
        if (existsSync(backupFile)) {
          rmSync(backupFile);
        }
      }
    }, 15000);

    it('should preserve backup file after recording', async () => {
      const sessionId = 'test-session-backup';

      // Begin transaction
      await pythonBridge.beginTransaction(sessionId);

      // Create a test file
      const testFile = resolve(analyzerDir, 'test_backup.py');
      const originalContent = 'def backup_test():\n    pass\n';
      writeFileSync(testFile, originalContent);

      const backupPath = `${testFile}.20251030-120002.bak`;

      try {
        // Write documentation
        await pythonBridge.apply({
          filepath: testFile,
          item_name: 'backup_test',
          item_type: 'function',
          docstring: 'Backup test function.',
          language: 'python',
          backup_path: backupPath,
        });

        // Record the write
        await pythonBridge.recordWrite(
          sessionId,
          testFile,
          backupPath,
          'backup_test',
          'function',
          'python'
        );

        // Verify backup file exists
        expect(existsSync(backupPath)).toBe(true);

        // Verify backup contains original content
        const backupContent = readFileSync(backupPath, 'utf8');
        expect(backupContent).toBe(originalContent);
      } finally {
        // Clean up
        if (existsSync(testFile)) {
          rmSync(testFile);
        }
        if (existsSync(backupPath)) {
          rmSync(backupPath);
        }
      }
    }, 15000);

    it('should handle multiple writes in same session', async () => {
      const sessionId = 'test-session-multiple';

      // Begin transaction
      await pythonBridge.beginTransaction(sessionId);

      // Create two test files
      const testFile1 = resolve(analyzerDir, 'test_multi1.py');
      const testFile2 = resolve(analyzerDir, 'test_multi2.py');
      writeFileSync(testFile1, 'def first():\n    pass\n');
      writeFileSync(testFile2, 'def second():\n    pass\n');

      try {
        // Write and record first file
        const backupPath1 = `${testFile1}.20251030-120003.bak`;
        await pythonBridge.apply({
          filepath: testFile1,
          item_name: 'first',
          item_type: 'function',
          docstring: 'First function.',
          language: 'python',
          backup_path: backupPath1,
        });
        await pythonBridge.recordWrite(
          sessionId,
          testFile1,
          backupPath1,
          'first',
          'function',
          'python'
        );

        // Write and record second file
        const backupPath2 = `${testFile2}.20251030-120004.bak`;
        await pythonBridge.apply({
          filepath: testFile2,
          item_name: 'second',
          item_type: 'function',
          docstring: 'Second function.',
          language: 'python',
          backup_path: backupPath2,
        });
        await pythonBridge.recordWrite(
          sessionId,
          testFile2,
          backupPath2,
          'second',
          'function',
          'python'
        );

        // Verify two commits were created
        const { stdout } = await execAsync(
          `git --git-dir=${testStateDir}/.git --work-tree=${analyzerDir} log --format=%H`,
          { cwd: analyzerDir }
        );

        const commits = stdout.trim().split('\n');
        expect(commits.length).toBeGreaterThanOrEqual(2);
      } finally {
        // Clean up
        [testFile1, testFile2].forEach((file) => {
          if (existsSync(file)) {
            rmSync(file);
          }
        });
        [
          `${testFile1}.20251030-120003.bak`,
          `${testFile2}.20251030-120004.bak`,
        ].forEach((backup) => {
          if (existsSync(backup)) {
            rmSync(backup);
          }
        });
      }
    }, 15000);
  });
});
