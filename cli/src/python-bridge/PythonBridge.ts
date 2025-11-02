/**
 * Python subprocess bridge implementation.
 *
 * This class spawns Python analyzer processes, passes configuration,
 * and parses JSON responses from stdout.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { z } from 'zod';
import type { IPythonBridge, AnalyzeOptions, AuditOptions, PlanOptions, SuggestOptions, ApplyData } from './IPythonBridge.js';
import type { AnalysisResult, AuditListResult, AuditRatings, PlanResult, SessionSummary, TransactionEntry, RollbackResult } from '../types/analysis.js';
import { AnalysisResultSchema, AuditListResultSchema, PlanResultSchema, SessionSummarySchema, TransactionEntrySchema, RollbackResultSchema, GenericSuccessSchema, formatValidationError } from './schemas.js';
import type { IConfig } from '../config/IConfig.js';
import { defaultConfig } from '../config/IConfig.js';

/**
 * Find the analyzer directory.
 *
 * Path Resolution Order:
 * 1. DOCIMP_ANALYZER_PATH environment variable (if set) - for custom installations
 * 2. Fallback strategies using process.cwd() (tried in order):
 * - <cwd>/../analyzer - when running from cli/ directory (development, Jest tests)
 * - <cwd>/analyzer - when running from repo root
 * - <cwd>/../../analyzer - when installed globally via npm
 *
 * Note: We cannot use import.meta.url for module-relative resolution because Jest
 * (CommonJS test environment) parses the entire file and rejects any 'import.meta'
 * reference, even in conditional branches. The only solution is to use process.cwd()
 * fallback strategies and require DOCIMP_ANALYZER_PATH for special setups.
 *
 * @returns Absolute path to analyzer directory
 * @throws Error if analyzer directory not found in any location
 */
function findAnalyzerDir(): string {
  // Check environment variable first (allows custom installations)
  const envPath = process.env.DOCIMP_ANALYZER_PATH;
  if (envPath) {
    if (existsSync(envPath)) {
      return resolve(envPath);
    }
    throw new Error(
      `DOCIMP_ANALYZER_PATH is set to "${envPath}" but directory does not exist.\n` +
      `Please check the path or unset the environment variable.`
    );
  }

  // Fallback path resolution when DOCIMP_ANALYZER_PATH is not set
  // Try multiple strategies based on common deployment scenarios
  const strategies = [
    { path: resolve(process.cwd(), '..', 'analyzer'), context: 'cli/ directory (development/tests)' },
    { path: resolve(process.cwd(), 'analyzer'), context: 'repo root' },
    { path: resolve(process.cwd(), '..', '..', 'analyzer'), context: 'global npm install' },
  ];

  for (const strategy of strategies) {
    if (existsSync(strategy.path)) {
      return strategy.path;
    }
  }

  // If all strategies fail, provide helpful error with attempted paths
  const attemptedPaths = strategies.map((s) => `  - ${s.path} (${s.context})`).join('\n');
  throw new Error(
    `Could not find analyzer directory.\n` +
    `Attempted paths:\n${attemptedPaths}\n` +
    `Current working directory: ${process.cwd()}\n\n` +
    `If you have a custom installation, set DOCIMP_ANALYZER_PATH environment variable.`
  );
}

/**
 * Detect available Python executable.
 * Checks GitHub Actions pythonLocation first, then DOCIMP_PYTHON_PATH,
 * then tries python3, python, and py.
 *
 * @returns Path to Python executable
 */
function detectPythonExecutable(): string {
  // GitHub Actions sets pythonLocation env var (e.g., /opt/hostedtoolcache/Python/3.13.8/x64)
  const pythonLocation = process.env.pythonLocation;
  if (pythonLocation) {
    // Try both python3 and python in the bin directory
    const candidates = [
      `${pythonLocation}/bin/python3`,
      `${pythonLocation}/bin/python`
    ];
    for (const candidate of candidates) {
      try {
        const result = spawnSync(candidate, ['--version'], { timeout: 2000 });
        if (result.status === 0) {
          return candidate;
        }
      } catch {
        // Try next candidate
      }
    }
  }

  // Check for explicit path from environment (for CI)
  const envPath = process.env.DOCIMP_PYTHON_PATH;
  if (envPath) {
    return envPath;
  }

  const candidates = ['python3', 'python', 'py'];

  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ['--version'], { timeout: 2000 });
      if (result.status === 0) {
        return candidate;
      }
    } catch {
      // Try next candidate
    }
  }

  // Default fallback
  return 'python';
}

