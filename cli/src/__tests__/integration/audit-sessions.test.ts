/**
 * Integration tests for audit session management commands.
 *
 * Tests list-audit-sessions and delete-audit-session commands.
 */

import prompts from 'prompts';
import {
  deleteAuditSessionCore,
  listAuditSessionsCore,
} from '../../commands/audit-sessions.js';
import type { AuditSessionState } from '../../types/audit-session-state.js';
import { SessionStateManager } from '../../utils/session-state-manager.js';

// Mock modules
jest.mock('prompts');
jest.mock('../../utils/session-state-manager');

// Store console output for verification
let consoleOutput: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('Audit Session Management Integration Tests', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Capture console output
    consoleOutput = [];
    console.log = jest.fn((...arguments_: any[]) => {
      consoleOutput.push(arguments_.join(' '));
    });
    console.error = jest.fn((...arguments_: any[]) => {
      consoleOutput.push(arguments_.join(' '));
    });
  });

  afterEach(() => {
    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    jest.restoreAllMocks();
  });

  describe('listAuditSessionsCore', () => {
    it('should display message when no sessions exist', async () => {
      // Mock: no sessions
      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([]);

      await listAuditSessionsCore();

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('audit');
      expect(consoleOutput.join('\n')).toContain('No audit sessions found');
    });

    it('should display single session with correct formatting', async () => {
      // Mock: single session
      const session: AuditSessionState = {
        session_id: '550e8400-e29b-41d4-a716-446655440060',
        started_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h ago
        current_index: 2,
        total_items: 5,
        partial_ratings: {
          '/test/file.ts': {
            func1: 3,
            func2: 4,
          },
        },
        file_snapshot: {},
        config: {
          showCodeMode: 'truncated' as const,
          maxLines: 20,
        },
        completed_at: null,
      };

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        session,
      ]);

      await listAuditSessionsCore();

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('audit');
      const output = consoleOutput.join('\n');
      expect(output).toContain('550e8400-e29');
      expect(output).toContain('2/5'); // Items rated
      expect(output).toContain('in-progress'); // Status
    });

    it('should display multiple sessions sorted by started_at descending', async () => {
      // Mock: multiple sessions (unsorted)
      const oldSession: AuditSessionState = {
        session_id: '111e8400-e29b-41d4-a716-446655440000',
        started_at: new Date(Date.now() - 7200 * 1000).toISOString(), // 2h ago
        current_index: 0,
        total_items: 3,
        partial_ratings: {},
        file_snapshot: {},
        config: {
          showCodeMode: 'truncated' as const,
          maxLines: 20,
        },
        completed_at: null,
      };

      const newSession: AuditSessionState = {
        session_id: '222e8400-e29b-41d4-a716-446655440000',
        started_at: new Date(Date.now() - 1800 * 1000).toISOString(), // 30m ago
        current_index: 2,
        total_items: 5,
        partial_ratings: {},
        file_snapshot: {},
        config: {
          showCodeMode: 'truncated' as const,
          maxLines: 20,
        },
        completed_at: null,
      };

      // SessionStateManager already sorts, so return in sorted order
      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        newSession,
        oldSession,
      ]);

      await listAuditSessionsCore();

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('audit');
      const output = consoleOutput.join('\n');
      expect(output).toContain('222e8400-e29'); // Newer session
      expect(output).toContain('111e8400-e29'); // Older session
    });

    it('should display completed session with green status', async () => {
      // Mock: completed session
      const completedSession: AuditSessionState = {
        session_id: '333e8400-e29b-41d4-a716-446655440000',
        started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
        current_index: 5,
        total_items: 5,
        partial_ratings: {
          '/test/file.ts': {
            func1: 3,
            func2: 4,
            func3: 2,
            func4: 3,
            func5: 4,
          },
        },
        file_snapshot: {},
        config: {
          showCodeMode: 'truncated' as const,
          maxLines: 20,
        },
        completed_at: new Date().toISOString(),
      };

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        completedSession,
      ]);

      await listAuditSessionsCore();

      const output = consoleOutput.join('\n');
      expect(output).toContain('5/5'); // All items rated
      expect(output).toContain('completed'); // Status
    });
  });

  describe('deleteAuditSessionCore', () => {
    it('should throw error when neither session ID nor --all provided', async () => {
      await expect(deleteAuditSessionCore(undefined, {})).rejects.toThrow(
        'Must provide session ID or use --all flag to delete all sessions'
      );
    });

    it('should throw error when both session ID and --all provided', async () => {
      await expect(
        deleteAuditSessionCore('550e8400-e29b-41d4-a716-446655440060', {
          all: true,
        })
      ).rejects.toThrow('Cannot specify both session ID and --all flag');
    });

    it('should delete specific session with confirmation', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440060';

      // Mock: session exists
      (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue({
        session_id: sessionId,
      });

      // Mock: user confirms
      (prompts as unknown as jest.Mock).mockResolvedValue({ value: true });

      await deleteAuditSessionCore(sessionId, {});

      expect(SessionStateManager.loadSessionState).toHaveBeenCalledWith(
        sessionId,
        'audit'
      );
      expect(prompts).toHaveBeenCalled();
      expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
        sessionId,
        'audit'
      );
      expect(consoleOutput.join('\n')).toContain(
        'Deleted audit session 550e8400-e29'
      );
    });

    it('should cancel deletion when user rejects confirmation', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440060';

      // Mock: session exists
      (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue({
        session_id: sessionId,
      });

      // Mock: user rejects
      (prompts as unknown as jest.Mock).mockResolvedValue({ value: false });

      await deleteAuditSessionCore(sessionId, {});

      expect(prompts).toHaveBeenCalled();
      expect(SessionStateManager.deleteSessionState).not.toHaveBeenCalled();
      expect(consoleOutput.join('\n')).toContain('Deletion cancelled');
    });

    it('should delete session without confirmation when --force flag used', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440060';

      // Mock: session exists
      (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue({
        session_id: sessionId,
      });

      await deleteAuditSessionCore(sessionId, { force: true });

      expect(prompts).not.toHaveBeenCalled();
      expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
        sessionId,
        'audit'
      );
    });

    it('should throw error when session not found', async () => {
      const sessionId = '999e8400-e29b-41d4-a716-446655440000';

      // Mock: session not found
      (SessionStateManager.loadSessionState as jest.Mock).mockRejectedValue(
        new Error('Session file not found')
      );

      await expect(deleteAuditSessionCore(sessionId, {})).rejects.toThrow(
        "Audit session '999e8400-e29b-41d4-a716-446655440000' not found"
      );
    });

    it('should throw error for invalid UUID format', async () => {
      const invalidSessionId = 'not-a-valid-uuid';

      await expect(
        deleteAuditSessionCore(invalidSessionId, {})
      ).rejects.toThrow(
        'Invalid session ID format: not-a-valid-uuid. Expected UUID (36 chars) or shortuuid (22 chars base57).'
      );

      // Verify session lookup was never attempted
      expect(SessionStateManager.loadSessionState).not.toHaveBeenCalled();
    });

    it('should delete all sessions with confirmation', async () => {
      // Mock: multiple sessions exist
      const sessions = [
        {
          session_id: '111e8400-e29b-41d4-a716-446655440000',
          started_at: new Date().toISOString(),
        },
        {
          session_id: '222e8400-e29b-41d4-a716-446655440000',
          started_at: new Date().toISOString(),
        },
      ];
      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue(
        sessions
      );

      // Mock: user confirms
      (prompts as unknown as jest.Mock).mockResolvedValue({ value: true });

      await deleteAuditSessionCore(undefined, { all: true });

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('audit');
      expect(prompts).toHaveBeenCalled();
      expect(SessionStateManager.deleteSessionState).toHaveBeenCalledTimes(2);
      expect(consoleOutput.join('\n')).toContain('Deleted 2 audit session(s)');
    });

    it('should display message when no sessions to delete with --all flag', async () => {
      // Mock: no sessions
      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([]);

      await deleteAuditSessionCore(undefined, { all: true });

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('audit');
      expect(SessionStateManager.deleteSessionState).not.toHaveBeenCalled();
      expect(consoleOutput.join('\n')).toContain('No audit sessions to delete');
    });
  });
});
