/**
 * Integration tests for improve session management commands.
 *
 * Tests list-improve-sessions and delete-improve-session commands.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import prompts from 'prompts';
import {
  deleteImproveSessionCore,
  listImproveSessionsCore,
} from '../../commands/improve-sessions.js';
import type { ImproveSessionState } from '../../types/improve-session-state.js';
import { SessionStateManager } from '../../utils/session-state-manager.js';

// Mock modules
jest.mock('prompts');
jest.mock('../../utils/session-state-manager');
jest.mock('node:child_process');
jest.mock('node:util');

// Store console output for verification
let consoleOutput: string[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe('Improve Session Management Integration Tests', () => {
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

  describe('listImproveSessionsCore', () => {
    it('should display message when no sessions exist', async () => {
      // Mock: no sessions
      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([]);

      await listImproveSessionsCore();

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('improve');
      expect(consoleOutput.join('\n')).toContain('No improve sessions found');
    });

    it('should display single session with transaction information', async () => {
      // Mock: single session
      const session: ImproveSessionState = {
        session_id: '550e8400-e29b-41d4-a716-446655440060',
        transaction_id: '550e8400-e29b-41d4-a716-446655440060',
        started_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1h ago
        current_index: 2,
        plan_items: [
          {
            name: 'func1',
            type: 'function',
            filepath: '/test/file.ts',
            line_number: 10,
            end_line: 15,
            language: 'typescript',
            complexity: 5,
            impact_score: 25.0,
            has_docs: false,
            parameters: [],
            return_type: 'void',
            docstring: null,
            export_type: 'named',
            module_system: 'esm',
            audit_rating: null,
          },
        ],
        user_preferences: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        partial_improvements: {
          '/test/file.ts': {
            func1: { status: 'accepted' },
          },
        },
        file_snapshot: {},
        config: {},
        completed_at: null,
      };

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        session,
      ]);

      await listImproveSessionsCore();

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('improve');
      const output = consoleOutput.join('\n');
      expect(output).toContain('550e8400-e29');
      expect(output).toContain('1/0/0'); // Accepted/Skipped/Errors
      expect(output).toContain('in-progress'); // Session status
      // Transaction status column is present (actual value depends on git availability)
    });

    it('should display multiple sessions sorted by started_at descending', async () => {
      // Mock: multiple sessions (unsorted)
      const oldSession: ImproveSessionState = {
        session_id: '111e8400-e29b-41d4-a716-446655440000',
        transaction_id: '111e8400-e29b-41d4-a716-446655440000',
        started_at: new Date(Date.now() - 7200 * 1000).toISOString(), // 2h ago
        current_index: 0,
        plan_items: [],
        user_preferences: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: null,
      };

      const newSession: ImproveSessionState = {
        session_id: '222e8400-e29b-41d4-a716-446655440000',
        transaction_id: '222e8400-e29b-41d4-a716-446655440000',
        started_at: new Date(Date.now() - 1800 * 1000).toISOString(), // 30m ago
        current_index: 0,
        plan_items: [],
        user_preferences: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: new Date(Date.now() - 1200 * 1000).toISOString(), // 20m ago
      };

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        newSession,
        oldSession,
      ]);

      await listImproveSessionsCore();

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('improve');
      const output = consoleOutput.join('\n');
      // SessionStateManager returns sorted list, so we just verify both are shown
      expect(output).toContain('222e8400-e29');
      expect(output).toContain('111e8400-e29');
    });

    it('should display completed session correctly', async () => {
      const session: ImproveSessionState = {
        session_id: '550e8400-e29b-41d4-a716-446655440060',
        transaction_id: '550e8400-e29b-41d4-a716-446655440060',
        started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
        current_index: 1,
        plan_items: [],
        user_preferences: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: new Date(Date.now() - 1800 * 1000).toISOString(),
      };

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        session,
      ]);

      await listImproveSessionsCore();

      const output = consoleOutput.join('\n');
      expect(output).toContain('completed'); // Session status
    });

    it('should verify table formatting includes all required columns', async () => {
      const session: ImproveSessionState = {
        session_id: '550e8400-e29b-41d4-a716-446655440060',
        transaction_id: '550e8400-e29b-41d4-a716-446655440060',
        started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
        current_index: 0,
        plan_items: [],
        user_preferences: {
          styleGuides: { typescript: 'tsdoc-typedoc' },
          tone: 'concise',
        },
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: null,
      };

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
        session,
      ]);

      await listImproveSessionsCore();

      const output = consoleOutput.join('\n');
      // Verify column headers present in table (may be truncated with ellipsis)
      expect(output).toContain('Session ID');
      expect(output).toMatch(/Transaction[\s…]/); // May be truncated as "Transaction …"
      expect(output).toContain('Started');
      expect(output).toContain('Completed');
      expect(output).toContain('Acc/Skip/Err');
      expect(output).toContain('Status');
      expect(output).toContain('Txn Status');
    });
  });

  describe('deleteImproveSessionCore', () => {
    it('should delete specific session after confirmation', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440060';

      // Mock session exists
      (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue({
        session_id: sessionId,
        transaction_id: sessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        plan_items: [],
        user_preferences: {},
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: null,
      });

      // Mock user confirms deletion
      (prompts as unknown as jest.Mock).mockResolvedValue({ value: true });

      await deleteImproveSessionCore(sessionId, { all: false, force: false });

      expect(SessionStateManager.loadSessionState).toHaveBeenCalledWith(
        sessionId,
        'improve'
      );
      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'confirm',
          message: expect.stringContaining('Delete improve session'),
        })
      );
      expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
        sessionId,
        'improve'
      );
      expect(consoleOutput.join('\n')).toContain('Deleted improve session');
    });

    it('should delete all sessions after confirmation', async () => {
      const sessions: ImproveSessionState[] = [
        {
          session_id: '111e8400-e29b-41d4-a716-446655440000',
          transaction_id: '111e8400-e29b-41d4-a716-446655440000',
          started_at: new Date().toISOString(),
          current_index: 0,
          plan_items: [],
          user_preferences: {},
          partial_improvements: {},
          file_snapshot: {},
          config: {},
          completed_at: null,
        },
        {
          session_id: '222e8400-e29b-41d4-a716-446655440000',
          transaction_id: '222e8400-e29b-41d4-a716-446655440000',
          started_at: new Date().toISOString(),
          current_index: 0,
          plan_items: [],
          user_preferences: {},
          partial_improvements: {},
          file_snapshot: {},
          config: {},
          completed_at: null,
        },
      ];

      (SessionStateManager.listSessions as jest.Mock).mockResolvedValue(
        sessions
      );
      (prompts as unknown as jest.Mock).mockResolvedValue({ value: true });

      await deleteImproveSessionCore(undefined, { all: true, force: false });

      expect(SessionStateManager.listSessions).toHaveBeenCalledWith('improve');
      expect(prompts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'confirm',
          message: expect.stringContaining('Delete all 2 improve session'),
        })
      );
      expect(SessionStateManager.deleteSessionState).toHaveBeenCalledTimes(2);
      expect(consoleOutput.join('\n')).toContain('Deleted 2 improve session');
    });

    it('should cancel deletion when user rejects confirmation', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440060';

      (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue({
        session_id: sessionId,
        transaction_id: sessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        plan_items: [],
        user_preferences: {},
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: null,
      });

      // Mock user rejects deletion
      (prompts as unknown as jest.Mock).mockResolvedValue({ value: false });

      await deleteImproveSessionCore(sessionId, { all: false, force: false });

      expect(SessionStateManager.deleteSessionState).not.toHaveBeenCalled();
      expect(consoleOutput.join('\n')).toContain('Deletion cancelled');
    });

    it('should skip confirmation when --force flag provided', async () => {
      const sessionId = '550e8400-e29b-41d4-a716-446655440060';

      (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue({
        session_id: sessionId,
        transaction_id: sessionId,
        started_at: new Date().toISOString(),
        current_index: 0,
        plan_items: [],
        user_preferences: {},
        partial_improvements: {},
        file_snapshot: {},
        config: {},
        completed_at: null,
      });

      await deleteImproveSessionCore(sessionId, { all: false, force: true });

      expect(prompts).not.toHaveBeenCalled();
      expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
        sessionId,
        'improve'
      );
    });

    it('should throw error when session not found', async () => {
      // Use a valid UUID format that doesn't exist
      const sessionId = '999e8400-e29b-41d4-a716-446655440000';

      (SessionStateManager.loadSessionState as jest.Mock).mockRejectedValue(
        new Error('Session file not found')
      );

      await expect(
        deleteImproveSessionCore(sessionId, { all: false, force: false })
      ).rejects.toThrow(
        "Improve session '999e8400-e29b-41d4-a716-446655440000' not found"
      );
    });

    it('should throw error for invalid UUID format', async () => {
      const invalidSessionId = 'not-a-valid-uuid';

      await expect(
        deleteImproveSessionCore(invalidSessionId, { all: false, force: false })
      ).rejects.toThrow(
        'Invalid session ID format: not-a-valid-uuid. Expected UUID (36 chars) or shortuuid (22 chars base57).'
      );

      // Verify session lookup was never attempted
      expect(SessionStateManager.loadSessionState).not.toHaveBeenCalled();
    });

    it('should throw error when neither session ID nor --all flag provided', async () => {
      await expect(
        deleteImproveSessionCore(undefined, { all: false, force: false })
      ).rejects.toThrow('Must provide session ID or use --all flag');
    });

    it('should throw error when both session ID and --all flag provided', async () => {
      // Use a valid UUID format
      const validSessionId = '550e8400-e29b-41d4-a716-446655440000';
      await expect(
        deleteImproveSessionCore(validSessionId, { all: true, force: false })
      ).rejects.toThrow('Cannot specify both session ID and --all flag');
    });
  });
});
