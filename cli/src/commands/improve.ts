/**
 * Improve command implementation.
 *
 * This command provides an interactive workflow for improving documentation
 * with Claude AI assistance and plugin validation.
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import prompts from 'prompts';
import chalk from 'chalk';
import { StateManager } from '../utils/StateManager.js';
import { PathValidator } from '../utils/PathValidator.js';
import { InteractiveSession } from '../session/InteractiveSession.js';
import {
  STYLE_GUIDE_CHOICES,
  VALID_STYLE_GUIDES,
  VALID_TONES,
  TONE_CHOICES,
} from '../constants/styleGuides.js';
import type { PlanResult, SupportedLanguage } from '../types/analysis.js';
import type { IConfig } from '../config/IConfig.js';
import { isPluginConfig } from '../config/IConfig.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IConfigLoader } from '../config/IConfigLoader.js';
import type { IPluginManager } from '../plugins/IPluginManager.js';
import type { IDisplay } from '../display/IDisplay.js';
import type { IEditorLauncher } from '../editor/IEditorLauncher.js';
import type { IInteractiveSession } from '../session/IInteractiveSession.js';

/**
 * User cancelled the operation.
 * This is a special case that should exit with code 0 (not an error).
 */
class UserCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserCancellationError';
  }
}

/**
 * Core improve logic (extracted for testability).
 *
 * @param path - Path to file or directory to improve
 * @param options - Command options
 * @param options.config - Path to configuration file
 * @param options.planFile - Path to plan file containing improvement items
 * @param options.pythonStyle - Python documentation style guide
 * @param options.javascriptStyle - JavaScript documentation style guide
 * @param options.typescriptStyle - TypeScript documentation style guide
 * @param options.tone - Documentation tone (concise, friendly, technical)
 * @param options.nonInteractive - Run in non-interactive mode
 * @param options.verbose - Enable verbose output
 * @param options.listStyles - List available style guides and exit
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @param pluginManager - Plugin manager instance (dependency injection)
 * @param editorLauncher - Editor launcher instance (dependency injection)
 */
