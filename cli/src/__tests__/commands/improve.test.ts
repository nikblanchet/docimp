/**
 * Integration tests for improve command.
 *
 * Tests the complete improve command workflow including config loading,
 * plan loading, plugin initialization, and session orchestration.
 */

import { improveCommand } from '../../commands/improve.js';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { PluginManager } from '../../plugins/PluginManager.js';
import { InteractiveSession } from '../../session/InteractiveSession.js';
import { readFileSync } from 'fs';
import prompts from 'prompts';

// Mock dependencies
jest.mock('../../python-bridge/PythonBridge.js');
jest.mock('../../config/ConfigLoader.js');
jest.mock('../../plugins/PluginManager.js');
jest.mock('../../session/InteractiveSession.js');
jest.mock('fs');
jest.mock('prompts');
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
  },
  bold: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
}));
jest.mock('ora', () => ({
  default: () => ({
    start: () => ({ stop: () => {}, succeed: () => {}, fail: () => {} }),
  }),
}));
jest.mock('cli-table3', () => {
  return class MockTable {
    constructor() {}
    toString() { return ''; }
  };
});
jest.mock('../../display/TerminalDisplay.js');

const MockConfigLoader = ConfigLoader as jest.MockedClass<typeof ConfigLoader>;
const MockPluginManager = PluginManager as jest.MockedClass<typeof PluginManager>;
const MockInteractiveSession = InteractiveSession as jest.MockedClass<typeof InteractiveSession>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockPrompts = prompts as jest.MockedFunction<typeof prompts>;

