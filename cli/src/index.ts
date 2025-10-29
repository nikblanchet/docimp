#!/usr/bin/env node

/**
 * Main entry point for the DocImp CLI.
 *
 * This module sets up Commander.js with subcommands for analyzing,
 * auditing, planning, and improving documentation coverage.
 */

import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import { auditCommand } from './commands/audit.js';
import { planCommand } from './commands/plan.js';
import { improveCommand } from './commands/improve.js';
import { StateManager } from './utils/StateManager.js';
import { PythonBridge } from './python-bridge/PythonBridge.js';
import { TerminalDisplay } from './display/TerminalDisplay.js';
import { ConfigLoader } from './config/ConfigLoader.js';
import { PluginManager } from './plugins/PluginManager.js';
import { EditorLauncher } from './editor/EditorLauncher.js';

const program = new Command();

program
  .name('docimp')
  .description('Impact-driven documentation coverage tool')
  .version('0.1.0');

// Analyze command
program
  .command('analyze')
  .description('Analyze documentation coverage in a codebase')
  .argument('<path>', 'Path to file or directory to analyze')
  .option('--format <format>', 'Output format (json or summary)', 'summary')
  .option('--config <path>', 'Path to configuration file')
  .option('--verbose', 'Enable verbose output')
  .option('--keep-old-reports', 'Preserve existing audit and plan files')
  .option('--strict', 'Fail immediately on first parse error (for CI/CD and debugging)')
  .action(async (path, options) => {
    try {
      // Instantiate dependencies (ONLY place with 'new' in TypeScript)
      const display = new TerminalDisplay();
      const configLoader = new ConfigLoader();

      // Load config to get bridge timeout settings
      const config = await configLoader.load(options.config);
      const bridge = new PythonBridge(undefined, undefined, config);

      // Call command with injected dependencies
      const exitCode = await analyzeCommand(path, options, bridge, display, configLoader);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  });

// Audit command
program
  .command('audit')
  .description('Audit existing documentation quality')
  .argument('<path>', 'Path to file or directory to audit')
  .option('--audit-file <file>', `Path to audit results file (default: ${StateManager.getAuditFile()})`)
  .option('--config <path>', 'Path to configuration file')
  .option('--verbose', 'Enable verbose output')
  .action(async (path, options) => {
    try {
      // Instantiate dependencies
      const display = new TerminalDisplay();
      const configLoader = new ConfigLoader();

      // Load config to get bridge timeout settings
      const config = await configLoader.load(options.config);
      const bridge = new PythonBridge(undefined, undefined, config);

      // Call command with injected dependencies
      const exitCode = await auditCommand(path, options, bridge, display, configLoader);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  });

// Plan command
program
  .command('plan')
  .description('Generate prioritized documentation improvement plan')
  .argument('<path>', 'Path to file or directory to plan')
  .option('--audit-file <file>', `Path to audit results file (default: ${StateManager.getAuditFile()})`)
  .option('--plan-file <file>', `Output file for plan (default: ${StateManager.getPlanFile()})`)
  .option('--quality-threshold <threshold>', 'Include items with rating <= threshold (default: 2)', '2')
  .option('--verbose', 'Enable verbose output')
  .action(async (path, options) => {
    try {
      // Instantiate dependencies
      const display = new TerminalDisplay();
      // Plan command doesn't need config, so use minimal bridge
      const bridge = new PythonBridge();

      // Call command with injected dependencies
      const exitCode = await planCommand(path, options, bridge, display);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  });

// Improve command
program
  .command('improve')
  .description('Interactively improve documentation with Claude AI')
  .argument('<path>', 'Path to file or directory to improve')
  .option('--config <path>', 'Path to configuration file')
  .option('--plan-file <file>', `Plan file to load (default: ${StateManager.getPlanFile()})`)
  .option('--python-style <style>', 'Python style guide (google, numpy-rest, numpy-markdown, sphinx)')
  .option('--javascript-style <style>', 'JavaScript style guide (jsdoc-vanilla, jsdoc-google, jsdoc-closure)')
  .option('--typescript-style <style>', 'TypeScript style guide (tsdoc-typedoc, tsdoc-aedoc, jsdoc-ts)')
  .option('--tone <tone>', 'Documentation tone (concise, detailed, friendly)')
  .option('--non-interactive', 'Skip prompts and use config/CLI flags only (for CI/CD)')
  .option('--list-styles', 'List all available style guides and tones')
  .option('--verbose', 'Enable verbose output')
  .action(async (path, options) => {
    try {
      // Instantiate dependencies
      const display = new TerminalDisplay();
      const configLoader = new ConfigLoader();

      // Load config to get bridge timeout settings and plugin configuration
      const config = await configLoader.load(options.config);
      const bridge = new PythonBridge(undefined, undefined, config);
      const pluginManager = new PluginManager(config);
      const editorLauncher = new EditorLauncher();

      // Call command with injected dependencies
      const exitCode = await improveCommand(path, options, bridge, display, configLoader, pluginManager, editorLauncher);
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      console.error('Unexpected error:', error);
      process.exit(1);
    }
  });

program.parse(process.argv);
