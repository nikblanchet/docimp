/**
 * Interactive session for improving documentation with Claude AI.
 *
 * Manages the workflow of:
 * 1. Loading plan items
 * 2. Requesting Claude suggestions
 * 3. Running plugin validation
 * 4. Presenting options to user (Accept/Edit/Regenerate/Skip/Quit)
 * 5. Writing accepted documentation to files
 */

import prompts from 'prompts';
import chalk from 'chalk';
import { v4 as uuidv4 } from 'uuid';
import type { PlanItem, SupportedLanguage } from '../types/analysis.js';
import type { IConfig } from '../config/IConfig.js';
import type { PluginResult, CodeItemMetadata } from '../plugins/IPlugin.js';
import type { IPluginManager } from '../plugins/IPluginManager.js';
import type { IEditorLauncher } from '../editor/IEditorLauncher.js';
import type { IPythonBridge } from '../python-bridge/IPythonBridge.js';
import type { IInteractiveSession } from './IInteractiveSession.js';
import { ProgressTracker } from './ProgressTracker.js';
import { UserCancellationError } from '../commands/improve.js';

/**
 * Options for interactive session.
 */
export interface SessionOptions {
  /** User configuration */
  config: IConfig;

  /** Python bridge for Claude and file operations */
  pythonBridge: IPythonBridge;

  /** Plugin manager for validation */
  pluginManager: IPluginManager;

  /** Editor launcher for manual editing */
  editorLauncher: IEditorLauncher;

  /** Per-language style guides (only for languages in the plan) */
  styleGuides: Partial<Record<SupportedLanguage, string>>;

  /** Documentation tone */
  tone: string;

  /** Base directory for path validation */
  basePath: string;
}

/**
 * User action choices.
 */
type UserAction = 'accept' | 'edit' | 'regenerate' | 'skip' | 'undo' | 'quit';

/**
 * Manages an interactive documentation improvement session.
 */
export class InteractiveSession implements IInteractiveSession {
  private config: IConfig;
  private pythonBridge: IPythonBridge;
  private pluginManager: IPluginManager;
  private styleGuides: Partial<Record<SupportedLanguage, string>>;
  private tone: string;
  private editorLauncher: IEditorLauncher;
  private basePath: string;
  private sessionId?: string;
  private transactionActive: boolean = false;
  private changeCount: number = 0;

  /**
   * Create a new interactive session.
   *
   * @param options - Session options
   */
  constructor(options: SessionOptions) {
    this.config = options.config;
    this.pythonBridge = options.pythonBridge;
    this.pluginManager = options.pluginManager;
    this.styleGuides = options.styleGuides;
    this.tone = options.tone;
    this.editorLauncher = options.editorLauncher;
    this.basePath = options.basePath;
  }

  /**
   * Run the interactive session with the given plan items.
   *
   * @param items - Plan items to process
   * @returns Promise resolving when session is complete
   */
  async run(items: PlanItem[]): Promise<void> {
    if (items.length === 0) {
      console.log(chalk.yellow('No items in plan. Nothing to improve.'));
      return;
    }

    // Initialize transaction for tracking documentation changes
    this.sessionId = uuidv4();

    try {
      await this.pythonBridge.beginTransaction(this.sessionId);
      this.transactionActive = true;
    } catch (error) {
      console.warn(
        chalk.yellow('Warning: Failed to initialize transaction tracking:'),
        chalk.dim(error instanceof Error ? error.message : String(error))
      );
      console.warn(
        chalk.yellow('Session will continue without rollback capability.\n')
      );
      this.transactionActive = false;
    }

    console.log(chalk.bold(`\n Starting interactive improvement session`));
    console.log(chalk.dim(`Found ${items.length} items to improve`));
    if (this.transactionActive) {
      console.log(
        chalk.dim(
          `Transaction tracking: enabled (session ${this.sessionId?.substring(0, 8)}...)\n`
        )
      );
    } else {
      console.log(chalk.dim(`Transaction tracking: disabled\n`));
    }

    const tracker = new ProgressTracker(items.length);

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Show progress
        console.log(
          chalk.dim(
            `\n[${i + 1}/${items.length}] ${tracker.getProgressString()}`
          )
        );

        // Process this item
        const shouldContinue = await this.processItem(item, i, tracker);

        if (!shouldContinue) {
          tracker.recordQuit(i);
          break;
        }
      }

      // Show final summary
      this.showSummary(tracker);

