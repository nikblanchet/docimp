/**
 * Improve command implementation.
 *
 * This command provides an interactive workflow for improving documentation
 * with Claude AI assistance and plugin validation.
 */

import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import chalk from 'chalk';
import Table from 'cli-table3';
import prompts from 'prompts';
import type { IConfigLoader } from '../config/i-config-loader.js';
import type { IConfig } from '../config/i-config.js';
import { isPluginConfig } from '../config/i-config.js';
import { EXIT_CODE, type ExitCode } from '../constants/exit-codes.js';
import {
  STYLE_GUIDE_CHOICES,
  VALID_STYLE_GUIDES,
  VALID_TONES,
  TONE_CHOICES,
} from '../constants/style-guides.js';
import type { IDisplay } from '../display/i-display.js';
import type { IEditorLauncher } from '../editor/i-editor-launcher.js';
import type { IPluginManager } from '../plugins/i-plugin-manager.js';
import type { IPythonBridge } from '../python-bridge/i-python-bridge.js';
import type { IInteractiveSession } from '../session/i-interactive-session.js';
import { InteractiveSession } from '../session/interactive-session.js';
import type {
  PlanResult,
  PlanItem,
  SupportedLanguage,
} from '../types/analysis.js';
import {
  ImproveSessionStateSchema,
  type ImproveSessionState,
  type ImproveStatusRecord,
} from '../types/improve-session-state.js';
import { FileTracker } from '../utils/file-tracker.js';
import { PathValidator } from '../utils/path-validator.js';
import { SessionStateManager } from '../utils/session-state-manager.js';
import { StateManager } from '../utils/state-manager.js';
import {
  WorkflowValidator,
  formatStalenessWarning,
} from '../utils/workflow-validator.js';

/**
 * User cancelled the operation.
 * This is a special case that should exit with code 0 (not an error).
 */
