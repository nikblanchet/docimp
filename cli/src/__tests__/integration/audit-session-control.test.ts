/**
 * Integration tests for audit session control flags.
 *
 * Tests --new and --clear-session flags for session management.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import prompts from 'prompts';
import { auditCore } from '../../commands/audit.js';
import type { IConfigLoader } from '../../config/i-config-loader.js';
import type { IDisplay } from '../../display/i-display.js';
import type { IPythonBridge } from '../../python-bridge/i-python-bridge.js';
import type { AuditSessionState } from '../../types/audit-session-state.js';
import { CodeExtractor } from '../../utils/code-extractor.js';
import { FileTracker } from '../../utils/file-tracker.js';
import { PathValidator } from '../../utils/path-validator.js';
import { SessionStateManager } from '../../utils/session-state-manager.js';
import { StateManager } from '../../utils/state-manager.js';

// Mock modules
jest.mock('prompts');
jest.mock('../../utils/session-state-manager');
jest.mock('../../utils/file-tracker');

// Mock dependencies
const mockBridge: IPythonBridge = {
  audit: jest.fn().mockResolvedValue({
    items: [
      {
        name: 'testFunction',
        type: 'function',
        filepath: '/test/file.ts',
        line_number: 10,
        end_line: 20,
        language: 'typescript',
        complexity: 5,
        docstring: 'Test docstring',
        audit_rating: null,
      },
    ],
  }),
  applyAudit: jest.fn().mockResolvedValue(undefined),
} as any;

const mockDisplay: IDisplay = {
  showMessage: jest.fn(),
  startSpinner: jest.fn(() => jest.fn()),
  showBoxedDocstring: jest.fn(),
  showCodeBlock: jest.fn(),
  showAuditSummary: jest.fn(),
  showError: jest.fn(),
} as any;

const mockConfigLoader: IConfigLoader = {
  load: jest.fn().mockResolvedValue({
    audit: {
      showCode: {
        mode: 'truncated',
        maxLines: 20,
      },
    },
  }),
} as any;

describe('Audit Session Control Tests', () => {
  let tempSessionReportsDir: string;

  beforeEach(async () => {
    // Create temp directory for session reports
    tempSessionReportsDir = path.join(
      '/tmp',
      `test-session-control-${Date.now()}`
    );
    await fs.mkdir(tempSessionReportsDir, { recursive: true });

    // Reset mocks
    jest.clearAllMocks();

    // Mock StateManager to use temp directory
    jest
      .spyOn(StateManager, 'getSessionReportsDir')
      .mockReturnValue(tempSessionReportsDir);
    jest
      .spyOn(StateManager, 'getAuditFile')
      .mockReturnValue(path.join(tempSessionReportsDir, 'audit.json'));

    // Mock FileTracker
    (FileTracker.createSnapshot as jest.Mock).mockResolvedValue({});
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([]);

    // Mock PathValidator
    jest
      .spyOn(PathValidator, 'validatePathExists')
      .mockReturnValue('/test/path');
    jest.spyOn(PathValidator, 'validatePathReadable').mockReturnValue();
    jest.spyOn(PathValidator, 'warnIfEmpty').mockReturnValue();

    // Mock CodeExtractor
    jest.spyOn(CodeExtractor, 'extractCodeBlock').mockReturnValue({
      code: 'function testFunction() {\n  return 42;\n}',
      truncated: false,
      totalLines: 3,
      displayedLines: 3,
    });

    // Mock SessionStateManager.saveSessionState to write files
    (SessionStateManager.saveSessionState as jest.Mock).mockImplementation(
      async (state, type) => {
        const filename = `${type}-session-${state.session_id}.json`;
        const filePath = path.join(tempSessionReportsDir, filename);
        await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf8');
        return state.session_id;
      }
    );

    // Mock SessionStateManager.deleteSessionState
    (SessionStateManager.deleteSessionState as jest.Mock).mockResolvedValue(
      undefined
    );
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempSessionReportsDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    jest.restoreAllMocks();
  });

  it('should bypass auto-detection and start fresh with --new flag', async () => {
    // Mock: existing incomplete session
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440060',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
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
        showCodeMode: 'truncated',
        maxLines: 20,
      },
      completed_at: null,
    };

    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
      existingSession,
    ]);

    // Mock user rating
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      rating: '3',
    });

    await auditCore(
      '/test/path',
      { new: true }, // Explicit --new flag
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should NOT have prompted for resume (bypass auto-detection)
    expect(prompts).toHaveBeenCalledTimes(1); // Only rating prompt
    expect(prompts).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('Resume'),
      })
    );

    // Should have created NEW session (not loaded existing)
    expect(SessionStateManager.loadSessionState).not.toHaveBeenCalled();
    expect(SessionStateManager.saveSessionState).toHaveBeenCalled();

    // Verify new session ID is different
    const saveCall = (SessionStateManager.saveSessionState as jest.Mock).mock
      .calls[0];
    expect(saveCall[0].session_id).not.toBe(
      '550e8400-e29b-41d4-a716-446655440060'
    );
  });

  it('should start fresh session with --new flag (no existing sessions)', async () => {
    // Mock: no existing sessions
    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([]);

    // Mock user rating
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      rating: '3',
    });

    await auditCore(
      '/test/path',
      { new: true },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have created new session
    expect(SessionStateManager.saveSessionState).toHaveBeenCalled();

    // Should have prompted for rating
    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        name: 'rating',
      })
    );
  });

  it('should delete all incomplete sessions with --clear-session flag', async () => {
    // Mock: multiple incomplete sessions
    const session1: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440070',
      started_at: new Date(Date.now() - 7200 * 1000).toISOString(),
      current_index: 3,
      total_items: 10,
      partial_ratings: {},
      file_snapshot: {},
      config: {
        showCodeMode: 'truncated',
        maxLines: 20,
      },
      completed_at: null,
    };

    const session2: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440071',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 5,
      total_items: 12,
      partial_ratings: {},
      file_snapshot: {},
      config: {
        showCodeMode: 'truncated',
        maxLines: 20,
      },
      completed_at: null,
    };

    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
      session2,
      session1,
    ]);

    // Expect error to be thrown (caught by command wrapper)
    await expect(
      auditCore(
        '/test/path',
        { clearSession: true },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('CLEAR_SESSION_COMPLETE');

    // Should have shown message about clearing
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Clearing 2 incomplete audit session')
    );

    // Should have deleted both sessions
    expect(SessionStateManager.deleteSessionState).toHaveBeenCalledTimes(2);
    expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440070',
      'audit'
    );
    expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440071',
      'audit'
    );

    // Should have shown completion message
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Cleared 2 session')
    );

    // Should NOT have started audit
    expect(mockBridge.audit).not.toHaveBeenCalled();
  });

  it('should handle --clear-session with no incomplete sessions', async () => {
    // Mock: no incomplete sessions (only completed)
    const completedSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440080',
      started_at: new Date(Date.now() - 86400 * 1000).toISOString(),
      current_index: 5,
      total_items: 5,
      partial_ratings: {},
      file_snapshot: {},
      config: {
        showCodeMode: 'truncated',
        maxLines: 20,
      },
      completed_at: new Date().toISOString(), // Completed!
    };

    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
      completedSession,
    ]);

    // Expect error to be thrown (caught by command wrapper)
    await expect(
      auditCore(
        '/test/path',
        { clearSession: true },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('CLEAR_SESSION_COMPLETE');

    // Should have shown message about no incomplete sessions
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('No incomplete audit sessions to clear')
    );

    // Should NOT have deleted any sessions
    expect(SessionStateManager.deleteSessionState).not.toHaveBeenCalled();

    // Should NOT have started audit
    expect(mockBridge.audit).not.toHaveBeenCalled();
  });
});
