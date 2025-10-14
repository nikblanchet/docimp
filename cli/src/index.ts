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
  .action(analyzeCommand);

// Audit command
program
  .command('audit')
  .description('Audit existing documentation quality')
  .argument('<path>', 'Path to file or directory to audit')
  .option('--audit-file <file>', 'Path to audit results file (default: .docimp-audit.json)')
  .option('--verbose', 'Enable verbose output')
  .action(auditCommand);

// Plan command
program
  .command('plan')
  .description('Generate prioritized documentation improvement plan')
  .argument('<path>', 'Path to file or directory to plan')
  .option('--config <path>', 'Path to configuration file')
  .option('--output <file>', 'Output file for plan (default: .docimp-plan.json)')
  .action(planCommand);

// Improve command
program
  .command('improve')
  .description('Interactively improve documentation with Claude AI')
  .argument('<path>', 'Path to file or directory to improve')
  .option('--config <path>', 'Path to configuration file')
  .option('--plan <file>', 'Plan file to load (default: .docimp-plan.json)')
  .action(improveCommand);

program.parse(process.argv);