export class UserCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserCancellationError';
  }
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
    (s) => !(s as ImproveSessionState).completed_at
  );

  if (incomplete.length === 0) {
    throw new Error(`No incomplete ${type} sessions found`);
  }

  // Display table with session details
  const table = new Table({
    head: ['#', 'Session ID', 'Progress', 'Started'],
    colWidths: [5, 15, 30, 15],
  });

  for (const [index, session] of incomplete.entries()) {
    const improveSession = session as ImproveSessionState;
    const sessionId = improveSession.session_id.slice(0, 12);

    // Count processed items (with status records)
    let processed = 0;
    for (const fileImprovements of Object.values(
      improveSession.partial_improvements
    )) {
      for (const statusRecord of Object.values(fileImprovements)) {
        // Empty dict = not yet processed
        if (Object.keys(statusRecord as object).length > 0) {
          processed++;
        }
      }
    }

    const remaining = improveSession.total_items - processed;
    const progress = `${processed} processed, ${remaining} remaining`;
    const started = formatElapsedTime(String(improveSession.started_at));
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
 * Delete all incomplete improve sessions.
 *
 * @param display - Display instance for messaging
 */
async function handleClearSessions(display: IDisplay): Promise<void> {
  const sessions = await SessionStateManager.listSessions('improve');
  const incomplete = sessions.filter((s) => !s.completed_at);

  if (incomplete.length === 0) {
    display.showMessage('No incomplete improve sessions to clear');
    return;
  }

  display.showMessage(
    `Clearing ${incomplete.length} incomplete improve session(s)...`
  );

  for (const session of incomplete) {
    await SessionStateManager.deleteSessionState(session.session_id, 'improve');
  }

  display.showMessage(`Cleared ${incomplete.length} session(s)`);
}

/**
 * Load and validate a resume session.
 *
 * @param sessionId - Session ID (UUID string) to resume
 * @param display - Display instance for messaging
 * @returns Validated improve session state
 * @throws {Error} If session file not found or invalid
 */
async function loadResumeImproveSession(
  sessionId: string,
  display: IDisplay
): Promise<ImproveSessionState> {
  // Load session state
  const sessionState = await SessionStateManager.loadSessionState(
    sessionId,
    'improve'
  );

  // Validate schema with Zod
  const validated = ImproveSessionStateSchema.parse(sessionState);

  // Count processed items
  let processed = 0;
  for (const fileImprovements of Object.values(
    validated.partial_improvements
  )) {
    for (const statusRecord of Object.values(fileImprovements)) {
      if (Object.keys(statusRecord as object).length > 0) {
        processed++;
      }
    }
  }

  const remaining = validated.total_items - processed;

  // Show concise banner
  const shortSessionId = validated.session_id.slice(0, 8);
  display.showMessage(
    `Resuming session ${shortSessionId} (${processed} processed, ${remaining} remaining)`
  );

  return validated;
}

/**
 * Filter items to only those not yet processed.
 *
 * @param items - All plan items
 * @param partialImprovements - Improvements from session state
 * @returns Items with empty status records (not yet processed)
 */
export function filterUnprocessedItems(
  items: PlanItem[],
  partialImprovements: Record<
    string,
    Record<string, ImproveStatusRecord | Record<string, never>>
  >
): PlanItem[] {
  return items.filter((item) => {
    const statusRecord = partialImprovements[item.filepath]?.[item.name];
    // Empty dict {} = not yet processed
    return !statusRecord || Object.keys(statusRecord as object).length === 0;
  });
}

/**
 * Handle file invalidation for resumed improve sessions.
 *
 * Detects file modifications and invalidates items from changed files.
 * Only detects external edits (session's own writes are excluded via snapshot updates).
 *
 * @param sessionState - Current session state
 * @param items - All plan items from session
 * @param display - Display instance for warnings
 * @returns Updated items and session state
 */
async function handleFileInvalidationImprove(
  sessionState: ImproveSessionState,
  items: PlanItem[],
  display: IDisplay
): Promise<{
  items: PlanItem[];
  sessionState: ImproveSessionState;
}> {
  // Detect file changes
  const changedFiles = await FileTracker.detectChanges(
    sessionState.file_snapshot
  );

  if (changedFiles.length === 0) {
    return { items, sessionState }; // No changes
  }

  // Show warning banner
  display.showMessage(
    chalk.yellow(
      `Warning: ${changedFiles.length} file(s) modified since last session.`
    )
  );
  display.showMessage(
    chalk.yellow(
      `Items from these files have been invalidated and will be skipped.`
    )
  );

  // Update file snapshot with new checksums
  const newSnapshot = await FileTracker.createSnapshot(changedFiles);
  sessionState.file_snapshot = Object.assign(
    {},
    sessionState.file_snapshot,
    newSnapshot
  );

  // Clear status records for changed items (user must re-process)
  for (const filepath of changedFiles) {
    if (sessionState.partial_improvements[filepath]) {
      // Reset all status records to empty dicts for this file
      for (const itemName of Object.keys(
        sessionState.partial_improvements[filepath]
      )) {
        sessionState.partial_improvements[filepath][itemName] = {};
      }
    }
  }

  // Filter out items from changed files
  const validItems = items.filter(
    (item) => !changedFiles.includes(item.filepath)
  );

  return { items: validItems, sessionState };
}

/**
 * Detect and prompt for resuming an existing improve session.
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
async function detectAndPromptResumeImprove(
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
        'Use: docimp improve <path> --resume --resume-file <file>'
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
    const sessionId = await promptSelectSession('improve');
    if (!sessionId) {
      display.showMessage('Session selection cancelled, starting new session');
      return null;
    }
    return sessionId;
  }

  // Priority 5: Auto-detect (no flags provided)
  const sessions = await SessionStateManager.listSessions('improve');
  const incomplete = sessions.filter(
    (s) => !(s as ImproveSessionState).completed_at
  );

  if (incomplete.length === 0) {
    return null; // No incomplete sessions, start fresh
  }

  // Get latest incomplete session
  const latest = incomplete[0] as ImproveSessionState; // listSessions returns sorted by started_at desc

  // Count processed items
  let processed = 0;
  for (const fileImprovements of Object.values(latest.partial_improvements)) {
    for (const statusRecord of Object.values(fileImprovements)) {
      if (Object.keys(statusRecord as object).length > 0) {
        processed++;
      }
    }
  }

  const remaining = latest.total_items - processed;
  const elapsed = formatElapsedTime(String(latest.started_at));
  const sessionId = latest.session_id.slice(0, 8);

  // Prompt user (default Yes)
  const shouldResume = await promptYesNo(
    `Found session ${sessionId} (${processed} processed, ${remaining} remaining, ${elapsed}). Resume? [Y/n]`,
    true
  );

  return shouldResume ? latest.session_id : null;
}

/**
 * Core improve logic (extracted for testability).
 *
 * @param path - Path to file or directory to improve
 * @param options - Command options
 * @param options.config - Path to configuration file
 * @param options.planFile - Path to plan file containing improvement items
 * @param options.pythonStyle - Python documentation style guide
 * @param options.javascriptStyle - JavaScript documentation style guide
 * @param options.typescriptStyle - TypeScript documentation style guide
 * @param options.tone - Documentation tone (concise, friendly, technical)
 * @param options.nonInteractive - Run in non-interactive mode
 * @param options.verbose - Enable verbose output
 * @param options.listStyles - List available style guides and exit
 * @param options.resume - Resume an incomplete session (show list)
 * @param options.resumeFile - Resume specific session file (skip list)
 * @param options.new - Force new session (bypass detection)
 * @param options.clearSession - Delete all incomplete sessions and exit
 * @param options.skipValidation - Skip workflow prerequisite validation
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @param pluginManager - Plugin manager instance (dependency injection)
 * @param editorLauncher - Editor launcher instance (dependency injection)
 */
export async function improveCore(
  path: string,
  options: {
    config?: string;
    planFile?: string;
    pythonStyle?: string;
    javascriptStyle?: string;
    typescriptStyle?: string;
    tone?: string;
    nonInteractive?: boolean;
    verbose?: boolean;
    listStyles?: boolean;
    resume?: boolean;
    resumeFile?: string;
    new?: boolean;
    clearSession?: boolean;
    skipValidation?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader,
  pluginManager: IPluginManager,
  editorLauncher: IEditorLauncher
): Promise<void> {
  // Handle --list-styles flag (exit early without requiring API key or plan)
  if (options.listStyles) {
    display.showMessage(chalk.bold('\nAvailable style guides:\n'));

    display.showMessage(chalk.cyan('Python:'));
    for (const style of VALID_STYLE_GUIDES.python) {
      display.showMessage(`  - ${style}`);
    }

    display.showMessage(chalk.cyan('\nJavaScript:'));
    for (const style of VALID_STYLE_GUIDES.javascript) {
      display.showMessage(`  - ${style}`);
    }

    display.showMessage(chalk.cyan('\nTypeScript:'));
    for (const style of VALID_STYLE_GUIDES.typescript) {
      display.showMessage(`  - ${style}`);
    }

    display.showMessage(chalk.cyan('\nTones:'));
    for (const tone of VALID_TONES) {
      display.showMessage(`  - ${tone}`);
    }

    display.showMessage('');
    return;
  }

  // Check for ANTHROPIC_API_KEY
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required.\n' +
        'Please set it to your Claude API key: export ANTHROPIC_API_KEY=sk-ant-...'
    );
  }

  // Validate path exists and is accessible (for consistency with other commands)
  const absolutePath = PathValidator.validatePathExists(path);
  PathValidator.validatePathReadable(absolutePath);
  PathValidator.warnIfEmpty(absolutePath);

  // Validate workflow prerequisites
  const validationResult = await WorkflowValidator.validateImprovePrerequisites(
    options.skipValidation ?? false
  );
  if (!validationResult.valid) {
    throw new Error(
      `${validationResult.error}\n${validationResult.suggestion}`
    );
  }

  // Check for stale plan (already validated in validateImprovePrerequisites, but show warning)
  const planStaleCheck = await WorkflowValidator.isPlanStale();
  if (planStaleCheck.isStale) {
    display.showMessage(
      formatStalenessWarning(
        'plan',
        planStaleCheck.changedCount,
        "Consider re-running 'docimp plan' to regenerate with latest analysis."
      )
    );
  }

  // Load configuration
  const config: IConfig = await configLoader.load(options.config);

  // Detect and prompt for resume (Priority 1-5)
  const sessionIdToResume = await detectAndPromptResumeImprove(
    {
      resume: options.resume,
      resumeFile: options.resumeFile,
      new: options.new,
      clearSession: options.clearSession,
    },
    display
  );

  // Load plan file (needed for both resume and fresh sessions)
  const planFilePath = options.planFile || StateManager.getPlanFile();
  let planResult: PlanResult;

  try {
    const planContent = readFileSync(nodePath.resolve(planFilePath), 'utf8');
    planResult = JSON.parse(planContent);
  } catch {
    throw new Error(
      `Failed to load plan file: ${planFilePath}\n` +
        `Run 'docimp plan ${path}' first to generate a plan.`
    );
  }

  if (!planResult.items || planResult.items.length === 0) {
    display.showMessage(chalk.yellow('No items in plan. Nothing to improve.'));
    return;
  }

  // Handle resume session: file invalidation and filtering
  let resumeSessionState: ImproveSessionState | null = null;
  let itemsToProcess = planResult.items;

  if (sessionIdToResume) {
    // Load and validate session state
    resumeSessionState = await loadResumeImproveSession(
      sessionIdToResume,
      display
    );

    // Handle file invalidation (detect external edits)
    const invalidationResult = await handleFileInvalidationImprove(
      resumeSessionState,
      planResult.items,
      display
    );

    resumeSessionState = invalidationResult.sessionState;
    itemsToProcess = invalidationResult.items;

    // Filter to unprocessed items only
    itemsToProcess = filterUnprocessedItems(
      itemsToProcess,
      resumeSessionState.partial_improvements
    );

    if (itemsToProcess.length === 0) {
      display.showMessage(
        chalk.green('All items in session already processed!')
      );
      return;
    }
  }

  // Detect languages present in items to process
  // Note: PlanItem.language never includes 'skipped' by design
  const detectedLanguages = [
    ...new Set(itemsToProcess.map((item) => item.language)),
  ];

  if (detectedLanguages.length === 0) {
    throw new Error('No valid languages found in plan. All items are skipped.');
  }

  // Collect user preferences (skip if resuming - use session state values)
  let styleGuides: Partial<Record<SupportedLanguage, string>> = {};
  let tone: string;

  // Validate CLI flag style guides (always done, regardless of resume)
  const cliStyleGuides: Partial<Record<SupportedLanguage, string>> = {};

  if (options.pythonStyle) {
    if (!VALID_STYLE_GUIDES.python.includes(options.pythonStyle)) {
      throw new Error(
        `Invalid Python style guide: ${options.pythonStyle}\n` +
          `Valid options: ${VALID_STYLE_GUIDES.python.join(', ')}`
      );
    }
    cliStyleGuides.python = options.pythonStyle;
  }

  if (options.javascriptStyle) {
    if (!VALID_STYLE_GUIDES.javascript.includes(options.javascriptStyle)) {
      throw new Error(
        `Invalid JavaScript style guide: ${options.javascriptStyle}\n` +
          `Valid options: ${VALID_STYLE_GUIDES.javascript.join(', ')}`
      );
    }
    cliStyleGuides.javascript = options.javascriptStyle;
  }

  if (options.typescriptStyle) {
    if (!VALID_STYLE_GUIDES.typescript.includes(options.typescriptStyle)) {
      throw new Error(
        `Invalid TypeScript style guide: ${options.typescriptStyle}\n` +
          `Valid options: ${VALID_STYLE_GUIDES.typescript.join(', ')}`
      );
    }
    cliStyleGuides.typescript = options.typescriptStyle;
  }

  // Validate tone if provided via CLI
  if (
    options.tone &&
    !(VALID_TONES as readonly string[]).includes(options.tone)
  ) {
    throw new Error(
      `Invalid tone: ${options.tone}\n` +
        `Valid options: ${VALID_TONES.join(', ')}`
    );
  }

  // Fail fast if plan contains unsupported languages
  const unsupportedLanguages = detectedLanguages.filter(
    (lang) => !STYLE_GUIDE_CHOICES[lang]
  );
  if (unsupportedLanguages.length > 0) {
    throw new Error(
      `Plan contains unsupported languages: ${unsupportedLanguages.join(', ')}\n` +
        `Supported languages: python, javascript, typescript`
    );
  }

  // Build style guides and tone: resume session or collect preferences
  if (resumeSessionState) {
    // Resuming: Use style guides and tone from session state
    styleGuides = resumeSessionState.config.styleGuides as Partial<
      Record<SupportedLanguage, string>
    >;
    tone = resumeSessionState.config.tone;
    if (options.verbose) {
      display.showMessage(chalk.dim(`Resuming with saved preferences:`));
      display.showMessage(
        chalk.dim(`  Style guides: ${JSON.stringify(styleGuides)}`)
      );
      display.showMessage(chalk.dim(`  Tone: ${tone}`));
    }
  } else {
    // Fresh session: Collect preferences
    display.showMessage(chalk.bold('\n Interactive Documentation Improvement'));
    display.showMessage(chalk.dim('Using Claude AI with plugin validation\n'));

    // In non-interactive mode, validate all required values are available
    if (options.nonInteractive) {
      const missingLanguages: string[] = [];

      for (const lang of detectedLanguages) {
        // Check CLI flag first, then config
        const cliValue = cliStyleGuides[lang];
        const configValue = config.styleGuides?.[lang];

        if (cliValue) {
          if (options.verbose) {
            display.showMessage(
              chalk.dim(`Using CLI flag for ${lang}: ${cliValue}`)
            );
          }
          styleGuides[lang] = cliValue;
        } else if (configValue) {
          if (options.verbose) {
            display.showMessage(
              chalk.dim(`Using config value for ${lang}: ${configValue}`)
            );
          }
          styleGuides[lang] = configValue;
        } else {
          missingLanguages.push(lang);
        }
      }

      if (missingLanguages.length > 0) {
        throw new Error(
          `Non-interactive mode requires style guides for all detected languages.\n` +
            `Missing configuration for: ${missingLanguages.join(', ')}\n\n` +
            `Please either:\n` +
            `  1. Add styleGuides.${missingLanguages[0]} to your docimp.config.js\n` +
            `  2. Use CLI flags: --${missingLanguages[0]}-style <style>\n` +
            `  3. Run without --non-interactive for interactive prompts`
        );
      }
    } else {
      // Interactive mode: prompt only for languages without CLI flags
      for (const lang of detectedLanguages) {
        // If CLI flag provided, use it and skip prompt
        if (cliStyleGuides[lang]) {
          if (options.verbose) {
            display.showMessage(
              chalk.dim(`Using CLI flag for ${lang}: ${cliStyleGuides[lang]}`)
            );
          }
          styleGuides[lang] = cliStyleGuides[lang];
          continue;
        }

        // Otherwise, prompt with config as initial selection
        const choices = STYLE_GUIDE_CHOICES[lang];
        const configuredStyle = config.styleGuides?.[lang as SupportedLanguage];
        const initialIndex = configuredStyle
          ? choices.findIndex((choice) => choice.value === configuredStyle)
          : -1;

        if (options.verbose && configuredStyle) {
          display.showMessage(
            chalk.dim(
              `Config has ${lang} style guide: ${configuredStyle} (pre-selected)`
            )
          );
        }

        const response = await prompts({
          type: 'select',
          name: 'styleGuide',
          message: `Select documentation style guide for ${chalk.cyan(lang)}:`,
          choices,
          initial: Math.max(initialIndex, 0),
        });

        if (response.styleGuide) {
          if (options.verbose) {
            display.showMessage(
              chalk.dim(
                `User selected ${lang} style guide: ${response.styleGuide}`
              )
            );
          }
          styleGuides[lang] = response.styleGuide;
        } else {
          throw new UserCancellationError('Style guide selection cancelled.');
        }
      }
    }

    // Determine tone from CLI flag, config, or prompt
    // (tone already declared at top)

    if (options.tone) {
      // CLI flag takes precedence
      if (options.verbose) {
        display.showMessage(
          chalk.dim(`Using CLI flag for tone: ${options.tone}`)
        );
      }
      tone = options.tone;
    } else if (options.nonInteractive) {
      // Non-interactive mode: use config or default
      tone = config.tone || 'concise';
      if (options.verbose) {
        const source = config.tone ? 'config' : 'default';
        display.showMessage(
          chalk.dim(`Using ${source} value for tone: ${tone}`)
        );
      }
    } else {
      // Interactive mode: prompt with config as initial selection
      const toneInitialIndex = config.tone
        ? TONE_CHOICES.findIndex((choice) => choice.value === config.tone)
        : -1;

      if (options.verbose && config.tone) {
        display.showMessage(
          chalk.dim(`Config has tone: ${config.tone} (pre-selected)`)
        );
      }

      const toneResponse = await prompts({
        type: 'select',
        name: 'tone',
        message: 'Select documentation tone (applies to all languages):',
        choices: TONE_CHOICES,
        initial: Math.max(toneInitialIndex, 0),
      });

      tone = toneResponse.tone || 'concise';
      if (!toneResponse.tone) {
        throw new UserCancellationError('Tone selection cancelled.');
      }
      if (options.verbose) {
        display.showMessage(chalk.dim(`User selected tone: ${tone}`));
      }
    }
  } // End of fresh session preference collection

  // Load plugins
  const pluginPaths = isPluginConfig(config.plugins)
    ? (config.plugins.paths ?? [])
    : (config.plugins ?? []);

  if (pluginPaths.length > 0) {
    display.showMessage(chalk.dim(`Loading plugins...`));
    try {
      await pluginManager.loadPlugins(pluginPaths);
      const loadedPlugins = pluginManager.getLoadedPlugins();
      display.showMessage(
        chalk.green(
          `Loaded ${loadedPlugins.length} plugin(s): ${loadedPlugins.join(', ')}`
        )
      );
    } catch (error) {
      display.showWarning(
        `Failed to load plugins: ${error instanceof Error ? error.message : String(error)}\n` +
          `Continuing without plugin validation.`
      );
    }
  }

  // Create interactive session with injected dependencies
  const session: IInteractiveSession = new InteractiveSession({
    config,
    pythonBridge: bridge,
    pluginManager,
    editorLauncher,
    styleGuides,
    tone,
    basePath: nodePath.resolve(process.cwd(), path),
    resumeSessionState: resumeSessionState ?? undefined,
  });

  // Run the session with filtered items
  await session.run(itemsToProcess);
}

