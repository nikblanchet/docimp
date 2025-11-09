/**
 * Tests for SessionStateManager utility.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  SessionStateManager,
  type SessionState,
} from '../../utils/session-state-manager.js';
import { StateManager } from '../../utils/state-manager.js';

describe('SessionStateManager', () => {
  let tempDir: string;
  let originalGetSessionReportsDir: typeof StateManager.getSessionReportsDir;
  let originalEnsureStateDir: typeof StateManager.ensureStateDir;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = path.join(process.cwd(), '.test-tmp-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // Mock StateManager methods
    originalGetSessionReportsDir = StateManager.getSessionReportsDir;
    originalEnsureStateDir = StateManager.ensureStateDir;

    StateManager.getSessionReportsDir = jest.fn(() => tempDir);
    StateManager.ensureStateDir = jest.fn(() => {
      /* no-op */
    });
  });

  afterEach(async () => {
    // Restore original methods
    StateManager.getSessionReportsDir = originalGetSessionReportsDir;
    StateManager.ensureStateDir = originalEnsureStateDir;

    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  describe('saveSessionState', () => {
    test('should save audit session state with atomic write', async () => {
      const sessionId = randomUUID();
      const state: SessionState = {
        session_id: sessionId,
        schema_version: '1.0',
        started_at: new Date().toISOString(),
        current_index: 5,
        total_items: 23,
        partial_ratings: {
          'file.py': { func1: 3, func2: null },
        },
        file_snapshot: {},
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      const resultId = await SessionStateManager.saveSessionState(
        state,
        'audit'
      );

      expect(resultId).toBe(sessionId);

      // Verify file was created
      const expectedPath = path.join(
        tempDir,
        `audit-session-${sessionId}.json`
      );
      const exists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Verify contents
      const fileContent = await fs.readFile(expectedPath, 'utf8');
      const loaded = JSON.parse(fileContent);
      expect(loaded).toEqual(state);

      // Verify no temp file left behind
      const files = await fs.readdir(tempDir);
      const tempFiles = files.filter((f) => f.endsWith('.tmp'));
      expect(tempFiles).toHaveLength(0);
    });

    test('should save improve session state', async () => {
      const sessionId = randomUUID();
      const state: SessionState = {
        session_id: sessionId,
        schema_version: '1.0',
        transaction_id: randomUUID(),
        started_at: new Date().toISOString(),
        current_index: 2,
        total_items: 2,
        partial_improvements: {},
        file_snapshot: {},
        config: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        completed_at: null,
      };

      const resultId = await SessionStateManager.saveSessionState(
        state,
        'improve'
      );

      expect(resultId).toBe(sessionId);

      // Verify file created
      const expectedPath = path.join(
        tempDir,
        `improve-session-${sessionId}.json`
      );
      const exists = await fs
        .access(expectedPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });

    test('should throw error for invalid session type', async () => {
      const state: SessionState = {
        session_id: randomUUID(),
        data: 'test',
      };

      await expect(
        SessionStateManager.saveSessionState(state, 'invalid' as 'audit')
      ).rejects.toThrow('Invalid session_type');
    });

    test('should throw error for missing session_id', async () => {
      const state = {
        started_at: new Date().toISOString(),
      } as SessionState;

      await expect(
        SessionStateManager.saveSessionState(state, 'audit')
      ).rejects.toThrow("must include 'session_id'");
    });
  });

  describe('loadSessionState', () => {
    test('should load session state from JSON file', async () => {
      const sessionId = randomUUID();
      const state: SessionState = {
        session_id: sessionId,
        schema_version: '1.0',
        started_at: new Date().toISOString(),
        current_index: 10,
        total_items: 20,
        partial_ratings: {},
        file_snapshot: {},
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      // Save state
      await SessionStateManager.saveSessionState(state, 'audit');

      // Load state
      const loaded = await SessionStateManager.loadSessionState(
        sessionId,
        'audit'
      );

      expect(loaded).toEqual(state);
    });

    test('should throw error for non-existent session', async () => {
      await expect(
        SessionStateManager.loadSessionState('non-existent', 'audit')
      ).rejects.toThrow('Session file not found');
    });

    test('should throw error for corrupted JSON', async () => {
      const filePath = path.join(tempDir, 'audit-session-corrupted.json');
      await fs.writeFile(filePath, '{ invalid json }', 'utf8');

      await expect(
        SessionStateManager.loadSessionState('corrupted', 'audit')
      ).rejects.toThrow(SyntaxError);
    });
  });

  describe('listSessions', () => {
    test('should list all sessions sorted by started_at descending', async () => {
      // Create sessions with different timestamps
      const sessions = [
        {
          session_id: randomUUID(),
          schema_version: '1.0',
          started_at: '2025-11-05T10:00:00Z',
          current_index: 0,
          total_items: 1,
          partial_ratings: {},
          file_snapshot: {},
          config: { showCodeMode: 'complete', maxLines: 20 },
          completed_at: null,
        },
        {
          session_id: randomUUID(),
          schema_version: '1.0',
          started_at: '2025-11-05T11:00:00Z',
          current_index: 0,
          total_items: 1,
          partial_ratings: {},
          file_snapshot: {},
          config: { showCodeMode: 'complete', maxLines: 20 },
          completed_at: null,
        },
        {
          session_id: randomUUID(),
          schema_version: '1.0',
          started_at: '2025-11-05T12:00:00Z',
          current_index: 0,
          total_items: 1,
          partial_ratings: {},
          file_snapshot: {},
          config: { showCodeMode: 'complete', maxLines: 20 },
          completed_at: null,
        },
      ];

      for (const session of sessions) {
        await SessionStateManager.saveSessionState(session, 'audit');
      }

      // List sessions
      const loadedSessions = await SessionStateManager.listSessions('audit');

      expect(loadedSessions).toHaveLength(3);

      // Verify sorted by started_at descending (newest first)
      expect(loadedSessions[0].started_at).toBe('2025-11-05T12:00:00Z');
      expect(loadedSessions[1].started_at).toBe('2025-11-05T11:00:00Z');
      expect(loadedSessions[2].started_at).toBe('2025-11-05T10:00:00Z');
    });

    test('should return empty list when no sessions exist', async () => {
      const sessions = await SessionStateManager.listSessions('audit');
      expect(sessions).toEqual([]);
    });
  });

  describe('deleteSessionState', () => {
    test('should delete session state file', async () => {
      const sessionId = randomUUID();
      const state: SessionState = {
        session_id: sessionId,
        schema_version: '1.0',
        started_at: new Date().toISOString(),
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: {},
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };

      // Save state
      await SessionStateManager.saveSessionState(state, 'audit');
      const filePath = path.join(tempDir, `audit-session-${sessionId}.json`);
      let exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Delete state
      await SessionStateManager.deleteSessionState(sessionId, 'audit');

      // Verify file deleted
      exists = await fs
        .access(filePath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    test('should not throw error when deleting non-existent session', async () => {
      // Should not throw error (idempotent)
      await expect(
        SessionStateManager.deleteSessionState('non-existent', 'audit')
      ).resolves.not.toThrow();
    });
  });

  describe('getLatestSession', () => {
    test('should get the most recent session', async () => {
      // Create sessions with different timestamps
      const sessionId1 = randomUUID();
      const session1: SessionState = {
        session_id: sessionId1,
        schema_version: '1.0',
        started_at: '2025-11-05T10:00:00Z',
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: {},
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };
      await SessionStateManager.saveSessionState(session1, 'audit');

      const sessionId2 = randomUUID();
      const session2: SessionState = {
        session_id: sessionId2,
        schema_version: '1.0',
        started_at: '2025-11-05T12:00:00Z',
        current_index: 0,
        total_items: 1,
        partial_ratings: {},
        file_snapshot: {},
        config: { showCodeMode: 'complete', maxLines: 20 },
        completed_at: null,
      };
      await SessionStateManager.saveSessionState(session2, 'audit');

      // Get latest
      const latest = await SessionStateManager.getLatestSession('audit');

      expect(latest).not.toBeNull();
      expect(latest?.session_id).toBe(sessionId2);
    });

    test('should return null when no sessions exist', async () => {
      const latest = await SessionStateManager.getLatestSession('audit');
      expect(latest).toBeNull();
    });
  });
});
