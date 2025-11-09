/**
 * Audit command implementation.
 *
 * This command audits existing documentation quality by presenting
 * documented items to the user for interactive rating.
 */

import { randomUUID } from 'node:crypto';
import Table from 'cli-table3';
import prompts from 'prompts';
import type { IConfigLoader } from '../config/i-config-loader.js';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import type { IDisplay } from '../display/i-display.js';
import type { IPythonBridge } from '../python-bridge/i-python-bridge.js';
import type {
  AuditItem,
  AuditRatings,
  AuditSummary,
} from '../types/analysis.js';
import {
  AuditSessionStateSchema,
  type AuditSessionState,
} from '../types/audit-session-state.js';
import { CodeExtractor } from '../utils/code-extractor.js';
import { FileTracker } from '../utils/file-tracker.js';
import { PathValidator } from '../utils/path-validator.js';
import { SessionStateManager } from '../utils/session-state-manager.js';
import { StateManager } from '../utils/state-manager.js';
import { WorkflowValidator } from '../utils/workflow-validator.js';

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
    terrible: 0, // Rating 1
    ok: 0, // Rating 2
    good: 0, // Rating 3
    excellent: 0, // Rating 4
    skipped: 0, // Rating null
  };

  let auditedItems = 0;

  // Iterate through all ratings
  for (const fileRatings of Object.values(ratings.ratings)) {
    for (const rating of Object.values(fileRatings)) {
      auditedItems++;

      switch (rating) {
        case null: {
          ratingCounts.skipped++;

          break;
        }
        case 1: {
          ratingCounts.terrible++;

          break;
        }
        case 2: {
          ratingCounts.ok++;

          break;
        }
        case 3: {
          ratingCounts.good++;

          break;
        }
        case 4: {
          ratingCounts.excellent++;

          break;
        }
        // No default
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
 * Initialize audit session state at the start of an audit.
 *
 * Creates initial session state with UUID, timestamp, and file snapshots for
 * modification detection. All ratings start as null (not yet rated).
 *
 * @param items - AuditItems to audit
 * @param config - Audit configuration
 * @param config.showCodeMode - Display mode for code (complete, truncated, signature, on-demand)
 * @param config.maxLines - Maximum lines to show in truncated mode
 * @returns Initial AuditSessionState
 */
async function initializeAuditSession(
  items: AuditItem[],
  config: {
    showCodeMode: 'complete' | 'truncated' | 'signature' | 'on-demand';
    maxLines: number;
  }
): Promise<AuditSessionState> {
  const sessionId = randomUUID();

  // Extract unique filepaths from items
  const filepaths = [...new Set(items.map((item) => item.filepath))];

  // Create file snapshots for modification detection
  const fileSnapshot = await FileTracker.createSnapshot(filepaths);

  // Initialize empty ratings: filepath -> item_name -> null
  const partialRatings: Record<string, Record<string, number | null>> = {};
  for (const item of items) {
    if (!partialRatings[item.filepath]) {
      partialRatings[item.filepath] = {};
    }
    partialRatings[item.filepath][item.name] = null;
  }

  return {
    session_id: sessionId,
    started_at: new Date().toISOString(),
    current_index: 0,
    total_items: items.length,
    partial_ratings: partialRatings,
    file_snapshot: fileSnapshot,
    config: {
      showCodeMode: config.showCodeMode,
      maxLines: config.maxLines,
    },
    completed_at: null,
  } as AuditSessionState;
}

/**
 * Save audit session progress to disk.
 *
 * Uses atomic write pattern (temp file + rename) to prevent corruption.
 *
 * @param state - Current audit session state
 */
async function saveAuditProgress(state: AuditSessionState): Promise<void> {
  await SessionStateManager.saveSessionState(state, 'audit');
}

/**
 * Format elapsed time in human-readable format.
 *
 * @param isoTimestamp - ISO 8601 timestamp
 * @returns Human-readable elapsed time (e.g., "2h ago", "5m ago")
 */
export function formatElapsedTime(isoTimestamp: string): string {
  const started = new Date(isoTimestamp);
  const now = new Date();
  const elapsed = now.getTime() - started.getTime();
  const seconds = Math.floor(elapsed / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ago`;
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return `${seconds}s ago`;
}

/**
 * Prompt user with Yes/No question.
 *
 * @param message - Question to display
 * @param defaultYes - Default to Yes if user presses Enter
 * @returns True if user selected Yes, false otherwise
 */
export async function promptYesNo(
  message: string,
  defaultYes: boolean
): Promise<boolean> {
  const response = await prompts({
    type: 'confirm',
    name: 'value',
    message,
    initial: defaultYes,
  });

  // Handle Ctrl+C (undefined response)
  if (response.value === undefined) {
    return false;
  }

  return response.value as boolean;
}

/**
 * Prompt user to select a session from a list.
 *
 * @param type - Session type ('audit' or 'improve')
 * @returns Selected session ID, or null if cancelled
 */
async function promptSelectSession(
  type: 'audit' | 'improve'
): Promise<string | null> {
  const sessions = await SessionStateManager.listSessions(type);
  const incomplete = sessions.filter(
    (s) => !(s as AuditSessionState).completed_at
  );

  if (incomplete.length === 0) {
    throw new Error(`No incomplete ${type} sessions found`);
  }

  // Display table with session details
  const table = new Table({
    head: ['#', 'Session ID', 'Progress', 'Started'],
    colWidths: [5, 15, 20, 15],
  });

  for (const [index, session] of incomplete.entries()) {
    const auditSession = session as AuditSessionState;
    const sessionId = auditSession.session_id.slice(0, 12);
    const progress = `${auditSession.current_index}/${auditSession.total_items} rated`;
    const started = formatElapsedTime(String(auditSession.started_at));
    table.push([index + 1, sessionId, progress, started]);
  }

  console.log('\nIncomplete sessions:\n');
  console.log(table.toString());

  const response = await prompts({
    type: 'number',
    name: 'value',
    message: 'Select session number (or 0 to cancel):',
    min: 0,
    max: incomplete.length,
  });

  // Handle Ctrl+C or cancel
  if (response.value === undefined || response.value === 0) {
    return null;
  }

  const selectedIndex = Number(response.value) - 1;
  return incomplete[selectedIndex].session_id;
}

/**
 * Delete all incomplete audit sessions.
 *
 * @param display - Display instance for messaging
 */
async function handleClearSessions(display: IDisplay): Promise<void> {
  const sessions = await SessionStateManager.listSessions('audit');
  const incomplete = sessions.filter((s) => !s.completed_at);

  if (incomplete.length === 0) {
    display.showMessage('No incomplete audit sessions to clear');
    return;
  }

  display.showMessage(
    `Clearing ${incomplete.length} incomplete audit session(s)...`
  );

  for (const session of incomplete) {
    await SessionStateManager.deleteSessionState(session.session_id, 'audit');
  }

  display.showMessage(`Cleared ${incomplete.length} session(s)`);
}

/**
 * Load and validate a resume session.
 *
 * @param sessionId - Session ID (UUID string) to resume
 * @param display - Display instance for messaging
 * @returns Validated audit session state
 * @throws {Error} If session file not found or invalid
 */
async function loadResumeSession(
  sessionId: string,
  display: IDisplay
): Promise<AuditSessionState> {
  // Load session state
  const sessionState = await SessionStateManager.loadSessionState(
    sessionId,
    'audit'
  );

  // Validate schema with Zod
  const validated = AuditSessionStateSchema.parse(sessionState);

  // Show concise banner
  const shortSessionId = validated.session_id.slice(0, 8);
  const progress = `${validated.current_index}/${validated.total_items} rated`;
  display.showMessage(`Resuming session ${shortSessionId} (${progress})`);

  return validated;
}

/**
 * Filter items to only those not yet rated.
 *
 * @param items - All code items
 * @param partialRatings - Ratings from session state
 * @returns Items with null or undefined ratings
 */
export function filterUnratedItems(
  items: AuditItem[],
  partialRatings: Record<string, Record<string, number | null>>
): AuditItem[] {
  return items.filter((item) => {
    const rating = partialRatings[item.filepath]?.[item.name];
    return rating === null || rating === undefined;
  });
}

/**
 * Handle file invalidation for resumed sessions.
 *
 * Detects file modifications and re-analyzes changed files.
 * Auto-continues with re-analysis (no prompt required).
 *
 * @param sessionState - Current session state
 * @param items - All code items from session
 * @param pythonBridge - Bridge for re-analysis
 * @param display - Display instance for warnings
 * @returns Updated items and session state
 */
async function handleFileInvalidation(
  sessionState: AuditSessionState,
  items: AuditItem[],
  pythonBridge: IPythonBridge,
  display: IDisplay
): Promise<{
  items: AuditItem[];
  sessionState: AuditSessionState;
}> {
  // Detect file changes
  const changedFiles = await FileTracker.detectChanges(
    sessionState.file_snapshot
  );

  if (changedFiles.length === 0) {
    return { items, sessionState }; // No changes
  }

  // Show warning banner (yellow)
  display.showMessage(
    `Warning: ${changedFiles.length} file(s) modified since last session, re-analyzing...`
  );

  // Re-analyze changed files (changedFiles is already an array of filepaths)
  const analysisResults = await Promise.all(
    changedFiles.map(async (filepath) => {
      try {
        // Re-run audit on single file
        const result = await pythonBridge.audit({
          path: filepath,
        });
        return result.items || [];
      } catch (error) {
        display.showMessage(
          `Failed to re-analyze ${filepath}: ${error instanceof Error ? error.message : String(error)}`
        );
        return [];
      }
    })
  );

  // Flatten and merge new items
  const changedItems = analysisResults.flat();

  // Replace old items with new analysis for changed files
  const unchangedItems = items.filter(
    (item) => !changedFiles.includes(item.filepath)
  );
  const updatedItems = [...unchangedItems, ...changedItems];

  // Update file snapshot with new checksums
  const newSnapshot = await FileTracker.createSnapshot(changedFiles);
  sessionState.file_snapshot = Object.assign(
    {},
    sessionState.file_snapshot,
    newSnapshot
  );

  // Update partial_ratings for changed files:
  // - Remove old items that no longer exist
  // - Add new items from re-analysis
  // - Set all ratings to null (user must re-rate)
  for (const filepath of changedFiles) {
    // Get all items for this file from re-analysis
    const fileItems = changedItems.filter((item) => item.filepath === filepath);

    // Replace ratings for this file with new items (all null)
    sessionState.partial_ratings[filepath] = Object.fromEntries(
      fileItems.map((item) => [item.name, null])
    );
  }

  return { items: updatedItems, sessionState };
}

/**
 * Detect and prompt for resuming an existing audit session.
 *
 * Implements hybrid UX:
 * - Priority 1: --new flag bypasses detection (start fresh)
 * - Priority 2: --clear-session deletes all incomplete, exits
 * - Priority 3: --resume-file loads specific session (skip list)
 * - Priority 4: --resume shows session list for selection
 * - Priority 5: Auto-detect latest incomplete, prompt user (default Yes)
 *
 * @param options - Command options
 * @param options.resume - Resume an incomplete session (show list)
 * @param options.resumeFile - Resume specific session file (skip list)
 * @param options.new - Force new session (bypass detection)
 * @param options.clearSession - Delete all incomplete sessions and exit
 * @param display - Display instance for messaging
 * @returns Session ID to resume, or null to start fresh
 */
async function detectAndPromptResume(
  options: {
    resume?: boolean;
    resumeFile?: string;
    new?: boolean;
    clearSession?: boolean;
  },
  display: IDisplay
): Promise<string | null> {
  // Validate conflicting flags
  if (options.resume && options.new) {
    throw new Error(
      'Cannot use --resume and --new flags together. ' +
        'Use --resume to continue existing session or --new to start fresh.'
    );
  }

  if (options.resumeFile && !options.resume) {
    throw new Error(
      '--resume-file requires --resume flag. ' +
        'Use: docimp audit <path> --resume --resume-file <file>'
    );
  }

  // Priority 1: --new flag bypasses detection
  if (options.new) {
    return null;
  }

  // Priority 2: --clear-session deletes all incomplete, exits
  if (options.clearSession) {
    await handleClearSessions(display);
    // Throw error to exit gracefully (caught by command wrapper)
    throw new Error('CLEAR_SESSION_COMPLETE');
  }

  // Priority 3: --resume-file specified
  if (options.resumeFile) {
    return options.resumeFile;
  }

  // Priority 4: --resume flag (show session list)
  if (options.resume) {
    const sessionId = await promptSelectSession('audit');
    if (!sessionId) {
      display.showMessage('Session selection cancelled, starting new session');
      return null;
    }
    return sessionId;
  }

  // Priority 5: Auto-detect (no flags provided)
  const sessions = await SessionStateManager.listSessions('audit');
  const incomplete = sessions.filter(
    (s) => !(s as AuditSessionState).completed_at
  );

  if (incomplete.length === 0) {
    return null; // No incomplete sessions, start fresh
  }

  // Get latest incomplete session
  const latest = incomplete[0] as AuditSessionState; // listSessions returns sorted by started_at desc
  const elapsed = formatElapsedTime(String(latest.started_at));
  const progress = `${latest.current_index}/${latest.total_items} rated`;
  const sessionId = latest.session_id.slice(0, 8);

  // Prompt user (default Yes)
  const shouldResume = await promptYesNo(
    `Found session ${sessionId} (${progress}, ${elapsed}). Resume? [Y/n]`,
    true
  );

  return shouldResume ? latest.session_id : null;
}

/**
 * Core audit logic (extracted for testability).
 *
 * @param path - Path to file or directory to audit
 * @param options - Command options
 * @param options.auditFile - Path to audit file for storing ratings
 * @param options.verbose - Enable verbose output
 * @param options.config - Path to configuration file
 * @param options.resume - Resume an incomplete session (show list)
 * @param options.resumeFile - Resume specific session file (skip list)
 * @param options.new - Force new session (bypass detection)
 * @param options.clearSession - Delete all incomplete sessions and exit
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
    resume?: boolean;
    resumeFile?: string;
    new?: boolean;
    clearSession?: boolean;
    skipValidation?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<void> {
  // Validate path exists and is accessible before proceeding
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Validate workflow prerequisites
  const validationResult = await WorkflowValidator.validateAuditPrerequisites(
    options.skipValidation ?? false
  );
  if (!validationResult.valid) {
    throw new Error(
      `${validationResult.error}\n${validationResult.suggestion}`
    );
  }

  // Check for stale analysis data
  const isStale = await WorkflowValidator.isAnalyzeStale();
  if (isStale) {
    display.showMessage(
      '\nWarning: Source files have changed since last analysis. ' +
        'Consider re-running "docimp analyze" for accurate results.\n'
    );
  }

  // Load configuration
  const config = await configLoader.load(options.config);

  // Extract audit.showCode settings with defaults
  const showCodeMode = config.audit?.showCode?.mode ?? 'truncated';
  const maxLines = config.audit?.showCode?.maxLines ?? 20;

  // Use StateManager default if auditFile not provided
  const auditFile = options.auditFile ?? StateManager.getAuditFile();

  // Detect and prompt for resume
  const resumeSessionId = await detectAndPromptResume(options, display);

  let sessionState: AuditSessionState;
  let items: AuditItem[];

  if (resumeSessionId) {
    // RESUME PATH: Load existing session
    sessionState = await loadResumeSession(resumeSessionId, display);

    // Get list of documented items from Python
    if (options.verbose) {
      display.showMessage(`Finding documented items in: ${absolutePath}`);
    }

    const stopSpinner = display.startSpinner('Loading items from session...');

    try {
      const result = await bridge.audit({
        path: absolutePath,
        auditFile,
        verbose: options.verbose,
      });

      stopSpinner();

      items = result.items;

      // Handle file invalidation (auto re-analyze changed files)
      const invalidationResult = await handleFileInvalidation(
        sessionState,
        items,
        bridge,
        display
      );
      items = invalidationResult.items;
      sessionState = invalidationResult.sessionState;

      // Filter to unrated items
      items = filterUnratedItems(items, sessionState.partial_ratings);

      if (items.length === 0) {
        display.showMessage(
          '\nAll items from session already rated. Session complete.'
        );

        // Save all ratings from session to audit file
        const finalRatings: AuditRatings = {
          ratings: sessionState.partial_ratings,
        };
        await bridge.applyAudit(finalRatings, auditFile);

        // Mark session complete and delete
        sessionState.completed_at = new Date().toISOString();
        await SessionStateManager.saveSessionState(sessionState, 'audit');
        await SessionStateManager.deleteSessionState(
          sessionState.session_id,
          'audit'
        );
        return;
      }

      display.showMessage(
        `\nResuming: ${items.length} unrated items remaining.`
      );
      display.showMessage("Rate the quality of each item's documentation.\n");
    } catch (error) {
      stopSpinner();
      throw error;
    }
  } else {
    // NEW SESSION PATH: Start fresh
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

      items = result.items;

      if (items.length === 0) {
        display.showMessage('No documented items found to audit.');
        return;
      }

      display.showMessage(`\nFound ${items.length} documented items to audit.`);
      display.showMessage("Rate the quality of each item's documentation.\n");

      // Initialize session state for incremental save/resume
      sessionState = await initializeAuditSession(items, {
        showCodeMode: showCodeMode as
          | 'complete'
          | 'truncated'
          | 'signature'
          | 'on-demand',
        maxLines,
      });
    } catch (error) {
      stopSpinner();
      throw error;
    }
  }

  // Initialize ratings structure
  const ratings: AuditRatings = { ratings: {} };

  // Track whether user quit early
  let userQuitEarly = false;

  // Interactive rating loop
  let audited = 0;
  for (const item of items) {
    audited++;

    // Update current index in session state
    sessionState.current_index = audited - 1;

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

    switch (showCodeMode) {
      case 'complete': {
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

        break;
      }
      case 'truncated': {
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

        break;
      }
      case 'signature': {
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

        break;
      }
      case 'on-demand': {
        // Don't show code, but make [C] available
        showCodeOption = true;

        break;
      }
      // No default
    }

    // Rating loop - allows re-prompting if user presses [C]
    let userRating: string | undefined;
    while (!userRating) {
      // Build prompt message based on whether [C] option is available
      let promptMessage = '';
      let validOptions = ['1', '2', '3', '4', 'S', 'Q'];

      if (showCodeOption) {
        // [C] option available - different messages for different modes
        promptMessage =
          showCodeMode === 'truncated'
            ? '[1] Terrible  [2] Poor  [3] Good  [4] Excellent  [C] Full code  [S] Skip  [Q] Quit\n\nYour rating:'
            : '[1] Terrible  [2] Poor  [3] Good  [4] Excellent  [C] Show code  [S] Skip  [Q] Quit\n\nYour rating:';
        validOptions = ['1', '2', '3', '4', 'C', 'S', 'Q'];
      } else {
        // No [C] option (complete mode)
        promptMessage =
          '[1] Terrible  [2] Poor  [3] Good  [4] Excellent  [S] Skip  [Q] Quit\n\nYour rating:';
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
        userQuitEarly = true; // Mark that user quit before completing all items
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
        userQuitEarly = true; // Mark that user quit before completing all items
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

      // Update session state and save incrementally
      sessionState.partial_ratings[item.filepath][item.name] = null;
      await saveAuditProgress(sessionState);

      display.showMessage('Skipped.\n');
      continue;
    }

    // Save the numeric rating (1-4)
    const numericRating = Number.parseInt(userRating, 10);
    if (!ratings.ratings[item.filepath]) {
      ratings.ratings[item.filepath] = {};
    }
    ratings.ratings[item.filepath][item.name] = numericRating;

    // Update session state and save incrementally
    sessionState.partial_ratings[item.filepath][item.name] = numericRating;
    await saveAuditProgress(sessionState);

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
      // Merge all ratings from session state (includes previous runs + current run)
      // This ensures we save the complete set of ratings, not just new ones from this run
      ratings.ratings = sessionState.partial_ratings;
      await bridge.applyAudit(ratings, auditFile);

      // Check if user completed all items or quit early
      if (userQuitEarly) {
        // User quit early - preserve session for resume (leave completed_at null)
        await SessionStateManager.saveSessionState(sessionState, 'audit');
      } else {
        // Mark session as complete and delete (auto-delete completed sessions)
        sessionState.completed_at = new Date().toISOString();
        await SessionStateManager.saveSessionState(sessionState, 'audit');
        await SessionStateManager.deleteSessionState(
          sessionState.session_id,
          'audit'
        );
      }

      savingSpinner();

      // Calculate and display audit summary
      const summary = calculateAuditSummary(items.length, ratings, auditFile);
      display.showAuditSummary(summary);
    } catch (error) {
      savingSpinner();
      throw error;
    }
  } else {
    // No ratings saved (user quit immediately or all skipped)
    // Session remains with completed_at=null (can be resumed later)
    display.showMessage('\n\nNo ratings saved.');
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
 * @param options.resume - Resume an incomplete session (show list)
 * @param options.resumeFile - Resume specific session file (skip list)
 * @param options.new - Force new session (bypass detection)
 * @param options.clearSession - Delete all incomplete sessions and exit
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS for success, EXIT_CODE.ERROR for failure)
 */
export async function auditCommand(
  path: string,
  options: {
    auditFile?: string;
    verbose?: boolean;
    config?: string;
    resume?: boolean;
    resumeFile?: string;
    new?: boolean;
    clearSession?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader
): Promise<ExitCode> {
  try {
    await auditCore(path, options, bridge, display, configLoader);
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    // Handle --clear-session completion (successful exit)
    if (error instanceof Error && error.message === 'CLEAR_SESSION_COMPLETE') {
      return EXIT_CODE.SUCCESS;
    }
    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}