/**
 * Execute the improve command.
 * This is the entry point called by Commander.js.
 *
 * @param path - Path to file or directory to improve
 * @param options - Command options
 * @param options.config - Path to configuration file
 * @param options.planFile - Path to plan file containing improvement items
 * @param options.pythonStyle - Python documentation style guide
 * @param options.javascriptStyle - JavaScript documentation style guide
 * @param options.typescriptStyle - TypeScript documentation style guide
 * @param options.tone - Documentation tone (concise, friendly, technical)
 * @param options.nonInteractive - Run in non-interactive mode
 * @param options.verbose - Enable verbose output
 * @param options.listStyles - List available style guides and exit
 * @param options.resume - Resume an incomplete session (show selection list)
 * @param options.resumeFile - Resume specific session ID (skip selection)
 * @param options.new - Force new session (bypass auto-detection)
 * @param options.clearSession - Delete all incomplete sessions and exit
 * @param bridge - Python bridge instance (dependency injection)
 * @param display - Display instance (dependency injection)
 * @param configLoader - Config loader instance (dependency injection)
 * @param pluginManager - Plugin manager instance (dependency injection)
 * @param editorLauncher - Editor launcher instance (dependency injection)
 * @returns Exit code (EXIT_CODE.SUCCESS or EXIT_CODE.USER_CANCELLED for success, EXIT_CODE.ERROR for failure)
 */
