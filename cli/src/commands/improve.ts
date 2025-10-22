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
import type { PlanResult, SupportedLanguage } from '../types/analysis.js';
import type { IConfig } from '../config/IConfig.js';

/**
 * Execute the improve command.
 *
 * @param path - Path to file or directory to improve
 * @param options - Command options
 */
export async function improveCommand(
  path: string,
  options: {
    config?: string;
    planFile?: string;
    tone?: string;
    verbose?: boolean;
  }
): Promise<void> {
  const display = new TerminalDisplay();

  try {
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

    // Define style guide choices per language
    const styleGuideChoices: Record<SupportedLanguage, Array<{ title: string; value: string }>> = {
      python: [
        { title: 'Google', value: 'google' },
        { title: 'NumPy + reST', value: 'numpy-rest' },
        { title: 'NumPy + Markdown', value: 'numpy-markdown' },
        { title: 'Pure reST (Sphinx)', value: 'sphinx' },
      ],
      javascript: [
        { title: 'JSDoc (Vanilla)', value: 'jsdoc-vanilla' },
        { title: 'Google JSDoc', value: 'jsdoc-google' },
        { title: 'Closure (JSDoc/Closure)', value: 'jsdoc-closure' },
      ],
      typescript: [
        { title: 'TSDoc (TypeDoc)', value: 'tsdoc-typedoc' },
        { title: 'TSDoc (API Extractor/AEDoc)', value: 'tsdoc-aedoc' },
        { title: 'JSDoc-in-TS', value: 'jsdoc-ts' },
      ],
    };

    // Fail fast if plan contains unsupported languages
    const unsupportedLanguages = detectedLanguages.filter(lang => !styleGuideChoices[lang]);
    if (unsupportedLanguages.length > 0) {
      display.showError(
        `Plan contains unsupported languages: ${unsupportedLanguages.join(', ')}\n` +
        `Supported languages: python, javascript, typescript`
      );
      process.exit(1);
    }

    // Sequential prompts for each detected language
    const styleGuides: Partial<Record<SupportedLanguage, string>> = {};

    for (const lang of detectedLanguages) {
      const choices = styleGuideChoices[lang];

      // Find initial selection from config
      const configuredStyle = config.styleGuides?.[lang as SupportedLanguage];
      const initialIndex = configuredStyle
        ? choices.findIndex(choice => choice.value === configuredStyle)
        : -1;

      const response = await prompts({
        type: 'select',
        name: 'styleGuide',
        message: `Select documentation style guide for ${chalk.cyan(lang)}:`,
        choices,
        initial: initialIndex >= 0 ? initialIndex : 0,
      });

      if (response.styleGuide) {
        styleGuides[lang] = response.styleGuide;
      } else {
        display.showError('Style guide selection cancelled.');
        process.exit(0);
      }
    }

    // Prompt for tone (applies to all languages)
    const toneChoices = [
      { title: 'Concise', value: 'concise' },
      { title: 'Detailed', value: 'detailed' },
      { title: 'Friendly', value: 'friendly' },
    ];

    const toneInitialIndex = config.tone
      ? toneChoices.findIndex(choice => choice.value === config.tone)
      : -1;

    const toneResponse = await prompts({
      type: 'select',
      name: 'tone',
      message: 'Select documentation tone (applies to all languages):',
      choices: toneChoices,
      initial: toneInitialIndex >= 0 ? toneInitialIndex : 0,
    });

    // Use command-line override or user preference for tone
    const tone = options.tone || toneResponse.tone || 'concise';

    // Load plugins
    const pluginManager = new PluginManager();
    if (config.plugins && config.plugins.length > 0) {
      display.showMessage(chalk.dim(`Loading plugins...`));
      try {
        await pluginManager.loadPlugins(config.plugins);
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
