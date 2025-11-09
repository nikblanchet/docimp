/**
 * Integration tests for audit resume auto-detection functionality.
 *
 * Tests the hybrid UX where audit command detects existing sessions and prompts user.
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

describe('Audit Resume Auto-Detection', () => {
  let tempSessionReportsDir: string;
  let tempRoot: string;

  beforeEach(async () => {
    // Create temp directory for session reports
    tempRoot = path.join(
      '/tmp',
      `docimp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    const docimpDir = path.join(tempRoot, '.docimp');
    tempSessionReportsDir = path.join(docimpDir, 'session-reports');
    await fs.mkdir(tempSessionReportsDir, { recursive: true });

    // Reset mocks
    jest.clearAllMocks();

    // Mock StateManager to use temp directory
    jest.spyOn(StateManager, 'getStateDir').mockReturnValue(docimpDir);
    jest
      .spyOn(StateManager, 'getSessionReportsDir')
      .mockReturnValue(tempSessionReportsDir);
    jest
      .spyOn(StateManager, 'getAnalyzeFile')
      .mockReturnValue(path.join(tempSessionReportsDir, 'analyze-latest.json'));
    jest
      .spyOn(StateManager, 'getAuditFile')
      .mockReturnValue(path.join(docimpDir, 'audit.json'));

    // Create required workflow state files for WorkflowValidator
    await fs.writeFile(
      path.join(tempSessionReportsDir, 'analyze-latest.json'),
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

    // Mock FileTracker
    (FileTracker.createSnapshot as jest.Mock).mockResolvedValue({});

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
  });

  afterEach(async () => {
    // Clean up temp directory and parent (which contains workflow-state.json)
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    jest.restoreAllMocks();
  });

  it('should start fresh when no existing session and no flags provided', async () => {
    // Mock: no existing sessions
    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([]);

    // Mock user rating the item
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      rating: '3',
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should NOT prompt for resume (no session exists)
    expect(prompts).toHaveBeenCalledTimes(1); // Only the rating prompt
    expect(prompts).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('Resume'),
      })
    );

    // Should create new session
    expect(SessionStateManager.saveSessionState).toHaveBeenCalled();
  });

  it('should prompt user when existing session found (auto-detect)', async () => {
    // Mock: existing incomplete session
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440001',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      current_index: 2,
      total_items: 5,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
          func2: 4,
          testFunction: null,
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

    // Mock: user accepts resume prompt (Y)
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // First call: resume prompt
        return Promise.resolve({ value: true });
      }
      // Subsequent calls: ratings
      return Promise.resolve({ rating: '3' });
    });

    // Mock: load session returns existing session
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: no file changes
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([]);

    await auditCore(
      '/test/path',
      {}, // No flags - should trigger auto-detection
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have prompted for resume
    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('Resume'),
      })
    );

    // Should have loaded the session
    expect(SessionStateManager.loadSessionState).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440001',
      'audit'
    );
  });

  it('should start fresh when user rejects resume prompt (auto-detect)', async () => {
    // Mock: existing incomplete session
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440002',
      started_at: new Date(Date.now() - 7200 * 1000).toISOString(), // 2 hours ago
      current_index: 1,
      total_items: 3,
      partial_ratings: {},
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

    // Mock: user rejects resume prompt (N)
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // First call: resume prompt - user says NO
        return Promise.resolve({ value: false });
      }
      // Subsequent calls: ratings
      return Promise.resolve({ rating: '3' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have prompted for resume
    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('Resume'),
      })
    );

    // Should NOT have loaded the old session
    expect(SessionStateManager.loadSessionState).not.toHaveBeenCalled();

    // Should have created NEW session
    const saveCall = (SessionStateManager.saveSessionState as jest.Mock).mock
      .calls[0];
    expect(saveCall[0].session_id).not.toBe(
      '550e8400-e29b-41d4-a716-446655440002'
    ); // Different session ID
  });

  it('should ignore completed sessions and start fresh (auto-detect)', async () => {
    // Mock: only completed sessions exist
    const completedSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440003',
      started_at: new Date(Date.now() - 86400 * 1000).toISOString(), // 1 day ago
      current_index: 5,
      total_items: 5,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
          func2: 4,
          func3: 2,
          func4: 4,
          func5: 3,
        },
      },
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

    // Mock user rating
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      rating: '3',
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should NOT prompt for resume (session is completed)
    expect(prompts).toHaveBeenCalledTimes(1); // Only rating prompt
    expect(prompts).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'confirm',
        message: expect.stringContaining('Resume'),
      })
    );

    // Should create new session (completed sessions ignored)
    expect(SessionStateManager.saveSessionState).toHaveBeenCalled();
  });
});
