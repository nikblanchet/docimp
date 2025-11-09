import * as fs from 'fs/promises';
import * as nodePath from 'path';
import { WorkflowStateManager } from '../utils/workflow-state-manager.js';
import {
  WorkflowState,
  CommandState,
  createEmptyWorkflowState,
  createCommandState,
} from '../types/workflow-state.js';
import { StateManager } from '../utils/state-manager.js';

// Mock the file system
jest.mock('fs/promises');
jest.mock('../utils/state-manager');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockStateManager = StateManager as jest.Mocked<typeof StateManager>;

describe('WorkflowStateManager', () => {
  const testStateDir = '/test/.docimp';
  const testWorkflowStateFile = nodePath.join(
    testStateDir,
    'workflow-state.json'
  );

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateManager.getStateDir.mockReturnValue(testStateDir);
    mockStateManager.ensureStateDir.mockReturnValue(undefined);
  });

  describe('saveWorkflowState', () => {
    it('should save workflow state atomically (temp + rename)', async () => {
      const state = createEmptyWorkflowState();

      await WorkflowStateManager.saveWorkflowState(state);

      // Should write to temp file first
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        `${testWorkflowStateFile}.tmp`,
        expect.any(String),
        'utf8'
      );

      // Then rename atomically
      expect(mockFs.rename).toHaveBeenCalledWith(
        `${testWorkflowStateFile}.tmp`,
        testWorkflowStateFile
      );
    });

    it('should ensure state directory exists before writing', async () => {
      const state = createEmptyWorkflowState();

      await WorkflowStateManager.saveWorkflowState(state);

      expect(mockStateManager.ensureStateDir).toHaveBeenCalled();
    });

    it('should serialize state to JSON with proper formatting', async () => {
      const state = createEmptyWorkflowState();

      await WorkflowStateManager.saveWorkflowState(state);

      const serialized = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(serialized);

      expect(parsed).toMatchObject({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });
    });

    it('should validate state against schema before saving', async () => {
      const invalidState = {
        schema_version: '2.0', // Invalid version
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      } as any;

      await expect(
        WorkflowStateManager.saveWorkflowState(invalidState)
      ).rejects.toThrow();
    });
  });

  describe('loadWorkflowState', () => {
    it('should load and validate workflow state from file', async () => {
      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: '2025-01-01T00:00:00Z',
          item_count: 10,
          file_checksums: { 'file.ts': 'abc123' },
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(state));

      const loaded = await WorkflowStateManager.loadWorkflowState();

      expect(loaded).toEqual(state);
      expect(mockFs.readFile).toHaveBeenCalledWith(
        testWorkflowStateFile,
        'utf8'
      );
    });

    it('should return empty state if file does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const loaded = await WorkflowStateManager.loadWorkflowState();

      expect(loaded).toEqual(createEmptyWorkflowState());
    });

    it('should throw error for malformed JSON', async () => {
      mockFs.readFile.mockResolvedValue('{ invalid json');

      await expect(WorkflowStateManager.loadWorkflowState()).rejects.toThrow(
        /Failed to load workflow state/
      );
    });

    it('should throw error for invalid schema', async () => {
      const invalidState = {
        schema_version: '1.0',
        last_analyze: { timestamp: 'not-iso', item_count: 'not-a-number' }, // Invalid
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidState));

      await expect(WorkflowStateManager.loadWorkflowState()).rejects.toThrow();
    });

    it('should handle all command states being populated', async () => {
      const commandState: CommandState = {
        timestamp: '2025-01-01T00:00:00Z',
        item_count: 5,
        file_checksums: { 'file.py': 'def456' },
      };

      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: commandState,
        last_audit: commandState,
        last_plan: commandState,
        last_improve: commandState,
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(state));

      const loaded = await WorkflowStateManager.loadWorkflowState();

      expect(loaded.last_analyze).toEqual(commandState);
      expect(loaded.last_audit).toEqual(commandState);
      expect(loaded.last_plan).toEqual(commandState);
      expect(loaded.last_improve).toEqual(commandState);
    });
  });

  describe('updateCommandState', () => {
    it('should update analyze command state', async () => {
      const emptyState = createEmptyWorkflowState();
      mockFs.readFile.mockResolvedValue(JSON.stringify(emptyState));

      const commandState = createCommandState(10, { 'file.ts': 'abc' });

      await WorkflowStateManager.updateCommandState('analyze', commandState);

      // Should have loaded state, updated it, and saved
      expect(mockFs.readFile).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();

      const savedData = JSON.parse(
        (mockFs.writeFile as jest.Mock).mock.calls[0][1]
      );
      expect(savedData.last_analyze).toEqual(commandState);
    });

    it('should update audit command state', async () => {
      const emptyState = createEmptyWorkflowState();
      mockFs.readFile.mockResolvedValue(JSON.stringify(emptyState));

      const commandState = createCommandState(5, { 'file.py': 'def' });

      await WorkflowStateManager.updateCommandState('audit', commandState);

      const savedData = JSON.parse(
        (mockFs.writeFile as jest.Mock).mock.calls[0][1]
      );
      expect(savedData.last_audit).toEqual(commandState);
    });

    it('should update plan command state', async () => {
      const emptyState = createEmptyWorkflowState();
      mockFs.readFile.mockResolvedValue(JSON.stringify(emptyState));

      const commandState = createCommandState(3, { 'file.js': 'ghi' });

      await WorkflowStateManager.updateCommandState('plan', commandState);

      const savedData = JSON.parse(
        (mockFs.writeFile as jest.Mock).mock.calls[0][1]
      );
      expect(savedData.last_plan).toEqual(commandState);
    });

    it('should update improve command state', async () => {
      const emptyState = createEmptyWorkflowState();
      mockFs.readFile.mockResolvedValue(JSON.stringify(emptyState));

      const commandState = createCommandState(7, { 'file.tsx': 'jkl' });

      await WorkflowStateManager.updateCommandState('improve', commandState);

      const savedData = JSON.parse(
        (mockFs.writeFile as jest.Mock).mock.calls[0][1]
      );
      expect(savedData.last_improve).toEqual(commandState);
    });

    it('should preserve other command states when updating one', async () => {
      const existingState: WorkflowState = {
        schema_version: '1.0',
        last_analyze: createCommandState(10, { 'a.ts': 'xxx' }),
        last_audit: createCommandState(8, { 'b.py': 'yyy' }),
        last_plan: null,
        last_improve: null,
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(existingState));

      const newPlanState = createCommandState(5, { 'c.js': 'zzz' });
      await WorkflowStateManager.updateCommandState('plan', newPlanState);

      const savedData = JSON.parse(
        (mockFs.writeFile as jest.Mock).mock.calls[0][1]
      );

      // Original states should be preserved
      expect(savedData.last_analyze).toEqual(existingState.last_analyze);
      expect(savedData.last_audit).toEqual(existingState.last_audit);
      // New state should be set
      expect(savedData.last_plan).toEqual(newPlanState);
      // Untouched state should remain null
      expect(savedData.last_improve).toBeNull();
    });
  });

  describe('getCommandState', () => {
    it('should return analyze command state if it exists', async () => {
      const commandState = createCommandState(10, { 'file.ts': 'abc' });
      const state: WorkflowState = {
        ...createEmptyWorkflowState(),
        last_analyze: commandState,
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(state));

      const result = await WorkflowStateManager.getCommandState('analyze');

      expect(result).toEqual(commandState);
    });

    it('should return null if command state does not exist', async () => {
      const emptyState = createEmptyWorkflowState();
      mockFs.readFile.mockResolvedValue(JSON.stringify(emptyState));

      const result = await WorkflowStateManager.getCommandState('audit');

      expect(result).toBeNull();
    });

    it('should return null if workflow state file does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.readFile.mockRejectedValue(error);

      const result = await WorkflowStateManager.getCommandState('plan');

      expect(result).toBeNull();
    });
  });

  describe('clearWorkflowState', () => {
    it('should delete workflow state file', async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await WorkflowStateManager.clearWorkflowState();

      expect(mockFs.unlink).toHaveBeenCalledWith(testWorkflowStateFile);
    });

    it('should not throw error if file does not exist', async () => {
      const error: any = new Error('File not found');
      error.code = 'ENOENT';
      mockFs.unlink.mockRejectedValue(error);

      await expect(
        WorkflowStateManager.clearWorkflowState()
      ).resolves.not.toThrow();
    });

    it('should throw error for other file system errors', async () => {
      const error: NodeJS.ErrnoException = Object.assign(
        new Error('Permission denied'),
        { code: 'EACCES' }
      );
      mockFs.unlink.mockRejectedValue(error);

      await expect(WorkflowStateManager.clearWorkflowState()).rejects.toThrow(
        'Permission denied'
      );
    });
  });

  describe('exists', () => {
    it('should return true if workflow state file exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await WorkflowStateManager.exists();

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(testWorkflowStateFile);
    });

    it('should return false if workflow state file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await WorkflowStateManager.exists();

      expect(result).toBe(false);
    });
  });

  describe('createCommandState', () => {
    it('should create command state with ISO timestamp', () => {
      const beforeTime = new Date().toISOString();
      const state = createCommandState(10, { 'file.ts': 'abc' });
      const afterTime = new Date().toISOString();

      expect(state.item_count).toBe(10);
      expect(state.file_checksums).toEqual({ 'file.ts': 'abc' });
      expect(state.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
      expect(state.timestamp >= beforeTime).toBe(true);
      expect(state.timestamp <= afterTime).toBe(true);
    });

    it('should handle empty file checksums', () => {
      const state = createCommandState(0, {});

      expect(state.item_count).toBe(0);
      expect(state.file_checksums).toEqual({});
    });
  });

  describe('createEmptyWorkflowState', () => {
    it('should create empty workflow state with version 1.0', () => {
      const state = createEmptyWorkflowState();

      expect(state).toEqual({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });
    });
  });
});
