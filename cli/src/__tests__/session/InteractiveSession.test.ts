/**
 * Tests for InteractiveSession.
 *
 * Tests the main interactive documentation improvement workflow.
 */

import { randomUUID } from 'node:crypto';
import { InteractiveSession } from '../../session/interactive-session.js';
import { PythonBridge } from '../../python-bridge/python-bridge.js';
import { PluginManager } from '../../plugins/plugin-manager.js';
import { EditorLauncher } from '../../editor/editor-launcher.js';
import { SessionStateManager } from '../../utils/session-state-manager.js';
import prompts from 'prompts';
import type { PlanItem } from '../../types/analysis.js';
import type { IConfig } from '../../config/i-config.js';

// Mock dependencies
jest.mock('../../python-bridge/python-bridge.js');
jest.mock('../../plugins/plugin-manager.js');
jest.mock('../../editor/editor-launcher.js');
jest.mock('prompts');
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    cyan: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
  },
  bold: (str: string) => str,
  cyan: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
}));

const MockPythonBridge = PythonBridge as jest.MockedClass<typeof PythonBridge>;
const MockPluginManager = PluginManager as jest.MockedClass<
  typeof PluginManager
>;
const MockEditorLauncher = EditorLauncher as jest.MockedClass<
  typeof EditorLauncher
>;
const mockPrompts = prompts as jest.MockedFunction<typeof prompts>;

