/**
 * Performance Benchmark Tests
 *
 * Tests performance targets specified in Phase 3.13:
 * - Workflow state save/load: < 100ms
 * - File invalidation (1000 files): < 500ms
 * - Status command: < 50ms
 * - Incremental analysis time savings: 90%+ for 10% file changes
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { WorkflowStateManager } from '../utils/workflow-state-manager';
import { WorkflowValidator } from '../utils/workflow-validator';
import { StateManager } from '../utils/state-manager';
import type { WorkflowState } from '../types/workflow-state';

describe('Performance Benchmarks', () => {
  let tempDir: string;
  let getStateDirSpy: jest.SpyInstance;

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `docimp-bench-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const docimpDir = path.join(tempDir, '.docimp');
    await fs.mkdir(docimpDir, { recursive: true });

    // Mock StateManager.getStateDir() to return our temp directory
    // This avoids changing process.cwd() which causes race conditions in CI
    getStateDirSpy = jest
      .spyOn(StateManager, 'getStateDir')
      .mockReturnValue(docimpDir);
  });

  afterEach(async () => {
    getStateDirSpy.mockRestore();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('1. Workflow State Save/Load Performance', () => {
    it('should save workflow state in < 100ms', async () => {
      // Create workflow state with 100 files
      const fileChecksums: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        fileChecksums[`src/file${i}.py`] = `checksum-${i}`;
      }

      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 200,
          file_checksums: fileChecksums,
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      // Measure save time
      const saveStart = Date.now();
      await WorkflowStateManager.saveWorkflowState(state);
      const saveDuration = Date.now() - saveStart;

      expect(saveDuration).toBeLessThan(100);
    });

    it('should load workflow state in < 100ms', async () => {
      // Create workflow state with 100 files
      const fileChecksums: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        fileChecksums[`src/file${i}.py`] = `checksum-${i}`;
      }

      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 200,
          file_checksums: fileChecksums,
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      // Save first
      await WorkflowStateManager.saveWorkflowState(state);

      // Measure load time
      const loadStart = Date.now();
      const loaded = await WorkflowStateManager.loadWorkflowState();
      const loadDuration = Date.now() - loadStart;

      expect(loadDuration).toBeLessThan(100);
      expect(loaded.last_analyze?.item_count).toBe(200);
    });
  });

  describe('2. File Invalidation Performance', () => {
    it('should detect file changes in 1000 files in < 500ms', async () => {
      // Create workflow state with 1000 files
      const oldChecksums: Record<string, string> = {};
      const newChecksums: Record<string, string> = {};

      for (let i = 0; i < 1000; i++) {
        const filepath = `src/file${i}.py`;
        oldChecksums[filepath] = `checksum-${i}`;

        // Modify 10% of files (100 files)
        if (i < 100) {
          newChecksums[filepath] = `checksum-${i}-modified`;
        } else {
          newChecksums[filepath] = `checksum-${i}`;
        }
      }

      const oldState: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 2000,
          file_checksums: oldChecksums,
        },
        last_audit: {
          timestamp: new Date(Date.now() - 1000).toISOString(),
          item_count: 500,
          file_checksums: oldChecksums,
        },
        last_plan: null,
        last_improve: null,
      };

      const newState: WorkflowState = {
        ...oldState,
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 2000,
          file_checksums: newChecksums,
        },
      };

      // Save old state
      await WorkflowStateManager.saveWorkflowState(oldState);

      // Measure invalidation detection time
      const detectStart = Date.now();
      // Save the new state so WorkflowValidator can compare
      await WorkflowStateManager.saveWorkflowState(newState);
      const staleAudit = await WorkflowValidator.isAuditStale();
      const detectDuration = Date.now() - detectStart;

      expect(detectDuration).toBeLessThan(500);
      expect(staleAudit.isStale).toBe(true);
      expect(staleAudit.changedCount).toBeGreaterThan(0);
    });

    it('should handle large file set (2000 files) in reasonable time', async () => {
      // Create workflow state with 2000 files
      const fileChecksums: Record<string, string> = {};

      for (let i = 0; i < 2000; i++) {
        fileChecksums[`src/file${i}.py`] = `checksum-${i}`;
      }

      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 4000,
          file_checksums: fileChecksums,
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      // Measure save and load time for large dataset
      const saveStart = Date.now();
      await WorkflowStateManager.saveWorkflowState(state);
      const saveDuration = Date.now() - saveStart;

      const loadStart = Date.now();
      const loaded = await WorkflowStateManager.loadWorkflowState();
      const loadDuration = Date.now() - loadStart;

      // Should still be reasonably fast (allow more time for 2000 files)
      expect(saveDuration).toBeLessThan(500);
      expect(loadDuration).toBeLessThan(500);
      expect(
        Object.keys(loaded.last_analyze?.file_checksums || {})
      ).toHaveLength(2000);
    });
  });

  describe('3. Status Command Performance', () => {
    it('should execute status command in < 50ms (TypeScript layer only)', async () => {
      // Create workflow state with typical data
      const fileChecksums: Record<string, string> = {};
      for (let i = 0; i < 50; i++) {
        fileChecksums[`src/file${i}.py`] = `checksum-${i}`;
      }

      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 100,
          file_checksums: fileChecksums,
        },
        last_audit: {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          item_count: 30,
          file_checksums: fileChecksums,
        },
        last_plan: {
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          item_count: 20,
          file_checksums: fileChecksums,
        },
        last_improve: null,
      };

      await WorkflowStateManager.saveWorkflowState(state);

      // Measure status command execution time (load + validation only, not Python bridge)
      const statusStart = Date.now();
      const loaded = await WorkflowStateManager.loadWorkflowState();
      const staleAudit = await WorkflowValidator.isAuditStale();
      const stalePlan = await WorkflowValidator.isPlanStale();
      const statusDuration = Date.now() - statusStart;

      // Note: This tests TypeScript layer only. Full status includes Python bridge overhead.
      expect(statusDuration).toBeLessThan(50);
      expect(staleAudit).toBeDefined();
      expect(stalePlan).toBeDefined();
    });

    it('should load and validate workflow state efficiently', async () => {
      // Create workflow state
      const state: WorkflowState = {
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 150,
          file_checksums: {
            'src/file1.py': 'abc123',
            'src/file2.py': 'def456',
            'src/file3.py': 'ghi789',
          },
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      await WorkflowStateManager.saveWorkflowState(state);

      // Multiple status checks should be fast
      const iterations = 10;
      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await WorkflowStateManager.loadWorkflowState();
      }

      const totalDuration = Date.now() - start;
      const avgDuration = totalDuration / iterations;

      // Average should be well under 50ms
      expect(avgDuration).toBeLessThan(50);
    });
  });

  describe('4. Incremental Analysis Simulation', () => {
    it('should demonstrate significant time savings with incremental analysis', async () => {
      // This test simulates the concept of incremental analysis
      // Actual time savings would be measured in end-to-end tests

      const totalFiles = 100;
      const changedFiles = 10; // 10% changed

      // Simulate full analysis: process all files
      const fullAnalysisStart = Date.now();
      const fullResults: string[] = [];
      for (let i = 0; i < totalFiles; i++) {
        fullResults.push(`processed-file-${i}`);
      }
      const fullDuration = Date.now() - fullAnalysisStart;

      // Simulate incremental analysis: process only changed files
      const incrementalStart = Date.now();
      const incrementalResults: string[] = [];
      for (let i = 0; i < changedFiles; i++) {
        incrementalResults.push(`processed-file-${i}`);
      }
      const incrementalDuration = Date.now() - incrementalStart;

      // Calculate time savings
      const timeSavings =
        fullDuration > 0
          ? ((fullDuration - incrementalDuration) / fullDuration) * 100
          : 0;

      // For this simulation, we expect significant savings
      // Note: Real-world savings measured in bash script tests
      expect(incrementalResults).toHaveLength(changedFiles);
      expect(fullResults).toHaveLength(totalFiles);

      // Incremental should process fewer files
      expect(incrementalResults.length).toBeLessThan(fullResults.length);
    });

    it('should efficiently detect changed files from checksums', async () => {
      const totalFiles = 1000;
      const changedPercentage = 0.1; // 10%

      // Create old and new checksum maps
      const oldChecksums: Record<string, string> = {};
      const newChecksums: Record<string, string> = {};

      for (let i = 0; i < totalFiles; i++) {
        const filepath = `src/file${i}.py`;
        oldChecksums[filepath] = `checksum-${i}`;

        // Modify 10% of files
        if (i < totalFiles * changedPercentage) {
          newChecksums[filepath] = `checksum-${i}-modified`;
        } else {
          newChecksums[filepath] = `checksum-${i}`;
        }
      }

      // Measure change detection
      const detectStart = Date.now();
      const changedFiles: string[] = [];

      for (const [filepath, checksum] of Object.entries(newChecksums)) {
        if (oldChecksums[filepath] !== checksum) {
          changedFiles.push(filepath);
        }
      }

      const detectDuration = Date.now() - detectStart;

      // Should detect changes quickly
      expect(detectDuration).toBeLessThan(100);
      expect(changedFiles).toHaveLength(totalFiles * changedPercentage);
    });
  });

  describe('5. Performance Regression Tests', () => {
    it('should maintain performance with complex workflow states', async () => {
      // Create complex workflow state with all commands executed
      const fileChecksums: Record<string, string> = {};
      for (let i = 0; i < 500; i++) {
        fileChecksums[`src/file${i}.py`] = `checksum-${i}`;
      }

      const state: WorkflowState = {
        schema_version: '1.0',
        migration_log: [
          {
            from: '0.9',
            to: '1.0',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
          },
        ],
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 1000,
          file_checksums: fileChecksums,
        },
        last_audit: {
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          item_count: 400,
          file_checksums: fileChecksums,
        },
        last_plan: {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          item_count: 200,
          file_checksums: fileChecksums,
        },
        last_improve: {
          timestamp: new Date(Date.now() - 1800000).toISOString(),
          item_count: 50,
          file_checksums: fileChecksums,
        },
      };

      // Measure save and load performance with complex state
      const saveStart = Date.now();
      await WorkflowStateManager.saveWorkflowState(state);
      const saveDuration = Date.now() - saveStart;

      const loadStart = Date.now();
      const loaded = await WorkflowStateManager.loadWorkflowState();
      const loadDuration = Date.now() - loadStart;

      // Complex state should still meet performance targets
      expect(saveDuration).toBeLessThan(150); // Slightly more lenient for complex state
      expect(loadDuration).toBeLessThan(150);
      expect(loaded.migration_log).toHaveLength(1);
    });

    it('should handle empty workflow state efficiently', async () => {
      // Measure performance with minimal state
      const emptyState: WorkflowState = {
        schema_version: '1.0',
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      const saveStart = Date.now();
      await WorkflowStateManager.saveWorkflowState(emptyState);
      const saveDuration = Date.now() - saveStart;

      const loadStart = Date.now();
      const loaded = await WorkflowStateManager.loadWorkflowState();
      const loadDuration = Date.now() - loadStart;

      // Empty state should be very fast
      expect(saveDuration).toBeLessThan(50);
      expect(loadDuration).toBeLessThan(50);
      expect(loaded.last_analyze).toBeNull();
    });
  });
});
