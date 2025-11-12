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
        migration_log: [],
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

  describe('saveHistorySnapshot', () => {
    const testHistoryDir = nodePath.join(testStateDir, 'history');

    beforeEach(() => {
      mockStateManager.getHistoryDir.mockReturnValue(testHistoryDir);
    });

    it('should save timestamped snapshot atomically', async () => {
      const state = createEmptyWorkflowState();

      const snapshotPath =
        await WorkflowStateManager.saveHistorySnapshot(state);

      // Should write to temp file first
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.tmp$/),
        expect.any(String),
        'utf8'
      );

      // Then rename atomically
      expect(mockFs.rename).toHaveBeenCalled();

      // Snapshot path should be in history directory
      expect(snapshotPath).toContain(testHistoryDir);
      expect(snapshotPath).toMatch(
        /workflow-state-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json$/
      );
    });

    it('should use cross-platform safe timestamp format', async () => {
      const state = createEmptyWorkflowState();

      const snapshotPath =
        await WorkflowStateManager.saveHistorySnapshot(state);

      // Filename should not contain : or . except before extension
      const filename = nodePath.basename(snapshotPath);
      const filenameWithoutExt = filename.replace('.json', '');
      expect(filenameWithoutExt).not.toMatch(/[:.]/);
    });

    it('should ensure history directory exists before writing', async () => {
      const state = createEmptyWorkflowState();

      await WorkflowStateManager.saveHistorySnapshot(state);

      expect(mockStateManager.ensureStateDir).toHaveBeenCalled();
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
        WorkflowStateManager.saveHistorySnapshot(invalidState)
      ).rejects.toThrow();
    });

    it('should serialize full workflow state', async () => {
      const state: WorkflowState = {
        schema_version: '1.0',
        migration_log: [],
        last_analyze: {
          timestamp: '2025-01-01T00:00:00Z',
          item_count: 10,
          file_checksums: { 'file.ts': 'abc123' },
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      await WorkflowStateManager.saveHistorySnapshot(state);

      const serialized = (mockFs.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(serialized);

      expect(parsed.last_analyze).toEqual(state.last_analyze);
    });
  });

  describe('listHistorySnapshots', () => {
    const testHistoryDir = nodePath.join(testStateDir, 'history');

    beforeEach(() => {
      mockStateManager.getHistoryDir.mockReturnValue(testHistoryDir);
    });

    it('should list snapshots sorted newest first', async () => {
      const files = [
        'workflow-state-2025-01-01T10-00-00-000Z.json',
        'workflow-state-2025-01-03T10-00-00-000Z.json',
        'workflow-state-2025-01-02T10-00-00-000Z.json',
        'other-file.json',
      ];
      mockFs.readdir.mockResolvedValue(files as any);

      const snapshots = await WorkflowStateManager.listHistorySnapshots();

      expect(snapshots).toHaveLength(3);
      expect(snapshots[0]).toContain('2025-01-03'); // Newest first
      expect(snapshots[1]).toContain('2025-01-02');
      expect(snapshots[2]).toContain('2025-01-01'); // Oldest last
    });

    it('should filter out non-workflow-state files', async () => {
      const files = [
        'workflow-state-2025-01-01T10-00-00-000Z.json',
        'audit.json',
        'plan.json',
        'other.txt',
      ];
      mockFs.readdir.mockResolvedValue(files as any);

      const snapshots = await WorkflowStateManager.listHistorySnapshots();

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0]).toContain('workflow-state-');
    });

    it('should return empty array if history directory does not exist', async () => {
      const error: any = new Error('Directory not found');
      error.code = 'ENOENT';
      mockFs.readdir.mockRejectedValue(error);

      const snapshots = await WorkflowStateManager.listHistorySnapshots();

      expect(snapshots).toEqual([]);
    });

    it('should throw error for other filesystem errors', async () => {
      const error: any = new Error('Permission denied');
      error.code = 'EACCES';
      mockFs.readdir.mockRejectedValue(error);

      await expect(WorkflowStateManager.listHistorySnapshots()).rejects.toThrow(
        'Permission denied'
      );
    });

    it('should handle empty history directory', async () => {
      mockFs.readdir.mockResolvedValue([] as any);

      const snapshots = await WorkflowStateManager.listHistorySnapshots();

      expect(snapshots).toEqual([]);
    });
  });

  describe('rotateHistory', () => {
    const testHistoryDir = nodePath.join(testStateDir, 'history');

    beforeEach(() => {
      jest.clearAllMocks();
      mockStateManager.getStateDir.mockReturnValue(testStateDir);
      mockStateManager.getHistoryDir.mockReturnValue(testHistoryDir);
      mockStateManager.ensureStateDir.mockReturnValue(undefined);
      mockFs.readdir.mockResolvedValue([] as any);
      mockFs.unlink.mockResolvedValue(undefined as any);
    });

    it('should delete snapshots exceeding count limit', async () => {
      // Create 55 snapshots (exceeds default 50 limit)
      const files: string[] = [];
      for (let i = 0; i < 55; i++) {
        const timestamp = `2025-01-01T${String(i).padStart(2, '0')}-00-00-000Z`;
        files.push(`workflow-state-${timestamp}.json`);
      }
      mockFs.readdir.mockResolvedValue(files as any);

      // Mock stat to return recent timestamps (within 30 days)
      const now = Date.now();
      mockFs.stat.mockResolvedValue({
        mtimeMs: now - 1000 * 60 * 60 * 24 * 5, // 5 days ago
      } as any);

      await WorkflowStateManager.rotateHistory(50, 30);

      // Should delete 5 oldest snapshots
      expect(mockFs.unlink).toHaveBeenCalledTimes(5);
    });

    it('should delete snapshots exceeding age limit', async () => {
      const now = Date.now();
      const newFile = nodePath.join(
        testHistoryDir,
        'workflow-state-2025-01-02T00-00-00-000Z.json'
      );
      const oldFile = nodePath.join(
        testHistoryDir,
        'workflow-state-2025-01-01T00-00-00-000Z.json'
      );

      // listHistorySnapshots returns sorted newest first
      const files = [newFile, oldFile];
      mockFs.readdir.mockResolvedValue([
        'workflow-state-2025-01-02T00-00-00-000Z.json',
        'workflow-state-2025-01-01T00-00-00-000Z.json',
      ] as any);

      // Mock stat for each file when called
      mockFs.stat
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 10, // newFile: 10 days ago (ok)
        } as any)
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 40, // oldFile: 40 days ago (too old)
        } as any);

      await WorkflowStateManager.rotateHistory(50, 30);

      // Should delete 1 old snapshot
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(oldFile);
    });

    it('should use hybrid strategy (OR logic)', async () => {
      const now = Date.now();
      const newFile = nodePath.join(
        testHistoryDir,
        'workflow-state-2025-01-02T00-00-00-000Z.json'
      );
      const oldFile = nodePath.join(
        testHistoryDir,
        'workflow-state-2025-01-01T00-00-00-000Z.json'
      );

      mockFs.readdir.mockResolvedValue([
        'workflow-state-2025-01-02T00-00-00-000Z.json',
        'workflow-state-2025-01-01T00-00-00-000Z.json',
      ] as any);

      // newFile: 10 days old (fine)
      // oldFile: 40 days old (violates time limit)
      mockFs.stat
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 10,
        } as any)
        .mockResolvedValueOnce({
          mtimeMs: now - 1000 * 60 * 60 * 24 * 40,
        } as any);

      await WorkflowStateManager.rotateHistory(50, 30);

      // Should delete file violating time limit even though count is fine
      expect(mockFs.unlink).toHaveBeenCalledTimes(1);
      expect(mockFs.unlink).toHaveBeenCalledWith(oldFile);
    });

    it('should handle empty snapshot list', async () => {
      mockFs.readdir.mockResolvedValue([] as any);

      await WorkflowStateManager.rotateHistory(50, 30);

      expect(mockFs.unlink).not.toHaveBeenCalled();
    });

    it('should accept custom limits', async () => {
      const files: string[] = [];
      for (let i = 0; i < 15; i++) {
        files.push(`workflow-state-2025-01-0${i}T00-00-00-000Z.json`);
      }
      mockFs.readdir.mockResolvedValue(files as any);

      const now = Date.now();
      mockFs.stat.mockResolvedValue({
        mtimeMs: now - 1000 * 60 * 60 * 24 * 5, // 5 days ago
      } as any);

      // Custom limit: keep last 10
      await WorkflowStateManager.rotateHistory(10, 30);

      // Should delete 5 oldest snapshots
      expect(mockFs.unlink).toHaveBeenCalledTimes(5);
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
        migration_log: [],
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });
    });
  });
});
