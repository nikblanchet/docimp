/**
 * Tests for rollback CLI commands.
 */

import { listSessionsCore, listSessionsCommand } from '../commands/listSessions';
import { listChangesCore, listChangesCommand } from '../commands/listChanges';
import { rollbackSessionCore, rollbackSessionCommand } from '../commands/rollbackSession';
import { rollbackChangeCore, rollbackChangeCommand } from '../commands/rollbackChange';
import type { IPythonBridge } from '../python-bridge/IPythonBridge';
import type { IDisplay } from '../display/IDisplay';
import type { SessionSummary, TransactionEntry, RollbackResult } from '../types/analysis';
import { EXIT_CODE } from '../constants/exitCodes';

// Mock ESM modules
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    cyan: (str: string) => str,
    gray: (str: string) => str,
  },
  bold: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  cyan: (str: string) => str,
  gray: (str: string) => str,
}));

jest.mock('cli-table3', () => {
  return class MockTable {
    constructor() {}
    push() {}
    toString() { return 'mocked table'; }
  };
});

describe('List Sessions Command', () => {
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockSessions: SessionSummary[];

  beforeEach(() => {
    mockSessions = [
      {
        session_id: 'session-123',
        started_at: '2024-01-01T10:00:00',
        completed_at: null,
        change_count: 5,
        status: 'in_progress'
      },
      {
        session_id: 'session-456',
        started_at: '2024-01-02T10:00:00',
        completed_at: '2024-01-02T11:00:00',
        change_count: 3,
        status: 'committed'
      }
    ];

    mockBridge = {
      listSessions: jest.fn().mockResolvedValue(mockSessions),
      listChanges: jest.fn(),
      rollbackSession: jest.fn(),
      rollbackChange: jest.fn(),
      analyze: jest.fn(),
      audit: jest.fn(),
      applyAudit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    mockDisplay = {
      showSessionList: jest.fn(),
      showChangeList: jest.fn(),
      showRollbackResult: jest.fn(),
      showAnalysisResult: jest.fn(),
      showConfig: jest.fn(),
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showSuccess: jest.fn(),
      showCodeItems: jest.fn(),
      startSpinner: jest.fn().mockReturnValue(() => {}),
      showProgress: jest.fn(),
      showAuditSummary: jest.fn(),
      showBoxedDocstring: jest.fn(),
      showCodeBlock: jest.fn(),
      showSignature: jest.fn(),
    };
  });

  describe('listSessionsCore', () => {
    it('calls bridge.listSessions and displays result', async () => {
      await listSessionsCore(mockBridge, mockDisplay);

      expect(mockBridge.listSessions).toHaveBeenCalledTimes(1);
      expect(mockDisplay.showSessionList).toHaveBeenCalledWith(mockSessions);
    });

    it('displays empty list when no sessions', async () => {
      (mockBridge.listSessions as jest.Mock).mockResolvedValue([]);

      await listSessionsCore(mockBridge, mockDisplay);

      expect(mockDisplay.showSessionList).toHaveBeenCalledWith([]);
    });
  });

  describe('listSessionsCommand', () => {
    it('returns SUCCESS exit code on success', async () => {
      const exitCode = await listSessionsCommand(mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('returns ERROR exit code on failure', async () => {
      (mockBridge.listSessions as jest.Mock).mockRejectedValue(new Error('Git not available'));

      const exitCode = await listSessionsCommand(mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith('Git not available');
    });
  });
});

describe('List Changes Command', () => {
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockChanges: TransactionEntry[];

  beforeEach(() => {
    mockChanges = [
      {
        entry_id: 'abc123',
        filepath: '/path/to/file1.py',
        timestamp: '2024-01-01T10:01:00',
        item_name: 'my_function',
        item_type: 'function',
        language: 'python',
        success: true
      },
      {
        entry_id: 'def456',
        filepath: '/path/to/file2.ts',
        timestamp: '2024-01-01T10:02:00',
        item_name: 'MyClass',
        item_type: 'class',
        language: 'typescript',
        success: true
      }
    ];

    mockBridge = {
      listSessions: jest.fn(),
      listChanges: jest.fn().mockResolvedValue(mockChanges),
      rollbackSession: jest.fn(),
      rollbackChange: jest.fn(),
      analyze: jest.fn(),
      audit: jest.fn(),
      applyAudit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    mockDisplay = {
      showSessionList: jest.fn(),
      showChangeList: jest.fn(),
      showRollbackResult: jest.fn(),
      showAnalysisResult: jest.fn(),
      showConfig: jest.fn(),
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showSuccess: jest.fn(),
      showCodeItems: jest.fn(),
      startSpinner: jest.fn().mockReturnValue(() => {}),
      showProgress: jest.fn(),
      showAuditSummary: jest.fn(),
      showBoxedDocstring: jest.fn(),
      showCodeBlock: jest.fn(),
      showSignature: jest.fn(),
    };
  });

  describe('listChangesCore', () => {
    it('calls bridge.listChanges with session ID and displays result', async () => {
      await listChangesCore('session-123', mockBridge, mockDisplay);

      expect(mockBridge.listChanges).toHaveBeenCalledWith('session-123');
      expect(mockDisplay.showChangeList).toHaveBeenCalledWith(mockChanges, 'session-123');
    });

    it('handles "last" session ID', async () => {
      await listChangesCore('last', mockBridge, mockDisplay);

      expect(mockBridge.listChanges).toHaveBeenCalledWith('last');
    });
  });

  describe('listChangesCommand', () => {
    it('returns SUCCESS exit code on success', async () => {
      const exitCode = await listChangesCommand('session-123', mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('returns ERROR exit code on failure', async () => {
      (mockBridge.listChanges as jest.Mock).mockRejectedValue(new Error('Session not found'));

      const exitCode = await listChangesCommand('session-123', mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith('Session not found');
    });
  });
});

describe('Rollback Session Command', () => {
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockResult: RollbackResult;

  beforeEach(() => {
    mockResult = {
      success: true,
      restored_count: 3,
      failed_count: 0,
      status: 'completed',
      conflicts: [],
      message: 'Rolled back 3 file(s)'
    };

    mockBridge = {
      listSessions: jest.fn(),
      listChanges: jest.fn(),
      rollbackSession: jest.fn().mockResolvedValue(mockResult),
      rollbackChange: jest.fn(),
      analyze: jest.fn(),
      audit: jest.fn(),
      applyAudit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    mockDisplay = {
      showSessionList: jest.fn(),
      showChangeList: jest.fn(),
      showRollbackResult: jest.fn(),
      showAnalysisResult: jest.fn(),
      showConfig: jest.fn(),
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showSuccess: jest.fn(),
      showCodeItems: jest.fn(),
      startSpinner: jest.fn().mockReturnValue(() => {}),
      showProgress: jest.fn(),
      showAuditSummary: jest.fn(),
      showBoxedDocstring: jest.fn(),
      showCodeBlock: jest.fn(),
      showSignature: jest.fn(),
    };
  });

  describe('rollbackSessionCore', () => {
    it('calls bridge.rollbackSession and displays result', async () => {
      await rollbackSessionCore('session-123', mockBridge, mockDisplay);

      expect(mockBridge.rollbackSession).toHaveBeenCalledWith('session-123');
      expect(mockDisplay.showRollbackResult).toHaveBeenCalledWith(mockResult);
    });

    it('handles "last" session ID', async () => {
      await rollbackSessionCore('last', mockBridge, mockDisplay);

      expect(mockBridge.rollbackSession).toHaveBeenCalledWith('last');
    });

    it('displays result with conflicts', async () => {
      const conflictResult: RollbackResult = {
        success: false,
        restored_count: 0,
        failed_count: 2,
        status: 'failed',
        conflicts: ['/path/to/file1.py', '/path/to/file2.ts'],
        message: 'Rollback failed: 2 file(s) had conflicts'
      };
      (mockBridge.rollbackSession as jest.Mock).mockResolvedValue(conflictResult);

      await rollbackSessionCore('session-123', mockBridge, mockDisplay);

      expect(mockDisplay.showRollbackResult).toHaveBeenCalledWith(conflictResult);
    });
  });

  describe('rollbackSessionCommand', () => {
    it('returns SUCCESS exit code on success', async () => {
      const exitCode = await rollbackSessionCommand('session-123', mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('returns ERROR exit code on failure', async () => {
      (mockBridge.rollbackSession as jest.Mock).mockRejectedValue(new Error('Git error'));

      const exitCode = await rollbackSessionCommand('session-123', mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith('Git error');
    });
  });
});

describe('Rollback Change Command', () => {
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockResult: RollbackResult;

  beforeEach(() => {
    mockResult = {
      success: true,
      restored_count: 1,
      failed_count: 0,
      status: 'completed',
      conflicts: [],
      message: 'Rolled back 1 file(s)'
    };

    mockBridge = {
      listSessions: jest.fn(),
      listChanges: jest.fn(),
      rollbackSession: jest.fn(),
      rollbackChange: jest.fn().mockResolvedValue(mockResult),
      analyze: jest.fn(),
      audit: jest.fn(),
      applyAudit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    mockDisplay = {
      showSessionList: jest.fn(),
      showChangeList: jest.fn(),
      showRollbackResult: jest.fn(),
      showAnalysisResult: jest.fn(),
      showConfig: jest.fn(),
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showSuccess: jest.fn(),
      showCodeItems: jest.fn(),
      startSpinner: jest.fn().mockReturnValue(() => {}),
      showProgress: jest.fn(),
      showAuditSummary: jest.fn(),
      showBoxedDocstring: jest.fn(),
      showCodeBlock: jest.fn(),
      showSignature: jest.fn(),
    };
  });

  describe('rollbackChangeCore', () => {
    it('calls bridge.rollbackChange and displays result', async () => {
      await rollbackChangeCore('abc123', mockBridge, mockDisplay);

      expect(mockBridge.rollbackChange).toHaveBeenCalledWith('abc123');
      expect(mockDisplay.showRollbackResult).toHaveBeenCalledWith(mockResult);
    });

    it('handles "last" entry ID', async () => {
      await rollbackChangeCore('last', mockBridge, mockDisplay);

      expect(mockBridge.rollbackChange).toHaveBeenCalledWith('last');
    });
  });

  describe('rollbackChangeCommand', () => {
    it('returns SUCCESS exit code on success', async () => {
      const exitCode = await rollbackChangeCommand('abc123', mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('returns ERROR exit code on failure', async () => {
      (mockBridge.rollbackChange as jest.Mock).mockRejectedValue(new Error('Change not found'));

      const exitCode = await rollbackChangeCommand('abc123', mockBridge, mockDisplay);

      expect(exitCode).toBe(EXIT_CODE.ERROR);
      expect(mockDisplay.showError).toHaveBeenCalledWith('Change not found');
    });
  });
});