export async function improveCommand(
  path: string,
  options: {
    config?: string;
    planFile?: string;
    pythonStyle?: string;
    javascriptStyle?: string;
    typescriptStyle?: string;
    tone?: string;
    nonInteractive?: boolean;
    verbose?: boolean;
    listStyles?: boolean;
    resume?: boolean;
    resumeFile?: string;
    new?: boolean;
    clearSession?: boolean;
  },
  bridge: IPythonBridge,
  display: IDisplay,
  configLoader: IConfigLoader,
  pluginManager: IPluginManager,
  editorLauncher: IEditorLauncher
): Promise<ExitCode> {
  try {
    await improveCore(
      path,
      options,
      bridge,
      display,
      configLoader,
      pluginManager,
      editorLauncher
    );
    return EXIT_CODE.SUCCESS;
  } catch (error) {
    // Clear session complete - exit gracefully with code 0
    if (error instanceof Error && error.message === 'CLEAR_SESSION_COMPLETE') {
      return EXIT_CODE.SUCCESS;
    }

    // User cancellation is not an error - exit gracefully with code 0
    if (error instanceof UserCancellationError) {
      display.showError(error.message);
      return EXIT_CODE.USER_CANCELLED;
    }

    display.showError(error instanceof Error ? error.message : String(error));
    return EXIT_CODE.ERROR;
  }
}
