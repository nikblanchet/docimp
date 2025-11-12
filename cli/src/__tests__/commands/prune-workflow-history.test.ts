/**
 * Unit tests for prune-workflow-history command.
 *
 * Tests the prune-workflow-history command including age parsing,
 * pruning logic, dry-run mode, and error handling.
 */

import { promises as fs } from 'node:fs';
import {
  pruneWorkflowHistoryCommand,
  pruneWorkflowHistoryCore,
} from '../../commands/prune-workflow-history.js';
import { EXIT_CODE } from '../../constants/exit-codes.js';
import { WorkflowStateManager } from '../../utils/workflow-state-manager.js';

// Mock fs promises
jest.mock('node:fs', () => ({
  promises: {
    stat: jest.fn(),
    unlink: jest.fn(),
  },
}));

// Mock WorkflowStateManager
jest.mock('../../utils/workflow-state-manager.js');

// Mock chalk
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    cyan: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
  },
  bold: (str: string) => str,
  cyan: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('prune-workflow-history command', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };

    // Mock fs
    mockFs.unlink.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('pruneWorkflowHistoryCore', () => {
    it('should prune snapshots older than specified age', async () => {
      // Arrange
      const now = Date.now();
      const oldSnapshot =
        '/path/.docimp/history/workflow-state-2024-12-01T10-00-00-000Z.json';
      const newSnapshot =
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-000Z.json';

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([newSnapshot, oldSnapshot]);

      // Mock stat calls: once per snapshot for age check, once for display
      mockFs.stat
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 10, // 10 days ago
          size: 1024,
        } as any)
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 40, // 40 days ago
          size: 1024,
        } as any)
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 40, // For display
          size: 1024,
        } as any);

      // Act
      await pruneWorkflowHistoryCore({ olderThan: '30d' });

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(oldSnapshot);
    });

    it('should prune snapshots exceeding keep-last count', async () => {
      // Arrange
      const snapshots = [
        '/path/.docimp/history/workflow-state-2025-01-03T10-00-00-000Z.json',
        '/path/.docimp/history/workflow-state-2025-01-02T10-00-00-000Z.json',
        '/path/.docimp/history/workflow-state-2025-01-01T10-00-00-000Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(snapshots);

      mockFs.stat.mockResolvedValue({
        mtimeMs: Date.now(),
        size: 1024,
      } as any);

      // Act
      await pruneWorkflowHistoryCore({ keepLast: 2 });

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(snapshots[2]);
    });

    it('should prune using OR logic when both criteria specified', async () => {
      // Arrange
      const now = Date.now();
      const snapshots = [
        '/path/.docimp/history/workflow-state-2025-01-03T10-00-00-000Z.json', // Keep (new + within count)
        '/path/.docimp/history/workflow-state-2025-01-02T10-00-00-000Z.json', // Keep (new + within count)
        '/path/.docimp/history/workflow-state-2025-01-01T10-00-00-000Z.json', // Delete (exceeds count)
        '/path/.docimp/history/workflow-state-2024-12-01T10-00-00-000Z.json', // Delete (old + exceeds count)
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(snapshots);

      mockFs.stat
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 2,
        } as any) // 2 days
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 10,
        } as any) // 10 days
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 20,
        } as any) // 20 days
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 40,
        } as any); // 40 days

      // Act
      await pruneWorkflowHistoryCore({
        olderThan: '30d',
        keepLast: 2,
      });

      // Assert
      expect(mockFs.unlink).toHaveBeenCalledTimes(2); // Last 2 snapshots
      expect(mockFs.unlink).toHaveBeenCalledWith(snapshots[2]);
      expect(mockFs.unlink).toHaveBeenCalledWith(snapshots[3]);
    });

    it('should show preview in dry-run mode without deleting', async () => {
      // Arrange
      const snapshots = [
        '/path/.docimp/history/workflow-state-2025-01-02T10-00-00-000Z.json',
        '/path/.docimp/history/workflow-state-2025-01-01T10-00-00-000Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(snapshots);

      mockFs.stat.mockResolvedValue({
        mtimeMs: Date.now(),
        size: 1024,
      } as any);

      // Act
      await pruneWorkflowHistoryCore({ keepLast: 1, dryRun: true });

      // Assert
      expect(mockFs.unlink).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Dry run mode')
      );
    });

    it('should handle empty snapshot list', async () => {
      // Arrange
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([]);

      // Act
      await pruneWorkflowHistoryCore({ olderThan: '30d' });

      // Assert
      expect(mockFs.unlink).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('No workflow history')
      );
    });

    it('should handle no matching snapshots', async () => {
      // Arrange
      const now = Date.now();
      const snapshots = [
        '/path/.docimp/history/workflow-state-2025-01-02T10-00-00-000Z.json',
        '/path/.docimp/history/workflow-state-2025-01-01T10-00-00-000Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(snapshots);

      // All snapshots are recent (within 30 days)
      mockFs.stat.mockResolvedValue({
        mtimeMs: now - 1000 * 60 * 60 * 24 * 10, // 10 days ago
      } as any);

      // Act
      await pruneWorkflowHistoryCore({ olderThan: '30d' });

      // Assert
      expect(mockFs.unlink).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('No snapshots match')
      );
    });

    it('should throw error when no criteria specified', async () => {
      // Act & Assert
      await expect(pruneWorkflowHistoryCore({})).rejects.toThrow(
        'Must specify at least one pruning criterion'
      );
    });

    it('should parse age strings correctly', async () => {
      // Arrange
      const now = Date.now();
      const snapshot =
        '/path/.docimp/history/workflow-state-2024-01-01T10-00-00-000Z.json';

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([snapshot]);

      mockFs.stat.mockResolvedValue({
        mtimeMs: now - 1000 * 60 * 60 * 24 * 40, // 40 days ago
        size: 1024,
      } as any);

      // Test days
      await pruneWorkflowHistoryCore({ olderThan: '30d' });
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);

      // Reset
      mockFs.unlink.mockClear();

      // Test hours
      mockFs.stat.mockResolvedValue({
        mtimeMs: now - 1000 * 60 * 60 * 2, // 2 hours ago
        size: 1024,
      } as any);
      await pruneWorkflowHistoryCore({ olderThan: '1h' });
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
    });

    it('should throw error for invalid age format', async () => {
      // Act & Assert
      await expect(
        pruneWorkflowHistoryCore({ olderThan: 'invalid' })
      ).rejects.toThrow('Invalid age format');
    });
  });

  describe('pruneWorkflowHistoryCommand', () => {
    it('should return EXIT_CODE.SUCCESS on successful prune', async () => {
      // Arrange
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([]);

      // Act
      const exitCode = await pruneWorkflowHistoryCommand({ olderThan: '30d' });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should return EXIT_CODE.ERROR on invalid options', async () => {
      // Act
      const exitCode = await pruneWorkflowHistoryCommand({});

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Must specify at least one')
      );
    });

    it('should return EXIT_CODE.ERROR on invalid age format', async () => {
      // Arrange - need at least one snapshot for validation to happen
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([
          '/path/.docimp/history/workflow-state-2025-01-01T10-00-00-000Z.json',
        ]);

      // Act
      const exitCode = await pruneWorkflowHistoryCommand({
        olderThan: 'invalid',
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid age format')
      );
    });
  });
});