/**
 * Default implementation of Python bridge using subprocess.
 */
export class PythonBridge implements IPythonBridge {
  private readonly pythonPath: string;
  private readonly analyzerModule: string;
  private readonly defaultTimeout: number;
  private readonly suggestTimeout: number;
  private readonly killEscalationDelay: number;

  /**
   * Create a new Python bridge.
   *
   * @param pythonPath - Path to Python executable (default: auto-detected)
   * @param analyzerPath - Path to analyzer module (default: auto-detected)
   * @param config - Configuration with timeout settings (optional)
   */
  constructor(
    pythonPath?: string,
    analyzerPath?: string,
    config?: IConfig
  ) {
    this.pythonPath = pythonPath || detectPythonExecutable();

    // Auto-detect analyzer path relative to module location
    // This works regardless of user's cwd, global install, or directory structure
    if (!analyzerPath) {
      this.analyzerModule = findAnalyzerDir();
    } else {
      this.analyzerModule = analyzerPath;
    }

    // Load timeout settings from config or use defaults
    this.defaultTimeout = config?.pythonBridge?.defaultTimeout ?? defaultConfig.pythonBridge!.defaultTimeout!;
    this.suggestTimeout = config?.pythonBridge?.suggestTimeout ?? defaultConfig.pythonBridge!.suggestTimeout!;
    this.killEscalationDelay = config?.pythonBridge?.killEscalationDelay ?? defaultConfig.pythonBridge!.killEscalationDelay!;

    // Validate timeout values
    if (this.defaultTimeout <= 0) {
      throw new Error(
        `Invalid pythonBridge.defaultTimeout: ${this.defaultTimeout}. ` +
        `Timeout must be a positive number (milliseconds).`
      );
    }
    if (this.suggestTimeout <= 0) {
      throw new Error(
        `Invalid pythonBridge.suggestTimeout: ${this.suggestTimeout}. ` +
        `Timeout must be a positive number (milliseconds).`
      );
    }
    if (!Number.isFinite(this.defaultTimeout)) {
      throw new Error(
        `Invalid pythonBridge.defaultTimeout: ${this.defaultTimeout}. ` +
        `Timeout must be a finite number (not Infinity or NaN).`
      );
    }
    if (!Number.isFinite(this.suggestTimeout)) {
      throw new Error(
        `Invalid pythonBridge.suggestTimeout: ${this.suggestTimeout}. ` +
        `Timeout must be a finite number (not Infinity or NaN).`
      );
    }
    if (this.killEscalationDelay <= 0) {
      throw new Error(
        `Invalid pythonBridge.killEscalationDelay: ${this.killEscalationDelay}. ` +
        `Delay must be a positive number (milliseconds).`
      );
    }
    if (!Number.isFinite(this.killEscalationDelay)) {
      throw new Error(
        `Invalid pythonBridge.killEscalationDelay: ${this.killEscalationDelay}. ` +
        `Delay must be a finite number (not Infinity or NaN).`
      );
    }
  }

  /**
   * Analyze documentation coverage using Python analyzer.
   *
   * @param options - Analysis options
   * @returns Promise resolving to analysis result
   * @throws Error if Python process fails or returns invalid JSON
   */
  async analyze(options: AnalyzeOptions): Promise<AnalysisResult> {
    // Resolve path to absolute before passing to Python subprocess
    // This is necessary because the subprocess runs with CWD set to analyzer/
    const absolutePath = resolve(process.cwd(), options.path);

    const args = [
      '-m',
      'src.main',
      'analyze',
      absolutePath,
      '--format',
      'json',
    ];

    if (options.verbose) {
      args.push('--verbose');
    }

    if (options.strict) {
      args.push('--strict');
    }

    return this.executePython<AnalysisResult>(args, options.verbose, AnalysisResultSchema);
  }