export async function improveCore(
  path: string,
  options: {
    config?: string;
    planFile?: string;
    pythonStyle?: string;
    javascriptStyle?: string;
    typescriptStyle?: string;
    tone?: string;
    nonInteractive?: boolean;
    verbose?: boolean;
    listStyles?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader,
  pluginManager: IPluginManager,
  editorLauncher: IEditorLauncher
): Promise<void> {
  // Handle --list-styles flag (exit early without requiring API key or plan)
  if (options.listStyles) {
    display.showMessage(chalk.bold('\nAvailable style guides:\n'));

    display.showMessage(chalk.cyan('Python:'));
    VALID_STYLE_GUIDES.python.forEach(style => {
      display.showMessage(`  - ${style}`);
    });

    display.showMessage(chalk.cyan('\nJavaScript:'));
    VALID_STYLE_GUIDES.javascript.forEach(style => {
      display.showMessage(`  - ${style}`);
    });

    display.showMessage(chalk.cyan('\nTypeScript:'));
    VALID_STYLE_GUIDES.typescript.forEach(style => {
      display.showMessage(`  - ${style}`);
    });

    display.showMessage(chalk.cyan('\nTones:'));
    VALID_TONES.forEach(tone => {
      display.showMessage(`  - ${tone}`);
    });

    display.showMessage('');
    return;
  }

  // Check for ANTHROPIC_API_KEY
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
      'Please set it to your Claude API key: export ANTHROPIC_API_KEY=sk-ant-...'
    );
  }

  // Validate path exists and is accessible (for consistency with other commands)
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Load configuration
  const config: IConfig = await configLoader.load(options.config);

  // Load plan file
  const planFilePath = options.planFile || StateManager.getPlanFile();
  let planResult: PlanResult;

  try {
    const planContent = readFileSync(resolve(planFilePath), 'utf-8');
    planResult = JSON.parse(planContent);
  } catch {
    throw new Error(
      `Failed to load plan file: ${planFilePath}\n` +
      `Run 'docimp plan ${path}' first to generate a plan.`
    );
  }

  if (!planResult.items || planResult.items.length === 0) {
    display.showMessage(chalk.yellow('No items in plan. Nothing to improve.'));
    return;
  }

  // Detect languages present in plan
  // Note: PlanItem.language never includes 'skipped' by design
  const detectedLanguages = [...new Set(
    planResult.items.map(item => item.language)
  )];

  if (detectedLanguages.length === 0) {
    throw new Error('No valid languages found in plan. All items are skipped.');
  }

  // Collect user preferences
  display.showMessage(chalk.bold('\n Interactive Documentation Improvement'));
  display.showMessage(chalk.dim('Using Claude AI with plugin validation\n'));

  // Validate CLI flag style guides
  const cliStyleGuides: Partial<Record<SupportedLanguage, string>> = {};

  if (options.pythonStyle) {
    if (!VALID_STYLE_GUIDES.python.includes(options.pythonStyle)) {
      throw new Error(
        `Invalid Python style guide: ${options.pythonStyle}\n` +
        `Valid options: ${VALID_STYLE_GUIDES.python.join(', ')}`
      );
    }
    cliStyleGuides.python = options.pythonStyle;
  }

  if (options.javascriptStyle) {
    if (!VALID_STYLE_GUIDES.javascript.includes(options.javascriptStyle)) {
      throw new Error(
        `Invalid JavaScript style guide: ${options.javascriptStyle}\n` +
        `Valid options: ${VALID_STYLE_GUIDES.javascript.join(', ')}`
      );
    }
    cliStyleGuides.javascript = options.javascriptStyle;
  }

  if (options.typescriptStyle) {
    if (!VALID_STYLE_GUIDES.typescript.includes(options.typescriptStyle)) {
      throw new Error(
        `Invalid TypeScript style guide: ${options.typescriptStyle}\n` +
        `Valid options: ${VALID_STYLE_GUIDES.typescript.join(', ')}`
      );
    }
    cliStyleGuides.typescript = options.typescriptStyle;
  }

  // Validate tone if provided via CLI
  if (options.tone && !(VALID_TONES as readonly string[]).includes(options.tone)) {
    throw new Error(
      `Invalid tone: ${options.tone}\n` +
      `Valid options: ${VALID_TONES.join(', ')}`
    );
  }

  // Fail fast if plan contains unsupported languages
  const unsupportedLanguages = detectedLanguages.filter(lang => !STYLE_GUIDE_CHOICES[lang]);
  if (unsupportedLanguages.length > 0) {
    throw new Error(
      `Plan contains unsupported languages: ${unsupportedLanguages.join(', ')}\n` +
      `Supported languages: python, javascript, typescript`
    );
  }

  // Build style guides from CLI flags, config, or prompts
  const styleGuides: Partial<Record<SupportedLanguage, string>> = {};

  // In non-interactive mode, validate all required values are available
  if (options.nonInteractive) {
    const missingLanguages: string[] = [];

    for (const lang of detectedLanguages) {
      // Check CLI flag first, then config
      const cliValue = cliStyleGuides[lang];
      const configValue = config.styleGuides?.[lang];

      if (cliValue) {
        if (options.verbose) {
          display.showMessage(chalk.dim(`Using CLI flag for ${lang}: ${cliValue}`));
        }
        styleGuides[lang] = cliValue;
      } else if (configValue) {
        if (options.verbose) {
          display.showMessage(chalk.dim(`Using config value for ${lang}: ${configValue}`));
        }
        styleGuides[lang] = configValue;
      } else {
        missingLanguages.push(lang);
      }
    }

    if (missingLanguages.length > 0) {
      throw new Error(
        `Non-interactive mode requires style guides for all detected languages.\n` +
        `Missing configuration for: ${missingLanguages.join(', ')}\n\n` +
        `Please either:\n` +
        `  1. Add styleGuides.${missingLanguages[0]} to your docimp.config.js\n` +
        `  2. Use CLI flags: --${missingLanguages[0]}-style <style>\n` +
        `  3. Run without --non-interactive for interactive prompts`
      );
    }
  } else {
    // Interactive mode: prompt only for languages without CLI flags
    for (const lang of detectedLanguages) {
      // If CLI flag provided, use it and skip prompt
      if (cliStyleGuides[lang]) {
        if (options.verbose) {
          display.showMessage(chalk.dim(`Using CLI flag for ${lang}: ${cliStyleGuides[lang]}`));
        }
        styleGuides[lang] = cliStyleGuides[lang];
        continue;
      }

      // Otherwise, prompt with config as initial selection
      const choices = STYLE_GUIDE_CHOICES[lang];
      const configuredStyle = config.styleGuides?.[lang as SupportedLanguage];
      const initialIndex = configuredStyle
        ? choices.findIndex(choice => choice.value === configuredStyle)
        : -1;

      if (options.verbose && configuredStyle) {
        display.showMessage(chalk.dim(`Config has ${lang} style guide: ${configuredStyle} (pre-selected)`));
      }

      const response = await prompts({
        type: 'select',
        name: 'styleGuide',
        message: `Select documentation style guide for ${chalk.cyan(lang)}:`,
        choices,
        initial: initialIndex >= 0 ? initialIndex : 0,
      });

      if (response.styleGuide) {
        if (options.verbose) {
          display.showMessage(chalk.dim(`User selected ${lang} style guide: ${response.styleGuide}`));
        }
        styleGuides[lang] = response.styleGuide;
      } else {
        throw new UserCancellationError('Style guide selection cancelled.');
      }
    }
  }

  // Determine tone from CLI flag, config, or prompt
  let tone: string;

  if (options.tone) {
    // CLI flag takes precedence
    if (options.verbose) {
      display.showMessage(chalk.dim(`Using CLI flag for tone: ${options.tone}`));
    }
    tone = options.tone;
  } else if (options.nonInteractive) {
    // Non-interactive mode: use config or default
    tone = config.tone || 'concise';
    if (options.verbose) {
      const source = config.tone ? 'config' : 'default';
      display.showMessage(chalk.dim(`Using ${source} value for tone: ${tone}`));
    }
  } else {
    // Interactive mode: prompt with config as initial selection
    const toneInitialIndex = config.tone
      ? TONE_CHOICES.findIndex(choice => choice.value === config.tone)
      : -1;

    if (options.verbose && config.tone) {
      display.showMessage(chalk.dim(`Config has tone: ${config.tone} (pre-selected)`));
    }

    const toneResponse = await prompts({
      type: 'select',
      name: 'tone',
      message: 'Select documentation tone (applies to all languages):',
      choices: TONE_CHOICES,
      initial: toneInitialIndex >= 0 ? toneInitialIndex : 0,
    });

    tone = toneResponse.tone || 'concise';
    if (!toneResponse.tone) {
      throw new UserCancellationError('Tone selection cancelled.');
    }
    if (options.verbose) {
      display.showMessage(chalk.dim(`User selected tone: ${tone}`));
    }
  }

  // Load plugins
  const pluginPaths = isPluginConfig(config.plugins)
    ? config.plugins.paths ?? []
    : config.plugins ?? [];

  if (pluginPaths.length > 0) {
    display.showMessage(chalk.dim(`Loading plugins...`));
    try {
      await pluginManager.loadPlugins(pluginPaths);
      const loadedPlugins = pluginManager.getLoadedPlugins();
      display.showMessage(chalk.green(`Loaded ${loadedPlugins.length} plugin(s): ${loadedPlugins.join(', ')}`));
    } catch (error) {
      display.showWarning(
        `Failed to load plugins: ${error instanceof Error ? error.message : String(error)}\n` +
        `Continuing without plugin validation.`
      );
    }
  }

  // Create interactive session with injected dependencies
  const session: IInteractiveSession = new InteractiveSession({
    config,
    pythonBridge: bridge,
    pluginManager,
    editorLauncher,
    styleGuides,
    tone,
    basePath: resolve(process.cwd(), path),
  });

  // Run the session
  await session.run(planResult.items);
}

