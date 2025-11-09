import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { SessionStateManager } from '../../utils/session-state-manager';
import { FileTracker } from '../../utils/file-tracker';
import type { AuditSessionState } from '../../types/audit-session-state';
import type { ImproveSessionState } from '../../types/improve-session-state';
import type { CodeItem } from '../../types/analysis';

describe('Cross-Workflow Resume Integration', () => {
  let tempRoot: string;
  let tempDir: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempRoot = path.join(
      os.tmpdir(),
      `docimp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    tempDir = tempRoot;
    const docimpDir = path.join(tempDir, '.docimp');
    const sessionReportsDir = path.join(docimpDir, 'session-reports');

    // Create .docimp/session-reports directory first
    await fs.mkdir(sessionReportsDir, { recursive: true });

    process.chdir(tempDir);

    // Create required workflow state files for WorkflowValidator
    await fs.writeFile(
      path.join(sessionReportsDir, 'analyze-latest.json'),
      JSON.stringify({
        items: [],
        coverage_percent: 0,
        total_items: 0,
        documented_items: 0,
        by_language: {},
      }),
      'utf8'
    );

    await fs.writeFile(
      path.join(docimpDir, 'workflow-state.json'),
      JSON.stringify({
        schema_version: '1.0',
        last_analyze: {
          timestamp: new Date().toISOString(),
          item_count: 0,
          file_checksums: {},
        },
        last_audit: null,
        last_plan: null,
        last_improve: null,
      }),
      'utf8'
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  describe('1. Audit → Resume → Complete → Use in Plan', () => {
    it('should complete audit workflow and verify audit.json usable in plan', async () => {
      // Create test source file
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(
        testFile,
        'def calculate_score(x, y):\n    return x + y\n'
      );

      // Create mock CodeItem
      const items: CodeItem[] = [
        {
          name: 'calculate_score',
          type: 'function',
          filepath: testFile,
          line_number: 1,
          end_line: 2,
          language: 'python',
          complexity: 2,
          impact_score: 10,
          has_docs: false,
          parameters: ['x', 'y'],
          return_type: null,
          docstring: null,
          export_type: 'internal',
          module_system: 'unknown',
          audit_rating: null,
        },
      ];

      // Step 1: Start audit session
      const snapshot = await FileTracker.createSnapshot([testFile]);
      const sessionId = randomUUID();
      const auditState: AuditSessionState = {
        session_id: sessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: snapshot,
        config: {
          showCodeMode: 'complete',
          maxLines: 20,
        },
        completed_at: null,
      };

      await SessionStateManager.saveSessionState(auditState, 'audit');

      // Step 2: Rate item (simulate user interaction)
      auditState.partial_ratings[testFile] = { calculate_score: 2 };
      auditState.current_index = 1;
      await SessionStateManager.saveSessionState(auditState, 'audit');

      // Step 3: Resume audit session
      const resumedState =
        await SessionStateManager.loadSessionState<AuditSessionState>(
          sessionId,
          'audit'
        );
      expect(resumedState.partial_ratings[testFile]?.['calculate_score']).toBe(
        2
      );
      expect(resumedState.current_index).toBe(1);

      // Step 4: Complete session
      auditState.completed_at = new Date().toISOString();
      await SessionStateManager.saveSessionState(auditState, 'audit');

      // Step 5: Generate audit.json (simulate final output)
      const auditOutput = {
        items: items.map((item) => ({
          ...item,
          audit_rating:
            resumedState.partial_ratings[item.filepath]?.[item.name] ?? null,
        })),
        by_language: {
          python: {
            total: 1,
            documented: 0,
            undocumented: 1,
            coverage_percent: 0,
          },
        },
      };

      await fs.writeFile(
        '.docimp/session-reports/audit.json',
        JSON.stringify(auditOutput, null, 2)
      );

      // Step 6: Verify audit.json exists and is valid
      const auditJson = JSON.parse(
        await fs.readFile('.docimp/session-reports/audit.json', 'utf8')
      );
      expect(auditJson.items[0]?.audit_rating).toBe(2);
      expect(auditJson.items[0]?.name).toBe('calculate_score');

      // Step 7: Verify plan can use audit.json (simulate plan command loading audit.json)
      const planInput = auditJson;
      expect(planInput.items).toHaveLength(1);
      expect(planInput.items[0]?.audit_rating).toBe(2);
    });
  });

  describe('2. Improve → Resume → Undo → Resume Again', () => {
    it('should handle improve resume with undo and re-resume', async () => {
      // Create test source file
      const testFile = path.join(tempDir, 'test.ts');
      await fs.writeFile(
        testFile,
        'function add(a: number, b: number) { return a + b; }\n'
      );

      // Create improve session
      const snapshot = await FileTracker.createSnapshot([testFile]);
      const sessionId = randomUUID();
      const improveState: ImproveSessionState = {
        session_id: sessionId,
        transaction_id: randomUUID(),
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_improvements: {},
        file_snapshot: snapshot,
        config: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        completed_at: null,
      };

      await SessionStateManager.saveSessionState(improveState, 'improve');

      // Step 1: Accept one change
      improveState.partial_improvements[testFile] = {
        add: { status: 'accepted', timestamp: new Date().toISOString() },
      };
      improveState.current_index = 1;
      await SessionStateManager.saveSessionState(improveState, 'improve');

      // Step 2: Resume session
      const resumed1 =
        await SessionStateManager.loadSessionState<ImproveSessionState>(
          sessionId,
          'improve'
        );
      expect(resumed1.partial_improvements[testFile]?.['add']?.status).toBe(
        'accepted'
      );
      expect(resumed1.current_index).toBe(1);

      // Step 3: Simulate undo (revert improvements)
      resumed1.partial_improvements = {};
      resumed1.current_index = 0;
      await SessionStateManager.saveSessionState(resumed1, 'improve');

      // Step 4: Resume again
      const resumed2 =
        await SessionStateManager.loadSessionState<ImproveSessionState>(
          sessionId,
          'improve'
        );
      expect(Object.keys(resumed2.partial_improvements)).toHaveLength(0);
      expect(resumed2.current_index).toBe(0);

      // Verify state consistency
      expect(resumed2.config.tone).toBe('concise');
      expect(resumed2.total_items).toBe(1);
    });
  });

  describe('3. File Invalidation Across Audit and Improve', () => {
    it('should detect file changes between audit and improve sessions', async () => {
      const testFile = path.join(tempDir, 'test.js');
      await fs.writeFile(testFile, '// Original content\n');

      // Create audit session with file snapshot
      const auditSnapshot = await FileTracker.createSnapshot([testFile]);
      const sessionId = randomUUID();
      const auditState: AuditSessionState = {
        session_id: sessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: { [testFile]: { someFunc: 3 } },
        file_snapshot: auditSnapshot,
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: new Date().toISOString(),
      };
      await SessionStateManager.saveSessionState(auditState, 'audit');

      // Modify file between audit and improve
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      }); // Ensure timestamp changes
      await fs.writeFile(testFile, '// Modified content\n');

      // Create improve session with new snapshot
      const improveSnapshot = await FileTracker.createSnapshot([testFile]);

      // Detect changes by comparing snapshots
      const changedFiles = await FileTracker.detectChanges(
        auditState.file_snapshot
      );

      expect(changedFiles).toContain(testFile);
      expect(improveSnapshot[testFile]?.checksum).not.toBe(
        auditSnapshot[testFile]?.checksum
      );
    });
  });

  describe('4. Multiple Concurrent Sessions', () => {
    it('should handle audit and improve sessions running concurrently', async () => {
      const auditFile = path.join(tempDir, 'audit-file.py');
      const improveFile = path.join(tempDir, 'improve-file.py');

      await fs.writeFile(auditFile, 'def audit_func(): pass\n');
      await fs.writeFile(improveFile, 'def improve_func(): pass\n');

      // Create audit session
      const auditSnapshot = await FileTracker.createSnapshot([auditFile]);
      const auditSessionId = randomUUID();
      const auditState: AuditSessionState = {
        session_id: auditSessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: auditSnapshot,
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      // Create improve session
      const improveSnapshot = await FileTracker.createSnapshot([improveFile]);
      const improveSessionId = randomUUID();
      const improveState: ImproveSessionState = {
        session_id: improveSessionId,
        transaction_id: randomUUID(),
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_improvements: {},
        file_snapshot: improveSnapshot,
        config: { styleGuides: {}, tone: 'concise' },
        completed_at: null,
      };

      // Save both sessions
      await SessionStateManager.saveSessionState(auditState, 'audit');
      await SessionStateManager.saveSessionState(improveState, 'improve');

      // List sessions of each type
      const auditSessions =
        await SessionStateManager.listSessions<AuditSessionState>('audit');
      const improveSessions =
        await SessionStateManager.listSessions<ImproveSessionState>('improve');

      expect(auditSessions).toHaveLength(1);
      expect(improveSessions).toHaveLength(1);
      expect(auditSessions[0]?.session_id).toBe(auditSessionId);
      expect(improveSessions[0]?.session_id).toBe(improveSessionId);

      // Verify no interference between sessions
      expect(auditSessions[0]?.file_snapshot[auditFile]).toBeDefined();
      expect(auditSessions[0]?.file_snapshot[improveFile]).toBeUndefined();
      expect(improveSessions[0]?.file_snapshot[improveFile]).toBeDefined();
      expect(improveSessions[0]?.file_snapshot[auditFile]).toBeUndefined();
    });
  });

  describe('5. Session Cleanup', () => {
    it('should delete old sessions correctly', async () => {
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'pass\n');
      const snapshot = await FileTracker.createSnapshot([testFile]);

      // Create multiple audit sessions
      const sessionIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const sessionId = randomUUID();
        sessionIds.push(sessionId);
        const state: AuditSessionState = {
          session_id: sessionId,
          started_at: new Date().toISOString(),
          current_index: 0,
          total_items: 1,
          partial_ratings: {},
          file_snapshot: snapshot,
          config: { showCodeMode: 'complete', maxLines: 20 },
          completed_at: null,
        };
        await SessionStateManager.saveSessionState(state, 'audit');
      }

      // Verify all sessions exist
      let allSessions =
        await SessionStateManager.listSessions<AuditSessionState>('audit');
      expect(allSessions.length).toBeGreaterThanOrEqual(3);

      // Delete one session
      await SessionStateManager.deleteSessionState(sessionIds[0]!, 'audit');

      // Verify deletion
      allSessions =
        await SessionStateManager.listSessions<AuditSessionState>('audit');
      const deletedSession = allSessions.find(
        (s) => s.session_id === sessionIds[0]
      );
      expect(deletedSession).toBeUndefined();

      // Delete remaining sessions
      await SessionStateManager.deleteSessionState(sessionIds[1]!, 'audit');
      await SessionStateManager.deleteSessionState(sessionIds[2]!, 'audit');

      // Verify all deleted
      allSessions =
        await SessionStateManager.listSessions<AuditSessionState>('audit');
      const deletedSessionIds = sessionIds.filter((id) =>
        allSessions.some((s) => s.session_id === id)
      );
      expect(deletedSessionIds).toHaveLength(0);
    });
  });

  describe('6. Corrupted Session File Recovery', () => {
    it('should handle corrupted JSON gracefully', async () => {
      // Create corrupted session file
      const corruptedFile = path.join(
        tempDir,
        '.docimp/session-reports/audit-session-corrupted.json'
      );
      await fs.writeFile(corruptedFile, '{ invalid json syntax');

      // Attempt to load corrupted session
      await expect(
        SessionStateManager.loadSessionState('corrupted', 'audit')
      ).rejects.toThrow();
    });

    it('should handle missing required fields', async () => {
      // Create session file with missing fields
      const invalidSessionId = randomUUID();
      const invalidFile = path.join(
        tempDir,
        `.docimp/session-reports/audit-session-${invalidSessionId}.json`
      );
      await fs.writeFile(
        invalidFile,
        JSON.stringify({
          session_id: invalidSessionId,
          started_at: new Date().toISOString(),
          // Missing required fields: current_index, total_items, etc.
        })
      );

      // Attempt to load invalid session (Zod validation should fail)
      await expect(
        SessionStateManager.loadSessionState(invalidSessionId, 'audit')
      ).rejects.toThrow();
    });

    it('should continue workflow after corruption error', async () => {
      // Create valid session
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'pass\n');
      const snapshot = await FileTracker.createSnapshot([testFile]);

      const validSessionId = randomUUID();
      const validState: AuditSessionState = {
        session_id: validSessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: snapshot,
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      // Create corrupted session
      const corruptedSessionId = randomUUID();
      const corruptedFile = path.join(
        tempDir,
        `.docimp/session-reports/audit-session-${corruptedSessionId}.json`
      );
      await fs.writeFile(corruptedFile, 'corrupted');

      // Verify corrupted load fails
      await expect(
        SessionStateManager.loadSessionState(corruptedSessionId, 'audit')
      ).rejects.toThrow();

      // Save valid session after encountering corruption
      await SessionStateManager.saveSessionState(validState, 'audit');

      // Verify valid session can be loaded
      const loaded =
        await SessionStateManager.loadSessionState<AuditSessionState>(
          validSessionId,
          'audit'
        );
      expect(loaded.session_id).toBe(validSessionId);
    });
  });

  describe('7. Session State Migration/Version Handling', () => {
    it('should handle future schema changes gracefully (forward compatibility test)', async () => {
      // Create session with extra fields (future schema)
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'pass\n');
      const snapshot = await FileTracker.createSnapshot([testFile]);

      const futureSessionId = randomUUID();
      const futureState = {
        session_id: futureSessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: snapshot,
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
        // Future fields
        schema_version: '2.0',
        new_feature_field: 'some value',
      };

      const futureFile = path.join(
        tempDir,
        `.docimp/session-reports/audit-session-${futureSessionId}.json`
      );
      await fs.writeFile(futureFile, JSON.stringify(futureState, null, 2));

      // Load with current schema (should ignore extra fields via Zod passthrough)
      const loaded =
        await SessionStateManager.loadSessionState<AuditSessionState>(
          futureSessionId,
          'audit'
        );

      expect(loaded.session_id).toBe(futureSessionId);
      expect(loaded.current_index).toBe(0);
      // Extra fields should be ignored but not cause errors
    });

    it('should handle old schema (backward compatibility)', async () => {
      // Create session with minimal fields (old schema)
      const testFile = path.join(tempDir, 'test.py');
      await fs.writeFile(testFile, 'pass\n');

      const oldSessionId = randomUUID();
      const oldState = {
        session_id: oldSessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: {
          [testFile]: {
            filepath: testFile,
            timestamp: Date.now(),
            checksum: 'abc123',
            size: 5,
          },
        },
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      const oldFile = path.join(
        tempDir,
        `.docimp/session-reports/audit-session-${oldSessionId}.json`
      );
      await fs.writeFile(oldFile, JSON.stringify(oldState, null, 2));

      // Load old schema (should work with current schema)
      const loaded =
        await SessionStateManager.loadSessionState<AuditSessionState>(
          oldSessionId,
          'audit'
        );

      expect(loaded.session_id).toBe(oldSessionId);
      expect(loaded.file_snapshot[testFile]).toBeDefined();
    });
  });

  describe('8. Performance Test', () => {
    it('should save and load large session (1000+ items) under 500ms', async () => {
      // Create 1000 mock CodeItems
      const items: CodeItem[] = [];
      const snapshot: Record<string, any> = {};

      for (let i = 0; i < 1000; i++) {
        const filepath = `file-${i}.py`;
        items.push({
          name: `function_${i}`,
          type: 'function',
          filepath,
          line_number: 1,
          end_line: 5,
          language: 'python',
          complexity: Math.floor(Math.random() * 10) + 1,
          impact_score: Math.floor(Math.random() * 100),
          has_docs: false,
          parameters: ['arg1', 'arg2'],
          return_type: null,
          docstring: null,
          export_type: 'internal',
          module_system: 'unknown',
          audit_rating: null,
        });

        snapshot[filepath] = {
          filepath,
          timestamp: Date.now(),
          checksum: `checksum-${i}`,
          size: 100,
        };
      }

      const perfSessionId = randomUUID();
      const largeState: AuditSessionState = {
        session_id: perfSessionId,
        started_at: new Date().toISOString(),
        current_index: 500,
        total_items: 1000,
        partial_ratings: Object.fromEntries(
          items
            .slice(0, 500)
            .map((item) => [
              item.filepath,
              { [item.name]: Math.floor(Math.random() * 4) + 1 },
            ])
        ),
        file_snapshot: snapshot,
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      // Measure save performance
      const saveStart = Date.now();
      await SessionStateManager.saveSessionState(largeState, 'audit');
      const saveDuration = Date.now() - saveStart;

      expect(saveDuration).toBeLessThan(500); // Target: < 500ms

      // Measure load performance
      const loadStart = Date.now();
      const loaded =
        await SessionStateManager.loadSessionState<AuditSessionState>(
          perfSessionId,
          'audit'
        );
      const loadDuration = Date.now() - loadStart;

      expect(loadDuration).toBeLessThan(500); // Target: < 500ms

      // Verify integrity
      expect(loaded.total_items).toBe(1000);
      expect(loaded.current_index).toBe(500);
      expect(Object.keys(loaded.partial_ratings)).toHaveLength(500);
    });
  });
});
