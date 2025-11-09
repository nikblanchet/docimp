/**
 * Integration tests for audit resume workflow and error handling.
 *
 * Tests error scenarios and end-to-end resume workflows.
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

describe('Audit Resume Workflow and Error Handling', () => {
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
    // Clean up temp directory and parent (which contains workflow-state.json)
    try {
      await fs.rm(tempRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    jest.restoreAllMocks();
  });

  // Error Handling Tests

  it('should throw error when --resume and --new flags used together', async () => {
    await expect(
      auditCore(
        '/test/path',
        {
          resume: true,
          new: true, // Conflicting flags
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('Cannot use --resume and --new flags together');

    // Should NOT have started audit
    expect(mockBridge.audit).not.toHaveBeenCalled();
  });

  it('should throw error when --resume-file used without --resume', async () => {
    await expect(
      auditCore(
        '/test/path',
        {
          resumeFile: '/path/to/session.json',
          // Missing resume: true
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('--resume-file requires --resume flag');

    // Should NOT have started audit
    expect(mockBridge.audit).not.toHaveBeenCalled();
  });

  it('should throw error with corrupted session file', async () => {
    // Mock: load session throws validation error
    (SessionStateManager.loadSessionState as jest.Mock).mockRejectedValue(
      new Error(
        'Invalid session file format: Missing required field session_id'
      )
    );

    await expect(
      auditCore(
        '/test/path',
        {
          resume: true,
          resumeFile: '/path/to/corrupted.json',
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('Invalid session file format');

    // Should have attempted to load
    expect(SessionStateManager.loadSessionState).toHaveBeenCalled();

    // Should NOT have started audit
    expect(mockBridge.audit).not.toHaveBeenCalled();
  });

  // General Workflow Tests

  it('should complete session and auto-delete when all items rated', async () => {
    // Mock: session with 2 items, 1 already rated
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440090',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 1,
      total_items: 2,
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: user selects session and completes final rating
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // Auto-detection prompt
        return Promise.resolve({ value: true });
      }
      // Final rating
      return Promise.resolve({ rating: '4' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have marked session complete and deleted
    expect(SessionStateManager.deleteSessionState).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440090',
      'audit'
    );

    // Should have saved final ratings
    expect(mockBridge.applyAudit).toHaveBeenCalled();
  });

  it('should preserve session when user quits early', async () => {
    // Mock: session with multiple unrated items
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440100',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 1,
      total_items: 3,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3,
          testFunction: null,
          func2: null,
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: bridge returns 2 unrated items (testFunction and func2)
    (mockBridge.audit as jest.Mock).mockResolvedValueOnce({
      items: [
        {
          name: 'testFunction',
          type: 'function',
          filepath: '/test/file.ts',
          line_number: 10,
          end_line: 20,
          language: 'typescript',
          complexity: 5,
          docstring: 'Test',
          audit_rating: null,
        },
        {
          name: 'func2',
          type: 'function',
          filepath: '/test/file.ts',
          line_number: 30,
          end_line: 40,
          language: 'typescript',
          complexity: 3,
          docstring: 'Another',
          audit_rating: null,
        },
      ],
    });

    // Mock: user quits after first item (Q on second prompt)
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // Auto-detection prompt
        return Promise.resolve({ value: true });
      }
      if (promptCallCount === 2) {
        // First rating for testFunction
        return Promise.resolve({ rating: '3' });
      }
      // Second prompt for func2: user quits
      return Promise.resolve({ rating: 'Q' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have saved progress but NOT deleted session
    expect(SessionStateManager.saveSessionState).toHaveBeenCalled();
    expect(SessionStateManager.deleteSessionState).not.toHaveBeenCalled();
  });

  it('should skip to first unrated item when resuming with unchanged files', async () => {
    // Mock: session with 2 items already rated
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440110',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 2,
      total_items: 3,
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: no file changes
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([]);

    // Mock: user accepts resume and rates the remaining item
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        // Auto-detection prompt
        return Promise.resolve({ value: true });
      }
      // Rating for testFunction (only unrated item)
      return Promise.resolve({ rating: '3' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have prompted for rating only once (only unrated item)
    const ratingCalls = (prompts as jest.Mock).mock.calls.filter(
      (call) => call[0].name === 'rating'
    );
    expect(ratingCalls).toHaveLength(1);
  });

  it('should handle resume when all items already rated', async () => {
    // Mock: session with all items rated
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440120',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 2,
      total_items: 2,
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: bridge returns items matching session state
    (mockBridge.audit as jest.Mock).mockResolvedValueOnce({
      items: [
        {
          name: 'func1',
          type: 'function',
          filepath: '/test/file.ts',
          line_number: 10,
          end_line: 20,
          language: 'typescript',
          complexity: 5,
          docstring: 'First function',
          audit_rating: null, // Not yet in audit file (session not complete)
        },
        {
          name: 'func2',
          type: 'function',
          filepath: '/test/file.ts',
          line_number: 30,
          end_line: 40,
          language: 'typescript',
          complexity: 3,
          docstring: 'Second function',
          audit_rating: null,
        },
      ],
    });

    // Mock: no file changes
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([]);

    // Mock: auto-detection
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

    // Should have shown message about all items rated
    expect(mockDisplay.showMessage).toHaveBeenCalledWith(
      expect.stringContaining('All items from session already rated')
    );

    // Should have saved final ratings and deleted session
    expect(mockBridge.applyAudit).toHaveBeenCalled();
    expect(SessionStateManager.deleteSessionState).toHaveBeenCalled();
  });

  it('should preserve existing ratings when resuming', async () => {
    // Mock: session with existing ratings
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440130',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 1,
      total_items: 2,
      partial_ratings: {
        '/test/file.ts': {
          func1: 3, // Existing rating
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: user rates remaining item
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        return Promise.resolve({ value: true });
      }
      return Promise.resolve({ rating: '4' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Verify existing rating was preserved
    const applyCall = (mockBridge.applyAudit as jest.Mock).mock.calls[0];
    const ratingsArg = applyCall[0];
    expect(ratingsArg.ratings).toEqual({
      '/test/file.ts': {
        func1: 3, // Preserved
        testFunction: 4, // New
      },
    });
  });

  it('should merge new items from changed files during resume', async () => {
    // Mock: session with 1 item
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440140',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 0,
      total_items: 1,
      partial_ratings: {
        '/test/file.ts': {
          testFunction: null,
        },
      },
      file_snapshot: {
        '/test/file.ts': {
          filepath: '/test/file.ts',
          timestamp: Date.now() - 7200 * 1000,
          checksum: 'old-checksum',
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: file has changed
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file.ts',
    ]);

    // Mock: bridge.audit is called twice (initial + re-analysis)
    // First call: initial audit (returns session items)
    // Second call: re-analysis of changed file (returns updated items with new item)
    let auditCallCount = 0;
    (mockBridge.audit as jest.Mock).mockImplementation(() => {
      auditCallCount++;
      if (auditCallCount === 1) {
        // First call: return original session item
        return Promise.resolve({
          items: [
            {
              name: 'testFunction',
              type: 'function',
              filepath: '/test/file.ts',
              line_number: 10,
              end_line: 20,
              language: 'typescript',
              complexity: 5,
              docstring: 'Original',
              audit_rating: null,
            },
          ],
        });
      }
      // Second call (file invalidation): return updated items with NEW item
      return Promise.resolve({
        items: [
          {
            name: 'testFunction',
            type: 'function',
            filepath: '/test/file.ts',
            line_number: 10,
            end_line: 20,
            language: 'typescript',
            complexity: 5,
            docstring: 'Updated',
            audit_rating: null,
          },
          {
            name: 'newFunction', // NEW item
            type: 'function',
            filepath: '/test/file.ts',
            line_number: 30,
            end_line: 40,
            language: 'typescript',
            complexity: 3,
            docstring: 'New',
            audit_rating: null,
          },
        ],
      });
    });

    // Mock: user rates both items
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        return Promise.resolve({ value: true });
      }
      return Promise.resolve({ rating: '3' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have prompted for 2 items (original + new)
    const ratingCalls = (prompts as jest.Mock).mock.calls.filter(
      (call) => call[0].name === 'rating'
    );
    expect(ratingCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('should update file snapshot after re-analyzing changed files', async () => {
    // Mock: session with file snapshot
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440150',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 0,
      total_items: 1,
      partial_ratings: {
        '/test/file.ts': {
          testFunction: null,
        },
      },
      file_snapshot: {
        '/test/file.ts': {
          filepath: '/test/file.ts',
          timestamp: Date.now() - 7200 * 1000,
          checksum: 'old-checksum-xyz',
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
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: file has changed
    (FileTracker.detectChanges as jest.Mock).mockResolvedValue([
      '/test/file.ts',
    ]);

    // Mock: new snapshot
    (FileTracker.createSnapshot as jest.Mock).mockResolvedValue({
      '/test/file.ts': {
        filepath: '/test/file.ts',
        timestamp: Date.now(),
        checksum: 'new-checksum-abc',
        size: 150,
      },
    });

    // Mock: user interaction
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        return Promise.resolve({ value: true });
      }
      return Promise.resolve({ rating: '3' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Should have created new snapshot for changed files
    expect(FileTracker.createSnapshot).toHaveBeenCalledWith(['/test/file.ts']);

    // Verify snapshot was saved (check last saveSessionState call)
    const saveCalls = (SessionStateManager.saveSessionState as jest.Mock).mock
      .calls;
    const lastSave = saveCalls[saveCalls.length - 1][0];
    expect(lastSave.file_snapshot['/test/file.ts'].checksum).toBe(
      'new-checksum-abc'
    );
  });

  it('should preserve session config when resuming', async () => {
    // Mock: session with custom config
    const existingSession: AuditSessionState = {
      session_id: '550e8400-e29b-41d4-a716-446655440160',
      started_at: new Date(Date.now() - 3600 * 1000).toISOString(),
      current_index: 0,
      total_items: 1,
      partial_ratings: {
        '/test/file.ts': {
          testFunction: null,
        },
      },
      file_snapshot: {},
      config: {
        showCodeMode: 'signature', // Custom mode
        maxLines: 50, // Custom max lines
      },
      completed_at: null,
    };

    (SessionStateManager.listSessions as jest.Mock).mockResolvedValue([
      existingSession,
    ]);
    (SessionStateManager.loadSessionState as jest.Mock).mockResolvedValue(
      existingSession
    );

    // Mock: user completes audit
    let promptCallCount = 0;
    (prompts as jest.MockedFunction<typeof prompts>).mockImplementation(() => {
      promptCallCount++;
      if (promptCallCount === 1) {
        return Promise.resolve({ value: true });
      }
      return Promise.resolve({ rating: '3' });
    });

    await auditCore(
      '/test/path',
      {}, // No flags
      mockBridge,
      mockDisplay,
      mockConfigLoader
    );

    // Verify config was preserved in session state
    const saveCalls = (SessionStateManager.saveSessionState as jest.Mock).mock
      .calls;
    const savedState = saveCalls[0][0];
    expect(savedState.config.showCodeMode).toBe('signature');
    expect(savedState.config.maxLines).toBe(50);
  });
});
