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
import type { PlanResult } from '../types/analysis.js';
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
    styleGuide?: string;
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
    const planFilePath = options.planFile || '.docimp-plan.json';
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

    // Collect user preferences
    display.showMessage(chalk.bold('\n Interactive Documentation Improvement'));
    display.showMessage(chalk.dim('Using Claude AI with plugin validation\n'));

    const preferences = await prompts([
      {
        type: 'select',
        name: 'styleGuide',
        message: 'Select documentation style guide:',
        choices: [
          { title: 'JSDoc (JavaScript/TypeScript)', value: 'jsdoc' },
          { title: 'NumPy (Python)', value: 'numpy' },
          { title: 'Google (Python)', value: 'google' },
          { title: 'Sphinx (Python)', value: 'sphinx' },
        ],
        initial: 0,
      },
      {
        type: 'select',
        name: 'tone',
        message: 'Select documentation tone:',
        choices: [
          { title: 'Concise', value: 'concise' },
          { title: 'Detailed', value: 'detailed' },
          { title: 'Friendly', value: 'friendly' },
        ],
        initial: 0,
      },
    ]);

    // Use command-line overrides or user preferences
    const styleGuide = options.styleGuide || preferences.styleGuide || 'numpy';
    const tone = options.tone || preferences.tone || 'concise';

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

    // Create Python bridge
    const pythonBridge = new PythonBridge();

    // Create interactive session
    const session = new InteractiveSession({
      config,
      pythonBridge,
      pluginManager,
      styleGuide,
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
