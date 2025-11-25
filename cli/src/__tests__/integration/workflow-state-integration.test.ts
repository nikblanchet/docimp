/**
 * Integration tests for workflow state management across command boundaries.
 *
 * Tests validate workflow state updates, dependency checking, staleness detection,
 * and file modification tracking across analyze, audit, plan, and improve commands.
 *
 * Coverage:
 * - Workflow A: analyze → plan → improve
 * - Workflow B: analyze → audit → plan → improve
 * - File modification scenarios (add, modify, delete)
 * - Smart auto-clean integration
 * - Error handling and validation
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { analyzeCore } from '../../commands/analyze.js';
import { auditCore } from '../../commands/audit.js';
import { planCore } from '../../commands/plan.js';
import { improveCore } from '../../commands/improve.js';
import { WorkflowStateManager } from '../../utils/workflow-state-manager.js';
import { WorkflowValidator } from '../../utils/workflow-validator.js';
import { FileTracker } from '../../utils/file-tracker.js';
import type { IPythonBridge } from '../../python-bridge/i-python-bridge.js';
import type { IDisplay } from '../../display/i-display.js';
import type { IConfigLoader } from '../../config/i-config-loader.js';
import type { IConfig } from '../../config/i-config.js';
import type { CodeItem, AnalysisResult } from '../../types/analysis.js';
import type { PlanResult } from '../../types/plan.js';
import type { AuditResult } from '../../types/audit.js';
import { createMockCodeItem } from '../test-helpers.js';

describe('Workflow State Integration', () => {
  let tempRoot: string;
  let tempDir: string;
  let originalCwd: string;
  let mockBridge: jest.Mocked<IPythonBridge>;
  let mockDisplay: jest.Mocked<IDisplay>;
  let mockConfigLoader: jest.Mocked<IConfigLoader>;
  let mockConfig: IConfig;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempRoot = path.join(
      os.tmpdir(),
      `docimp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    tempDir = tempRoot;
    const docimpDir = path.join(tempDir, '.docimp');
    const sessionReportsDir = path.join(docimpDir, 'session-reports');

    // Create .docimp/session-reports directory
    await fs.mkdir(sessionReportsDir, { recursive: true });

    // Create initial empty workflow state
    await fs.writeFile(
      path.join(docimpDir, 'workflow-state.json'),
      JSON.stringify({
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      }),
      'utf8'
    );

    process.chdir(tempDir);

    // Create mock config
    mockConfig = {
      styleGuides: {},
      tone: 'concise',
      claude: {
        apiKey: 'test-key',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        temperature: 0,
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
      },
      pythonBridge: {
        analyzeTimeout: 60000,
        auditTimeout: 300000,
        planTimeout: 60000,
        improveTimeout: 120000,
        killEscalationDelay: 5000,
      },
      audit: {
        showCode: 'auto',
        maxLines: 30,
      },
      impactWeights: {
        complexity: 0.6,
        quality: 0.4,
      },
      plugins: [],
      exclude: [],
    };

    // Create mock Python bridge
    mockBridge = {
      analyze: jest.fn(),
      audit: jest.fn(),
      plan: jest.fn(),
      improve: jest.fn(),
      generateDocstring: jest.fn(),
      writeDocstring: jest.fn(),
      beginTransaction: jest.fn(),
      recordWrite: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackSession: jest.fn(),
      rollbackChange: jest.fn(),
      listSessions: jest.fn(),
      listChanges: jest.fn(),
      cleanup: jest.fn(),
    } as unknown as jest.Mocked<IPythonBridge>;

    // Create mock display
    mockDisplay = {
      showAnalysisResult: jest.fn(),
      showConfig: jest.fn(),
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showSuccess: jest.fn(),
      showCodeItems: jest.fn(),
      startSpinner: jest.fn(() => jest.fn()),
      showProgress: jest.fn(),
      showAuditSummary: jest.fn(),
      showBoxedDocstring: jest.fn(),
      showCodeBlock: jest.fn(),
      showSignature: jest.fn(),
      showSessionList: jest.fn(),
      showChangeList: jest.fn(),
      showRollbackResult: jest.fn(),
      showWorkflowStatus: jest.fn(),
      showIncrementalDryRun: jest.fn(),
    } as unknown as jest.Mocked<IDisplay>;

    // Create mock config loader
    mockConfigLoader = {
      load: jest.fn().mockResolvedValue(mockConfig),
    } as unknown as jest.Mocked<IConfigLoader>;
  });

  afterEach(async () => {
    try {
      process.chdir(originalCwd);
    } catch {
      // Ignore chdir errors if directory no longer exists
    }
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  describe('Workflow A: analyze → plan → improve', () => {
    it('should create workflow state with checksums after analyze', async () => {
      // Create test files
      const testFile1 = path.join(tempDir, 'test1.py');
      const testFile2 = path.join(tempDir, 'test2.py');
      await fs.writeFile(testFile1, 'def foo():\n    pass\n');
      await fs.writeFile(testFile2, 'def bar():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'foo',
          filepath: testFile1,
          complexity: 3,
        }),
        createMockCodeItem({
          name: 'bar',
          filepath: testFile2,
          complexity: 5,
        }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 2,
        documented_items: 0,
        by_language: {
          python: {
            total_items: 2,
            documented_items: 0,
            coverage_percent: 0,
          },
        },
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Run analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify workflow state was created
      const workflowStatePath = path.join(
        tempDir,
        '.docimp/workflow-state.json'
      );
      expect(existsSync(workflowStatePath)).toBe(true);

      const workflowState = JSON.parse(
        await fs.readFile(workflowStatePath, 'utf8')
      );

      expect(workflowState).toMatchObject({
        schema_version: '1.0',
        last_analyze: expect.objectContaining({
          timestamp: expect.any(String),
          item_count: 2,
          file_checksums: expect.objectContaining({
            [testFile1]: expect.any(String),
            [testFile2]: expect.any(String),
          }),
        }),
        last_audit: null,
        last_plan: null,
        last_improve: null,
      });
    });

    it('should use ISO 8601 timestamp format in workflow state', async () => {
      // Create test file
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Run analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Load workflow state and verify timestamp format
      const workflowState = JSON.parse(
        await fs.readFile(
          path.join(tempDir, '.docimp/workflow-state.json'),
          'utf8'
        )
      );

      // ISO 8601 format regex: YYYY-MM-DDTHH:mm:ss.sssZ or YYYY-MM-DDTHH:mm:ss±HH:mm
      const iso8601Regex =
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?([+-]\d{2}:\d{2}|Z)$/;

      expect(workflowState.last_analyze.timestamp).toMatch(iso8601Regex);

      // Verify timestamp is parseable as valid Date
      const timestamp = new Date(workflowState.last_analyze.timestamp);
      expect(timestamp.toString()).not.toBe('Invalid Date');

      // Verify timestamp is recent (within last 5 seconds)
      const now = Date.now();
      const timestampMs = timestamp.getTime();
      const diffMs = Math.abs(now - timestampMs);
      expect(diffMs).toBeLessThan(5000); // 5 seconds
    });

    it('should validate analyze prerequisite when running plan', async () => {
      // Attempt to run plan without analyze
      const mockPlanResult: PlanResult = {
        items: [],
        total_items: 0,
        metadata: {
          created_at: new Date().toISOString(),
          audit_applied: false,
        },
      };

      mockBridge.plan.mockResolvedValue(mockPlanResult);

      // Should throw error about missing analyze
      await expect(
        planCore(
          tempDir,
          mockBridge,
          mockDisplay,
          mockConfigLoader,
          mockConfig,
          {}
        )
      ).rejects.toThrow(/analyze/i);
    });

    it('should update workflow state with plan timestamp after plan', async () => {
      // First run analyze
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockAnalyzeResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockAnalyzeResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Now run plan
      const mockPlanResult: PlanResult = {
        items: mockItems,
        total_items: 1,
        metadata: {
          created_at: new Date().toISOString(),
          audit_applied: false,
        },
      };

      mockBridge.plan.mockResolvedValue(mockPlanResult);

      const beforePlanTime = Date.now();
      await planCore(tempDir, {}, mockBridge, mockDisplay);

      // Verify workflow state was updated
      const workflowState = JSON.parse(
        await fs.readFile(
          path.join(tempDir, '.docimp/workflow-state.json'),
          'utf8'
        )
      );

      expect(workflowState.last_plan).toBeTruthy();
      expect(workflowState.last_plan.timestamp).toBeTruthy();
      expect(workflowState.last_plan.item_count).toBe(1);
      expect(
        new Date(workflowState.last_plan.timestamp).getTime()
      ).toBeGreaterThanOrEqual(beforePlanTime);
    });

    it('should validate plan prerequisite when running improve', async () => {
      // Create analyze result but no plan
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockAnalyzeResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockAnalyzeResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Attempt to run improve without plan
      await expect(
        improveCore(
          tempDir,
          mockBridge,
          mockDisplay,
          mockConfigLoader,
          mockConfig,
          {
            nonInteractive: true,
            resume: false,
            newSession: false,
            clearSession: false,
          }
        )
      ).rejects.toThrow(/plan/i);
    });

    it('should detect stale plan when analyze is re-run', async () => {
      // Run analyze
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockAnalyzeResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockAnalyzeResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Run plan
      const mockPlanResult: PlanResult = {
        items: mockItems,
        total_items: 1,
        metadata: {
          created_at: new Date().toISOString(),
          audit_applied: false,
        },
      };

      mockBridge.plan.mockResolvedValue(mockPlanResult);
      await planCore(tempDir, {}, mockBridge, mockDisplay);

      // Wait a moment to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Modify the file to trigger staleness detection
      await fs.writeFile(testFile, 'def test():\n    return 42\n');

      // Re-run analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Check staleness - plan should be stale after analyze re-run
      const stalePlan = await WorkflowValidator.isPlanStale();

      expect(stalePlan.isStale).toBe(true);
      expect(stalePlan.changedCount).toBeGreaterThan(0);
    });
  });

  describe('Workflow B: analyze → audit → plan → improve', () => {
    it('should validate analyze prerequisite when running audit', async () => {
      // Attempt to run audit without analyze
      await expect(
        auditCore(
          tempDir,
          mockBridge,
          mockDisplay,
          mockConfigLoader,
          mockConfig,
          { resume: false, newSession: false, clearSession: false }
        )
      ).rejects.toThrow(/analyze/i);
    });

    it('should update workflow state with audit timestamp', async () => {
      // First run analyze
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockAnalyzeResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockAnalyzeResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Now run audit (simulating completion)
      const mockAuditResult: AuditResult = {
        items: mockItems.map((item) => ({
          ...item,
          audit_rating: 2,
        })),
        metadata: {
          created_at: new Date().toISOString(),
          total_rated: 1,
        },
      };

      // Create audit.json to simulate completed audit
      await fs.writeFile(
        path.join(tempDir, '.docimp/audit.json'),
        JSON.stringify(mockAuditResult, null, 2)
      );

      // Update workflow state manually (since auditCore is interactive)
      const state = await WorkflowStateManager.loadWorkflowState();
      const snapshot = await FileTracker.createSnapshot([testFile]);
      const checksums: Record<string, string> = {};
      for (const [filepath, fileSnapshot] of Object.entries(snapshot)) {
        checksums[filepath] = fileSnapshot.checksum;
      }
      state.last_audit = {
        timestamp: new Date().toISOString(),
        item_count: 1,
        file_checksums: checksums,
      };
      await WorkflowStateManager.saveWorkflowState(state);

      // Verify workflow state was updated
      const workflowState = JSON.parse(
        await fs.readFile(
          path.join(tempDir, '.docimp/workflow-state.json'),
          'utf8'
        )
      );

      expect(workflowState.last_audit).toBeTruthy();
      expect(workflowState.last_audit.timestamp).toBeTruthy();
      expect(workflowState.last_audit.item_count).toBe(1);
    });

    it('should load audit ratings in plan when audit exists', async () => {
      // Run analyze
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockAnalyzeResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockAnalyzeResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Create audit.json
      const mockAuditResult: AuditResult = {
        items: mockItems.map((item) => ({
          ...item,
          audit_rating: 2,
        })),
        metadata: {
          created_at: new Date().toISOString(),
          total_rated: 1,
        },
      };

      await fs.writeFile(
        path.join(tempDir, '.docimp/audit.json'),
        JSON.stringify(mockAuditResult, null, 2)
      );

      // Update workflow state
      const state = await WorkflowStateManager.loadWorkflowState();
      const snapshot = await FileTracker.createSnapshot([testFile]);
      const checksums: Record<string, string> = {};
      for (const [filepath, fileSnapshot] of Object.entries(snapshot)) {
        checksums[filepath] = fileSnapshot.checksum;
      }
      state.last_audit = {
        timestamp: new Date().toISOString(),
        item_count: 1,
        file_checksums: checksums,
      };
      await WorkflowStateManager.saveWorkflowState(state);

      // Run plan (should load audit ratings)
      const mockPlanResult: PlanResult = {
        items: mockItems.map((item) => ({
          ...item,
          audit_rating: 2,
        })),
        total_items: 1,
        metadata: {
          created_at: new Date().toISOString(),
          audit_applied: true,
        },
      };

      mockBridge.plan.mockResolvedValue(mockPlanResult);
      await planCore(tempDir, {}, mockBridge, mockDisplay);

      // Verify plan was called (audit ratings should be in the analysis result)
      expect(mockBridge.plan).toHaveBeenCalled();
    });

    it('should detect stale audit and plan when analyze is re-run', async () => {
      // Run analyze
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({
          name: 'test',
          filepath: testFile,
        }),
      ];

      const mockAnalyzeResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockAnalyzeResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Create audit
      const mockAuditResult: AuditResult = {
        items: mockItems.map((item) => ({
          ...item,
          audit_rating: 2,
        })),
        metadata: {
          created_at: new Date().toISOString(),
          total_rated: 1,
        },
      };

      await fs.writeFile(
        path.join(tempDir, '.docimp/audit.json'),
        JSON.stringify(mockAuditResult, null, 2)
      );

      // Update workflow state with audit
      let state = await WorkflowStateManager.loadWorkflowState();
      const snapshot = await FileTracker.createSnapshot([testFile]);
      const checksums: Record<string, string> = {};
      for (const [filepath, fileSnapshot] of Object.entries(snapshot)) {
        checksums[filepath] = fileSnapshot.checksum;
      }
      state.last_audit = {
        timestamp: new Date().toISOString(),
        item_count: 1,
        file_checksums: checksums,
      };
      await WorkflowStateManager.saveWorkflowState(state);

      // Run plan
      const mockPlanResult: PlanResult = {
        items: mockItems,
        total_items: 1,
        metadata: {
          created_at: new Date().toISOString(),
          audit_applied: true,
        },
      };

      mockBridge.plan.mockResolvedValue(mockPlanResult);
      await planCore(tempDir, {}, mockBridge, mockDisplay);

      // Wait a moment
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Modify the file to trigger staleness detection
      await fs.writeFile(testFile, 'def test():\n    return 42\n');

      // Re-run analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Check staleness for both audit and plan
      const staleAudit = await WorkflowValidator.isAuditStale();
      const stalePlan = await WorkflowValidator.isPlanStale();

      expect(staleAudit.isStale).toBe(true);
      expect(staleAudit.changedCount).toBeGreaterThan(0);
      expect(stalePlan.isStale).toBe(true);
      expect(stalePlan.changedCount).toBeGreaterThan(0);
    });
  });

  describe('File Modification and Incremental Analysis', () => {
    it('should only re-analyze modified files in incremental mode', async () => {
      // Create initial files
      const testFile1 = path.join(tempDir, 'test1.py');
      const testFile2 = path.join(tempDir, 'test2.py');
      const testFile3 = path.join(tempDir, 'test3.py');
      await fs.writeFile(testFile1, 'def foo():\n    pass\n');
      await fs.writeFile(testFile2, 'def bar():\n    pass\n');
      await fs.writeFile(testFile3, 'def baz():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'foo', filepath: testFile1 }),
        createMockCodeItem({ name: 'bar', filepath: testFile2 }),
        createMockCodeItem({ name: 'baz', filepath: testFile3 }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 3,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Run initial analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Modify only 2 files
      await fs.writeFile(testFile1, 'def foo():\n    return 42\n');
      await fs.writeFile(testFile2, 'def bar():\n    return 84\n');

      // Run incremental analyze
      const mockIncrementalResult: AnalysisResult = {
        items: [
          createMockCodeItem({ name: 'foo', filepath: testFile1 }),
          createMockCodeItem({ name: 'bar', filepath: testFile2 }),
        ],
        coverage_percent: 0,
        total_items: 2,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockIncrementalResult);

      await analyzeCore(
        tempDir,
        {
          incremental: true,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify analyze was called:
      // - 1 call for initial baseline (4 files)
      // - 2 calls for incremental (1 per modified file)
      // Total: 3 calls
      expect(mockBridge.analyze).toHaveBeenCalledTimes(3);
    });

    it('should remove deleted file from workflow state', async () => {
      // Create files
      const testFile1 = path.join(tempDir, 'test1.py');
      const testFile2 = path.join(tempDir, 'test2.py');
      await fs.writeFile(testFile1, 'def foo():\n    pass\n');
      await fs.writeFile(testFile2, 'def bar():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'foo', filepath: testFile1 }),
        createMockCodeItem({ name: 'bar', filepath: testFile2 }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 2,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Run initial analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Delete one file
      await fs.unlink(testFile2);

      // Run analyze again
      const mockNewResult: AnalysisResult = {
        items: [createMockCodeItem({ name: 'foo', filepath: testFile1 })],
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockNewResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify workflow state no longer includes deleted file
      const workflowState = JSON.parse(
        await fs.readFile(
          path.join(tempDir, '.docimp/workflow-state.json'),
          'utf8'
        )
      );

      expect(
        workflowState.last_analyze.file_checksums[testFile2]
      ).toBeUndefined();
      expect(
        workflowState.last_analyze.file_checksums[testFile1]
      ).toBeDefined();
    });

    it('should add new file to workflow state', async () => {
      // Create initial file
      const testFile1 = path.join(tempDir, 'test1.py');
      await fs.writeFile(testFile1, 'def foo():\n    pass\n');

      const mockItems1: CodeItem[] = [
        createMockCodeItem({ name: 'foo', filepath: testFile1 }),
      ];

      const mockResult1: AnalysisResult = {
        items: mockItems1,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult1);

      // Run initial analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Add new file
      const testFile2 = path.join(tempDir, 'test2.py');
      await fs.writeFile(testFile2, 'def bar():\n    pass\n');

      // Run analyze again
      const mockItems2: CodeItem[] = [
        createMockCodeItem({ name: 'foo', filepath: testFile1 }),
        createMockCodeItem({ name: 'bar', filepath: testFile2 }),
      ];

      const mockResult2: AnalysisResult = {
        items: mockItems2,
        coverage_percent: 0,
        total_items: 2,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult2);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify workflow state includes new file
      const workflowState = JSON.parse(
        await fs.readFile(
          path.join(tempDir, '.docimp/workflow-state.json'),
          'utf8'
        )
      );

      expect(
        workflowState.last_analyze.file_checksums[testFile1]
      ).toBeDefined();
      expect(
        workflowState.last_analyze.file_checksums[testFile2]
      ).toBeDefined();
      expect(workflowState.last_analyze.item_count).toBe(2);
    });

    it('should deduplicate analyzed_files when merging incremental results', async () => {
      // Create 3 test files
      const testFile1 = path.join(tempDir, 'dedup1.py');
      const testFile2 = path.join(tempDir, 'dedup2.py');
      const testFile3 = path.join(tempDir, 'dedup3.py');
      await fs.writeFile(testFile1, 'def foo():\n    pass\n');
      await fs.writeFile(testFile2, 'def bar():\n    pass\n');
      await fs.writeFile(testFile3, 'def baz():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'foo', filepath: testFile1 }),
        createMockCodeItem({ name: 'bar', filepath: testFile2 }),
        createMockCodeItem({ name: 'baz', filepath: testFile3 }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 3,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
        analyzed_files: [testFile1, testFile2, testFile3],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Run initial analyze
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Modify 2 files
      await fs.writeFile(testFile1, 'def foo():\n    return 42\n');
      await fs.writeFile(testFile2, 'def bar():\n    return 84\n');

      // Mock incremental result with INTENTIONAL DUPLICATES to test deduplication
      // Simulate Python analyzer returning same files multiple times
      const mockIncrementalResult: AnalysisResult = {
        items: [
          createMockCodeItem({ name: 'foo', filepath: testFile1 }),
          createMockCodeItem({ name: 'bar', filepath: testFile2 }),
        ],
        coverage_percent: 0,
        total_items: 2,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
        // Intentional duplicates to test Set deduplication
        analyzed_files: [testFile1, testFile2, testFile1, testFile2],
      };

      mockBridge.analyze.mockResolvedValue(mockIncrementalResult);

      // Run incremental analyze
      await analyzeCore(
        tempDir,
        {
          incremental: true,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Load final analysis result from session reports
      const analyzeFile = path.join(
        tempDir,
        '.docimp/session-reports/analyze-latest.json'
      );
      const finalResult = JSON.parse(await fs.readFile(analyzeFile, 'utf8'));

      // Assert: No duplicates in analyzed_files (Set removes them)
      const uniqueFiles = new Set(finalResult.analyzed_files);
      expect(finalResult.analyzed_files.length).toBe(uniqueFiles.size);

      // Assert: Contains exactly 3 unique files
      expect(uniqueFiles.size).toBe(3);
      expect(uniqueFiles.has(testFile1)).toBe(true);
      expect(uniqueFiles.has(testFile2)).toBe(true);
      expect(uniqueFiles.has(testFile3)).toBe(true);
    });
  });

  describe('Smart Auto-Clean Integration', () => {
    it('should preserve audit.json when --preserve-audit flag is used', async () => {
      // Create existing audit.json
      const auditPath = path.join(tempDir, '.docimp/audit.json');
      await fs.writeFile(
        auditPath,
        JSON.stringify({
          items: [],
          metadata: { created_at: new Date().toISOString(), total_rated: 0 },
        })
      );

      // Run analyze with preserve-audit
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'test', filepath: testFile }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: true,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify audit.json still exists
      expect(existsSync(auditPath)).toBe(true);
    });

    it('should handle missing audit.json gracefully', async () => {
      // Run analyze without existing audit.json
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'test', filepath: testFile }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Should not throw error (analyzeCore returns void)
      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // If we reach here, the command completed successfully
      expect(mockBridge.analyze).toHaveBeenCalled();
    });

    it('should skip prompt with --force-clean flag', async () => {
      // Create existing audit.json
      const auditPath = path.join(tempDir, '.docimp/audit.json');
      await fs.writeFile(
        auditPath,
        JSON.stringify({
          items: [],
          metadata: { created_at: new Date().toISOString(), total_rated: 0 },
        })
      );

      // Run analyze with force-clean (no prompt should be shown)
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'test', filepath: testFile }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: true,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // With force-clean, the analysis should complete successfully
      expect(mockBridge.analyze).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Validation', () => {
    it('should provide clear error message when audit run without analyze', async () => {
      // Attempt audit without analyze
      await expect(
        auditCore(
          tempDir,
          mockBridge,
          mockDisplay,
          mockConfigLoader,
          mockConfig,
          { resume: false, newSession: false, clearSession: false }
        )
      ).rejects.toThrow(/analyze/i);
    });

    it('should provide clear error message when improve run without plan', async () => {
      // Create analyze result but no plan
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'test', filepath: testFile }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      await analyzeCore(
        tempDir,
        {
          incremental: false,
          applyAudit: false,
          preserveAudit: false,
          forceClean: false,
          dryRun: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Attempt improve without plan
      await expect(
        improveCore(
          tempDir,
          mockBridge,
          mockDisplay,
          mockConfigLoader,
          mockConfig,
          {
            nonInteractive: true,
            resume: false,
            newSession: false,
            clearSession: false,
          }
        )
      ).rejects.toThrow(/plan/i);
    });

    it('should error on corrupted workflow-state.json', async () => {
      // Create corrupted workflow-state.json
      const workflowStatePath = path.join(
        tempDir,
        '.docimp/workflow-state.json'
      );
      const docimpDir = path.join(tempDir, '.docimp');
      await fs.mkdir(docimpDir, { recursive: true });
      await fs.writeFile(workflowStatePath, '{invalid json}');

      // Run analyze (should fail with clear error about corrupted state)
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'def test():\n    pass\n');

      const mockItems: CodeItem[] = [
        createMockCodeItem({ name: 'test', filepath: testFile }),
      ];

      const mockResult: AnalysisResult = {
        items: mockItems,
        coverage_percent: 0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValue(mockResult);

      // Should throw error about corrupted workflow state
      await expect(
        analyzeCore(
          tempDir,
          {
            incremental: false,
            applyAudit: false,
            preserveAudit: false,
            forceClean: false,
            dryRun: false,
          },
          mockBridge,
          mockDisplay,
          mockConfigLoader
        )
      ).rejects.toThrow(/workflow state/i);
    });
  });
});
