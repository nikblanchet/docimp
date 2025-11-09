/**
 * Unit tests for status command.
 *
 * Tests the status command including bridge calls, display rendering,
 * and error handling.
 */

import { statusCommand, statusCore } from '../../commands/status.js';
import { EXIT_CODE } from '../../constants/exit-codes.js';
import type { IDisplay } from '../../display/i-display.js';
import type { IPythonBridge } from '../../python-bridge/i-python-bridge.js';
import type { WorkflowStatusResult } from '../../types/analysis.js';

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

describe('status command', () => {
  let mockBridge: jest.Mocked<IPythonBridge>;
  let mockDisplay: jest.Mocked<IDisplay>;

  beforeEach(() => {
    // Create mock bridge
    mockBridge = {
      status: jest.fn(),
    } as unknown as jest.Mocked<IPythonBridge>;

    // Create mock display
    mockDisplay = {
      showWorkflowStatus: jest.fn(),
      showError: jest.fn(),
    } as unknown as jest.Mocked<IDisplay>;
  });

  describe('statusCore', () => {
    it('should call bridge.status() and display.showWorkflowStatus()', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T12:00:00Z',
            item_count: 23,
            file_count: 5,
          },
          { command: 'audit', status: 'not_run' },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [],
        suggestions: [
          "Run 'docimp audit <path>' to rate documentation quality",
        ],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockBridge.status).toHaveBeenCalledTimes(1);
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
    });

    it('should display empty workflow state correctly', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          { command: 'analyze', status: 'not_run' },
          { command: 'audit', status: 'not_run' },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [],
        suggestions: ["Run 'docimp analyze <path>' to analyze your codebase"],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
    });

    it('should display status with staleness warnings', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T14:00:00Z',
            item_count: 23,
            file_count: 5,
          },
          {
            command: 'audit',
            status: 'run',
            timestamp: '2025-01-01T12:00:00Z',
            item_count: 18,
            file_count: 5,
          },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: ['audit is stale (analyze re-run since audit)'],
        suggestions: ["Run 'docimp audit <path>' to refresh quality ratings"],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
      expect(mockStatus.staleness_warnings).toHaveLength(1);
    });

    it('should display status with file modifications', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T10:00:00Z',
            item_count: 23,
            file_count: 5,
          },
          { command: 'audit', status: 'not_run' },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [
          'analyze is stale (3 file(s) modified since last run)',
        ],
        suggestions: ["Run 'docimp analyze --incremental' to update analysis"],
        file_modifications: 3,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
      expect(mockStatus.file_modifications).toBe(3);
    });

    it('should display full workflow state (all commands run)', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T10:00:00Z',
            item_count: 23,
            file_count: 5,
          },
          {
            command: 'audit',
            status: 'run',
            timestamp: '2025-01-01T10:30:00Z',
            item_count: 18,
            file_count: 5,
          },
          {
            command: 'plan',
            status: 'run',
            timestamp: '2025-01-01T11:00:00Z',
            item_count: 12,
            file_count: 5,
          },
          {
            command: 'improve',
            status: 'run',
            timestamp: '2025-01-01T11:30:00Z',
            item_count: 8,
            file_count: 3,
          },
        ],
        staleness_warnings: [],
        suggestions: [],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
      expect(mockStatus.staleness_warnings).toHaveLength(0);
      expect(mockStatus.suggestions).toHaveLength(0);
    });
  });

  describe('statusCommand', () => {
    it('should return EXIT_CODE.SUCCESS on successful execution', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T12:00:00Z',
            item_count: 23,
            file_count: 5,
          },
          { command: 'audit', status: 'not_run' },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [],
        suggestions: [],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      const exitCode = await statusCommand(mockBridge, mockDisplay);

      // Assert
      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
      expect(mockDisplay.showError).not.toHaveBeenCalled();
    });

    it('should return EXIT_CODE.ERROR when bridge throws error', async () => {
      // Arrange
      const error = new Error('Failed to load workflow state');
      mockBridge.status.mockRejectedValue(error);

      // Act
      const exitCode = await statusCommand(mockBridge, mockDisplay);

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(
        'Failed to load workflow state'
      );
    });

    it('should handle non-Error exceptions gracefully', async () => {
      // Arrange
      mockBridge.status.mockRejectedValue('Unexpected error string');

      // Act
      const exitCode = await statusCommand(mockBridge, mockDisplay);

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(
        'Unexpected error string'
      );
    });

    it('should handle workflow state file not found error', async () => {
      // Arrange
      const error = new Error(
        'workflow-state.json not found - run docimp analyze first'
      );
      mockBridge.status.mockRejectedValue(error);

      // Act
      const exitCode = await statusCommand(mockBridge, mockDisplay);

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(error.message);
    });

    it('should handle corrupted workflow state file error', async () => {
      // Arrange
      const error = new Error('Invalid workflow state: corrupted JSON');
      mockBridge.status.mockRejectedValue(error);

      // Act
      const exitCode = await statusCommand(mockBridge, mockDisplay);

      // Assert
      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith(error.message);
    });
  });

  describe('edge cases', () => {
    it('should handle status with multiple staleness warnings', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T15:00:00Z',
            item_count: 25,
            file_count: 6,
          },
          {
            command: 'audit',
            status: 'run',
            timestamp: '2025-01-01T13:00:00Z',
            item_count: 20,
            file_count: 6,
          },
          {
            command: 'plan',
            status: 'run',
            timestamp: '2025-01-01T14:00:00Z',
            item_count: 15,
            file_count: 6,
          },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [
          'audit is stale (analyze re-run since audit)',
          'plan is stale (analyze re-run since plan)',
        ],
        suggestions: [
          "Run 'docimp audit <path>' to refresh quality ratings",
          "Run 'docimp plan <path>' to regenerate plan with latest data",
        ],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
      expect(mockStatus.staleness_warnings).toHaveLength(2);
      expect(mockStatus.suggestions).toHaveLength(2);
    });

    it('should handle status with zero item_count', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          {
            command: 'analyze',
            status: 'run',
            timestamp: '2025-01-01T12:00:00Z',
            item_count: 0,
            file_count: 0,
          },
          { command: 'audit', status: 'not_run' },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [],
        suggestions: ['No items found in analysis. Check your codebase path.'],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
      expect(mockStatus.commands[0].item_count).toBe(0);
    });

    it('should handle status with undefined optional fields', async () => {
      // Arrange
      const mockStatus: WorkflowStatusResult = {
        commands: [
          { command: 'analyze', status: 'not_run' },
          { command: 'audit', status: 'not_run' },
          { command: 'plan', status: 'not_run' },
          { command: 'improve', status: 'not_run' },
        ],
        staleness_warnings: [],
        suggestions: ["Run 'docimp analyze <path>' to analyze your codebase"],
        file_modifications: 0,
      };

      mockBridge.status.mockResolvedValue(mockStatus);

      // Act
      await statusCore(mockBridge, mockDisplay);

      // Assert
      expect(mockDisplay.showWorkflowStatus).toHaveBeenCalledWith(mockStatus);
      // Verify no timestamp/item_count fields present
      expect(mockStatus.commands[0].timestamp).toBeUndefined();
      expect(mockStatus.commands[0].item_count).toBeUndefined();
    });
  });
});
