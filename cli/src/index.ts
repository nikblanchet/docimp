/**
 * Main entry point for the DocImp CLI.
 *
 * This module sets up Commander.js with subcommands for analyzing,
 * auditing, planning, and improving documentation coverage.
 */

/* eslint-disable unicorn/no-process-exit, n/no-process-exit */
// This is a CLI entry point - process.exit() is appropriate here

import { Command } from 'commander';
import { analyzeCommand } from './commands/analyze.js';
import {
  deleteAuditSessionCommand,
  listAuditSessionsCommand,
} from './commands/audit-sessions.js';
import { auditCommand } from './commands/audit.js';
import {
  deleteImproveSessionCommand,
  listImproveSessionsCommand,
} from './commands/improve-sessions.js';
import { improveCommand } from './commands/improve.js';
import { listChangesCommand } from './commands/list-changes.js';
import { listSessionsCommand } from './commands/list-sessions.js';
import { planCommand } from './commands/plan.js';
import { rollbackChangeCommand } from './commands/rollback-change.js';
import { rollbackSessionCommand } from './commands/rollback-session.js';
import { ConfigLoader } from './config/config-loader.js';
import { EXIT_CODE } from './constants/exit-codes.js';
import { TerminalDisplay } from './display/terminal-display.js';
import { EditorLauncher } from './editor/editor-launcher.js';
import { PluginManager } from './plugins/plugin-manager.js';
import { PythonBridge } from './python-bridge/python-bridge.js';
import { StateManager } from './utils/state-manager.js';

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
  .option(
    '--strict',
    'Fail immediately on first parse error (for CI/CD and debugging)'
  )
  .action(async (path, options) => {
    try {
      // Instantiate dependencies (ONLY place with 'new' in TypeScript)
      const display = new TerminalDisplay();
      const configLoader = new ConfigLoader();

      // Load config to get bridge timeout settings
      const config = await configLoader.load(options.config);
      const bridge = new PythonBridge(undefined, undefined, config);

      // Call command with injected dependencies
      const exitCode = await analyzeCommand(
        path,
        options,
        bridge,
        display,
        configLoader
      );
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Audit command
program
  .command('audit')
  .description('Audit existing documentation quality')
  .argument('<path>', 'Path to file or directory to audit')
  .option(
    '--audit-file <file>',
    `Path to audit results file (default: ${StateManager.getAuditFile()})`
  )
  .option('--config <path>', 'Path to configuration file')
  .option('--verbose', 'Enable verbose output')
  .option('--resume', 'Resume an incomplete audit session')
  .option(
    '--resume-file <file>',
    'Resume specific session file (skips selection list)'
  )
  .option('--new', 'Force new session (ignore existing sessions)')
  .option('--clear-session', 'Delete all incomplete sessions and exit')
  .action(async (path, options) => {
    try {
      // Instantiate dependencies
      const display = new TerminalDisplay();
      const configLoader = new ConfigLoader();

      // Load config to get bridge timeout settings
      const config = await configLoader.load(options.config);
      const bridge = new PythonBridge(undefined, undefined, config);

      // Call command with injected dependencies
      const exitCode = await auditCommand(
        path,
        options,
        bridge,
        display,
        configLoader
      );
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Plan command
program
  .command('plan')
  .description('Generate prioritized documentation improvement plan')
  .argument('<path>', 'Path to file or directory to plan')
  .option(
    '--audit-file <file>',
    `Path to audit results file (default: ${StateManager.getAuditFile()})`
  )
  .option(
    '--plan-file <file>',
    `Output file for plan (default: ${StateManager.getPlanFile()})`
  )
  .option(
    '--quality-threshold <threshold>',
    'Include items with rating <= threshold (default: 2)',
    '2'
  )
  .option('--verbose', 'Enable verbose output')
  .action(async (path, options) => {
    try {
      // Instantiate dependencies
      const display = new TerminalDisplay();
      // Plan command doesn't need config, so use minimal bridge
      const bridge = new PythonBridge();

      // Call command with injected dependencies
      const exitCode = await planCommand(path, options, bridge, display);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Improve command
program
  .command('improve')
  .description('Interactively improve documentation with Claude AI')
  .argument('<path>', 'Path to file or directory to improve')
  .option('--config <path>', 'Path to configuration file')
  .option(
    '--plan-file <file>',
    `Plan file to load (default: ${StateManager.getPlanFile()})`
  )
  .option(
    '--python-style <style>',
    'Python style guide (google, numpy-rest, numpy-markdown, sphinx)'
  )
  .option(
    '--javascript-style <style>',
    'JavaScript style guide (jsdoc-vanilla, jsdoc-google, jsdoc-closure)'
  )
  .option(
    '--typescript-style <style>',
    'TypeScript style guide (tsdoc-typedoc, tsdoc-aedoc, jsdoc-ts)'
  )
  .option('--tone <tone>', 'Documentation tone (concise, detailed, friendly)')
  .option(
    '--non-interactive',
    'Skip prompts and use config/CLI flags only (for CI/CD)'
  )
  .option('--list-styles', 'List all available style guides and tones')
  .option('--verbose', 'Enable verbose output')
  .option('--resume', 'Resume an incomplete session (show list)')
  .option('--resume-file <sessionId>', 'Resume specific session ID')
  .option('--new', 'Force new session (bypass auto-detection)')
  .option('--clear-session', 'Delete all incomplete sessions and exit')
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
      const exitCode = await improveCommand(
        path,
        options,
        bridge,
        display,
        configLoader,
        pluginManager,
        editorLauncher
      );
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      // Unexpected error (commands should return exit codes, not throw)
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// List-sessions command (transaction tracking)
program
  .command('list-sessions')
  .description('List all documentation improvement sessions')
  .action(async () => {
    try {
      const display = new TerminalDisplay();
      const bridge = new PythonBridge();

      const exitCode = await listSessionsCommand(bridge, display);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// List-changes command (transaction tracking)
program
  .command('list-changes')
  .description('List changes in a specific session')
  .argument('<session-id>', 'Session UUID or "last" for most recent')
  .action(async (sessionId) => {
    try {
      const display = new TerminalDisplay();
      const bridge = new PythonBridge();

      const exitCode = await listChangesCommand(sessionId, bridge, display);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Rollback-session command (transaction rollback)
program
  .command('rollback-session')
  .description('Rollback an entire session (revert all changes)')
  .argument('<session-id>', 'Session UUID or "last" for most recent')
  .action(async (sessionId) => {
    try {
      const display = new TerminalDisplay();
      const bridge = new PythonBridge();

      const exitCode = await rollbackSessionCommand(sessionId, bridge, display);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Rollback-change command (transaction rollback)
program
  .command('rollback-change')
  .description('Rollback a specific change')
  .argument('<entry-id>', 'Change entry ID or "last" for most recent')
  .action(async (entryId) => {
    try {
      const display = new TerminalDisplay();
      const bridge = new PythonBridge();

      const exitCode = await rollbackChangeCommand(entryId, bridge, display);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// List-audit-sessions command (audit session management)
program
  .command('list-audit-sessions')
  .description('List all audit sessions')
  .action(async () => {
    try {
      const exitCode = await listAuditSessionsCommand();
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Delete-audit-session command (audit session management)
program
  .command('delete-audit-session [session-id]')
  .description('Delete audit session(s)')
  .option('--all', 'Delete all audit sessions')
  .option('--force', 'Skip confirmation prompt')
  .action(async (sessionId, options) => {
    try {
      const exitCode = await deleteAuditSessionCommand(sessionId, options);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// List-improve-sessions command (improve session management)
program
  .command('list-improve-sessions')
  .description('List all improve sessions')
  .action(async () => {
    try {
      const exitCode = await listImproveSessionsCommand();
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

// Delete-improve-session command (improve session management)
program
  .command('delete-improve-session [session-id]')
  .description('Delete improve session(s)')
  .option('--all', 'Delete all improve sessions')
  .option('--force', 'Skip confirmation prompt')
  .action(async (sessionId, options) => {
    try {
      const exitCode = await deleteImproveSessionCommand(sessionId, options);
      if (exitCode !== EXIT_CODE.SUCCESS) {
        process.exit(exitCode);
      }
    } catch (error) {
      const errorDisplay = new TerminalDisplay();
      errorDisplay.showError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
      );
      process.exit(EXIT_CODE.ERROR);
    }
  });

program.parse(process.argv);