describe('improve command', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockConfigLoader: jest.Mocked<ConfigLoader>;
  let mockPluginManager: jest.Mocked<PluginManager>;
  let mockSession: jest.Mocked<InteractiveSession>;
  let exitSpy: jest.SpyInstance;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    // Suppress console output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Mock process.exit
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit called with ${code}`);
    }) as any);

    // Setup mocks
    mockConfigLoader = new MockConfigLoader() as jest.Mocked<ConfigLoader>;
    mockConfigLoader.load = jest.fn().mockResolvedValue({
      styleGuide: 'jsdoc',
      tone: 'concise',
      plugins: ['./plugins/validate-types.js'],
      exclude: [],
    });

    mockPluginManager = new MockPluginManager() as jest.Mocked<PluginManager>;
    mockPluginManager.loadPlugins = jest.fn().mockResolvedValue(undefined);
    mockPluginManager.getLoadedPlugins = jest.fn().mockReturnValue(['validate-types']);

    mockSession = new MockInteractiveSession({} as any) as jest.Mocked<InteractiveSession>;
    mockSession.run = jest.fn().mockResolvedValue(undefined);

    MockConfigLoader.mockImplementation(() => mockConfigLoader);
    MockPluginManager.mockImplementation(() => mockPluginManager);
    MockInteractiveSession.mockImplementation(() => mockSession);

    // Mock plan file
    mockReadFileSync.mockReturnValue(JSON.stringify({
      items: [
        {
          name: 'testFunc',
          type: 'function',
          filepath: 'test.js',
          line_number: 10,
          language: 'javascript',
          complexity: 5,
          impact_score: 75,
          reason: 'High complexity',
          export_type: 'named',
          module_system: 'esm',
          parameters: [],
          has_docs: false,
          docstring: null,
          audit_rating: null,
        },
      ],
    }));

    // Mock user prompts
    mockPrompts.mockResolvedValue({
      styleGuide: 'jsdoc',
      tone: 'concise',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('ANTHROPIC_API_KEY validation', () => {
    it('should exit if ANTHROPIC_API_KEY not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(async () => {
        await improveCommand('./test', {});
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should continue if ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      await improveCommand('./test', {});

      expect(mockSession.run).toHaveBeenCalled();
    });
  });

  describe('configuration loading', () => {
    it('should load default config when no config specified', async () => {
      await improveCommand('./test', {});

      expect(mockConfigLoader.load).toHaveBeenCalledWith(undefined);
    });

    it('should load custom config when specified', async () => {
      await improveCommand('./test', { config: './custom.config.js' });

      expect(mockConfigLoader.load).toHaveBeenCalledWith('./custom.config.js');
    });

    it('should handle config loading errors', async () => {
      mockConfigLoader.load.mockRejectedValueOnce(new Error('Invalid config'));

      await expect(async () => {
        await improveCommand('./test', {});
      }).rejects.toThrow('process.exit called with 1');
    });
  });

  describe('plan file loading', () => {
    it('should load default plan file', async () => {
      await improveCommand('./test', {});

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.docimp\/session-reports\/plan\.json$/),
        'utf-8'
      );
    });

    it('should load custom plan file when specified', async () => {
      await improveCommand('./test', { planFile: './custom-plan.json' });

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/custom-plan\.json$/),
        'utf-8'
      );
    });

    it('should exit if plan file not found', async () => {
      mockReadFileSync.mockImplementationOnce(() => {
        throw new Error('ENOENT: no such file');
      });

      await expect(async () => {
        await improveCommand('./test', {});
      }).rejects.toThrow('process.exit called with 1');
    });

    it('should exit if plan file has invalid JSON', async () => {
      mockReadFileSync.mockReturnValueOnce('invalid json');

      await expect(async () => {
        await improveCommand('./test', {});
      }).rejects.toThrow();
    });

    it('should handle empty plan file', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({ items: [] }));

      await improveCommand('./test', {});

      expect(mockSession.run).not.toHaveBeenCalled();
    });
  });

  describe('user preferences', () => {
    it('should prompt for style guide and tone', async () => {
      await improveCommand('./test', {});

      expect(mockPrompts).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'styleGuide' }),
          expect.objectContaining({ name: 'tone' }),
        ])
      );
    });

    it('should use command-line style guide override', async () => {
      await improveCommand('./test', { styleGuide: 'numpy' });

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuide: 'numpy',
        })
      );
    });

    it('should use command-line tone override', async () => {
      await improveCommand('./test', { tone: 'detailed' });

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'detailed',
        })
      );
    });

    it('should use prompted values when no overrides', async () => {
      mockPrompts.mockResolvedValueOnce({
        styleGuide: 'google',
        tone: 'friendly',
      });

      await improveCommand('./test', {});

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuide: 'google',
          tone: 'friendly',
        })
      );
    });
  });

  describe('plugin loading', () => {
    it('should load plugins from config', async () => {
      await improveCommand('./test', {});

      expect(mockPluginManager.loadPlugins).toHaveBeenCalledWith([
        './plugins/validate-types.js',
      ]);
    });

    it('should continue without plugins if loading fails', async () => {
      mockPluginManager.loadPlugins.mockRejectedValueOnce(new Error('Plugin load failed'));

      await improveCommand('./test', {});

      // Should still create session
      expect(mockSession.run).toHaveBeenCalled();
    });

    it('should work with no plugins configured', async () => {
      mockConfigLoader.load.mockResolvedValueOnce({
        styleGuide: 'jsdoc',
        tone: 'concise',
        plugins: [],
        exclude: [],
      });

      await improveCommand('./test', {});

      expect(mockPluginManager.loadPlugins).not.toHaveBeenCalled();
    });
  });

  describe('session execution', () => {
    it('should create and run interactive session', async () => {
      await improveCommand('./test', {});

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.any(Object),
          pythonBridge: expect.any(Object),
          pluginManager: expect.any(Object),
          styleGuide: expect.any(String),
          tone: expect.any(String),
        })
      );
      expect(mockSession.run).toHaveBeenCalledWith([
        expect.objectContaining({
          name: 'testFunc',
          type: 'function',
        }),
      ]);
    });

    it('should pass plan items to session', async () => {
      const planItems = [
        {
          name: 'func1',
          type: 'function',
          filepath: 'test1.js',
          line_number: 10,
          language: 'javascript',
          complexity: 5,
          impact_score: 75,
          reason: 'reason1',
          export_type: 'named',
          module_system: 'esm',
          parameters: [],
          has_docs: false,
          docstring: null,
          audit_rating: null,
        },
        {
          name: 'func2',
          type: 'function',
          filepath: 'test2.js',
          line_number: 20,
          language: 'javascript',
          complexity: 8,
          impact_score: 80,
          reason: 'reason2',
          export_type: 'default',
          module_system: 'esm',
          parameters: ['x'],
          has_docs: false,
          docstring: null,
          audit_rating: null,
        },
      ];
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({ items: planItems }));

      await improveCommand('./test', {});

      expect(mockSession.run).toHaveBeenCalledWith(planItems);
    });

    it('should handle session errors', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Session failed'));

      await expect(async () => {
        await improveCommand('./test', {});
      }).rejects.toThrow('process.exit called with 1');
    });
  });

  describe('verbose mode', () => {
    it('should pass verbose flag to components', async () => {
      await improveCommand('./test', { verbose: true });

      // Session should be created (verbose doesn't prevent creation)
      expect(mockSession.run).toHaveBeenCalled();
    });
  });
});
