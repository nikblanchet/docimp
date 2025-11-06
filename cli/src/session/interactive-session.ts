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

import chalk from 'chalk';
import prompts from 'prompts';
import { v4 as uuidv4 } from 'uuid';
import { UserCancellationError } from '../commands/improve.js';
import type { IConfig } from '../config/i-config.js';
import type { IEditorLauncher } from '../editor/i-editor-launcher.js';
import type { IPluginManager } from '../plugins/i-plugin-manager.js';
import type { PluginResult, CodeItemMetadata } from '../plugins/i-plugin.js';
import type { IPythonBridge } from '../python-bridge/i-python-bridge.js';
import type { PlanItem, SupportedLanguage } from '../types/analysis.js';
import type { ImproveSessionState } from '../types/improve-session-state.js';
import { FileTracker } from '../utils/file-tracker.js';
import { SessionStateManager } from '../utils/session-state-manager.js';
import type { IInteractiveSession } from './i-interactive-session.js';
import { ProgressTracker } from './progress-tracker.js';

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

  /** Resume session state (optional, for resuming interrupted sessions) */
  resumeSessionState?: ImproveSessionState;
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
  private sessionState: ImproveSessionState | null = null;
  private currentIndex: number = 0;

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

    // If resuming, load session state and current index
    if (options.resumeSessionState) {
      this.sessionState = options.resumeSessionState;
      this.currentIndex = options.resumeSessionState.current_index;
      this.sessionId = options.resumeSessionState.session_id;
      // Note: transactionActive will be set in run() based on transaction_id
    }
  }

  /**
   * Get transaction status for a session ID.
   *
   * @param sessionId - Session UUID to check
   * @returns Transaction status or null if not found
   */
  private async getTransactionStatus(
    sessionId: string
  ): Promise<
    'in_progress' | 'committed' | 'rolled_back' | 'partial_rollback' | null
  > {
    try {
      const sessions = await this.pythonBridge.listSessions();
      const session = sessions.find((s) => s.session_id === sessionId);
      return session ? session.status : null;
    } catch (error) {
      // If listSessions fails, we can't verify transaction status
      console.warn(
        chalk.yellow('Warning: Failed to verify transaction status:'),
        chalk.dim(error instanceof Error ? error.message : String(error))
      );
      return null;
    }
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

    const isResuming = this.sessionState !== null;

    // Initialize transaction for tracking documentation changes
    if (isResuming) {
      // Resuming: Verify transaction status (Session 6b)
      if (!this.sessionState) {
        throw new Error('Session state is null during resume');
      }

      const transactionStatus = await this.getTransactionStatus(
        this.sessionState.session_id
      );

      switch (transactionStatus) {
        case null: {
          // Transaction not found - branch may have been deleted manually
          console.log(
            chalk.yellow(
              `Warning: Transaction branch not found for session ${this.sessionState.session_id.slice(0, 8)}.`
            )
          );
          console.log(
            chalk.yellow(
              `Creating new transaction. Previous changes may have been committed or rolled back manually.`
            )
          );

          // Create new transaction for this session
          try {
            await this.pythonBridge.beginTransaction(
              this.sessionState.session_id
            );
            this.transactionActive = true;
          } catch (error) {
            console.warn(
              chalk.yellow('Warning: Failed to create new transaction:'),
              chalk.dim(error instanceof Error ? error.message : String(error))
            );
            this.transactionActive = false;
          }

          break;
        }
        case 'in_progress': {
          // Transaction still active - resume it
          this.transactionActive = true;
          console.log(
            chalk.dim(
              `Transaction status: ${chalk.green('in-progress')} - resuming existing transaction`
            )
          );

          break;
        }
        case 'committed': {
          // Transaction was committed - create new transaction as continuation
          console.log(
            chalk.yellow(
              `Session ${this.sessionState.session_id.slice(0, 8)} was previously committed.`
            )
          );
          console.log(
            chalk.yellow(`Creating new transaction (continuation).\n`)
          );

          // Generate new transaction ID for continuation
          const newSessionId = uuidv4();
          const oldSessionId = this.sessionState.session_id;

          try {
            await this.pythonBridge.beginTransaction(newSessionId);
            this.transactionActive = true;
            this.sessionId = newSessionId;

            // Update session state with new transaction ID
            this.sessionState.session_id = newSessionId;
            this.sessionState.previous_session_id = oldSessionId;

            // Save updated session state
            await SessionStateManager.saveSessionState(
              this.sessionState,
              'improve'
            );
          } catch (error) {
            console.warn(
              chalk.yellow(
                'Warning: Failed to create continuation transaction:'
              ),
              chalk.dim(error instanceof Error ? error.message : String(error))
            );
            this.transactionActive = false;
          }

          break;
        }
        case 'rolled_back': {
          // Transaction was rolled back - cannot resume
          throw new Error(
            `Cannot resume session ${this.sessionState.session_id.slice(0, 8)}: transaction has been rolled back.\n` +
              `Use 'docimp improve --new' to start a fresh session.`
          );
        }
        case 'partial_rollback': {
          // Transaction has partial rollback - cannot resume
          throw new Error(
            `Cannot resume session ${this.sessionState.session_id.slice(0, 8)}: transaction has partial rollback.\n` +
              `Use 'docimp improve --new' to start a fresh session.`
          );
        }
        // No default
      }
    } else {
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
    }

    if (isResuming) {
      console.log(chalk.bold(`\n Resuming interactive improvement session`));
      console.log(
        chalk.dim(
          `Resuming from item ${this.currentIndex + 1} of ${items.length}`
        )
      );
    } else {
      console.log(chalk.bold(`\n Starting interactive improvement session`));
      console.log(chalk.dim(`Found ${items.length} items to improve`));
    }

    if (this.transactionActive) {
      console.log(
        chalk.dim(
          `Transaction tracking: enabled (session ${this.sessionId?.slice(0, 8)}...)\n`
        )
      );
    } else {
      console.log(chalk.dim(`Transaction tracking: disabled\n`));
    }

    // Initialize session state for save/resume capability (skip if resuming)
    if (!isResuming) {
      try {
        await this.initializeSessionState(items);
      } catch (error) {
        console.warn(
          chalk.yellow('Warning: Failed to initialize session state:'),
          chalk.dim(error instanceof Error ? error.message : String(error))
        );
        console.warn(
          chalk.yellow('Session will continue without save capability.\n')
        );
      }
    }

    const tracker = new ProgressTracker(items.length);

    try {
      // Start from currentIndex (0 for fresh, resumeState.current_index for resume)
      for (let index = this.currentIndex; index < items.length; index++) {
        const item = items[index];
        this.currentIndex = index;

        // Show progress
        console.log(
          chalk.dim(
            `\n[${index + 1}/${items.length}] ${tracker.getProgressString()}`
          )
        );

        // Process this item
        const shouldContinue = await this.processItem(item, index, tracker);

        if (!shouldContinue) {
          tracker.recordQuit(index);
          break;
        }
      }

      // Show final summary
      this.showSummary(tracker);

      // Mark session as complete
      await this.finalizeSessionState();

      // SUCCESS: Finalize transaction
      if (this.transactionActive && this.sessionId) {
        try {
          await this.pythonBridge.commitTransaction(this.sessionId);
          console.log(chalk.green('\nSession finalized. Changes committed.'));
          const shortId = this.sessionId.slice(0, 8);
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
      // Save session checkpoint with error status
      await this.saveCheckpoint(item, 'error');
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

      switch (action) {
        case 'accept': {
          // Write to file
          const success = await this.writeDocstring(item, currentDocstring);
          if (success) {
            tracker.recordAccepted();
            console.log(
              chalk.green(`✓ Documentation written to ${item.filepath}`)
            );
            // Save session checkpoint with accepted status
            await this.saveCheckpoint(item, 'accepted', currentDocstring);
          } else {
            console.log(chalk.red('Failed to write documentation'));
            tracker.recordError();
            // Save session checkpoint with error status
            await this.saveCheckpoint(item, 'error');
          }
          return true; // Continue to next item
        }
        case 'edit': {
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
        }
        case 'regenerate': {
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
        }
        case 'skip': {
          tracker.recordSkipped();
          console.log(chalk.yellow('Skipping item'));
          // Save session checkpoint with skipped status
          await this.saveCheckpoint(item, 'skipped');
          return true; // Continue to next item
        }
        case 'undo': {
          await this.handleUndo();
          // Stay on current item - continue loop to re-present
          continue;
        }
        case 'quit': {
          return false; // Stop processing
        }
        // No default
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
      .replaceAll(/[:.]/g, '-')
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
          for (const file of result.conflicts) {
            console.log(chalk.yellow(`  - ${file}`));
          }
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

  /**
   * Initialize session state for save/resume capability.
   *
   * @param items - Plan items to process
   */
  private async initializeSessionState(items: PlanItem[]): Promise<void> {
    if (!this.sessionId) {
      return; // No session ID, skip initialization
    }

    // Create file snapshot for modification detection
    const filepaths = [...new Set(items.map((item) => item.filepath))];
    const fileSnapshot = await FileTracker.createSnapshot(filepaths);

    // Initialize empty partial_improvements structure
    const partialImprovements: Record<
      string,
      Record<string, Record<string, unknown>>
    > = {};
    for (const item of items) {
      if (!partialImprovements[item.filepath]) {
        partialImprovements[item.filepath] = {};
      }
      partialImprovements[item.filepath][item.name] = {}; // Empty dict for unprocessed
    }

    // Create initial session state
    this.sessionState = {
      session_id: this.sessionId,
      transaction_id: this.sessionId, // Use same ID for transaction link
      started_at: new Date().toISOString(),
      current_index: 0,
      total_items: items.length,
      partial_improvements:
        partialImprovements as ImproveSessionState['partial_improvements'],
      file_snapshot: fileSnapshot as ImproveSessionState['file_snapshot'],
      config: {
        styleGuides: Object.fromEntries(
          Object.entries(this.styleGuides).map(([lang, guide]) => [lang, guide])
        ) as Record<string, string>,
        tone: this.tone,
      },
      completed_at: null,
    };

    // Save initial state
    await SessionStateManager.saveSessionState(this.sessionState, 'improve');
  }

  /**
   * Save session checkpoint after each user action.
   *
   * @param item - Current plan item
   * @param status - Action status (accepted/skipped/error)
   * @param suggestion - Optional suggestion text for accepted items
   */
  private async saveCheckpoint(
    item: PlanItem,
    status: 'accepted' | 'skipped' | 'error',
    suggestion?: string
  ): Promise<void> {
    if (!this.sessionState) {
      return; // No session state, skip checkpoint
    }

    // Update partial_improvements with status record
    const statusRecord: {
      status: 'accepted' | 'skipped' | 'error';
      timestamp: string;
      suggestion?: string;
    } = {
      status,
      timestamp: new Date().toISOString(),
    };

    if (suggestion && status === 'accepted') {
      statusRecord.suggestion = suggestion;
    }

    this.sessionState.partial_improvements[item.filepath][item.name] =
      statusRecord as ImproveSessionState['partial_improvements'][string][string];
    this.sessionState.current_index = this.currentIndex;

    // Update file snapshot after successful accept (to exclude own writes from invalidation)
    if (status === 'accepted') {
      try {
        const newSnapshot = await FileTracker.createSnapshot([item.filepath]);
        this.sessionState.file_snapshot = Object.assign(
          {},
          this.sessionState.file_snapshot,
          newSnapshot
        );
      } catch (error) {
        console.warn(
          chalk.yellow(
            `Warning: Failed to update file snapshot for ${item.filepath}:`
          ),
          chalk.dim(error instanceof Error ? error.message : String(error))
        );
        // Continue without updating snapshot - next resume will detect this as external edit
      }
    }

    // Save checkpoint
    await SessionStateManager.saveSessionState(this.sessionState, 'improve');
  }

  /**
   * Finalize session state when session completes.
   */
  private async finalizeSessionState(): Promise<void> {
    if (!this.sessionState) {
      return; // No session state, skip finalization
    }

    // Mark session as complete
    this.sessionState.completed_at = new Date().toISOString();

    // Save final state
    await SessionStateManager.saveSessionState(this.sessionState, 'improve');
  }
}
