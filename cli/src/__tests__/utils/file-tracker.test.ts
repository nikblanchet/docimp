/**
 * Tests for FileTracker utility.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { FileTracker, type CodeItem } from '../../utils/file-tracker.js';

describe('FileTracker', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = path.join(process.cwd(), '.test-tmp-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  describe('createSnapshot', () => {
    test('should create file snapshots with checksums and timestamps', async () => {
      // Create test files
      const file1 = path.join(tempDir, 'file1.py');
      const file2 = path.join(tempDir, 'file2.py');
      await fs.writeFile(file1, 'def func1():\n    pass\n', 'utf8');
      await fs.writeFile(file2, 'def func2():\n    return 42\n', 'utf8');

      const filepaths = [file1, file2];
      const snapshots = await FileTracker.createSnapshot(filepaths);

      expect(Object.keys(snapshots)).toHaveLength(2);
      expect(snapshots[file1]).toBeDefined();
      expect(snapshots[file2]).toBeDefined();

      // Verify snapshot fields
      const snapshot1 = snapshots[file1];
      expect(snapshot1.filepath).toBe(file1);
      expect(snapshot1.timestamp).toBeGreaterThan(0);
      expect(snapshot1.checksum).toHaveLength(64); // SHA256 hex digest
      expect(snapshot1.size).toBeGreaterThan(0);
    });

    test('should skip missing files silently', async () => {
      const file1 = path.join(tempDir, 'exists.py');
      await fs.writeFile(file1, 'content', 'utf8');

      const file2 = path.join(tempDir, 'missing.py'); // Doesn't exist

      const filepaths = [file1, file2];
      const snapshots = await FileTracker.createSnapshot(filepaths);

      // Only existing file should be in snapshot
      expect(Object.keys(snapshots)).toHaveLength(1);
      expect(snapshots[file1]).toBeDefined();
      expect(snapshots[file2]).toBeUndefined();
    });
  });

  describe('detectChanges', () => {
    test('should detect file changes when content is modified', async () => {
      const file1 = path.join(tempDir, 'file1.py');
      const file2 = path.join(tempDir, 'file2.py');
      await fs.writeFile(file1, 'def func1():\n    pass\n', 'utf8');
      await fs.writeFile(file2, 'def func2():\n    return 42\n', 'utf8');

      const snapshot = await FileTracker.createSnapshot([file1, file2]);

      // Modify file1 content
      await fs.writeFile(
        file1,
        'def func1_modified():\n    return 1\n',
        'utf8'
      );

      const changed = await FileTracker.detectChanges(snapshot);

      expect(changed).toHaveLength(1);
      expect(changed).toContain(file1);
      expect(changed).not.toContain(file2);
    });

    test('should return empty list when files are unchanged', async () => {
      const file1 = path.join(tempDir, 'file1.py');
      const file2 = path.join(tempDir, 'file2.py');
      await fs.writeFile(file1, 'content1', 'utf8');
      await fs.writeFile(file2, 'content2', 'utf8');

      const snapshot = await FileTracker.createSnapshot([file1, file2]);

      // No modifications
      const changed = await FileTracker.detectChanges(snapshot);

      expect(changed).toHaveLength(0);
    });

    test('should detect file deletion', async () => {
      const file1 = path.join(tempDir, 'file1.py');
      const file2 = path.join(tempDir, 'file2.py');
      await fs.writeFile(file1, 'content1', 'utf8');
      await fs.writeFile(file2, 'content2', 'utf8');

      const snapshot = await FileTracker.createSnapshot([file1, file2]);

      // Delete file1
      await fs.unlink(file1);

      const changed = await FileTracker.detectChanges(snapshot);

      expect(changed).toHaveLength(1);
      expect(changed).toContain(file1);
    });

    test('should NOT detect timestamp-only changes (same checksum)', async () => {
      const file1 = path.join(tempDir, 'file1.py');
      await fs.writeFile(file1, 'content', 'utf8');

      const snapshot = await FileTracker.createSnapshot([file1]);

      // Touch file (update timestamp without changing content)
      // Wait a bit to ensure timestamp changes
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      const now = new Date();
      await fs.utimes(file1, now, now);

      // Verify timestamp changed
      const stats = await fs.stat(file1);
      expect(stats.mtimeMs).not.toBe(snapshot[file1].timestamp);

      // Should NOT be detected as changed (same checksum)
      const changed = await FileTracker.detectChanges(snapshot);
      expect(changed).toHaveLength(0);
    });
  });

  describe('getChangedItems', () => {
    test('should filter items by changed files', () => {
      const items: CodeItem[] = [
        { filepath: '/path/to/file1.py', name: 'func1' },
        { filepath: '/path/to/file2.py', name: 'func2' },
        { filepath: '/path/to/file3.py', name: 'func3' },
      ];

      const changedFiles = ['/path/to/file1.py', '/path/to/file3.py'];

      const changedItems = FileTracker.getChangedItems(changedFiles, items);

      expect(changedItems).toHaveLength(2);
      expect(changedItems[0].name).toBe('func1');
      expect(changedItems[1].name).toBe('func3');
    });

    test('should return empty array when no files changed', () => {
      const items: CodeItem[] = [
        { filepath: '/path/to/file1.py', name: 'func1' },
        { filepath: '/path/to/file2.py', name: 'func2' },
      ];

      const changedFiles: string[] = [];

      const changedItems = FileTracker.getChangedItems(changedFiles, items);

      expect(changedItems).toHaveLength(0);
    });
  });
});
