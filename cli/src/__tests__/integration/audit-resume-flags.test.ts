/**
 * Integration tests for audit resume flag functionality.
 *
 * Tests --resume and --resume-file flags for explicit session resumption.
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

describe('Audit Resume Flag Tests', () => {
  let tempSessionReportsDir: string;

  beforeEach(async () => {
    // Create temp directory for session reports
    tempSessionReportsDir = path.join(
      '/tmp',
      `test-resume-flags-${Date.now()}`
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

  it('should throw error when --resume flag used with no sessions', async () => {
    // Mock: no existing sessions
    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([]);

    // Expect auditCore to throw error
    await expect(
      auditCore(
        '/test/path',
        { resume: true },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('No incomplete audit sessions found');

    // Should NOT have prompted for rating
    expect(prompts).not.toHaveBeenCalled();
  });

  it('should resume single incomplete session with --resume flag', async () => {
    // Mock: single incomplete session
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440010',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      current_index: 1,
      total_items: 3,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
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

    // Mock: user selects the session from list (even with single session)
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // First call: session selection prompt
        return Promise.resolve({ value: 1 }); // Select session #1
      }
      // Subsequent calls: ratings
      return Promise.resolve({ rating: '4' });
    });

    // Mock: load session returns existing session
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    await auditCore(
      '/test/path',
      { resume: true }, // Explicit --resume flag
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have prompted for session selection (even with single session)
    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'number',
        message: expect.stringContaining('Select session'),
      })
    );

    // Should have loaded the session
    expect(SessionStateManager.loadSessionState).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440010',
      'audit'
    );

    // Should have shown resume message
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Resuming session')
    );
  });

  it('should prompt session selection when --resume with multiple sessions', async () => {
    // Mock: multiple incomplete sessions
    const session1: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440020',
      started_at: new Date(Date.now() - 7200 * 1000).toISOString(), // 2 hours ago
      current_index: 3,
      total_items: 10,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
          func2: 2,
          func3: 4,
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

    const session2: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440021',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      current_index: 5,
      total_items: 12,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
          func2: 2,
          func3: 4,
          func4: 3,
          func5: 2,
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
      session2, // Newer first (sorted by started_at desc)
      session1,
    ]);

    // Mock: user selects first session from list
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // First call: session selection prompt
        return Promise.resolve({ value: 1 }); // Select session #1
      }
      // Subsequent calls: ratings
      return Promise.resolve({ rating: '3' });
    });

    // Mock: load session returns selected session
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      session2
    );

    await auditCore(
      '/test/path',
      { resume: true }, // Explicit --resume flag
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have prompted for session selection
    expect(prompts).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'number',
        message: expect.stringContaining('Select session'),
      })
    );

    // Should have loaded the selected session
    expect(SessionStateManager.loadSessionState).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440021',
      'audit'
    );
  });

  it('should load specific session file with --resume-file flag', async () => {
    // Mock: session file specified directly
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440030',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
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

    // Mock: load session from file
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock user rating
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      rating: '3',
    });

    await auditCore(
      '/test/path',
      {
        resume: true,
        resumeFile: '/path/to/session.json',
      },
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have loaded the session file directly (no list prompt)
    expect(SessionStateManager.loadSessionState).toHaveBeenCalledWith(
      '/path/to/session.json',
      'audit'
    );

    // Should NOT have prompted for session selection
    expect(prompts).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'number',
      })
    );

    // Should have shown resume message
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Resuming session')
    );
  });

  it('should detect file changes and re-analyze on resume', async () => {
    // Mock: session with one rated item
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440040',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 1,
      total_items: 2,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
          testFunction: null,
        },
      },
      file_snapshot: {
        '/test/file.ts': {
          filepath: '/test/file.ts',
          timestamp: Date.now() - 7200 * 1000,
          checksum: 'old-checksum-123',
          size: 100,
        },
      },
      config: {
        showCodeMode: 'truncated',
        maxLines: 20,
      },
      completed_at: null,
    };

    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
      existingSession,
    ]);

    // Mock: load session
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: file has changed (detected by FileTracker)
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file.ts',
    ]);

    // Mock: re-analysis returns updated items
    (mockBridge.audit as jest.Mock).mockResolvedValueOnce({
      items: [
        {
          name: 'func1',
          type: 'function',
          filepath: '/test/file.ts',
          line_number: 5,
          end_line: 15,
          language: 'typescript',
          complexity: 8, // Changed complexity
          docstring: 'Updated docstring',
          audit_rating: null,
        },
        {
          name: 'testFunction',
          type: 'function',
          filepath: '/test/file.ts',
          line_number: 20,
          end_line: 30,
          language: 'typescript',
          complexity: 6,
          docstring: 'Test',
          audit_rating: null,
        },
      ],
    });

    // Mock: user selects session and rates items
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // Auto-detection prompt: accept resume
        return Promise.resolve({ value: true });
      }
      // Ratings
      return Promise.resolve({ rating: '3' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags - triggers auto-detection
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have detected file changes
    expect(FileTracker.detectChanges).toHaveBeenCalledWith(
      existingSession.file_snapshot
    );

    // Should have shown warning about file changes
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Warning')
    );
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('modified')
    );

    // Should have re-analyzed the changed file
    expect(mockBridge.audit).toHaveBeenCalledWith({
      path: '/test/file.ts',
    });

    // Should have created new snapshot for changed files
    expect(FileTracker.createSnapshot).toHaveBeenCalledWith(['/test/file.ts']);
  });

  it('should handle deleted files on resume with error', async () => {
    // Mock: session referencing a file
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440050',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 0,
      total_items: 1,
      partial_ratings: {
        '/test/deleted-file.ts': {
          deletedFunction: null,
        },
      },
      file_snapshot: {
        '/test/deleted-file.ts': {
          filepath: '/test/deleted-file.ts',
          timestamp: Date.now() - 7200 * 1000,
          checksum: 'old-checksum-456',
          size: 150,
        },
      },
      config: {
        showCodeMode: 'truncated',
        maxLines: 20,
      },
      completed_at: null,
    };

    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
      existingSession,
    ]);

    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: file has been deleted
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/deleted-file.ts',
    ]);

    // Mock: initial audit succeeds (returns empty for deleted file)
    // Then re-analysis fails because file is deleted
    (mockBridge.audit as jest.Mock)
      .mockResolvedValueOnce({
        items: [], // Initial audit returns no items
      })
      .mockRejectedValueOnce(
        new Error('File not found: /test/deleted-file.ts')
      );

    // Mock: auto-detection prompt
    (prompts as jest.MockedFunction<typeof prompts>).mockResolvedValue({
      value: true,
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have attempted re-analysis
    expect(mockBridge.audit).toHaveBeenCalledWith({
      path: '/test/deleted-file.ts',
    });

    // Should have shown error message about failed re-analysis
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('Failed to re-analyze')
    );
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('/test/deleted-file.ts')
    );
  });
});