/**
 * Execute the improve command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to improve
 * @param options - Command options
 * @param options.config - Path to configuration file
 * @param options.planFile - Path to plan file containing improvement items
 * @param options.pythonStyle - Python documentation style guide
 * @param options.javascriptStyle - JavaScript documentation style guide
 * @param options.typescriptStyle - TypeScript documentation style guide
 * @param options.tone - Documentation tone (concise, friendly, technical)
 * @param options.nonInteractive - Run in non-interactive mode
 * @param options.verbose - Enable verbose output
 * @param options.listStyles - List available style guides and exit
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @param pluginManager - Plugin manager instance (dependency injection)
 * @param editorLauncher - Editor launcher instance (dependency injection)
 * @returns Exit code (0 for success, 1 for failure)
 */
export async function improveCommand(
  path: string,
  options: {
    config?: string;
    planFile?: string;
    pythonStyle?: string;
    javascriptStyle?: string;
    typescriptStyle?: string;
    tone?: string;
    nonInteractive?: boolean;
    verbose?: boolean;
    listStyles?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader,
  pluginManager: IPluginManager,
  editorLauncher: IEditorLauncher
): Promise<number> {
  try {
    await improveCore(path, options, bridge, display, configLoader, pluginManager, editorLauncher);
    return 0;
  } catch (error) {
    // User cancellation is not an error - exit gracefully with code 0
    if (error instanceof UserCancellationError) {
      display.showError(error.message);
      return 0;
    }

    display.showError(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