  /**
   * Get list of documented items for quality audit.
   *
   * @param options - Audit options
   * @returns Promise resolving to list of documented items
   * @throws Error if Python process fails or returns invalid JSON
   */
  async audit(options: AuditOptions): Promise<AuditListResult> {
    // Resolve path to absolute before passing to Python subprocess
    const absolutePath = resolve(process.cwd(), options.path);

    const args = [
      '-m',
      'src.main',
      'audit',
      absolutePath,
    ];

    if (options.auditFile) {
      // Resolve audit file to absolute path (Python subprocess runs in analyzer/ dir)
      const absoluteAuditFile = resolve(process.cwd(), options.auditFile);
      args.push('--audit-file', absoluteAuditFile);
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    return this.executePython<AuditListResult>(args, options.verbose, AuditListResultSchema);
  }

  /**
   * Save audit ratings to file.
   *
   * @param ratings - Audit ratings to persist
   * @param auditFile - Path to audit file (default: .docimp/session-reports/audit.json)
   * @returns Promise resolving when ratings are saved
   * @throws Error if Python process fails
   */
  async applyAudit(ratings: AuditRatings, auditFile?: string): Promise<void> {
    const args = [
      '-m',
      'src.main',
      'apply-audit',
    ];

    if (auditFile) {
      // Resolve audit file to absolute path (Python subprocess runs in analyzer/ dir)
      const absoluteAuditFile = resolve(process.cwd(), auditFile);
      args.push('--audit-file', absoluteAuditFile);
    }

    const childProcess = spawn(this.pythonPath, args, {
      cwd: this.analyzerModule,
      env: { ...process.env },
    });

    // Setup timeout handling
    const { cleanup, timeoutPromise } = this.setupProcessTimeout(
      childProcess,
      this.defaultTimeout,
      'apply-audit'
    );

    // Create promise for normal process completion
    const processPromise = new Promise<void>((resolve, reject) => {
      let stderr = '';

      // Send ratings as JSON via stdin
      childProcess.stdin.write(JSON.stringify(ratings));
      childProcess.stdin.end();

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('error', (error: Error) => {
        reject(
          new Error(
            `Failed to spawn Python process: ${error.message}\n` +
            `Make sure Python is installed and the analyzer module is available.`
          )
        );
      });

      childProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(
            new Error(
              `Python analyzer exited with code ${code}\n` +
              `stderr: ${stderr}`
            )
          );
          return;
        }

        resolve();
      });
    });

    // Race between timeout and normal completion, cleanup in finally
    try {
      return await Promise.race([processPromise, timeoutPromise]);
    } finally {
      cleanup();
    }
  }

  /**
   * Generate prioritized documentation improvement plan.
   *
   * @param options - Plan options
   * @returns Promise resolving to plan result
   * @throws Error if Python process fails or returns invalid JSON
   */
  async plan(options: PlanOptions): Promise<PlanResult> {
    // Resolve path to absolute before passing to Python subprocess
    const absolutePath = resolve(process.cwd(), options.path);

    const args = [
      '-m',
      'src.main',
      'plan',
      absolutePath,
    ];

    if (options.auditFile) {
      // Resolve audit file to absolute path (Python subprocess runs in analyzer/ dir)
      const absoluteAuditFile = resolve(process.cwd(), options.auditFile);
      args.push('--audit-file', absoluteAuditFile);
    }

    if (options.planFile) {
      // Resolve plan file to absolute path (Python subprocess runs in analyzer/ dir)
      const absolutePlanFile = resolve(process.cwd(), options.planFile);
      args.push('--plan-file', absolutePlanFile);
    }

    if (options.qualityThreshold !== undefined) {
      args.push('--quality-threshold', String(options.qualityThreshold));
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    return this.executePython<PlanResult>(args, options.verbose, PlanResultSchema);
  }

  /**
   * Request documentation suggestion from Claude.
   *
   * @param options - Suggestion options
   * @returns Promise resolving to suggested documentation text
   * @throws Error if Python process fails or Claude API error
   */
  async suggest(options: SuggestOptions): Promise<string> {
    const args = [
      '-m',
      'src.main',
      'suggest',
      options.target,
      '--style-guide', options.styleGuide,
      '--tone', options.tone,
    ];

    if (options.timeout !== undefined) {
      args.push('--timeout', String(options.timeout));
    }

    if (options.maxRetries !== undefined) {
      args.push('--max-retries', String(options.maxRetries));
    }

    if (options.retryDelay !== undefined) {
      args.push('--retry-delay', String(options.retryDelay));
    }

    if (options.verbose) {
      args.push('--verbose');
    }

    if (options.feedback) {
      args.push('--feedback', options.feedback);
    }

    // suggest command returns plain text, not JSON
    return this.executePythonText(args, options.verbose);
  }

  /**
   * Write documentation to a source file.
   *
   * @param data - Data for writing documentation
   * @returns Promise resolving when documentation is written
   * @throws Error if Python process fails or write fails
   */
  async apply(data: ApplyData): Promise<void> {
    const args = [
      '-m',
      'src.main',
      'apply',
    ];

    const childProcess = spawn(this.pythonPath, args, {
      cwd: this.analyzerModule,
      env: { ...process.env },
    });

    // Setup timeout handling
    const { cleanup, timeoutPromise } = this.setupProcessTimeout(
      childProcess,
      this.defaultTimeout,
      'apply'
    );

    // Create promise for normal process completion
    const processPromise = new Promise<void>((resolve, reject) => {
      let stderr = '';

      // Send apply data as JSON via stdin
      childProcess.stdin.write(JSON.stringify(data));
      childProcess.stdin.end();

      childProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      childProcess.on('error', (error: Error) => {
        reject(
          new Error(
            `Failed to spawn Python process: ${error.message}\n` +
            `Make sure Python is installed and the analyzer module is available.`
          )
        );
      });

      childProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(
            new Error(
              `Python analyzer exited with code ${code}\n` +
              `stderr: ${stderr}`
            )
          );
          return;
        }

        resolve();
      });
    });

    // Race between timeout and normal completion, cleanup in finally
    try {
      return await Promise.race([processPromise, timeoutPromise]);
    } finally {
      cleanup();
    }
  }

  /**
   * Setup timeout handling for a child process.
   *
   * Implements graceful shutdown: SIGTERM -> wait -> SIGKILL
   *
   * @param childProcess - The child process to monitor
   * @param timeoutMs - Timeout in milliseconds
   * @param commandName - Name of command for error messages
   * @returns Object with cleanup function and timeout promise
   */
  private setupProcessTimeout(
    childProcess: ChildProcess,
    timeoutMs: number,
    commandName: string
  ): { cleanup: () => void; timeoutPromise: Promise<never> } {
    let timeoutId: NodeJS.Timeout | null = null;
    let killTimeoutId: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (killTimeoutId) {
        clearTimeout(killTimeoutId);
        killTimeoutId = null;
      }
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        // Try graceful shutdown first (SIGTERM)
        childProcess.kill('SIGTERM');

        // If process doesn't exit within configured delay, force kill (SIGKILL)
        killTimeoutId = setTimeout(() => {
          if (childProcess.exitCode === null) {
            childProcess.kill('SIGKILL');
          }
        }, this.killEscalationDelay);

        reject(
          new Error(
            `Python ${commandName} command timed out after ${timeoutMs}ms.\n` +
            `The Python process may be frozen or the operation is taking too long.\n` +
            `Consider increasing the timeout in your docimp.config.js file.`
          )
        );
      }, timeoutMs);
    });

    return { cleanup, timeoutPromise };
  }

  /**
   * Execute Python subprocess and return text output (not JSON).
   *
   * @param args - Command-line arguments for Python
   * @param verbose - Whether to show verbose output
   * @param timeoutMs - Timeout in milliseconds (default: this.suggestTimeout for suggest, this.defaultTimeout otherwise)
   * @returns Promise resolving to text output
   * @throws Error if process fails
   */
  private async executePythonText(
    args: string[],
    verbose: boolean = false,
    timeoutMs?: number
  ): Promise<string> {
    const childProcess = spawn(this.pythonPath, args, {
      cwd: this.analyzerModule,
      env: { ...process.env },
    });

    // Extract command name for timeout error messages
    const commandName = args[2] || 'unknown';
    // Default to suggestTimeout for suggest command, defaultTimeout otherwise
    const timeout = timeoutMs ?? (commandName === 'suggest' ? this.suggestTimeout : this.defaultTimeout);

    // Setup timeout handling
    const { cleanup, timeoutPromise } = this.setupProcessTimeout(
      childProcess,
      timeout,
      commandName
    );

    // Create promise for normal process completion
    const processPromise = new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;

        // Pass through verbose output
        if (verbose) {
          console.error(text);
        }
      });

      childProcess.on('error', (error: Error) => {
        reject(
          new Error(
            `Failed to spawn Python process: ${error.message}\n` +
            `Make sure Python is installed and the analyzer module is available.`
          )
        );
      });

      childProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(
            new Error(
              `Python analyzer exited with code ${code}\n` +
              `stderr: ${stderr}\n` +
              `stdout: ${stdout}`
            )
          );
          return;
        }

        resolve(stdout);
      });
    });

    // Race between timeout and normal completion, cleanup in finally
    try {
      return await Promise.race([processPromise, timeoutPromise]);
    } finally {
      cleanup();
    }
  }

  /**
   * Execute Python subprocess and parse JSON output.
   *
   * @param args - Command-line arguments for Python
   * @param verbose - Whether to show verbose output
   * @param schema - Optional Zod schema for runtime validation
   * @param timeoutMs - Timeout in milliseconds (default: this.defaultTimeout)
   * @returns Promise resolving to parsed and validated JSON result
   * @throws Error if process fails, JSON is invalid, or validation fails
   */
  private async executePython<T>(
    args: string[],
    verbose: boolean = false,
    schema?: z.ZodType<T>,
    timeoutMs?: number
  ): Promise<T> {
    const childProcess = spawn(this.pythonPath, args, {
      cwd: this.analyzerModule,
      env: { ...process.env },
    });

    // Extract command name for timeout error messages
    const commandName = args[2] || 'unknown';
    const timeout = timeoutMs ?? this.defaultTimeout;

    // Setup timeout handling
    const { cleanup, timeoutPromise } = this.setupProcessTimeout(
      childProcess,
      timeout,
      commandName
    );

    // Create promise for normal process completion
    const processPromise = new Promise<T>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      childProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      childProcess.stderr.on('data', (data: Buffer) => {
        const text = data.toString();
        stderr += text;

        // Pass through verbose output
        if (verbose) {
          console.error(text);
        }
      });

      childProcess.on('error', (error: Error) => {
        reject(
          new Error(
            `Failed to spawn Python process: ${error.message}\n` +
            `Make sure Python is installed and the analyzer module is available.`
          )
        );
      });

      childProcess.on('close', (code: number) => {
        if (code !== 0) {
          reject(
            new Error(
              `Python analyzer exited with code ${code}\n` +
              `stderr: ${stderr}\n` +
              `stdout: ${stdout}`
            )
          );
          return;
        }

        // Parse JSON from stdout
        try {
          const parsed = JSON.parse(stdout);

          // Validate with Zod schema if provided
          if (schema) {
            try {
              const validated = schema.parse(parsed);
              resolve(validated);
            } catch (validationError) {
              if (validationError instanceof z.ZodError) {
                reject(
                  new Error(formatValidationError(validationError))
                );
              } else {
                reject(validationError);
              }
            }
          } else {
            // No schema provided, return parsed JSON as-is (backward compatibility)
            resolve(parsed as T);
          }
        } catch (error) {
          reject(
            new Error(
              `Failed to parse Python output as JSON: ${error instanceof Error ? error.message : String(error)}\n` +
              `stdout: ${stdout}\n` +
              `stderr: ${stderr}`
            )
          );
        }
      });
    });

    // Race between timeout and normal completion, cleanup in finally
    try {
      return await Promise.race([processPromise, timeoutPromise]);
    } finally {
      cleanup();
    }
  }

  /**
   * List all documentation improvement sessions.
   *
   * @returns Promise resolving to array of session summaries
   * @throws Error if Python process fails or returns invalid JSON
   */
  async listSessions(): Promise<SessionSummary[]> {
    const args = [
      '-m',
      'analyzer',
      'list-sessions',
      '--format',
      'json'
    ];

    // Validate with array schema
    const result = await this.executePython<SessionSummary[]>(
      args,
      false,
      z.array(SessionSummarySchema)
    );

    return result;
  }

  /**
   * List changes in a specific session.
   *
   * @param sessionId - Session UUID or 'last' for most recent
   * @returns Promise resolving to array of transaction entries
   * @throws Error if Python process fails or returns invalid JSON
   */
  async listChanges(sessionId: string): Promise<TransactionEntry[]> {
    const args = [
      '-m',
      'analyzer',
      'list-changes',
      sessionId,
      '--format',
      'json'
    ];

    // Validate with array schema
    const result = await this.executePython<TransactionEntry[]>(
      args,
      false,
      z.array(TransactionEntrySchema)
    );

    return result;
  }

  /**
   * Rollback an entire session (revert all changes).
   *
   * @param sessionId - Session UUID or 'last' for most recent
   * @returns Promise resolving to rollback result
   * @throws Error if Python process fails or rollback fails
   */
  async rollbackSession(sessionId: string): Promise<RollbackResult> {
    const args = [
      '-m',
      'analyzer',
      'rollback-session',
      sessionId,
      '--format',
      'json',
      '--no-confirm'
    ];

    const result = await this.executePython<RollbackResult>(
      args,
      false,
      RollbackResultSchema
    );

    return result;
  }

  /**
   * Rollback a specific change.
   *
   * @param entryId - Change entry ID or 'last' for most recent
   * @returns Promise resolving to rollback result
   * @throws Error if Python process fails or rollback fails
   */
  async rollbackChange(entryId: string): Promise<RollbackResult> {
    const args = [
      '-m',
      'analyzer',
      'rollback-change',
      entryId,
      '--format',
      'json',
      '--no-confirm'
    ];

    const result = await this.executePython<RollbackResult>(
      args,
      false,
      RollbackResultSchema
    );

    return result;
  }

  /**
   * Begin a new transaction for tracking documentation changes.
   *
   * Creates a new git branch in the side-car repository and initializes
   * a transaction manifest for tracking all changes in this session.
   *
   * @param sessionId - Unique identifier for this improve session (UUID)
   * @returns Promise resolving when transaction is initialized
   * @throws Error if git backend unavailable or initialization fails
   */
  async beginTransaction(sessionId: string): Promise<void> {
    const args = [
      '-m',
      'src.main',
      'begin-transaction',
      sessionId,
      '--format',
      'json'
    ];

    const result = await this.executePython<z.infer<typeof GenericSuccessSchema>>(
      args,
      false,
      GenericSuccessSchema
    );

    if (!result.success) {
      throw new Error(`Failed to begin transaction: ${result.error || 'Unknown error'}`);
    }
  }

  /**
   * Record a documentation write in the current transaction.
   *
   * Creates a git commit in the side-car repository with metadata about the
   * change. Must be called after each accepted documentation modification.
   *
   * @param sessionId - Transaction session identifier
   * @param filepath - Absolute path to modified file
   * @param backupPath - Path to backup file for rollback
   * @param itemName - Name of documented item (function/class/method)
   * @param itemType - Type of item ('function', 'class', 'method')
   * @param language - Programming language ('python', 'typescript', 'javascript')
   * @returns Promise resolving when write is recorded
   * @throws Error if transaction not active or git commit fails
   */
  async recordWrite(
    sessionId: string,
    filepath: string,
    backupPath: string,
    itemName: string,
    itemType: string,
    language: string
  ): Promise<void> {
    const args = [
      '-m',
      'src.main',
      'record-write',
      sessionId,
      filepath,
      backupPath,
      itemName,
      itemType,
      language,
      '--format',
      'json'
    ];

    const result = await this.executePython<z.infer<typeof GenericSuccessSchema>>(
      args,
      false,
      GenericSuccessSchema
    );

    if (!result.success) {
      throw new Error(`Failed to record write: ${result.error || 'Unknown error'}`);
    }
  }

  /**
   * Finalize transaction by squash-merging to main branch.
   *
   * Performs squash merge, creates commit, preserves session branch, and
   * deletes backup files.
   *
   * @param sessionId - Transaction session identifier
   * @returns Promise resolving when transaction is committed
   * @throws Error if no active transaction or merge fails
   */
  async commitTransaction(sessionId: string): Promise<void> {
    const args = [
      '-m',
      'src.main',
      'commit-transaction',
      sessionId,
      '--format',
      'json'
    ];

    const result = await this.executePython<z.infer<typeof GenericSuccessSchema>>(
      args,
      false,
      GenericSuccessSchema
    );

    if (!result.success) {
      throw new Error(`Failed to commit transaction: ${result.error || 'Unknown error'}`);
    }
  }
}
