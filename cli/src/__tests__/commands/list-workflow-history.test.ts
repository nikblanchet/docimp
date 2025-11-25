/**
 * Unit tests for list-workflow-history command.
 *
 * Tests the list-workflow-history command including listing snapshots,
 * display rendering, and error handling.
 */

import {
  listWorkflowHistoryCommand,
  listWorkflowHistoryCore,
} from '../../commands/list-workflow-history.js';
import { EXIT_CODE } from '../../constants/exit-codes.js';
import type { IDisplay } from '../../display/i-display.js';
import { WorkflowStateManager } from '../../utils/workflow-state-manager.js';

// Mock WorkflowStateManager
jest.mock('../../utils/workflow-state-manager.js');

// Mock chalk for colorful output
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

describe('list-workflow-history command', () => {
  let mockDisplay: jest.Mocked<IDisplay>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock display
    mockDisplay = {
      showWorkflowHistory: jest.fn(),
      showError: jest.fn(),
    } as unknown as jest.Mocked<IDisplay>;
  });

  describe('listWorkflowHistoryCore', () => {
    it('should list all snapshots and display them', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
        '/path/.docimp/history/workflow-state-2025-01-11T16-45-00-789Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false });

      // Assert
      expect(WorkflowStateManager.listHistorySnapshots).toHaveBeenCalledTimes(
        1
      );
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        false
      );
    });

    it('should handle empty snapshot list', async () => {
      // Arrange
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([]);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false });

      // Assert
      expect(WorkflowStateManager.listHistorySnapshots).toHaveBeenCalledTimes(
        1
      );
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith([], false);
    });

    it('should apply limit when specified', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
        '/path/.docimp/history/workflow-state-2025-01-11T16-45-00-789Z.json',
        '/path/.docimp/history/workflow-state-2025-01-11T12-00-00-000Z.json',
        '/path/.docimp/history/workflow-state-2025-01-10T08-30-00-111Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false, limit: 3 });

      // Assert
      expect(WorkflowStateManager.listHistorySnapshots).toHaveBeenCalledTimes(
        1
      );
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots.slice(0, 3),
        false
      );
    });

    it('should output JSON when json option is true', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: true });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        true
      );
    });

    it('should handle limit of 0 (no snapshots displayed)', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false, limit: 0 });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith([], false);
    });

    it('should not apply limit when limit is undefined', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
        '/path/.docimp/history/workflow-state-2025-01-11T16-45-00-789Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, {
        json: false,
        limit: undefined,
      });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        false
      );
    });

    it('should handle limit greater than number of snapshots', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false, limit: 10 });

      // Assert
      // slice(0, 10) on 2 items returns all 2 items
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        false
      );
    });
  });

  describe('listWorkflowHistoryCommand', () => {
    it('should return EXIT_CODE.SUCCESS on successful execution', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      const exitCode = await listWorkflowHistoryCommand(mockDisplay, {
        json: false,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
      expect(mockDisplay.showError).not.toHaveBeenCalled();
    });

    it('should return EXIT_CODE.SUCCESS when no snapshots exist', async () => {
      // Arrange
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue([]);

      // Act
      const exitCode = await listWorkflowHistoryCommand(mockDisplay, {
        json: false,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
      expect(mockDisplay.showError).not.toHaveBeenCalled();
    });

    it('should return EXIT_CODE.ERROR when listHistorySnapshots throws error', async () => {
      // Arrange
      const error = new Error('Failed to read history directory');
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockRejectedValue(error);

      // Act
      const exitCode = await listWorkflowHistoryCommand(mockDisplay, {
        json: false,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(
        'Failed to read history directory'
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockRejectedValue('Unexpected error string');

      // Act
      const exitCode = await listWorkflowHistoryCommand(mockDisplay, {
        json: false,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(
        'Unexpected error string'
      );
    });

    it('should handle file system errors', async () => {
      // Arrange
      const error = new Error('EACCES: permission denied');
      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockRejectedValue(error);

      // Act
      const exitCode = await listWorkflowHistoryCommand(mockDisplay, {
        json: false,
      });

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(error.message);
    });
  });

  describe('edge cases', () => {
    it('should handle single snapshot', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        false
      );
    });

    it('should handle large number of snapshots', async () => {
      // Arrange
      const mockSnapshots = Array.from(
        { length: 100 },
        (_, i) =>
          `/path/.docimp/history/workflow-state-2025-01-${String(12 - Math.floor(i / 10)).padStart(2, '0')}T10-00-00-${String(i).padStart(3, '0')}Z.json`
      );

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        false
      );
      expect(mockSnapshots).toHaveLength(100);
    });

    it('should handle limit equal to snapshot count', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
        '/path/.docimp/history/workflow-state-2025-01-11T16-45-00-789Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: false, limit: 3 });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots,
        false
      );
    });

    it('should handle json mode with limit', async () => {
      // Arrange
      const mockSnapshots = [
        '/path/.docimp/history/workflow-state-2025-01-12T14-30-00-123Z.json',
        '/path/.docimp/history/workflow-state-2025-01-12T10-00-00-456Z.json',
        '/path/.docimp/history/workflow-state-2025-01-11T16-45-00-789Z.json',
      ];

      jest
        .spyOn(WorkflowStateManager, 'listHistorySnapshots')
        .mockResolvedValue(mockSnapshots);

      // Act
      await listWorkflowHistoryCore(mockDisplay, { json: true, limit: 2 });

      // Assert
      expect(mockDisplay.showWorkflowHistory).toHaveBeenCalledWith(
        mockSnapshots.slice(0, 2),
        true
      );
    });
  });
});
