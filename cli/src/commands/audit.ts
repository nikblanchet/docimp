/**
 * Audit command implementation.
 *
 * This command audits existing documentation quality by presenting
 * documented items to the user for interactive rating.
 */

import prompts from 'prompts';
import { PythonBridge } from '../python-bridge/PythonBridge.js';
import { TerminalDisplay } from '../display/TerminalDisplay.js';
import { StateManager } from '../utils/StateManager.js';
import { ConfigLoader } from '../config/ConfigLoader.js';
import { CodeExtractor } from '../utils/CodeExtractor.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';
import type { AuditRatings, AuditSummary } from '../types/analysis.js';
import type { IConfig } from '../config/IConfig.js';

/**
 * Calculate audit summary statistics from ratings.
 *
 * This is a pure function extracted for testability.
 *
 * @param totalItems - Total number of documented items available for audit
 * @param ratings - Audit ratings collected
 * @param auditFile - Path to the audit file
 * @returns Summary statistics for display
 */
export function calculateAuditSummary(
  totalItems: number,
  ratings: AuditRatings,
  auditFile: string
): AuditSummary {
  // Count ratings by type
  const ratingCounts = {
    terrible: 0,  // Rating 1
    ok: 0,        // Rating 2
    good: 0,      // Rating 3
    excellent: 0, // Rating 4
    skipped: 0,   // Rating null
  };

  let auditedItems = 0;

  // Iterate through all ratings
  for (const fileRatings of Object.values(ratings.ratings)) {
    for (const rating of Object.values(fileRatings)) {
      auditedItems++;

      if (rating === null) {
        ratingCounts.skipped++;
      } else if (rating === 1) {
        ratingCounts.terrible++;
      } else if (rating === 2) {
        ratingCounts.ok++;
      } else if (rating === 3) {
        ratingCounts.good++;
      } else if (rating === 4) {
        ratingCounts.excellent++;
      }
    }
  }

  return {
    totalItems,
    auditedItems,
    ratingCounts,
    auditFile,
  };
}

/**
 * Core audit logic (extracted for testability).
 *
 * @param path - Path to file or directory to audit
 * @param options - Command options
 * @param bridge - Python bridge instance (injected for testing)
 * @param display - Display instance (injected for testing)
 * @param config - Config instance (injected for testing)
 */
