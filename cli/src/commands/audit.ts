/**
 * Audit command implementation.
 *
 * This command audits existing documentation quality by presenting
 * documented items to the user for interactive rating.
 */

import prompts from 'prompts';
import { StateManager } from '../utils/StateManager.js';
import { CodeExtractor } from '../utils/CodeExtractor.js';
import { PathValidator } from '../utils/PathValidator.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IDisplay } from '../display/IDisplay.js';
import type { IConfigLoader } from '../config/IConfigLoader.js';
import type { AuditRatings, AuditSummary } from '../types/analysis.js';

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
 * @param options.auditFile - Path to audit file for storing ratings
 * @param options.verbose - Enable verbose output
 * @param options.config - Path to configuration file
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 */
export async function auditCore(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
    config?: string;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<void> {
  // Validate path exists and is accessible before proceeding
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Load configuration
  const config = await configLoader.load(options.config);

  // Extract audit.showCode settings with defaults
  const showCodeMode = config.audit?.showCode?.mode ?? 'truncated';
  const maxLines = config.audit?.showCode?.maxLines ?? 20;

  // Use StateManager default if auditFile not provided
  const auditFile = options.auditFile ?? StateManager.getAuditFile();

  // Get list of documented items from Python
  if (options.verbose) {
    display.showMessage(`Finding documented items in: ${absolutePath}`);
  }

  const stopSpinner = display.startSpinner('Analyzing documented items...');

  try {
    const result = await bridge.audit({
      path: absolutePath,
      auditFile,
      verbose: options.verbose,
    });

    stopSpinner();

    const items = result.items;

    if (items.length === 0) {
      display.showMessage('No documented items found to audit.');
      return;
    }

    display.showMessage(`\nFound ${items.length} documented items to audit.`);
    display.showMessage('Rate the quality of each item\'s documentation.\n');

    // Initialize ratings structure
    const ratings: AuditRatings = { ratings: {} };

    // Interactive rating loop
    let audited = 0;
    for (const item of items) {
      audited++;

      // Show progress
      display.showMessage(`\nAuditing: ${audited}/${items.length}`);
      display.showMessage(`${item.type} ${item.name} (${item.language})`);
      display.showMessage(`Location: ${item.filepath}:${item.line_number}`);
      display.showMessage(`Complexity: ${item.complexity}\n`);

      // Show the documentation in a boxed display
      if (item.docstring) {
        display.showBoxedDocstring(item.docstring);
        display.showMessage(''); // Add blank line after box
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
        display.showCodeBlock(
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
        display.showCodeBlock(
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
        display.showSignature(sigResult.signature, sigResult.totalLines);
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
          display.showMessage('\n\nAudit interrupted by user.');
          userRating = 'QUIT'; // Signal to quit
          break;
        }

        const normalized = response.rating.trim().toUpperCase();

        // Handle [C] option - show full code and re-prompt
        if (normalized === 'C') {
          display.showMessage(''); // Blank line before code
          const fullCodeResult = CodeExtractor.extractCodeBlock(
            item.filepath,
            item.line_number,
            item.end_line,
            0, // maxLines = 0 means no truncation
            true // include line numbers
          );
          display.showCodeBlock(
            fullCodeResult.code,
            false, // not truncated (showing full code)
            fullCodeResult.totalLines,
            fullCodeResult.displayedLines
          );
          display.showMessage(''); // Blank line after code
          // Loop continues to re-prompt
          continue;
        }

        // Handle quit
        if (normalized === 'Q') {
          display.showMessage('\n\nAudit stopped by user.');
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
        display.showMessage('Skipped.\n');
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

      display.showMessage(`Rated as: ${ratingLabels[numericRating]}\n`);
    }

    // Save all ratings
    const totalRatings = Object.values(ratings.ratings).reduce(
      (sum, fileRatings) => sum + Object.keys(fileRatings).length,
      0
    );

    if (totalRatings > 0) {
      const savingSpinner = display.startSpinner('Saving audit ratings...');

      try {
        await bridge.applyAudit(ratings, auditFile);
        savingSpinner();

        // Calculate and display audit summary
        const summary = calculateAuditSummary(items.length, ratings, auditFile);
        display.showAuditSummary(summary);
      } catch (error) {
        savingSpinner();
        throw error;
      }
    } else {
      display.showMessage('\n\nNo ratings saved.');
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
 * @param options.auditFile - Path to audit file for storing ratings
 * @param options.verbose - Enable verbose output
 * @param options.config - Path to configuration file
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 */
export async function auditCommand(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
    config?: string;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<void> {
  try {
    await auditCore(path, options, bridge, display, configLoader);
  } catch (error) {
    display.showError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