describe('InteractiveSession', () => {
  let session: InteractiveSession;
  let mockPythonBridge: jest.Mocked<PythonBridge>;
  let mockPluginManager: jest.Mocked<PluginManager>;
  let mockEditorLauncher: jest.Mocked<EditorLauncher>;
  let mockConfig: IConfig;
  let mockPlanItem: PlanItem;

  // Suppress console output during tests
  let consoleSpy: jest.SpyInstance;

  // Helper to create additional plan items for multi-item tests
  const createSecondItem = (
    baseItem: PlanItem,
    baseName = 'secondFunction',
    lineNumber = 20
  ): PlanItem => ({
    ...baseItem,
    name: baseName,
    line_number: lineNumber,
  });

  beforeEach(() => {
    // Suppress console output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();

    // Create mock config
    mockConfig = {
      styleGuides: {
        javascript: 'jsdoc-vanilla',
        python: 'google',
        typescript: 'tsdoc-typedoc',
      },
      tone: 'concise',
      plugins: [],
      exclude: [],
    };

    // Create mock instances
    mockPythonBridge = new MockPythonBridge() as jest.Mocked<PythonBridge>;
    mockPluginManager = new MockPluginManager() as jest.Mocked<PluginManager>;
    mockEditorLauncher = {
      editText: jest.fn().mockResolvedValue(null),
    } as any;

    // Setup default mock behaviors
    mockPythonBridge.suggest = jest
      .fn()
      .mockResolvedValue('/** Generated docs */');
    mockPythonBridge.apply = jest.fn().mockResolvedValue(undefined);
    mockPluginManager.runBeforeAccept = jest.fn().mockResolvedValue([]);

    // Create mock plan item
    mockPlanItem = {
      name: 'testFunction',
      type: 'function',
      filepath: 'test.js',
      line_number: 10,
      language: 'javascript',
      complexity: 5,
      impact_score: 75,
      reason: 'High complexity function',
      export_type: 'named',
      module_system: 'esm',
      parameters: ['a', 'b'],
      return_type: 'number',
      has_docs: false,
      docstring: null,
      audit_rating: null,
    };

    // Create session with injected editorLauncher
    session = new InteractiveSession({
      config: mockConfig,
      pythonBridge: mockPythonBridge,
      pluginManager: mockPluginManager,
      editorLauncher: mockEditorLauncher,
      styleGuides: {
        javascript: 'jsdoc-vanilla',
        python: 'google',
        typescript: 'tsdoc-typedoc',
      },
      tone: 'concise',
      basePath: process.cwd(),
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.resetAllMocks();
  });

  describe('run', () => {
    it('should handle empty item list', async () => {
      await session.run([]);

      expect(mockPythonBridge.suggest).not.toHaveBeenCalled();
    });

    it('should process single item with accept action', async () => {
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.suggest).toHaveBeenCalledWith({
        target: 'test.js:testFunction',
        styleGuide: 'jsdoc-vanilla',
        tone: 'concise',
      });
      expect(mockPluginManager.runBeforeAccept).toHaveBeenCalled();
      expect(mockPythonBridge.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: 'test.js',
          item_name: 'testFunction',
          docstring: '/** Generated docs */',
        })
      );
    });

    it('should process single item with skip action', async () => {
      mockPrompts.mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.suggest).toHaveBeenCalled();
      expect(mockPythonBridge.apply).not.toHaveBeenCalled();
    });

    it('should stop processing when user quits', async () => {
      const items = [mockPlanItem, { ...mockPlanItem, name: 'secondFunction' }];
      mockPrompts.mockResolvedValueOnce({ action: 'quit' });

      await session.run(items);

      expect(mockPythonBridge.suggest).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.apply).not.toHaveBeenCalled();
    });

    it('should continue to next item after accept', async () => {
      const items = [
        mockPlanItem,
        { ...mockPlanItem, name: 'secondFunction', line_number: 20 },
      ];
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' })
        .mockResolvedValueOnce({ action: 'skip' });

      await session.run(items);

      expect(mockPythonBridge.suggest).toHaveBeenCalledTimes(2);
      expect(mockPythonBridge.apply).toHaveBeenCalledTimes(1);
    });

    it('should handle suggestion generation failure', async () => {
      mockPythonBridge.suggest.mockRejectedValueOnce(new Error('API error'));
      mockPrompts.mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      // Should continue despite error
      expect(mockPythonBridge.apply).not.toHaveBeenCalled();

      // Should track error in summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Errors: 1/)
      );
    });

    it('should handle write failure', async () => {
      mockPythonBridge.apply.mockRejectedValueOnce(new Error('Write failed'));
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.apply).toHaveBeenCalled();
      // Should not throw, just log error

      // Should track error in summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Errors: 1/)
      );
    });
  });

  describe('transaction initialization', () => {
    it('should call beginTransaction at session start', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledWith(
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        )
      );
    });

    it('should continue session if transaction initialization fails', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockRejectedValue(new Error('Git backend not available'));
      mockPrompts.mockResolvedValueOnce({ action: 'skip' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await session.run([mockPlanItem]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to initialize transaction/),
        expect.any(String)
      );
      expect(mockPythonBridge.suggest).toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should generate unique session IDs for each run', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPrompts
        .mockResolvedValueOnce({ action: 'skip' })
        .mockResolvedValueOnce({ action: 'skip' });

      // First session instance
      await session.run([mockPlanItem]);
      const firstCallSessionId =
        mockPythonBridge.beginTransaction.mock.calls[0][0];

      // Create a new session instance for second run (not resuming)
      const secondSession = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { python: 'google' },
        tone: 'concise',
        basePath: '/test',
      });

      await secondSession.run([mockPlanItem]);
      const secondCallSessionId =
        mockPythonBridge.beginTransaction.mock.calls[1][0];

      expect(firstCallSessionId).not.toBe(secondCallSessionId);
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(2);
    });

    it('should not call beginTransaction for empty item list', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);

      await session.run([]);

      expect(mockPythonBridge.beginTransaction).not.toHaveBeenCalled();
    });
  });

  describe('change tracking', () => {
    it('should call recordWrite after successful write', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.recordWrite).toHaveBeenCalledWith(
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        ),
        mockPlanItem.filepath,
        expect.stringContaining('.bak'),
        mockPlanItem.name,
        mockPlanItem.type,
        mockPlanItem.language
      );
    });

    it('should pass backup_path to apply command', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          backup_path: expect.stringContaining('.bak'),
        })
      );
    });

    it('should not call recordWrite if transaction initialization failed', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockRejectedValue(new Error('Git not available'));
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.recordWrite).not.toHaveBeenCalled();

      consoleWarnSpy.mockRestore();
    });

    it('should continue if recordWrite fails (graceful degradation)', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest
        .fn()
        .mockRejectedValue(new Error('Git commit failed'));
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await session.run([mockPlanItem]);

      // Write should succeed even though recordWrite failed
      expect(mockPythonBridge.apply).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to record change in transaction/),
        expect.any(String)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should not call recordWrite when user skips', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.recordWrite).not.toHaveBeenCalled();
    });
  });

  describe('transaction finalization', () => {
    it('should call commitTransaction after successful session completion', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.commitTransaction).toHaveBeenCalledWith(
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        )
      );
      expect(mockPythonBridge.commitTransaction).toHaveBeenCalledTimes(1);
    });

    it('should call commitTransaction even when user quits mid-session', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockResolvedValue(undefined);

      // First item: accept, second item: quit
      const secondItem = { ...mockPlanItem, name: 'secondFunction' };
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' })
        .mockResolvedValueOnce({ action: 'quit' });

      await session.run([mockPlanItem, secondItem]);

      // Quitting is a normal exit - transaction should still be committed
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalled();
      expect(mockPythonBridge.recordWrite).toHaveBeenCalledTimes(1); // Only first item
      expect(mockPythonBridge.commitTransaction).toHaveBeenCalledTimes(1); // Still commits
    });

    it('should continue if commitTransaction fails (graceful degradation)', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockRejectedValue(new Error('Git merge failed'));
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await session.run([mockPlanItem]);

      // Session should complete despite commit failure
      expect(mockPythonBridge.apply).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to finalize transaction/),
        expect.any(String)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should NOT attempt commit if transaction never initialized', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockRejectedValue(new Error('Git not available'));
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await session.run([mockPlanItem]);

      // Transaction init failed, so commitTransaction should never be called
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalled();
      expect(mockPythonBridge.commitTransaction).not.toHaveBeenCalled();
      expect(mockPythonBridge.apply).toHaveBeenCalled(); // Write still succeeds

      consoleWarnSpy.mockRestore();
    });

    it('should provide user feedback on successful finalization', async () => {
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await session.run([mockPlanItem]);

      // Verify console output mentions finalization/commit
      const allCalls = consoleLogSpy.mock.calls.flat();
      const hasFinalizationMessage = allCalls.some(
        (call) =>
          typeof call === 'string' &&
          (call.includes('finalize') ||
            call.includes('commit') ||
            call.includes('Session complete'))
      );

      expect(hasFinalizationMessage).toBe(true);
      expect(mockPythonBridge.commitTransaction).toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });
  });

  describe('plugin validation', () => {
    it('should run plugin validation before showing suggestion', async () => {
      const validationResults = [{ accept: true, plugin: 'test-plugin' }];
      mockPluginManager.runBeforeAccept.mockResolvedValueOnce(
        validationResults
      );
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPluginManager.runBeforeAccept).toHaveBeenCalledWith(
        '/** Generated docs */',
        expect.objectContaining({
          name: 'testFunction',
          type: 'function',
          filepath: 'test.js',
        }),
        mockConfig
      );
    });

    it('should show validation warnings when plugins reject', async () => {
      const validationResults = [
        {
          accept: false,
          reason: 'Parameter name mismatch',
          plugin: 'validate-types',
        },
      ];
      mockPluginManager.runBeforeAccept.mockResolvedValueOnce(
        validationResults
      );
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.apply).toHaveBeenCalled();
    });

    it('should allow accepting despite validation failures', async () => {
      const validationResults = [
        { accept: false, reason: 'Style issue', plugin: 'style-checker' },
      ];
      mockPluginManager.runBeforeAccept.mockResolvedValueOnce(
        validationResults
      );
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.apply).toHaveBeenCalled();
    });
  });

  describe('edit action', () => {
    it('should launch editor when edit action chosen', async () => {
      mockEditorLauncher.editText.mockResolvedValueOnce('/** Edited docs */');

      mockPrompts
        .mockResolvedValueOnce({ action: 'edit' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockEditorLauncher.editText).toHaveBeenCalledWith(
        '/** Generated docs */',
        '.js'
      );
      expect(mockPythonBridge.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          docstring: '/** Edited docs */',
        })
      );
    });

    it('should re-validate after editing', async () => {
      mockEditorLauncher.editText.mockResolvedValueOnce('/** Edited docs */');

      mockPrompts
        .mockResolvedValueOnce({ action: 'edit' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPluginManager.runBeforeAccept).toHaveBeenCalledTimes(2);
      expect(mockPluginManager.runBeforeAccept).toHaveBeenNthCalledWith(
        2,
        '/** Edited docs */',
        expect.any(Object),
        mockConfig
      );
    });

    it('should handle editor returning null (no changes)', async () => {
      mockEditorLauncher.editText.mockResolvedValueOnce(null);

      mockPrompts
        .mockResolvedValueOnce({ action: 'edit' })
        .mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      // Should show original suggestion again
      expect(mockPythonBridge.apply).not.toHaveBeenCalled();
    });

    it('should use correct file extension for Python', async () => {
      mockEditorLauncher.editText.mockResolvedValueOnce('"""Edited docs"""');

      const pythonItem: PlanItem = {
        ...mockPlanItem,
        language: 'python',
        filepath: 'test.py',
      };
      mockPrompts
        .mockResolvedValueOnce({ action: 'edit' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run([pythonItem]);

      expect(mockEditorLauncher.editText).toHaveBeenCalledWith(
        expect.any(String),
        '.py'
      );
    });
  });

  describe('regenerate action', () => {
    it('should prompt for feedback when regenerating', async () => {
      mockPrompts
        .mockResolvedValueOnce({ action: 'regenerate' })
        .mockResolvedValueOnce({ feedback: 'Add more detail' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPrompts).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'text',
          name: 'feedback',
        })
      );
    });

    it('should request new suggestion after feedback', async () => {
      mockPythonBridge.suggest
        .mockResolvedValueOnce('/** First suggestion */')
        .mockResolvedValueOnce('/** Second suggestion */');

      mockPrompts
        .mockResolvedValueOnce({ action: 'regenerate' })
        .mockResolvedValueOnce({ feedback: 'Make it better' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.suggest).toHaveBeenCalledTimes(2);

      // Verify first call has no feedback
      expect(mockPythonBridge.suggest).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          target: 'test.js:testFunction',
          styleGuide: 'jsdoc-vanilla',
          tone: 'concise',
          feedback: undefined,
        })
      );

      // Verify second call includes feedback
      expect(mockPythonBridge.suggest).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          target: 'test.js:testFunction',
          styleGuide: 'jsdoc-vanilla',
          tone: 'concise',
          feedback: 'Make it better',
        })
      );

      expect(mockPythonBridge.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          docstring: '/** Second suggestion */',
        })
      );
    });

    it('should handle regeneration failure', async () => {
      mockPythonBridge.suggest
        .mockResolvedValueOnce('/** First suggestion */')
        .mockRejectedValueOnce(new Error('API error'));

      mockPrompts
        .mockResolvedValueOnce({ action: 'regenerate' })
        .mockResolvedValueOnce({ feedback: 'Try again' })
        .mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      // Should continue with original suggestion
      expect(mockPythonBridge.apply).not.toHaveBeenCalled();
    });

    it('should handle empty feedback', async () => {
      mockPrompts
        .mockResolvedValueOnce({ action: 'regenerate' })
        .mockResolvedValueOnce({ feedback: '' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      // Should show original suggestion again
      expect(mockPythonBridge.suggest).toHaveBeenCalledTimes(1);
    });
  });

  describe('interface type handling', () => {
    it('should convert interface type to class for plugin validation', async () => {
      const interfaceItem = {
        ...mockPlanItem,
        type: 'interface' as any,
        name: 'ITestInterface',
      };
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([interfaceItem]);

      expect(mockPluginManager.runBeforeAccept).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'class',
        }),
        expect.any(Object)
      );
    });
  });

  describe('progress tracking', () => {
    it('should show progress for multiple items', async () => {
      const items = [
        mockPlanItem,
        { ...mockPlanItem, name: 'second' },
        { ...mockPlanItem, name: 'third' },
      ];
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' })
        .mockResolvedValueOnce({ action: 'skip' })
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run(items);

      // Should show progress indicators
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[1\/3\]/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[2\/3\]/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[3\/3\]/)
      );
    });

    it('should show final summary', async () => {
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Session Summary/)
      );
    });
  });

  describe('error tracking integration', () => {
    it('should track errors when initial suggestion fails', async () => {
      mockPythonBridge.suggest.mockRejectedValueOnce(new Error('API error'));

      await session.run([mockPlanItem]);

      // Should show error message
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to generate suggestion/)
      );

      // Should show error count in summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Errors: 1/)
      );
    });

    it('should track errors when write to file fails', async () => {
      mockPythonBridge.apply.mockRejectedValueOnce(new Error('Write failed'));
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      // Should show error message
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Failed to write documentation/)
      );

      // Should show error count in summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Errors: 1/)
      );

      // Should NOT show as accepted
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Accepted: 0/)
      );
    });

    it('should track multiple errors across items', async () => {
      const items = [
        mockPlanItem, // Item 1: accept (success)
        { ...mockPlanItem, name: 'second', line_number: 20 }, // Item 2: error (suggest fails)
        { ...mockPlanItem, name: 'third', line_number: 30 }, // Item 3: error (write fails)
        { ...mockPlanItem, name: 'fourth', line_number: 40 }, // Item 4: skip
        { ...mockPlanItem, name: 'fifth', line_number: 50 }, // Item 5: accept (success)
      ];

      mockPythonBridge.suggest
        .mockResolvedValueOnce('/** Docs 1 */')
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce('/** Docs 3 */')
        .mockResolvedValueOnce('/** Docs 4 */')
        .mockResolvedValueOnce('/** Docs 5 */');

      mockPythonBridge.apply
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Write failed'))
        .mockResolvedValueOnce(undefined);

      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Item 1
        // Item 2: suggest fails, no prompt
        .mockResolvedValueOnce({ action: 'accept' }) // Item 3
        .mockResolvedValueOnce({ action: 'skip' }) // Item 4
        .mockResolvedValueOnce({ action: 'accept' }); // Item 5

      await session.run(items);

      // Verify summary shows all items accounted for
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Total items: 5/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Completed: 5/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Accepted: 2/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Skipped: 1/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Errors: 2/)
      );
    });

    it('should not show errors in summary when count is zero', async () => {
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      // Should show summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Session Summary/)
      );

      // Should NOT contain "Errors:" line
      const allCalls = consoleSpy.mock.calls.map((call) => call[0]);
      const hasErrorLine = allCalls.some(
        (call: string) => typeof call === 'string' && call.includes('Errors:')
      );
      expect(hasErrorLine).toBe(false);
    });

    it('should show errors in progress string during workflow', async () => {
      const items = [
        mockPlanItem,
        { ...mockPlanItem, name: 'second', line_number: 20 },
        { ...mockPlanItem, name: 'third', line_number: 30 },
      ];

      mockPythonBridge.suggest
        .mockResolvedValueOnce('/** Docs 1 */')
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce('/** Docs 3 */');

      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' })
        // Item 2 fails
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run(items);

      // Progress string for item 3 should include error count
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[3\/3\].*1 error/)
      );
    });
  });

  describe('regression: Issue #219', () => {
    it('should not lose items in summary when errors occur (Issue #219)', async () => {
      // Reproduce exact scenario from Issue #219:
      // Item 1: Accept (success)
      // Item 2: Suggestion fails
      // Item 3: Suggestion fails
      // Item 4: Accept (success)
      const items = [
        { ...mockPlanItem, name: 'item1', line_number: 10 },
        { ...mockPlanItem, name: 'item2', line_number: 20 },
        { ...mockPlanItem, name: 'item3', line_number: 30 },
        { ...mockPlanItem, name: 'item4', line_number: 40 },
      ];

      mockPythonBridge.suggest
        .mockResolvedValueOnce('/** Docs 1 */')
        .mockRejectedValueOnce(new Error('Invalid style guide'))
        .mockRejectedValueOnce(new Error('Invalid style guide'))
        .mockResolvedValueOnce('/** Docs 4 */');

      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' })
        // Items 2-3: errors, no prompts
        .mockResolvedValueOnce({ action: 'accept' });

      await session.run(items);

      // CRITICAL: All 4 items must be accounted for
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Total items: 4/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Completed: 4/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Accepted: 2/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Errors: 2/)
      );

      // Verify no items "disappeared"
      // 4 total = 2 accepted + 2 errors + 0 skipped
      const allCalls = consoleSpy.mock.calls.map((call) => call[0]).join('\n');
      expect(allCalls).toMatch(/Completed: 4/);
      expect(allCalls).not.toMatch(/Quit at item/);
    });
  });

  describe('claude configuration integration (Issue #243)', () => {
    it('should pass claude config values through to PythonBridge', async () => {
      // Create config with custom claude settings
      const customConfig: IConfig = {
        ...mockConfig,
        claude: {
          timeout: 45.0,
          maxRetries: 5,
          retryDelay: 2.0,
        },
      };

      // Create session with custom config
      const customSession = new InteractiveSession({
        config: customConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'google',
          typescript: 'tsdoc-typedoc',
        },
        tone: 'concise',
        basePath: process.cwd(),
      });

      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await customSession.run([mockPlanItem]);

      // Verify suggest was called with claude config values
      expect(mockPythonBridge.suggest).toHaveBeenCalledWith({
        target: 'test.js:testFunction',
        styleGuide: 'jsdoc-vanilla',
        tone: 'concise',
        timeout: 45.0,
        maxRetries: 5,
        retryDelay: 2.0,
      });
    });

    it('should use default claude config when not specified', async () => {
      // Config without claude section - should use defaults
      const defaultSession = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'google',
          typescript: 'tsdoc-typedoc',
        },
        tone: 'concise',
        basePath: process.cwd(),
      });

      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await defaultSession.run([mockPlanItem]);

      // Verify suggest was called with undefined values (Python CLI will use defaults)
      expect(mockPythonBridge.suggest).toHaveBeenCalledWith({
        target: 'test.js:testFunction',
        styleGuide: 'jsdoc-vanilla',
        tone: 'concise',
        timeout: undefined,
        maxRetries: undefined,
        retryDelay: undefined,
      });
    });

    it('should pass partial claude config correctly', async () => {
      // Config with only some claude fields specified
      const partialConfig: IConfig = {
        ...mockConfig,
        claude: {
          timeout: 60.0,
          // maxRetries and retryDelay not specified
        },
      };

      const partialSession = new InteractiveSession({
        config: partialConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'google',
          typescript: 'tsdoc-typedoc',
        },
        tone: 'concise',
        basePath: process.cwd(),
      });

      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await partialSession.run([mockPlanItem]);

      // Verify suggest was called with only timeout specified
      expect(mockPythonBridge.suggest).toHaveBeenCalledWith({
        target: 'test.js:testFunction',
        styleGuide: 'jsdoc-vanilla',
        tone: 'concise',
        timeout: 60.0,
        maxRetries: undefined,
        retryDelay: undefined,
      });
    });
  });

  describe('undo functionality', () => {
    let undoSession: InteractiveSession;

    beforeEach(() => {
      // Setup transaction mocks
      // These mocks enable the transaction lifecycle:
      // 1. beginTransaction succeeds -> sets transactionActive = true
      // 2. apply succeeds -> writes documentation
      // 3. recordWrite succeeds -> increments changeCount
      // 4. rollbackChange handles undo requests
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.rollbackChange = jest.fn().mockResolvedValue({
        success: true,
        restored_count: 1,
        failed_count: 0,
        status: 'completed',
        conflicts: [],
        message: 'Rollback successful',
        item_name: 'testFunction',
        item_type: 'function',
        filepath: 'test.js',
      });

      // Create session for undo tests
      undoSession = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        basePath: process.cwd(),
      });
    });

    it('should not show [U] option before any changes made', async () => {
      const session = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        basePath: process.cwd(),
      });

      // Mock prompts to capture choices
      let capturedChoices: any[] = [];
      mockPrompts.mockImplementationOnce((options: any) => {
        capturedChoices = options.choices;
        return Promise.resolve({ action: 'accept' });
      });

      await session.run([mockPlanItem]);

      // Verify [U] option is not present
      const hasUndo = capturedChoices.some((choice) => choice.value === 'undo');
      expect(hasUndo).toBe(false);
    });

    it('should show [U] option after first accepted change', async () => {
      const session = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        basePath: process.cwd(),
      });

      const secondItem: PlanItem = {
        ...mockPlanItem,
        name: 'secondFunction',
      };

      // Mock prompts: first accept, then check second prompt
      let secondPromptChoices: any[] = [];
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept first item
        .mockImplementationOnce((options: any) => {
          secondPromptChoices = options.choices;
          return Promise.resolve({ action: 'accept' }); // Accept second item
        });

      await session.run([mockPlanItem, secondItem]);

      // Verify [U] option is present in second prompt
      const hasUndo = secondPromptChoices.some(
        (choice) => choice.value === 'undo'
      );
      expect(hasUndo).toBe(true);
      const undoChoice = secondPromptChoices.find(
        (choice) => choice.value === 'undo'
      );
      expect(undoChoice?.title).toBe('Undo last change');
    });

    it('should successfully undo last change', async () => {
      const secondItem = createSecondItem(mockPlanItem);

      // Accept first item, then on second item: undo, then quit
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept first item
        .mockResolvedValueOnce({ action: 'undo' }) // Undo on second item
        .mockResolvedValueOnce({ action: 'quit' }); // Quit on second item

      await undoSession.run([mockPlanItem, secondItem]);

      // Verify transaction lifecycle was executed
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledWith(
        expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        )
      );

      // Verify documentation was written and recorded for first item
      expect(mockPythonBridge.apply).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.apply).toHaveBeenCalledWith(
        expect.objectContaining({
          filepath: 'test.js',
          item_name: 'testFunction',
          docstring: '/** Generated docs */',
          backup_path: expect.stringMatching(/test\.js\..*\.bak$/),
        })
      );

      expect(mockPythonBridge.recordWrite).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.recordWrite).toHaveBeenCalledWith(
        expect.any(String),
        'test.js',
        expect.stringMatching(/test\.js\..*\.bak$/),
        'testFunction',
        'function',
        'javascript'
      );

      // Verify rollbackChange was called with 'last'
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledWith('last');
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledTimes(1);
    });

    it('should stay on current item after undo (not return to undone item)', async () => {
      const secondItem = createSecondItem(mockPlanItem);

      // Workflow: Accept item 1 -> Move to item 2 -> Undo (reverts item 1, stays on item 2) -> Accept item 2
      // Design decision: Undo doesn't jump back to the undone item, it stays forward on current item
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept item 1 (testFunction)
        .mockResolvedValueOnce({ action: 'undo' }) // On item 2: undo item 1 (stays on item 2)
        .mockResolvedValueOnce({ action: 'accept' }); // Accept item 2 (secondFunction)

      await undoSession.run([mockPlanItem, secondItem]);

      // Verify transaction lifecycle
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(1);

      // Verify suggest was called twice (once per item)
      expect(mockPythonBridge.suggest).toHaveBeenCalledTimes(2);
      expect(mockPythonBridge.suggest).toHaveBeenNthCalledWith(1, {
        target: 'test.js:testFunction',
        styleGuide: 'jsdoc-vanilla',
        tone: 'concise',
        timeout: undefined,
        maxRetries: undefined,
        retryDelay: undefined,
      });
      expect(mockPythonBridge.suggest).toHaveBeenNthCalledWith(2, {
        target: 'test.js:secondFunction',
        styleGuide: 'jsdoc-vanilla',
        tone: 'concise',
        timeout: undefined,
        maxRetries: undefined,
        retryDelay: undefined,
      });

      // Verify apply was called twice (first item accepted, second item accepted after undo)
      expect(mockPythonBridge.apply).toHaveBeenCalledTimes(2);

      // Verify recordWrite was called twice (once per accept)
      expect(mockPythonBridge.recordWrite).toHaveBeenCalledTimes(2);

      // Verify rollbackChange was called once (undo first item)
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledWith('last');
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledTimes(1);
    });

    it('should handle undo when no changes made yet', async () => {
      const session = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        basePath: process.cwd(),
      });

      // Try undo without accepting first (should show warning)
      mockPrompts
        .mockResolvedValueOnce({ action: 'undo' })
        .mockResolvedValueOnce({ action: 'quit' });

      await session.run([mockPlanItem]);

      // Verify rollbackChange was NOT called (no changes yet)
      expect(mockPythonBridge.rollbackChange).not.toHaveBeenCalled();
      // Verify console.log showed warning about no changes
      const allLogs = consoleSpy.mock.calls.map((call) => call.join(' '));
      const hasNoChangesWarning = allLogs.some((log) =>
        log.includes('No changes to undo')
      );
      expect(hasNoChangesWarning).toBe(true);
    });

    it('should handle undo failures gracefully', async () => {
      const secondItem = createSecondItem(mockPlanItem);

      // Override rollbackChange to fail with conflicts AFTER session creation
      mockPythonBridge.rollbackChange.mockResolvedValueOnce({
        success: false,
        restored_count: 0,
        failed_count: 1,
        status: 'failed',
        conflicts: ['test.js'],
        message: 'Conflict detected',
      });

      // Accept first item, then on second item: undo (fails), quit
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept first item
        .mockResolvedValueOnce({ action: 'undo' }) // Undo on second item (fails)
        .mockResolvedValueOnce({ action: 'quit' }); // Quit on second item

      await undoSession.run([mockPlanItem, secondItem]);

      // Verify transaction lifecycle executed up to undo
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.apply).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.recordWrite).toHaveBeenCalledTimes(1);

      // Verify rollbackChange was called
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledWith('last');
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledTimes(1);

      // Verify error message was shown (check for all console.log calls)
      const allLogs = consoleSpy.mock.calls.map((call: any[]) =>
        call.join(' ')
      );
      const hasUndoFailed = allLogs.some((log: string) =>
        log.includes('Undo failed')
      );
      const hasConflicts = allLogs.some((log: string) =>
        log.includes('Conflicts detected')
      );
      expect(hasUndoFailed).toBe(true);
      expect(hasConflicts).toBe(true);
      expect(allLogs.some((log: string) => log.includes('test.js'))).toBe(true);
    });

    it('should decrement changeCount after successful undo', async () => {
      const session = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        basePath: process.cwd(),
      });

      // Accept, undo (decrement changeCount to 0), try undo again (should show warning)
      let secondUndoAttemptChoices: any[] = [];
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept (changeCount = 1)
        .mockResolvedValueOnce({ action: 'undo' }) // Undo (changeCount = 0)
        .mockImplementationOnce((options: any) => {
          secondUndoAttemptChoices = options.choices;
          return Promise.resolve({ action: 'quit' }); // Quit
        });

      await session.run([mockPlanItem]);

      // After accepting 1 and undoing 1, changeCount should be 0
      // So [U] should NOT be present in next prompt
      const hasUndo = secondUndoAttemptChoices.some(
        (choice) => choice.value === 'undo'
      );
      expect(hasUndo).toBe(false);
    });

    it('should display item metadata on successful undo', async () => {
      const secondItem = createSecondItem(mockPlanItem);

      // Override rollbackChange with metadata AFTER session creation
      mockPythonBridge.rollbackChange.mockResolvedValueOnce({
        success: true,
        restored_count: 1,
        failed_count: 0,
        status: 'completed',
        conflicts: [],
        message: 'Success',
        item_name: 'myCustomFunction',
        item_type: 'function',
        filepath: 'custom/path/file.py',
      });

      // Accept first item, then on second item: undo, quit
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept first item
        .mockResolvedValueOnce({ action: 'undo' }) // Undo on second item
        .mockResolvedValueOnce({ action: 'quit' }); // Quit on second item

      await undoSession.run([mockPlanItem, secondItem]);

      // Verify transaction lifecycle
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.apply).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.recordWrite).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledWith('last');

      // Verify success message includes item details (check all console.log calls)
      const allLogs = consoleSpy.mock.calls.map((call: any[]) =>
        call.join(' ')
      );

      // The implementation displays: "Reverted documentation for myCustomFunction (function)"
      const hasItemName = allLogs.some((log: string) =>
        log.includes('myCustomFunction')
      );
      const hasItemType = allLogs.some((log: string) =>
        log.includes('function')
      );

      // The implementation displays: "  File: custom/path/file.py"
      const hasFilepath = allLogs.some((log: string) =>
        log.includes('custom/path/file.py')
      );

      expect(hasItemName).toBe(true);
      expect(hasItemType).toBe(true);
      expect(hasFilepath).toBe(true);

      // Verify the success message format
      const hasRevertedMessage = allLogs.some((log: string) =>
        log.includes('Reverted documentation for')
      );
      expect(hasRevertedMessage).toBe(true);
    });

    it('should maintain correct changeCount with multiple accepts and undos', async () => {
      const items = [
        mockPlanItem, // item 1: testFunction
        createSecondItem(mockPlanItem, 'item2', 20), // item 2
        createSecondItem(mockPlanItem, 'item3', 30), // item 3
        createSecondItem(mockPlanItem, 'item4', 40), // item 4
      ];

      // Workflow: Accept item 1 -> Accept item 2 -> Undo on item 3 -> Accept item 3 -> Quit on item 4
      // Net result: 2 changes committed (item 1 and item 3; item 2 was undone)
      mockPrompts
        .mockResolvedValueOnce({ action: 'accept' }) // Accept item 1 -> changeCount = 1
        .mockResolvedValueOnce({ action: 'accept' }) // Accept item 2 -> changeCount = 2
        .mockResolvedValueOnce({ action: 'undo' }) // Undo on item 3 -> changeCount = 1
        .mockResolvedValueOnce({ action: 'accept' }) // Accept item 3 -> changeCount = 2
        .mockResolvedValueOnce({ action: 'quit' }); // Quit on item 4

      await undoSession.run(items);

      // Verify transaction lifecycle
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(1);
      expect(mockPythonBridge.apply).toHaveBeenCalledTimes(3); // 3 accepts
      expect(mockPythonBridge.recordWrite).toHaveBeenCalledTimes(3); // 3 records
      expect(mockPythonBridge.rollbackChange).toHaveBeenCalledTimes(1); // 1 undo

      // Verify final state
      expect(mockPythonBridge.commitTransaction).toHaveBeenCalledTimes(1);
      // Net result: 2 changes committed (item 1, item 3; item 2 was undone)
    });
  });

  describe('Transaction Resume (Session 6b)', () => {
    let resumeSession: InteractiveSession;
    let mockResumeState: any;
    let testSessionId: string;
    let testTransactionId: string;

    beforeEach(() => {
      // Generate valid UUIDs for this test
      testSessionId = randomUUID();
      testTransactionId = randomUUID();

      // Create mock resume state
      mockResumeState = {
        session_id: testSessionId,
        transaction_id: testTransactionId,
        started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        current_index: 1, // Resuming from second item
        total_items: 3,
        partial_improvements: {
          '/test/file.py': {
            testFunction: {
              status: 'accepted',
              timestamp: new Date().toISOString(),
              suggestion: '/** First item accepted */',
            },
            secondFunction: {}, // Empty dict = not yet processed
            thirdFunction: {},
          },
        },
        file_snapshot: {},
        config: { styleGuides: { python: 'google' }, tone: 'concise' },
        completed_at: null,
      };

      // Create session with resume state
      resumeSession = new InteractiveSession({
        config: mockConfig,
        pythonBridge: mockPythonBridge,
        pluginManager: mockPluginManager,
        editorLauncher: mockEditorLauncher,
        styleGuides: { python: 'google' },
        tone: 'concise',
        basePath: '/test',
        resumeSessionState: mockResumeState,
      });

      // Mock transaction methods
      mockPythonBridge.beginTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
      mockPythonBridge.recordWrite = jest.fn().mockResolvedValue(undefined);
      mockPythonBridge.commitTransaction = jest
        .fn()
        .mockResolvedValue(undefined);
    });

    it('should resume in-progress transaction', async () => {
      // Mock listSessions to return in-progress status
      mockPythonBridge.listSessions = jest.fn().mockResolvedValue([
        {
          session_id: testSessionId,
          started_at: mockResumeState.started_at,
          completed_at: null,
          change_count: 1,
          status: 'in_progress',
        },
      ]);

      mockPrompts.mockResolvedValueOnce({ action: 'quit' });

      await resumeSession.run([mockPlanItem]);

      // Should NOT call beginTransaction (resuming existing)
      expect(mockPythonBridge.beginTransaction).not.toHaveBeenCalled();

      // Should call listSessions to check status
      expect(mockPythonBridge.listSessions).toHaveBeenCalled();
    });

    it('should create new transaction for committed session (continuation)', async () => {
      // Mock listSessions to return committed status
      mockPythonBridge.listSessions = jest.fn().mockResolvedValue([
        {
          session_id: testSessionId,
          started_at: mockResumeState.started_at,
          completed_at: new Date().toISOString(),
          change_count: 1,
          status: 'committed',
        },
      ]);

      // Mock SessionStateManager.saveSessionState
      const mockSaveSessionState = jest.fn().mockResolvedValue(undefined);
      (SessionStateManager as any).saveSessionState = mockSaveSessionState;

      mockPrompts.mockResolvedValueOnce({ action: 'quit' });

      await resumeSession.run([mockPlanItem]);

      // Should call beginTransaction with NEW session ID (continuation)
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledWith(
        expect.not.stringMatching('test-session-123')
      );

      // Should save updated session state with new session ID and previous_session_id
      expect(mockSaveSessionState).toHaveBeenCalled();
    });

    it('should throw error for rolled-back session', async () => {
      // Mock listSessions to return rolled_back status
      mockPythonBridge.listSessions = jest.fn().mockResolvedValue([
        {
          session_id: testSessionId,
          started_at: mockResumeState.started_at,
          completed_at: null,
          change_count: 1,
          status: 'rolled_back',
        },
      ]);

      await expect(resumeSession.run([mockPlanItem])).rejects.toThrow(
        /Cannot resume session.*rolled back/
      );
    });

    it('should throw error for partial-rollback session', async () => {
      // Mock listSessions to return partial_rollback status
      mockPythonBridge.listSessions = jest.fn().mockResolvedValue([
        {
          session_id: testSessionId,
          started_at: mockResumeState.started_at,
          completed_at: null,
          change_count: 1,
          status: 'partial_rollback',
        },
      ]);

      await expect(resumeSession.run([mockPlanItem])).rejects.toThrow(
        /Cannot resume session.*partial rollback/
      );
    });

    it('should create new transaction for missing transaction branch', async () => {
      // Mock listSessions to return empty (transaction not found)
      mockPythonBridge.listSessions = jest.fn().mockResolvedValue([]);

      mockPrompts.mockResolvedValueOnce({ action: 'quit' });

      await resumeSession.run([mockPlanItem]);

      // Should call beginTransaction with original session ID (recreate)
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledWith(
        testSessionId
      );
    });

    it('should handle listSessions failure gracefully', async () => {
      // Mock listSessions to throw error
      mockPythonBridge.listSessions = jest
        .fn()
        .mockRejectedValue(new Error('Git not available'));

      mockPrompts.mockResolvedValueOnce({ action: 'quit' });

      await resumeSession.run([mockPlanItem]);

      // Should create new transaction despite failure
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledWith(
        testSessionId
      );
    });
  });
});
