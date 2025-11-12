import * as fs from 'fs/promises';
import {
  WorkflowValidator,
  compareFileChecksums,
} from '../utils/workflow-validator.js';
import { WorkflowStateManager } from '../utils/workflow-state-manager.js';
import { StateManager } from '../utils/state-manager.js';
import { createCommandState } from '../types/workflow-state.js';

jest.mock('fs/promises');
jest.mock('../utils/state-manager');
jest.mock('../utils/workflow-state-manager');

const mockFs = fs as jest.Mocked<typeof fs>;
const mockStateManager = StateManager as jest.Mocked<typeof StateManager>;
const mockWorkflowStateManager = WorkflowStateManager as jest.Mocked<
  typeof WorkflowStateManager
>;

describe('WorkflowValidator', () => {
  const testAnalyzeFile = '/test/.docimp/session-reports/analyze-latest.json';
  const testPlanFile = '/test/.docimp/session-reports/plan.json';

  beforeEach(() => {
    jest.clearAllMocks();
    mockStateManager.getAnalyzeFile.mockReturnValue(testAnalyzeFile);
    mockStateManager.getPlanFile.mockReturnValue(testPlanFile);
  });

  describe('validateAuditPrerequisites', () => {
    it('should return valid if analyze file exists and workflow state is current', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, { 'file.ts': 'abc' }),
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.validateAuditPrerequisites();

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.suggestion).toBeUndefined();
    });

    it('should return invalid if analyze file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await WorkflowValidator.validateAuditPrerequisites();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('analysis results not found');
      expect(result.suggestion).toContain('docimp analyze');
    });

    it('should return invalid if workflow state is missing despite file existing', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.validateAuditPrerequisites();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('workflow state is missing');
      expect(result.suggestion).toContain('Re-run');
    });

    it('should return valid if skipValidation is true', async () => {
      const result = await WorkflowValidator.validateAuditPrerequisites(true);

      expect(result.valid).toBe(true);
      expect(mockFs.access).not.toHaveBeenCalled();
    });
  });

  describe('validatePlanPrerequisites', () => {
    it('should return valid if analyze file exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await WorkflowValidator.validatePlanPrerequisites();

      expect(result.valid).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(testAnalyzeFile);
    });

    it('should return invalid if analyze file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await WorkflowValidator.validatePlanPrerequisites();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('analysis results not found');
      expect(result.suggestion).toContain('docimp analyze');
    });

    it('should return valid if skipValidation is true', async () => {
      const result = await WorkflowValidator.validatePlanPrerequisites(true);

      expect(result.valid).toBe(true);
      expect(mockFs.access).not.toHaveBeenCalled();
    });
  });

  describe('validateImprovePrerequisites', () => {
    it('should return valid if plan file exists and is current', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {}),
        last_audit: null,
        last_plan: createCommandState(5, {}),
        last_improve: null,
      });

      const result = await WorkflowValidator.validateImprovePrerequisites();

      expect(result.valid).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(testPlanFile);
    });

    it('should return invalid if plan file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const result = await WorkflowValidator.validateImprovePrerequisites();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('plan file not found');
      expect(result.suggestion).toContain('docimp plan');
    });

    it('should return invalid if plan is stale (analyze newer than plan)', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const analyzeTime = new Date('2025-01-01T12:00:00Z');
      const planTime = new Date('2025-01-01T11:00:00Z'); // 1 hour earlier

      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: analyzeTime.toISOString(),
          item_count: 10,
          file_checksums: {},
        },
        last_audit: null,
        last_plan: {
          timestamp: planTime.toISOString(),
          item_count: 5,
          file_checksums: {},
        },
        last_improve: null,
      });

      const result = await WorkflowValidator.validateImprovePrerequisites();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('plan is stale');
      expect(result.suggestion).toContain('Re-run');
    });

    it('should return valid if plan is current (plan newer than analyze)', async () => {
      mockFs.access.mockResolvedValue(undefined);

      const analyzeTime = new Date('2025-01-01T11:00:00Z');
      const planTime = new Date('2025-01-01T12:00:00Z'); // 1 hour later

      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: analyzeTime.toISOString(),
          item_count: 10,
          file_checksums: {},
        },
        last_audit: null,
        last_plan: {
          timestamp: planTime.toISOString(),
          item_count: 5,
          file_checksums: {},
        },
        last_improve: null,
      });

      const result = await WorkflowValidator.validateImprovePrerequisites();

      expect(result.valid).toBe(true);
    });

    it('should return valid if skipValidation is true', async () => {
      const result = await WorkflowValidator.validateImprovePrerequisites(true);

      expect(result.valid).toBe(true);
      expect(mockFs.access).not.toHaveBeenCalled();
    });
  });

  describe('isAnalyzeStale', () => {
    it('should return false if no analyze has been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAnalyzeStale();

      expect(result).toBe(false);
    });

    it('should return true if any file has been modified', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 1,
          file_checksums: { 'file.ts': 'old-checksum' },
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      mockFs.readFile.mockResolvedValue('new content');

      const result = await WorkflowValidator.isAnalyzeStale();

      expect(result).toBe(true);
    });

    it('should return false if no files have been modified', async () => {
      const fileContent = 'unchanged content';
      const crypto = await import('crypto');
      const checksum = crypto
        .createHash('sha256')
        .update(fileContent)
        .digest('hex');

      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 1,
          file_checksums: { 'file.ts': checksum },
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      mockFs.readFile.mockResolvedValue(fileContent);

      const result = await WorkflowValidator.isAnalyzeStale();

      expect(result).toBe(false);
    });

    it('should return true if file is missing', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 1,
          file_checksums: { 'file.ts': 'checksum' },
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      mockFs.readFile.mockRejectedValue(new Error('File not found'));

      const result = await WorkflowValidator.isAnalyzeStale();

      expect(result).toBe(true);
    });
  });

  describe('compareFileChecksums', () => {
    it('should return no changes if all checksums match', () => {
      const newer = createCommandState(10, {
        'file1.ts': 'abc123',
        'file2.ts': 'def456',
      });
      const older = createCommandState(5, {
        'file1.ts': 'abc123',
        'file2.ts': 'def456',
      });

      const result = compareFileChecksums(newer, older);

      expect(result.hasChanges).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should detect modified files', () => {
      const newer = createCommandState(10, {
        'file1.ts': 'newchecksum',
        'file2.ts': 'def456',
      });
      const older = createCommandState(5, {
        'file1.ts': 'oldchecksum',
        'file2.ts': 'def456',
      });

      const result = compareFileChecksums(newer, older);

      expect(result.hasChanges).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should detect removed files', () => {
      const newer = createCommandState(10, {
        'remaining.ts': 'abc123',
      });
      const older = createCommandState(5, {
        'removed.ts': 'def456',
        'remaining.ts': 'abc123',
      });

      const result = compareFileChecksums(newer, older);

      expect(result.hasChanges).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should detect added files', () => {
      const newer = createCommandState(10, {
        'existing.ts': 'abc123',
        'new.ts': 'def456',
      });
      const older = createCommandState(5, {
        'existing.ts': 'abc123',
      });

      const result = compareFileChecksums(newer, older);

      expect(result.hasChanges).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should count multiple changes correctly', () => {
      const newer = createCommandState(10, {
        'modified1.ts': 'new1',
        'modified2.ts': 'new2',
        'unchanged.ts': 'same',
        'added.ts': 'new',
      });
      const older = createCommandState(5, {
        'modified1.ts': 'old1',
        'modified2.ts': 'old2',
        'unchanged.ts': 'same',
        'removed.ts': 'gone',
      });

      const result = compareFileChecksums(newer, older);

      expect(result.hasChanges).toBe(true);
      expect(result.changedCount).toBe(4); // 2 modified + 1 added + 1 removed
    });

    it('should throw error if newer state is missing file_checksums', () => {
      const newer = {
        timestamp: new Date().toISOString(),
        item_count: 10,
        file_checksums: undefined as any,
      };
      const older = createCommandState(5, { 'file.ts': 'abc' });

      expect(() => compareFileChecksums(newer, older)).toThrow(
        'Cannot compare file checksums'
      );
    });

    it('should throw error if older state is missing file_checksums', () => {
      const newer = createCommandState(10, { 'file.ts': 'abc' });
      const older = {
        timestamp: new Date().toISOString(),
        item_count: 5,
        file_checksums: undefined as any,
      };

      expect(() => compareFileChecksums(newer, older)).toThrow(
        'Cannot compare file checksums'
      );
    });

    it('should handle legacy workflow state with empty checksums', () => {
      // This test verifies the error is thrown (not silently swallowed)
      const legacyState = createCommandState(5, {}); // Empty checksums
      const newerState = createCommandState(3, {});

      expect(() => compareFileChecksums(newerState, legacyState)).toThrow(
        'file_checksums missing from command state'
      );
    });

    it('should throw error with actionable message for legacy data', () => {
      const legacyState = createCommandState(10, {});
      const newerState = createCommandState(10, { 'file.ts': 'abc123' });

      expect(() => compareFileChecksums(newerState, legacyState)).toThrow(
        'This may indicate legacy workflow state data'
      );

      expect(() => compareFileChecksums(newerState, legacyState)).toThrow(
        'Re-run analysis to update workflow state with checksums'
      );
    });
  });

  describe('isAuditStale', () => {
    it('should return not stale if audit has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, { 'file.ts': 'abc123' }),
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should return not stale if analyze has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: createCommandState(5, { 'file.ts': 'abc123' }),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should return stale if file checksum differs between analyze and audit', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'file.ts': 'newchecksum',
          'other.ts': 'xyz789',
        }),
        last_audit: createCommandState(5, {
          'file.ts': 'oldchecksum',
          'other.ts': 'xyz789',
        }),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should return stale if file was removed from newer analyze', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'remaining.ts': 'abc123',
        }),
        last_audit: createCommandState(5, {
          'removed.ts': 'def456',
          'remaining.ts': 'abc123',
        }),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should return stale if file was added to newer analyze', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'existing.ts': 'abc123',
          'new.ts': 'def456',
        }),
        last_audit: createCommandState(5, {
          'existing.ts': 'abc123',
        }),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should return not stale if all checksums match', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'file1.ts': 'abc123',
          'file2.ts': 'def456',
        }),
        last_audit: createCommandState(5, {
          'file1.ts': 'abc123',
          'file2.ts': 'def456',
        }),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should return correct changed count for multiple file changes', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'file1.ts': 'newchecksum1',
          'file2.ts': 'newchecksum2',
          'file3.ts': 'unchanged',
          'file4.ts': 'added',
        }),
        last_audit: createCommandState(5, {
          'file1.ts': 'oldchecksum1',
          'file2.ts': 'oldchecksum2',
          'file3.ts': 'unchanged',
          'removed.ts': 'removed',
        }),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(4); // 2 modified + 1 added + 1 removed
    });
  });

  describe('isPlanStale', () => {
    it('should return not stale if plan has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, { 'file.ts': 'abc123' }),
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should return not stale if analyze has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: createCommandState(5, { 'file.ts': 'abc123' }),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should return stale if file checksum differs between analyze and plan', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'file.ts': 'newchecksum',
          'other.ts': 'xyz789',
        }),
        last_audit: null,
        last_plan: createCommandState(5, {
          'file.ts': 'oldchecksum',
          'other.ts': 'xyz789',
        }),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should return stale if file was removed from newer analyze', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'remaining.ts': 'abc123',
        }),
        last_audit: null,
        last_plan: createCommandState(5, {
          'removed.ts': 'def456',
          'remaining.ts': 'abc123',
        }),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should return stale if file was added to newer analyze', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'existing.ts': 'abc123',
          'new.ts': 'def456',
        }),
        last_audit: null,
        last_plan: createCommandState(5, {
          'existing.ts': 'abc123',
        }),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(1);
    });

    it('should return not stale if all checksums match', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'file1.ts': 'abc123',
          'file2.ts': 'def456',
        }),
        last_audit: null,
        last_plan: createCommandState(5, {
          'file1.ts': 'abc123',
          'file2.ts': 'def456',
        }),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(false);
      expect(result.changedCount).toBe(0);
    });

    it('should return correct changed count for multiple file changes', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {
          'file1.ts': 'newchecksum1',
          'file2.ts': 'newchecksum2',
          'file3.ts': 'unchanged',
          'file4.ts': 'added',
        }),
        last_audit: null,
        last_plan: createCommandState(5, {
          'file1.ts': 'oldchecksum1',
          'file2.ts': 'oldchecksum2',
          'file3.ts': 'unchanged',
          'removed.ts': 'removed',
        }),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result.isStale).toBe(true);
      expect(result.changedCount).toBe(4); // 2 modified + 1 added + 1 removed
    });
  });
});
