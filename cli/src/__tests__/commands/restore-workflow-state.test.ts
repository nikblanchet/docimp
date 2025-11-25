/**
 * Unit tests for restore-workflow-state command.
 *
 * Tests the restore-workflow-state command including snapshot validation,
 * backup creation, restore logic, and error handling.
 */

import { promises as fs } from 'node:fs';
import prompts from 'prompts';
import {
  restoreWorkflowStateCommand,
  restoreWorkflowStateCore,
} from '../../commands/restore-workflow-state.js';
import { EXIT_CODE } from '../../constants/exit-codes.js';
import { createEmptyWorkflowState } from '../../types/workflow-state.js';
import { StateManager } from '../../utils/state-manager.js';
import { WorkflowStateManager } from '../../utils/workflow-state-manager.js';

// Mock fs promises
jest.mock('node:fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    rename: jest.fn(),
    copyFile: jest.fn(),
  },
}));

// Mock StateManager
jest.mock('../../utils/state-manager.js');

// Mock WorkflowStateManager
jest.mock('../../utils/workflow-state-manager.js');

// Mock prompts
jest.mock('prompts');

// Mock chalk
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    cyan: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    gray: (str: string) => str,
  },
  bold: (str: string) => str,
  cyan: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  gray: (str: string) => str,
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('restore-workflow-state command', () => {
  const testSnapshotPath =
    '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json';
  const testStateDir = '/path/.docimp';
  const testCurrentStateFile = '/path/.docimp/workflow-state.json';

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

    // Reset prompts mock
    (prompts as unknown as jest.Mock).mockReset();

    // Mock StateManager
    jest.spyOn(StateManager, 'getStateDir').mockReturnValue(testStateDir);

    // Mock WorkflowStateManager
    jest.spyOn(WorkflowStateManager, 'exists').mockResolvedValue(true);
    jest
      .spyOn(WorkflowStateManager, 'loadWorkflowState')
      .mockResolvedValue(createEmptyWorkflowState());
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('restoreWorkflowStateCore', () => {
    it('should restore snapshot with force option', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, { force: true });

      // Assert
      expect(mockFs.access).toHaveBeenCalledWith(testSnapshotPath);
      expect(mockFs.readFile).toHaveBeenCalledWith(testSnapshotPath, 'utf8');
      expect(mockFs.copyFile).toHaveBeenCalledWith(
        testCurrentStateFile,
        expect.stringMatching(/\.backup-\d+\.json$/)
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        JSON.stringify(mockSnapshot, null, 2),
        'utf8'
      );
      expect(mockFs.rename).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        testCurrentStateFile
      );
    });

    it('should show preview in dry-run mode', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, { dryRun: true });

      // Assert
      expect(mockFs.access).toHaveBeenCalled();
      expect(mockFs.readFile).toHaveBeenCalled();
      expect(mockFs.copyFile).not.toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('Dry run mode')
      );
    });

    it('should throw error if snapshot file does not exist', async () => {
      // Arrange
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      // Act & Assert
      await expect(
        restoreWorkflowStateCore(testSnapshotPath, {})
      ).rejects.toThrow('Snapshot file not found');
    });

    it('should throw error if snapshot file is invalid JSON', async () => {
      // Arrange
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json {');

      // Act & Assert
      await expect(
        restoreWorkflowStateCore(testSnapshotPath, {})
      ).rejects.toThrow();
    });

    it('should throw error if snapshot fails schema validation', async () => {
      // Arrange
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify({ invalid: 'schema' }));

      // Act & Assert
      await expect(
        restoreWorkflowStateCore(testSnapshotPath, {})
      ).rejects.toThrow('Invalid snapshot file');
    });

    it('should handle restore when no current state exists', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      jest.spyOn(WorkflowStateManager, 'exists').mockResolvedValue(false);

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, { force: true });

      // Assert
      expect(mockFs.copyFile).not.toHaveBeenCalled(); // No backup needed
      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.rename).toHaveBeenCalled();
    });

    it('should prompt for confirmation without force option', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      (prompts as unknown as jest.Mock).mockResolvedValue({ value: true });

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, {});

      // Assert
      expect(prompts).toHaveBeenCalledWith({
        type: 'confirm',
        name: 'value',
        message: 'Proceed with restore?',
        initial: false,
      });
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should cancel restore if user declines confirmation', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));

      (prompts as unknown as jest.Mock).mockResolvedValue({ value: false });

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, {});

      // Assert
      expect(prompts).toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('cancelled')
      );
    });

    it('should cancel restore if user presses Ctrl+C', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));

      (prompts as unknown as jest.Mock).mockResolvedValue({
        value: undefined,
      }); // Ctrl+C

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, {});

      // Assert
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('cancelled')
      );
    });
  });

  describe('restoreWorkflowStateCommand', () => {
    it('should return EXIT_CODE.SUCCESS on successful restore', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      // Act
      const exitCode = await restoreWorkflowStateCommand(testSnapshotPath, {
        force: true,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should return EXIT_CODE.ERROR when snapshot file not found', async () => {
      // Arrange
      mockFs.access.mockRejectedValue(new Error('ENOENT'));

      // Act
      const exitCode = await restoreWorkflowStateCommand(testSnapshotPath, {});

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Snapshot file not found')
      );
    });

    it('should return EXIT_CODE.ERROR when snapshot is invalid', async () => {
      // Arrange
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json');

      // Act
      const exitCode = await restoreWorkflowStateCommand(testSnapshotPath, {});

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(consoleSpy.error).toHaveBeenCalled();
    });

    it('should handle file system errors during backup', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.copyFile.mockRejectedValue(new Error('Permission denied'));

      // Act
      const exitCode = await restoreWorkflowStateCommand(testSnapshotPath, {
        force: true,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied')
      );
    });

    it('should handle file system errors during restore', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      // Act
      const exitCode = await restoreWorkflowStateCommand(testSnapshotPath, {
        force: true,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('Disk full')
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long snapshot path', async () => {
      // Arrange
      const longPath = `/very/long/path/${'repeat/'.repeat(50)}workflow-state-2025-01-12T14-30-00-123Z.json`;
      const mockSnapshot = createEmptyWorkflowState();
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));

      // Act
      await restoreWorkflowStateCore(longPath, { dryRun: true });

      // Assert
      expect(mockFs.access).toHaveBeenCalledWith(longPath);
      expect(mockFs.readFile).toHaveBeenCalledWith(longPath, 'utf8');
    });

    it('should handle snapshot with all workflow commands populated', async () => {
      // Arrange
      const mockSnapshot = createEmptyWorkflowState();
      mockSnapshot.last_analyze = {
        timestamp: '2025-01-12T10:00:00Z',
        item_count: 23,
        file_checksums: { 'file.py': 'abc123' },
      };
      mockSnapshot.last_audit = {
        timestamp: '2025-01-12T11:00:00Z',
        item_count: 18,
        file_checksums: { 'file.py': 'abc123' },
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockSnapshot));
      mockFs.copyFile.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, { force: true });

      // Assert
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        JSON.stringify(mockSnapshot, null, 2),
        'utf8'
      );
    });

    it('should truncate very large snapshots in dry-run preview', async () => {
      // Arrange
      const largeSnapshot = createEmptyWorkflowState();
      // Add many checksums to make JSON large
      largeSnapshot.last_analyze = {
        timestamp: '2025-01-12T10:00:00Z',
        item_count: 1000,
        file_checksums: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [`file${i}.py`, 'abc123'])
        ),
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(largeSnapshot));

      // Act
      await restoreWorkflowStateCore(testSnapshotPath, { dryRun: true });

      // Assert
      expect(consoleSpy.log).toHaveBeenCalledWith(
        expect.stringContaining('truncated')
      );
    });
  });
});