      // SUCCESS: Finalize transaction
      if (this.transactionActive && this.sessionId) {
        try {
          await this.pythonBridge.commitTransaction(this.sessionId);
          console.log(chalk.green('\nSession finalized. Changes committed.'));
          const shortId = this.sessionId.substring(0, 8);
          console.log(
            chalk.dim(`Session ID: ${shortId}... (full: ${this.sessionId})`)
          );
          console.log(
            chalk.dim(
              `Use 'docimp list-changes ${this.sessionId}' to review changes.`
            )
          );
        } catch (error) {
          console.warn(
            chalk.yellow('Warning: Failed to finalize transaction:'),
            chalk.dim(error instanceof Error ? error.message : String(error))
          );
        }
      }
    } catch (error) {
      // ERROR/CANCELLATION: Leave transaction uncommitted
      if (this.sessionId && this.transactionActive) {
        if (error instanceof UserCancellationError) {
          // Expected: User quit mid-session
          console.log(
            chalk.yellow('\nSession cancelled. Changes left uncommitted.')
          );
        } else {
          // Unexpected error (network failure, disk full, etc.)
          console.error(
            chalk.red(
              '\nSession failed due to error. Changes left uncommitted.'
            )
          );
        }
        console.log(
          chalk.dim(
            `Use 'docimp rollback-session ${this.sessionId}' to undo changes.`
          )
        );
      }
      throw error;
    }
  }

  /**
   * Process a single plan item.
   *
   * @param item - Plan item to process
   * @param _index - Item index in the plan (unused)
   * @param tracker - Progress tracker
   * @returns Promise resolving to true if should continue, false if user quit
   */
  private async processItem(
    item: PlanItem,
    _index: number,
    tracker: ProgressTracker
  ): Promise<boolean> {
    // Show item details
    this.showItemDetails(item);

    // Request Claude suggestion
    let docstring = await this.requestSuggestion(item);

    if (!docstring) {
      console.log(chalk.red('Failed to generate suggestion.'));
      tracker.recordError();
      return true; // Continue to next item
    }

    // Interactive loop for this item
    let currentDocstring = docstring;
    let feedback: string | undefined;

    while (true) {
      // Run plugin validation
      const validationResults = await this.runPluginValidation(
        currentDocstring,
        item
      );

      // Show suggestion and validation results
      this.showSuggestion(currentDocstring, validationResults);

      // Get user action
      const action = await this.promptUserAction(validationResults);

      if (action === 'accept') {
        // Write to file
        const success = await this.writeDocstring(item, currentDocstring);
        if (success) {
          tracker.recordAccepted();
          console.log(
            chalk.green(`✓ Documentation written to ${item.filepath}`)
          );
        } else {
          console.log(chalk.red('Failed to write documentation'));
          tracker.recordError();
        }
        return true; // Continue to next item
      } else if (action === 'edit') {
        // Launch editor
        const edited = await this.editDocstring(
          currentDocstring,
          item.language
        );
        if (edited) {
          currentDocstring = edited;
          // Loop back to validate edited version
          continue;
        } else {
          console.log(chalk.yellow('No changes made in editor'));
          continue;
        }
      } else if (action === 'regenerate') {
        // Prompt for feedback
        feedback = await this.promptFeedback();
        if (feedback) {
          // Request new suggestion with feedback
          const newDocstring = await this.requestSuggestion(item, feedback);
          if (newDocstring) {
            currentDocstring = newDocstring;
            // Loop back to show new suggestion
            continue;
          } else {
            console.log(chalk.red('Failed to regenerate suggestion'));
            continue;
          }
        } else {
          continue;
        }
      } else if (action === 'skip') {
        tracker.recordSkipped();
        console.log(chalk.yellow('Skipping item'));
        return true; // Continue to next item
      } else if (action === 'undo') {
        await this.handleUndo();
        // Stay on current item - continue loop to re-present
        continue;
      } else if (action === 'quit') {
        return false; // Stop processing
      }
    }
  }

  /**
   * Show details about the current item.
   *
   * @param item - Plan item
   */
  private showItemDetails(item: PlanItem): void {
    console.log(chalk.bold(`\n${item.type} ${chalk.cyan(item.name)}`));
    console.log(chalk.dim(`  Location: ${item.filepath}:${item.line_number}`));
    console.log(chalk.dim(`  Language: ${item.language}`));
    console.log(chalk.dim(`  Complexity: ${item.complexity}`));
    console.log(chalk.dim(`  Impact Score: ${item.impact_score.toFixed(1)}`));
    console.log(chalk.dim(`  Reason: ${item.reason}`));
  }

  /**
   * Request a documentation suggestion from Claude.
   *
   * @param item - Plan item
   * @param feedback - Optional feedback for regeneration
   * @returns Promise resolving to suggested documentation, or null on error
   */
  private async requestSuggestion(
    item: PlanItem,
    feedback?: string
  ): Promise<string | null> {
    console.log(chalk.dim('\nRequesting suggestion from Claude...'));

    try {
      // Call Python CLI suggest command
      const target = `${item.filepath}:${item.name}`;

      if (feedback) {
        console.log(chalk.dim('Regenerating with your feedback...'));
      }

      // Lookup style guide for this item's language
      const styleGuide = this.styleGuides[item.language];
      if (!styleGuide) {
        console.error(
          chalk.red(`No style guide configured for language: ${item.language}`)
        );
        return null;
      }

      const result = await this.pythonBridge.suggest({
        target,
        styleGuide,
        tone: this.tone,
        timeout: this.config.claude?.timeout,
        maxRetries: this.config.claude?.maxRetries,
        retryDelay: this.config.claude?.retryDelay,
        feedback,
      });

      return result.trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error requesting suggestion: ${message}`));
      return null;
    }
  }

  /**
   * Run plugin validation on documentation.
   *
   * @param docstring - Documentation to validate
   * @param item - Plan item being documented
   * @returns Promise resolving to validation results from all plugins
   */
  private async runPluginValidation(
    docstring: string,
    item: PlanItem
  ): Promise<PluginResult[]> {
    // Convert PlanItem to CodeItemMetadata
    // Note: Treat 'interface' as 'class' for plugin validation
    const itemType: 'function' | 'class' | 'method' =
      item.type === 'interface'
        ? 'class'
        : (item.type as 'function' | 'class' | 'method');

    const metadata: CodeItemMetadata = {
      name: item.name,
      type: itemType,
      filepath: item.filepath,
      line_number: item.line_number,
      language: item.language,
      complexity: item.complexity,
      export_type: item.export_type,
      module_system: item.module_system,
      parameters: item.parameters,
      return_type: item.return_type || undefined,
    };

    // Run beforeAccept hooks via plugin manager
    return await this.pluginManager.runBeforeAccept(
      docstring,
      metadata,
      this.config
    );
  }

  /**
   * Show the suggested documentation and validation results.
   *
   * @param docstring - Documentation suggestion
   * @param validationResults - Results from plugin validation
   */
  private showSuggestion(
    docstring: string,
    validationResults: PluginResult[]
  ): void {
    console.log(chalk.bold('\nSuggested documentation:'));
    console.log(chalk.dim('---'));
    console.log(docstring);
    console.log(chalk.dim('---'));

    // Show validation results
    const failures = validationResults.filter((r) => !r.accept);
    if (failures.length > 0) {
      console.log(chalk.yellow('\nValidation warnings:'));
      for (const result of failures) {
        console.log(chalk.yellow(`  - ${result.reason}`));
        if (result.autoFix) {
          console.log(chalk.dim(`    Auto-fix available`));
        }
      }
    } else {
      console.log(chalk.green('\nValidation passed'));
    }
  }

  /**
   * Prompt user for action.
   *
   * @param validationResults - Validation results
   * @returns Promise resolving to user's chosen action
   */
  private async promptUserAction(
    validationResults: PluginResult[]
  ): Promise<UserAction> {
    const hasFailures = validationResults.some((r) => !r.accept);

    // Build choices array - conditionally include undo
    const choices = [
      { title: hasFailures ? 'Accept anyway' : 'Accept', value: 'accept' },
      { title: 'Edit manually', value: 'edit' },
      { title: 'Regenerate with feedback', value: 'regenerate' },
      { title: 'Skip this item', value: 'skip' },
    ];

    // Add undo option only if changes have been made and transaction is active
    if (this.changeCount > 0 && this.transactionActive) {
      choices.splice(4, 0, { title: 'Undo last change', value: 'undo' });
    }

    choices.push({ title: 'Quit session', value: 'quit' });

    const response = await prompts({
      type: 'select',
      name: 'action',
      message: 'What would you like to do?',
      choices,
    });

    return response.action || 'skip';
  }

  /**
   * Prompt user for feedback when regenerating.
   *
   * @returns Promise resolving to feedback text, or undefined if cancelled
   */
  private async promptFeedback(): Promise<string | undefined> {
    const response = await prompts({
      type: 'text',
      name: 'feedback',
      message: 'Enter feedback for regeneration (or leave empty to cancel):',
    });

    return response.feedback?.trim() || undefined;
  }

  /**
   * Launch editor to manually edit documentation.
   *
   * @param docstring - Current documentation
   * @param language - Source language for syntax highlighting
   * @returns Promise resolving to edited documentation, or null if cancelled
   */
  private async editDocstring(
    docstring: string,
    language: string
  ): Promise<string | null> {
    console.log(chalk.dim('\nLaunching editor...'));

    try {
      const extension = language === 'python' ? '.py' : '.js';
      const edited = await this.editorLauncher.editText(docstring, extension);
      return edited;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error launching editor: ${message}`));
      return null;
    }
  }

  /**
   * Write documentation to file using Python apply command.
   *
   * @param item - Plan item
   * @param docstring - Documentation to write
   * @returns Promise resolving to true if successful
   */
  private async writeDocstring(
    item: PlanItem,
    docstring: string
  ): Promise<boolean> {
    // Generate timestamp-based backup path for transaction tracking
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('Z', '');
    const backupPath = `${item.filepath}.${timestamp}.bak`;

    try {
      await this.pythonBridge.apply({
        filepath: item.filepath,
        item_name: item.name,
        item_type: item.type,
        docstring: docstring,
        language: item.language,
        line_number: item.line_number,
        base_path: this.basePath,
        backup_path: backupPath,
      });

      // Record the write in transaction (if transaction is active)
      if (this.transactionActive && this.sessionId) {
        try {
          await this.pythonBridge.recordWrite(
            this.sessionId,
            item.filepath,
            backupPath,
            item.name,
            item.type,
            item.language
          );

          // Increment change count for undo tracking
          this.changeCount++;
        } catch (error) {
          // Log warning but don't fail the write operation
          const message =
            error instanceof Error ? error.message : String(error);
          console.warn(
            chalk.yellow('Warning: Failed to record change in transaction:'),
            chalk.dim(message)
          );
          console.warn(
            chalk.yellow(
              'Documentation was written but rollback may not work for this change.\n'
            )
          );
        }
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error writing documentation: ${message}`));
      return false;
    }
  }

  /**
   * Handle undo of the most recent change using git history.
   *
   * Calls Python bridge with 'last' to rollback HEAD commit on session branch.
   * Displays item name/type from commit metadata.
   *
   * @returns Promise resolving when undo is complete
   */
  private async handleUndo(): Promise<void> {
    if (this.changeCount === 0) {
      console.log(chalk.yellow('\nNo changes to undo yet'));
      return;
    }

    if (!this.transactionActive || !this.sessionId) {
      console.log(
        chalk.yellow('\nUndo unavailable: transaction tracking not active')
      );
      return;
    }

    try {
      console.log(chalk.dim('\nRolling back last change...'));

      const result = await this.pythonBridge.rollbackChange('last');

      if (result.success) {
        // Enhanced feedback with metadata
        const itemDesc = result.item_name
          ? `${result.item_name} (${result.item_type})`
          : 'change';
        console.log(chalk.green(`Reverted documentation for ${itemDesc}`));
        if (result.filepath) {
          console.log(chalk.dim(`  File: ${result.filepath}`));
        }

        // Decrement change count
        this.changeCount--;
      } else {
        console.log(chalk.red('Undo failed'));
        if (result.conflicts.length > 0) {
          console.log(chalk.yellow('Conflicts detected:'));
          result.conflicts.forEach((file) => {
            console.log(chalk.yellow(`  - ${file}`));
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error during undo: ${message}`));
    }
  }

  /**
   * Show final session summary.
   *
   * @param tracker - Progress tracker
   */
  private showSummary(tracker: ProgressTracker): void {
    const progress = tracker.getProgress();

    console.log(chalk.bold('\n Session Summary'));
    console.log(chalk.dim('═'.repeat(50)));
    console.log(`  Total items: ${progress.totalItems}`);
    console.log(`  Completed: ${progress.completedItems}`);
    console.log(chalk.green(`  Accepted: ${progress.acceptedItems}`));
    console.log(chalk.yellow(`  Skipped: ${progress.skippedItems}`));

    if (progress.errorItems > 0) {
      console.log(chalk.red(`  Errors: ${progress.errorItems}`));
    }

    if (progress.quitAt !== null) {
      console.log(chalk.dim(`  (Quit at item ${progress.quitAt + 1})`));
    }
  }
}
