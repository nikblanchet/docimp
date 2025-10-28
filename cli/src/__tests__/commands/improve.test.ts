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
      styleGuides: {
        javascript: 'jsdoc-vanilla',
        python: 'google',
        typescript: 'tsdoc-typedoc',
      },
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

    // Mock fs.existsSync, fs.statSync, and fs.accessSync for path validation
    const fs = require('fs');
    jest.spyOn(fs, 'existsSync').mockImplementation((path: string) => {
      // Allow './test' path to exist for tests
      if (path === './test' || path.includes('.docimp')) {
        return true;
      }
      return false;
    });
    jest.spyOn(fs, 'statSync').mockImplementation(() => ({
      isDirectory: () => true,
      isFile: () => false,
    }));
    jest.spyOn(fs, 'readdirSync').mockImplementation(() => ['file.ts']); // Not empty
    jest.spyOn(fs, 'accessSync').mockImplementation(() => {}); // Allow read access

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
        await improveCommand('./test', {});
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
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
        await improveCommand('./test', {});
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
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

      await improveCommand('./test', {});

      // Should prompt for both languages and tone
      expect(mockPrompts).toHaveBeenCalledTimes(3);
      expect(mockSession.run).toHaveBeenCalled();
    });
  });

  describe('user preferences', () => {
    it('should prompt for style guides per language and tone', async () => {
      await improveCommand('./test', {});

      // Should be called twice: once for javascript style, once for tone
      expect(mockPrompts).toHaveBeenCalledTimes(2);
      // First call: javascript style guide
      expect(mockPrompts).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'styleGuide' }));
      // Second call: tone
      expect(mockPrompts).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'tone' }));
    });

    it('should use command-line tone override', async () => {
      await improveCommand('./test', { tone: 'detailed' });

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

      await improveCommand('./test', {});

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
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'google',
          typescript: 'tsdoc-typedoc',
        },
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

      await improveCommand('./test', { pythonStyle: 'numpy-rest' });

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

      await improveCommand('./test', {
        pythonStyle: 'google',
        javascriptStyle: 'jsdoc-google',
      });

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
        await improveCommand('./test', { pythonStyle: 'invalid-style' });
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should reject invalid javascript style guide', async () => {
      await expect(async () => {
        await improveCommand('./test', { javascriptStyle: 'invalid-style' });
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should reject invalid typescript style guide', async () => {
      await expect(async () => {
        await improveCommand('./test', { typescriptStyle: 'invalid-style' });
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should reject invalid tone', async () => {
      await expect(async () => {
        await improveCommand('./test', { tone: 'invalid-tone' });
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('non-interactive mode', () => {
    it('should use config values without prompting when --non-interactive', async () => {
      await improveCommand('./test', { nonInteractive: true });

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
      await improveCommand('./test', {
        nonInteractive: true,
        javascriptStyle: 'jsdoc-google',
        tone: 'detailed',
      });

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
        await improveCommand('./test', { nonInteractive: true });
      }).rejects.toThrow('process.exit called with 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
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

      await improveCommand('./test', {
        nonInteractive: true,
        pythonStyle: 'google',
      });

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

      await improveCommand('./test', { nonInteractive: true });

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

      await improveCommand('./test', { pythonStyle: 'google' });

      // Should prompt for javascript (no flag) and tone
      expect(mockPrompts).toHaveBeenCalledTimes(2);
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          styleGuides: { python: 'google', javascript: 'jsdoc-vanilla' },
        })
      );
    });

    it('should skip tone prompt when --tone flag provided', async () => {
      await improveCommand('./test', { tone: 'friendly' });

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

      await improveCommand('./test', { listStyles: true });

      // Should not attempt to load config or plan
      expect(mockConfigLoader.load).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockPrompts).not.toHaveBeenCalled();
      // Note: TerminalDisplay is instantiated but session is not created
    });

    it('should display all style guides without requiring plan file', async () => {
      await improveCommand('./test', { listStyles: true });

      // Should not load plan file
      expect(mockReadFileSync).not.toHaveBeenCalled();
      expect(mockPrompts).not.toHaveBeenCalled();
    });

    it('should return early after displaying styles', async () => {
      await improveCommand('./test', { listStyles: true });

      // Should not create interactive session
      expect(mockSession.run).not.toHaveBeenCalled();
    });
  });

  describe('verbose logging', () => {
    it('should work in non-interactive mode with verbose flag', async () => {
      await improveCommand('./test', {
        nonInteractive: true,
        verbose: true,
      });

      // Verify session was created with correct config
      expect(MockInteractiveSession).toHaveBeenCalled();
      expect(mockSession.run).toHaveBeenCalled();
    });

    it('should work with CLI flag in verbose mode', async () => {
      await improveCommand('./test', {
        nonInteractive: true,
        javascriptStyle: 'jsdoc-google',
        verbose: true,
      });

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

      await improveCommand('./test', { verbose: true });

      // Verify prompts were called and session created
      expect(mockPrompts).toHaveBeenCalled();
      expect(MockInteractiveSession).toHaveBeenCalled();
    });

    it('should accept verbose flag with other options', async () => {
      await improveCommand('./test', {
        nonInteractive: true,
        verbose: true,
        tone: 'detailed',
      });

      // Verify all options passed correctly
      expect(MockInteractiveSession).toHaveBeenCalledWith(
        expect.objectContaining({
          tone: 'detailed',
        })
      );
    });
  });
});
