/**
 * Integration tests for improve command.
 *
 * Tests the complete improve command workflow including config loading,
 * plan loading, plugin initialization, and session orchestration.
 */

import { improveCommand, improveCore } from '../../commands/improve.js';
import type { IConfigLoader } from '../../config/IConfigLoader.js';
import type { IPluginManager } from '../../plugins/IPluginManager.js';
import type { IEditorLauncher } from '../../editor/IEditorLauncher.js';
import type { IPythonBridge } from '../../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../../display/IDisplay.js';
import { defaultConfig } from '../../config/IConfig.js';
import { InteractiveSession } from '../../session/InteractiveSession.js';
import { readFileSync } from 'fs';
import prompts from 'prompts';

// Mock dependencies
jest.mock('../../session/InteractiveSession.js');
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn(),
    statSync: jest.fn(),
    readdirSync: jest.fn(),
    accessSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
  };
});
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

const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockPrompts = prompts as jest.MockedFunction<typeof prompts>;
const MockInteractiveSession = InteractiveSession as jest.MockedClass<typeof InteractiveSession>;

describe('improve command', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockConfigLoader: IConfigLoader;
  let mockPluginManager: IPluginManager;
  let mockEditorLauncher: IEditorLauncher;
  let mockSession: jest.Mocked<InteractiveSession>;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

    // Suppress console output
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    // Setup mock dependencies
    mockBridge = {
      analyze: jest.fn(),
      audit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    mockDisplay = {
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showConfig: jest.fn(),
      showAnalysisResult: jest.fn(),
      showAuditSummary: jest.fn(),
      startSpinner: jest.fn(() => jest.fn()),
    };

    mockConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'google',
          typescript: 'tsdoc-typedoc',
        },
        tone: 'concise',
        plugins: ['./plugins/validate-types.js'],
        exclude: [],
      }),
    };

    mockPluginManager = {
      loadPlugins: jest.fn().mockResolvedValue(undefined),
      runBeforeAccept: jest.fn().mockResolvedValue([]),
      runAfterWrite: jest.fn().mockResolvedValue([]),
      getLoadedPlugins: jest.fn().mockReturnValue(['validate-types']),
      clear: jest.fn(),
    };

    mockEditorLauncher = {
      editText: jest.fn().mockResolvedValue(null),
    };

    // Setup mock session that will be returned when InteractiveSession is instantiated
    mockSession = new MockInteractiveSession({} as any) as jest.Mocked<InteractiveSession>;
    mockSession.run = jest.fn().mockResolvedValue(undefined);
    MockInteractiveSession.mockImplementation(() => mockSession);

    // Mock fs for path validation
    const fs = require('fs');
    fs.existsSync.mockImplementation((path: string) => {
      // Allow './test' path and .docimp paths to exist for tests
      const pathStr = String(path);
      if (pathStr.includes('./test') || pathStr.includes('.docimp') || pathStr.includes('/test')) {
        return true;
      }
      return false;
    });
    fs.statSync.mockImplementation(() => ({
      isDirectory: () => true,
      isFile: () => false,
    }));
    fs.readdirSync.mockImplementation(() => ['file.ts']); // Not empty
    fs.accessSync.mockImplementation(() => {}); // Allow read access

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

    // Mock user prompts - use mockImplementation to provide fresh values for each call
    mockPrompts.mockImplementation((promptConfig: any) => {
      if (promptConfig.name === 'styleGuide') {
        return Promise.resolve({ styleGuide: 'jsdoc-vanilla' });
      } else if (promptConfig.name === 'tone') {
        return Promise.resolve({ tone: 'concise' });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('ANTHROPIC_API_KEY validation', () => {
    it('should throw error if ANTHROPIC_API_KEY not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await expect(async () => {
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow('ANTHROPIC_API_KEY environment variable is required');
    });

    it('should continue if ANTHROPIC_API_KEY is set', async () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockSession.run).toHaveBeenCalled();
    });
  });

  describe('configuration loading', () => {
    it('should load default config when no config specified', async () => {
      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockConfigLoader.load).toHaveBeenCalledWith(undefined);
    });

    it('should load custom config when specified', async () => {
      await improveCore('./test', { config: './custom.config.js' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockConfigLoader.load).toHaveBeenCalledWith('./custom.config.js');
    });

    it('should handle config loading errors', async () => {
      mockConfigLoader.load.mockRejectedValueOnce(new Error('Invalid config'));

      await expect(async () => {
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();
    });
  });

  describe('plan file loading', () => {
    it('should load default plan file', async () => {
      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockReadFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.docimp\/session-reports\/plan\.json$/),
        'utf-8'
      );
    });

    it('should load custom plan file when specified', async () => {
      await improveCore('./test', { planFile: './custom-plan.json' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

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
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();
    });

    it('should exit if plan file has invalid JSON', async () => {
      mockReadFileSync.mockReturnValueOnce('invalid json');

      await expect(async () => {
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();
    });

    it('should handle empty plan file', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({ items: [] }));

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockSession.run).not.toHaveBeenCalled();
    });
  });

  describe('language support validation', () => {
    it('should fail fast if plan contains unsupported languages', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [
          {
            name: 'testFunc',
            type: 'function',
            filepath: 'test.rb',
            line_number: 10,
            language: 'ruby',
            complexity: 5,
            impact_score: 75,
            reason: 'High complexity',
            export_type: 'named',
            module_system: 'unknown',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
        ],
      }));

      await expect(async () => {
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

      // Should not prompt for style guides
      expect(mockPrompts).not.toHaveBeenCalled();
    });

    it('should fail fast with multiple unsupported languages', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [
          {
            name: 'testFunc1',
            type: 'function',
            filepath: 'test.rb',
            line_number: 10,
            language: 'ruby',
            complexity: 5,
            impact_score: 75,
            reason: 'reason',
            export_type: 'named',
            module_system: 'unknown',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
          {
            name: 'testFunc2',
            type: 'function',
            filepath: 'test.go',
            line_number: 10,
            language: 'go',
            complexity: 5,
            impact_score: 75,
            reason: 'reason',
            export_type: 'named',
            module_system: 'unknown',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
        ],
      }));

      await expect(async () => {
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

    });

    it('should continue if all languages are supported', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [
          {
            name: 'pyFunc',
            type: 'function',
            filepath: 'test.py',
            line_number: 10,
            language: 'python',
            complexity: 5,
            impact_score: 75,
            reason: 'reason',
            export_type: 'named',
            module_system: 'unknown',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
          {
            name: 'tsFunc',
            type: 'function',
            filepath: 'test.ts',
            line_number: 10,
            language: 'typescript',
            complexity: 5,
            impact_score: 75,
            reason: 'reason',
            export_type: 'named',
            module_system: 'esm',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
        ],
      }));

      mockPrompts
        .mockResolvedValueOnce({ styleGuide: 'google' })        // Python style
        .mockResolvedValueOnce({ styleGuide: 'tsdoc-typedoc' }) // TypeScript style
        .mockResolvedValueOnce({ tone: 'concise' });            // Tone

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should prompt for both languages and tone
      expect(mockPrompts).toHaveBeenCalledTimes(3);
      expect(mockSession.run).toHaveBeenCalled();
    });
  });

  describe('user preferences', () => {
    it('should prompt for style guides per language and tone', async () => {
      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should be called twice: once for javascript style, once for tone
      expect(mockPrompts).toHaveBeenCalledTimes(2);
      // First call: javascript style guide
      expect(mockPrompts).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'styleGuide' }));
      // Second call: tone
      expect(mockPrompts).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'tone' }));
    });

    it('should use command-line tone override', async () => {
      await improveCore('./test', { tone: 'detailed' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'detailed',
        })
      );
    });

    it('should use prompted values when no tone override', async () => {
      mockPrompts
        .mockResolvedValueOnce({ styleGuide: 'jsdoc-google' })  // JavaScript style
        .mockResolvedValueOnce({ tone: 'friendly' });           // Tone

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { javascript: 'jsdoc-google' },
          tone: 'friendly',
        })
      );
    });
  });

  describe('plugin loading', () => {
    it('should load plugins from config', async () => {
      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockPluginManager.loadPlugins).toHaveBeenCalledWith([
        './plugins/validate-types.js',
      ]);
    });

    it('should continue without plugins if loading fails', async () => {
      mockPluginManager.loadPlugins.mockRejectedValueOnce(new Error('Plugin load failed'));

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should still create session
      expect(mockSession.run).toHaveBeenCalled();
    });

    it('should work with no plugins configured', async () => {
      mockConfigLoader.load.mockResolvedValueOnce({
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'google',
          typescript: 'tsdoc-typedoc',
        },
        tone: 'concise',
        plugins: [],
        exclude: [],
      });

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockPluginManager.loadPlugins).not.toHaveBeenCalled();
    });
  });

  describe('session execution', () => {
    it('should create and run interactive session', async () => {
      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.any(Object),
          pythonBridge: expect.any(Object),
          pluginManager: expect.any(Object),
          styleGuides: expect.any(Object),
          tone: expect.any(String),
          basePath: expect.any(String),
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

      await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockSession.run).toHaveBeenCalledWith(planItems);
    });

    it('should handle session errors', async () => {
      mockSession.run.mockRejectedValueOnce(new Error('Session failed'));

      await expect(async () => {
        await improveCore('./test', {}, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();
    });
  });

  describe('verbose mode', () => {
    it('should pass verbose flag to components', async () => {
      await improveCore('./test', { verbose: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Session should be created (verbose doesn't prevent creation)
      expect(mockSession.run).toHaveBeenCalled();
    });
  });

  describe('CLI style guide flags', () => {
    it('should use CLI flag and skip prompt when --python-style provided', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [{
          name: 'pyFunc',
          type: 'function',
          filepath: 'test.py',
          line_number: 10,
          language: 'python',
          complexity: 5,
          impact_score: 75,
          reason: 'reason',
          export_type: 'named',
          module_system: 'unknown',
          parameters: [],
          has_docs: false,
          docstring: null,
          audit_rating: null,
        }],
      }));

      mockPrompts.mockResolvedValueOnce({ tone: 'concise' });

      await improveCore('./test', { pythonStyle: 'numpy-rest' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should only prompt for tone, not python style
      expect(mockPrompts).toHaveBeenCalledTimes(1);
      expect(mockPrompts).toHaveBeenCalledWith(expect.objectContaining({ name: 'tone' }));

      // Session should receive CLI flag value
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { python: 'numpy-rest' },
        })
      );
    });

    it('should use multiple CLI flags and skip all prompts except tone', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [
          {
            name: 'pyFunc',
            type: 'function',
            filepath: 'test.py',
            line_number: 10,
            language: 'python',
            complexity: 5,
            impact_score: 75,
            reason: 'reason',
            export_type: 'named',
            module_system: 'unknown',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
          {
            name: 'jsFunc',
            type: 'function',
            filepath: 'test.js',
            line_number: 20,
            language: 'javascript',
            complexity: 3,
            impact_score: 50,
            reason: 'reason',
            export_type: 'named',
            module_system: 'esm',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
        ],
      }));

      mockPrompts.mockResolvedValueOnce({ tone: 'detailed' });

      await improveCore('./test', {
        pythonStyle: 'google',
        javascriptStyle: 'jsdoc-google',
      }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should only prompt for tone
      expect(mockPrompts).toHaveBeenCalledTimes(1);
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { python: 'google', javascript: 'jsdoc-google' },
        })
      );
    });

    it('should reject invalid python style guide', async () => {
      await expect(async () => {
        await improveCore('./test', { pythonStyle: 'invalid-style' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

    });

    it('should reject invalid javascript style guide', async () => {
      await expect(async () => {
        await improveCore('./test', { javascriptStyle: 'invalid-style' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

    });

    it('should reject invalid typescript style guide', async () => {
      await expect(async () => {
        await improveCore('./test', { typescriptStyle: 'invalid-style' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

    });

    it('should reject invalid tone', async () => {
      await expect(async () => {
        await improveCore('./test', { tone: 'invalid-tone' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

    });
  });

  describe('non-interactive mode', () => {
    it('should use config values without prompting when --non-interactive', async () => {
      await improveCore('./test', { nonInteractive: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should not prompt at all
      expect(mockPrompts).not.toHaveBeenCalled();

      // Should use config values
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { javascript: 'jsdoc-vanilla' },
          tone: 'concise',
        })
      );
    });

    it('should use CLI flags over config in non-interactive mode', async () => {
      await improveCore('./test', {
        nonInteractive: true,
        javascriptStyle: 'jsdoc-google',
        tone: 'detailed',
      }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockPrompts).not.toHaveBeenCalled();
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { javascript: 'jsdoc-google' },
          tone: 'detailed',
        })
      );
    });

    it('should fail in non-interactive mode when config missing for detected language', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [{
          name: 'pyFunc',
          type: 'function',
          filepath: 'test.py',
          line_number: 10,
          language: 'python',
          complexity: 5,
          impact_score: 75,
          reason: 'reason',
          export_type: 'named',
          module_system: 'unknown',
          parameters: [],
          has_docs: false,
          docstring: null,
          audit_rating: null,
        }],
      }));

      // Config only has javascript, but plan needs python
      mockConfigLoader.load.mockResolvedValueOnce({
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        plugins: [],
        exclude: [],
      });

      await expect(async () => {
        await improveCore('./test', { nonInteractive: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);
      }).rejects.toThrow();

      expect(mockPrompts).not.toHaveBeenCalled();
    });

    it('should succeed in non-interactive mode with CLI flag for missing config', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [{
          name: 'pyFunc',
          type: 'function',
          filepath: 'test.py',
          line_number: 10,
          language: 'python',
          complexity: 5,
          impact_score: 75,
          reason: 'reason',
          export_type: 'named',
          module_system: 'unknown',
          parameters: [],
          has_docs: false,
          docstring: null,
          audit_rating: null,
        }],
      }));

      // Config missing python, but CLI flag provides it
      mockConfigLoader.load.mockResolvedValueOnce({
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: 'concise',
        plugins: [],
        exclude: [],
      });

      await improveCore('./test', {
        nonInteractive: true,
        pythonStyle: 'google',
      }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(mockPrompts).not.toHaveBeenCalled();
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { python: 'google' },
        })
      );
    });

    it('should use default tone in non-interactive mode when not configured', async () => {
      mockConfigLoader.load.mockResolvedValueOnce({
        styleGuides: { javascript: 'jsdoc-vanilla' },
        tone: undefined as any,
        plugins: [],
        exclude: [],
      });

      await improveCore('./test', { nonInteractive: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'concise',
        })
      );
    });
  });

  describe('mixed interactive and CLI flags', () => {
    it('should skip prompt for language with CLI flag, prompt for others', async () => {
      mockReadFileSync.mockReturnValueOnce(JSON.stringify({
        items: [
          {
            name: 'pyFunc',
            type: 'function',
            filepath: 'test.py',
            line_number: 10,
            language: 'python',
            complexity: 5,
            impact_score: 75,
            reason: 'reason',
            export_type: 'named',
            module_system: 'unknown',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
          {
            name: 'jsFunc',
            type: 'function',
            filepath: 'test.js',
            line_number: 20,
            language: 'javascript',
            complexity: 3,
            impact_score: 50,
            reason: 'reason',
            export_type: 'named',
            module_system: 'esm',
            parameters: [],
            has_docs: false,
            docstring: null,
            audit_rating: null,
          },
        ],
      }));

      mockPrompts
        .mockResolvedValueOnce({ styleGuide: 'jsdoc-vanilla' }) // JavaScript prompt
        .mockResolvedValueOnce({ tone: 'concise' });            // Tone prompt

      await improveCore('./test', { pythonStyle: 'google' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should prompt for javascript (no flag) and tone
      expect(mockPrompts).toHaveBeenCalledTimes(2);
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { python: 'google', javascript: 'jsdoc-vanilla' },
        })
      );
    });

    it('should skip tone prompt when --tone flag provided', async () => {
      await improveCore('./test', { tone: 'friendly' }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should only prompt for javascript style, not tone
      expect(mockPrompts).toHaveBeenCalledTimes(1);
      expect(mockPrompts).toHaveBeenCalledWith(expect.objectContaining({ name: 'styleGuide' }));
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'friendly',
        })
      );
    });
  });

  describe('--list-styles flag', () => {
    it('should display all style guides and exit without requiring API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      await improveCore('./test', { listStyles: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should not attempt to load config or plan
      expect(mockConfigLoader.load).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockPrompts).not.toHaveBeenCalled();
      // Note: TerminalDisplay is instantiated but session is not created
    });

    it('should display all style guides without requiring plan file', async () => {
      await improveCore('./test', { listStyles: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should not load plan file
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockPrompts).not.toHaveBeenCalled();
    });

    it('should return early after displaying styles', async () => {
      await improveCore('./test', { listStyles: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Should not create interactive session
      expect(mockSession.run).not.toHaveBeenCalled();
    });
  });

  describe('verbose logging', () => {
    it('should work in non-interactive mode with verbose flag', async () => {
      await improveCore('./test', {
        nonInteractive: true,
        verbose: true,
      }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Verify session was created with correct config
      expect(MockInteractiveSession).toHaveBeenCalled();
      expect(mockSession.run).toHaveBeenCalled();
    });

    it('should work with CLI flag in verbose mode', async () => {
      await improveCore('./test', {
        nonInteractive: true,
        javascriptStyle: 'jsdoc-google',
        verbose: true,
      }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Verify CLI flag was used
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { javascript: 'jsdoc-google' },
        })
      );
    });

    it('should work in interactive mode with verbose flag', async () => {
      mockPrompts
        .mockResolvedValueOnce({ styleGuide: 'jsdoc-vanilla' })
        .mockResolvedValueOnce({ tone: 'concise' });

      await improveCore('./test', { verbose: true }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Verify prompts were called and session created
      expect(mockPrompts).toHaveBeenCalled();
      expect(MockInteractiveSession).toHaveBeenCalled();
    });

    it('should accept verbose flag with other options', async () => {
      await improveCore('./test', {
        nonInteractive: true,
        verbose: true,
        tone: 'detailed',
      }, mockBridge, mockDisplay, mockConfigLoader, mockPluginManager, mockEditorLauncher);

      // Verify all options passed correctly
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'detailed',
        })
      );
    });
  });
});
