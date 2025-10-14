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
      styleGuide: 'jsdoc',
      tone: 'concise',
      plugins: [],
      exclude: [],
    };

    // Create mock instances
    mockPythonBridge = new MockPythonBridge() as jest.Mocked<PythonBridge>;
    mockPluginManager = new MockPluginManager() as jest.Mocked<PluginManager>;

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

    // Create session
    session = new InteractiveSession({
      config: mockConfig,
      pythonBridge: mockPythonBridge,
      pluginManager: mockPluginManager,
      styleGuide: 'jsdoc',
      tone: 'concise',
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.clearAllMocks();
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
        styleGuide: 'jsdoc',
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
    });

    it('should handle write failure', async () => {
      mockPythonBridge.apply.mockRejectedValueOnce(new Error('Write failed'));
      mockPrompts.mockResolvedValueOnce({ action: 'accept' });

      await session.run([mockPlanItem]);

      expect(mockPythonBridge.apply).toHaveBeenCalled();
      // Should not throw, just log error
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
      const mockEditorLauncher = new MockEditorLauncher() as jest.Mocked<EditorLauncher>;
      mockEditorLauncher.editText = jest.fn().mockResolvedValue('/** Edited docs */');
      (session as any).editorLauncher = mockEditorLauncher;

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
      const mockEditorLauncher = new MockEditorLauncher() as jest.Mocked<EditorLauncher>;
      mockEditorLauncher.editText = jest.fn().mockResolvedValue('/** Edited docs */');
      (session as any).editorLauncher = mockEditorLauncher;

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
      const mockEditorLauncher = new MockEditorLauncher() as jest.Mocked<EditorLauncher>;
      mockEditorLauncher.editText = jest.fn().mockResolvedValue(null);
      (session as any).editorLauncher = mockEditorLauncher;

      mockPrompts
        .mockResolvedValueOnce({ action: 'edit' })
        .mockResolvedValueOnce({ action: 'skip' });

      await session.run([mockPlanItem]);

      // Should show original suggestion again
      expect(mockPythonBridge.apply).not.toHaveBeenCalled();
    });

    it('should use correct file extension for Python', async () => {
      const mockEditorLauncher = new MockEditorLauncher() as jest.Mocked<EditorLauncher>;
      mockEditorLauncher.editText = jest.fn().mockResolvedValue('"""Edited docs"""');
      (session as any).editorLauncher = mockEditorLauncher;

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
});
