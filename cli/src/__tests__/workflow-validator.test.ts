import * as fs from 'fs/promises';
import { WorkflowValidator } from '../utils/workflow-validator.js';
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
      expect(result.error).toContain('Analysis results not found');
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
      expect(result.error).toContain('Analysis results not found');
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
      expect(result.error).toContain('Plan file not found');
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
      expect(result.error).toContain('Plan is stale');
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

  describe('isAuditStale', () => {
    it('should return false if audit has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {}),
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result).toBe(false);
    });

    it('should return false if analyze has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: createCommandState(5, {}),
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result).toBe(false);
    });

    it('should return true if analyze is newer than audit', async () => {
      const auditTime = new Date('2025-01-01T11:00:00Z');
      const analyzeTime = new Date('2025-01-01T12:00:00Z');

      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: analyzeTime.toISOString(),
          item_count: 10,
          file_checksums: {},
        },
        last_audit: {
          timestamp: auditTime.toISOString(),
          item_count: 5,
          file_checksums: {},
        },
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result).toBe(true);
    });

    it('should return false if audit is newer than or equal to analyze', async () => {
      const analyzeTime = new Date('2025-01-01T11:00:00Z');
      const auditTime = new Date('2025-01-01T12:00:00Z');

      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: {
          timestamp: analyzeTime.toISOString(),
          item_count: 10,
          file_checksums: {},
        },
        last_audit: {
          timestamp: auditTime.toISOString(),
          item_count: 5,
          file_checksums: {},
        },
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isAuditStale();

      expect(result).toBe(false);
    });
  });

  describe('isPlanStale', () => {
    it('should return false if plan has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: createCommandState(10, {}),
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result).toBe(false);
    });

    it('should return false if analyze has not been run', async () => {
      mockWorkflowStateManager.loadWorkflowState.mockResolvedValue({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: createCommandState(5, {}),
        last_improve: null,
      });

      const result = await WorkflowValidator.isPlanStale();

      expect(result).toBe(false);
    });

    it('should return true if analyze is newer than plan', async () => {
      const planTime = new Date('2025-01-01T11:00:00Z');
      const analyzeTime = new Date('2025-01-01T12:00:00Z');

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

      const result = await WorkflowValidator.isPlanStale();

      expect(result).toBe(true);
    });

    it('should return false if plan is newer than or equal to analyze', async () => {
      const analyzeTime = new Date('2025-01-01T11:00:00Z');
      const planTime = new Date('2025-01-01T12:00:00Z');

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

      const result = await WorkflowValidator.isPlanStale();

      expect(result).toBe(false);
    });
  });
});
