/**
 * Tests for InteractiveSession.
 *
 * Tests the main interactive documentation improvement workflow.
 */

import { InteractiveSession } from '../../session/InteractiveSession.js';
import { PythonBridge } from '../../python-bridge/PythonBridge.js';
import { PluginManager } from '../../plugins/PluginManager.js';
import { EditorLauncher } from '../../editor/EditorLauncher.js';
import prompts from 'prompts';
import type { PlanItem } from '../../types/analysis.js';
import type { IConfig } from '../../config/IConfig.js';

// Mock dependencies
jest.mock('../../python-bridge/PythonBridge.js');
jest.mock('../../plugins/PluginManager.js');
jest.mock('../../editor/EditorLauncher.js');
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
const MockPluginManager = PluginManager as jest.MockedClass<typeof PluginManager>;
const MockEditorLauncher = EditorLauncher as jest.MockedClass<typeof EditorLauncher>;
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

  beforeEach(() => {
    // Suppress console output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

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
    mockPythonBridge.suggest = jest.fn().mockResolvedValue('/** Generated docs */');
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
      mockPythonBridge.beginTransaction = jest.fn().mockResolvedValue(undefined);
      mockPrompts.mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledWith(
        expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      );
    });

    it('should continue session if transaction initialization fails', async () => {
      mockPythonBridge.beginTransaction = jest.fn().mockRejectedValue(
        new Error('Git backend not available')
      );
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
      mockPythonBridge.beginTransaction = jest.fn().mockResolvedValue(undefined);
      mockPrompts
        .mockResolvedValueOnce({ action: 'skip' })
        .mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);
      const firstCallSessionId = mockPythonBridge.beginTransaction.mock.calls[0][0];

      await session.run([mockPlanItem]);
      const secondCallSessionId = mockPythonBridge.beginTransaction.mock.calls[1][0];

      expect(firstCallSessionId).not.toBe(secondCallSessionId);
      expect(mockPythonBridge.beginTransaction).toHaveBeenCalledTimes(2);
    });

    it('should not call beginTransaction for empty item list', async () => {
      mockPythonBridge.beginTransaction = jest.fn().mockResolvedValue(undefined);

      await session.run([]);

      expect(mockPythonBridge.beginTransaction).not.toHaveBeenCalled();
    });
  });

  describe('plugin validation', () => {
    it('should run plugin validation before showing suggestion', async () => {
      const validationResults = [
        { accept: true, plugin: 'test-plugin' },
      ];
      mockPluginManager.runBeforeAccept.mockResolvedValueOnce(validationResults);
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
      mockPluginManager.runBeforeAccept.mockResolvedValueOnce(validationResults);
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.apply).toHaveBeenCalled();
    });

    it('should allow accepting despite validation failures', async () => {
      const validationResults = [
        { accept: false, reason: 'Style issue', plugin: 'style-checker' },
      ];
      mockPluginManager.runBeforeAccept.mockResolvedValueOnce(validationResults);
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

      const pythonItem: PlanItem = { ...mockPlanItem, language: 'python', filepath: 'test.py' };
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
        mockPlanItem,                                          // Item 1: accept (success)
        { ...mockPlanItem, name: 'second', line_number: 20 }, // Item 2: error (suggest fails)
        { ...mockPlanItem, name: 'third', line_number: 30 },  // Item 3: error (write fails)
        { ...mockPlanItem, name: 'fourth', line_number: 40 }, // Item 4: skip
        { ...mockPlanItem, name: 'fifth', line_number: 50 },  // Item 5: accept (success)
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
        .mockResolvedValueOnce({ action: 'accept' })  // Item 1
        // Item 2: suggest fails, no prompt
        .mockResolvedValueOnce({ action: 'accept' })  // Item 3
        .mockResolvedValueOnce({ action: 'skip' })    // Item 4
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
      const allCalls = consoleSpy.mock.calls.map(call => call[0]);
      const hasErrorLine = allCalls.some((call: string) =>
        typeof call === 'string' && call.includes('Errors:')
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
      const allCalls = consoleSpy.mock.calls.map(call => call[0]).join('\n');
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
});
