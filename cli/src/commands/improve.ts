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
import { PythonBridge } from '../python-bridge/PythonBridge.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { TerminalDisplay } from '../display/TerminalDisplay.js';
import { InteractiveSession } from '../session/InteractiveSession.js';
import { StateManager } from '../utils/StateManager.js';
import {
  STYLE_GUIDE_CHOICES,
  VALID_STYLE_GUIDES,
  VALID_TONES,
  TONE_CHOICES,
} from '../constants/styleGuides.js';
import type { PlanResult, SupportedLanguage } from '../types/analysis.js';
import type { IConfig } from '../config/IConfig.js';

/**
 * Execute the improve command.
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
  }
): Promise<void> {
  const display = new TerminalDisplay();

  try {
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
      display.showError(
        'ANTHROPIC_API_KEY environment variable is required.\n' +
        'Please set it to your Claude API key: export ANTHROPIC_API_KEY=sk-ant-...'
      );
      process.exit(1);
    }

    // Load configuration
    const configLoader = new ConfigLoader();
    const config: IConfig = await configLoader.load(options.config);

    // Load plan file
    const planFilePath = options.planFile || StateManager.getPlanFile();
    let planResult: PlanResult;

    try {
      const planContent = readFileSync(resolve(planFilePath), 'utf-8');
      planResult = JSON.parse(planContent);
    } catch {
      display.showError(
        `Failed to load plan file: ${planFilePath}\n` +
        `Run 'docimp plan ${path}' first to generate a plan.`
      );
      process.exit(1);
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
      display.showError('No valid languages found in plan. All items are skipped.');
      process.exit(1);
    }

    // Collect user preferences
    display.showMessage(chalk.bold('\n Interactive Documentation Improvement'));
    display.showMessage(chalk.dim('Using Claude AI with plugin validation\n'));

    // Validate CLI flag style guides
    const cliStyleGuides: Partial<Record<SupportedLanguage, string>> = {};

    if (options.pythonStyle) {
      if (!VALID_STYLE_GUIDES.python.includes(options.pythonStyle)) {
        display.showError(
          `Invalid Python style guide: ${options.pythonStyle}\n` +
          `Valid options: ${VALID_STYLE_GUIDES.python.join(', ')}`
        );
        process.exit(1);
      }
      cliStyleGuides.python = options.pythonStyle;
    }

    if (options.javascriptStyle) {
      if (!VALID_STYLE_GUIDES.javascript.includes(options.javascriptStyle)) {
        display.showError(
          `Invalid JavaScript style guide: ${options.javascriptStyle}\n` +
          `Valid options: ${VALID_STYLE_GUIDES.javascript.join(', ')}`
        );
        process.exit(1);
      }
      cliStyleGuides.javascript = options.javascriptStyle;
    }

    if (options.typescriptStyle) {
      if (!VALID_STYLE_GUIDES.typescript.includes(options.typescriptStyle)) {
        display.showError(
          `Invalid TypeScript style guide: ${options.typescriptStyle}\n` +
          `Valid options: ${VALID_STYLE_GUIDES.typescript.join(', ')}`
        );
        process.exit(1);
      }
      cliStyleGuides.typescript = options.typescriptStyle;
    }

    // Validate tone if provided via CLI
    if (options.tone && !(VALID_TONES as readonly string[]).includes(options.tone)) {
      display.showError(
        `Invalid tone: ${options.tone}\n` +
        `Valid options: ${VALID_TONES.join(', ')}`
      );
      process.exit(1);
    }

    // Fail fast if plan contains unsupported languages
    const unsupportedLanguages = detectedLanguages.filter(lang => !STYLE_GUIDE_CHOICES[lang]);
    if (unsupportedLanguages.length > 0) {
      display.showError(
        `Plan contains unsupported languages: ${unsupportedLanguages.join(', ')}\n` +
        `Supported languages: python, javascript, typescript`
      );
      process.exit(1);
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
        display.showError(
          `Non-interactive mode requires style guides for all detected languages.\n` +
          `Missing configuration for: ${missingLanguages.join(', ')}\n\n` +
          `Please either:\n` +
          `  1. Add styleGuides.${missingLanguages[0]} to your docimp.config.js\n` +
          `  2. Use CLI flags: --${missingLanguages[0]}-style <style>\n` +
          `  3. Run without --non-interactive for interactive prompts`
        );
        process.exit(1);
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
          display.showError('Style guide selection cancelled.');
          process.exit(0);
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
        display.showError('Tone selection cancelled.');
        process.exit(0);
      }
      if (options.verbose) {
        display.showMessage(chalk.dim(`User selected tone: ${tone}`));
      }
    }

    // Load plugins
    const pluginManager = new PluginManager(config);
    const pluginPaths = Array.isArray(config.plugins)
      ? config.plugins
      : config.plugins?.paths ?? [];

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

    // Create Python bridge with config for timeout settings
    const pythonBridge = new PythonBridge(undefined, undefined, config);

    // Create interactive session
    const session = new InteractiveSession({
      config,
      pythonBridge,
      pluginManager,
      styleGuides,
      tone,
      basePath: resolve(process.cwd(), path),
    });

    // Run the session
    await session.run(planResult.items);

  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