export async function auditCore(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
  },
  bridge?: IPythonBridge,
  display?: IDisplay,
  config?: IConfig
): Promise<void> {
  // Create display dependency (needed before loading config)
  const terminalDisplay = display ?? new TerminalDisplay();

  // Load config if not injected
  let loadedConfig = config;
  if (!loadedConfig) {
    const configLoader = new ConfigLoader();
    loadedConfig = await configLoader.load();
  }

  // Create Python bridge with config for timeout settings (after config loaded)
  const pythonBridge = bridge ?? new PythonBridge(undefined, undefined, loadedConfig);

  // Extract audit.showCode settings with defaults
  const showCodeMode = loadedConfig.audit?.showCode?.mode ?? 'truncated';
  const maxLines = loadedConfig.audit?.showCode?.maxLines ?? 20;

  // Use StateManager default if auditFile not provided
  const auditFile = options.auditFile ?? StateManager.getAuditFile();

  // Get list of documented items from Python
  if (options.verbose) {
    terminalDisplay.showMessage(`Finding documented items in: ${path}`);
  }

  const stopSpinner = terminalDisplay.startSpinner('Analyzing documented items...');

  try {
    const result = await pythonBridge.audit({
      path,
      auditFile,
      verbose: options.verbose,
    });

    stopSpinner();

    const items = result.items;

    if (items.length === 0) {
      terminalDisplay.showMessage('No documented items found to audit.');
      return;
    }

    terminalDisplay.showMessage(`\nFound ${items.length} documented items to audit.`);
    terminalDisplay.showMessage('Rate the quality of each item\'s documentation.\n');

    // Initialize ratings structure
    const ratings: AuditRatings = { ratings: {} };

    // Interactive rating loop
    let audited = 0;
    for (const item of items) {
      audited++;

      // Show progress
      terminalDisplay.showMessage(`\nAuditing: ${audited}/${items.length}`);
      terminalDisplay.showMessage(`${item.type} ${item.name} (${item.language})`);
      terminalDisplay.showMessage(`Location: ${item.filepath}:${item.line_number}`);
      terminalDisplay.showMessage(`Complexity: ${item.complexity}\n`);

      // Show the documentation in a boxed display
      if (item.docstring) {
        terminalDisplay.showBoxedDocstring(item.docstring);
        terminalDisplay.showMessage(''); // Add blank line after box
      }

      // Display code based on mode
      let showCodeOption = false; // Track if [C] option should be shown

      if (showCodeMode === 'complete') {
        // Show full code, no [C] option
        const codeResult = CodeExtractor.extractCodeBlock(
          item.filepath,
          item.line_number,
          item.end_line,
          0, // maxLines = 0 means no truncation
          true // include line numbers
        );
        terminalDisplay.showCodeBlock(
          codeResult.code,
          codeResult.truncated,
          codeResult.totalLines,
          codeResult.displayedLines
        );
        showCodeOption = false;
      } else if (showCodeMode === 'truncated') {
        // Show code up to maxLines
        const codeResult = CodeExtractor.extractCodeBlock(
          item.filepath,
          item.line_number,
          item.end_line,
          maxLines,
          true // include line numbers
        );
        terminalDisplay.showCodeBlock(
          codeResult.code,
          codeResult.truncated,
          codeResult.totalLines,
          codeResult.displayedLines
        );
        // Show [C] if code was truncated
        showCodeOption = codeResult.truncated;
      } else if (showCodeMode === 'signature') {
        // Show just the signature
        const sigResult = CodeExtractor.extractSignature(
          item.filepath,
          item.line_number,
          item.end_line,
          item.language,
          5 // maxLines for signature
        );
        terminalDisplay.showSignature(sigResult.signature, sigResult.totalLines);
        showCodeOption = true; // Always show [C] in signature mode
      } else if (showCodeMode === 'on-demand') {
        // Don't show code, but make [C] available
        showCodeOption = true;
      }

      // Rating loop - allows re-prompting if user presses [C]
      let userRating: string | undefined;
      while (!userRating) {
        // Build prompt message based on whether [C] option is available
        let promptMessage = '';
        let validOptions = ['1', '2', '3', '4', 'S', 'Q'];

        if (showCodeOption) {
          // [C] option available - different messages for different modes
          if (showCodeMode === 'truncated') {
            promptMessage = '[1] Terrible  [2] Poor  [3] Good  [4] Excellent  [C] Full code  [S] Skip  [Q] Quit\n\nYour rating:';
          } else {
            // signature and on-demand modes
            promptMessage = '[1] Terrible  [2] Poor  [3] Good  [4] Excellent  [C] Show code  [S] Skip  [Q] Quit\n\nYour rating:';
          }
          validOptions = ['1', '2', '3', '4', 'C', 'S', 'Q'];
        } else {
          // No [C] option (complete mode)
          promptMessage = '[1] Terrible  [2] Poor  [3] Good  [4] Excellent  [S] Skip  [Q] Quit\n\nYour rating:';
        }

        // Prompt for rating
        const response = await prompts({
          type: 'text',
          name: 'rating',
          message: promptMessage,
          validate: (value: string) => {
            const normalized = value.trim().toUpperCase();
            if (validOptions.includes(normalized)) {
              return true;
            }
            if (showCodeOption) {
              return 'Please enter 1-4 for quality rating, C to view code, S to skip, or Q to quit';
            }
            return 'Please enter 1-4 for quality rating, S to skip, or Q to quit';
          },
        });

        // Handle user cancellation (Ctrl+C)
        if (response.rating === undefined) {
          terminalDisplay.showMessage('\n\nAudit interrupted by user.');
          userRating = 'QUIT'; // Signal to quit
          break;
        }

        const normalized = response.rating.trim().toUpperCase();

        // Handle [C] option - show full code and re-prompt
        if (normalized === 'C') {
          terminalDisplay.showMessage(''); // Blank line before code
          const fullCodeResult = CodeExtractor.extractCodeBlock(
            item.filepath,
            item.line_number,
            item.end_line,
            0, // maxLines = 0 means no truncation
            true // include line numbers
          );
          terminalDisplay.showCodeBlock(
            fullCodeResult.code,
            false, // not truncated (showing full code)
            fullCodeResult.totalLines,
            fullCodeResult.displayedLines
          );
          terminalDisplay.showMessage(''); // Blank line after code
          // Loop continues to re-prompt
          continue;
        }

        // Handle quit
        if (normalized === 'Q') {
          terminalDisplay.showMessage('\n\nAudit stopped by user.');
          userRating = 'QUIT'; // Signal to quit
          break;
        }

        // Handle skip - save null
        if (normalized === 'S') {
          userRating = 'SKIP';
          break;
        }

        // Numeric rating (1-4)
        userRating = normalized;
      }

      // Break outer loop if user quit
      if (userRating === 'QUIT') {
        break;
      }

      // Handle skip
      if (userRating === 'SKIP') {
        if (!ratings.ratings[item.filepath]) {
          ratings.ratings[item.filepath] = {};
        }
        ratings.ratings[item.filepath][item.name] = null;
        terminalDisplay.showMessage('Skipped.\n');
        continue;
      }

      // Save the numeric rating (1-4)
      const numericRating = parseInt(userRating, 10);
      if (!ratings.ratings[item.filepath]) {
        ratings.ratings[item.filepath] = {};
      }
      ratings.ratings[item.filepath][item.name] = numericRating;

      const ratingLabels: Record<number, string> = {
        1: 'Terrible',
        2: 'OK',
        3: 'Good',
        4: 'Excellent',
      };

      terminalDisplay.showMessage(`Rated as: ${ratingLabels[numericRating]}\n`);
    }

    // Save all ratings
    const totalRatings = Object.values(ratings.ratings).reduce(
      (sum, fileRatings) => sum + Object.keys(fileRatings).length,
      0
    );

    if (totalRatings > 0) {
      const savingSpinner = terminalDisplay.startSpinner('Saving audit ratings...');

      try {
        await pythonBridge.applyAudit(ratings, auditFile);
        savingSpinner();

        // Calculate and display audit summary
        const summary = calculateAuditSummary(items.length, ratings, auditFile);
        terminalDisplay.showAuditSummary(summary);
      } catch (error) {
        savingSpinner();
        throw error;
      }
    } else {
      terminalDisplay.showMessage('\n\nNo ratings saved.');
    }
  } catch (error) {
    stopSpinner();
    throw error;
  }
}

/**
 * Execute the audit command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to audit
 * @param options - Command options
 */
export async function auditCommand(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
  }
): Promise<void> {
  const display = new TerminalDisplay();

  try {
    await auditCore(path, options);
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
