/**
 * Python subprocess bridge implementation.
 *
 * This class spawns Python analyzer processes, passes configuration,
 * and parses JSON responses from stdout.
 */

import { spawn, spawnSync, ChildProcess } from 'child_process';
import { resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import type { IPythonBridge, AnalyzeOptions, AuditOptions, PlanOptions, SuggestOptions, ApplyData } from './IPythonBridge.js';
import type { AnalysisResult, AuditListResult, AuditRatings, PlanResult } from '../types/analysis.js';
import { AnalysisResultSchema, AuditListResultSchema, PlanResultSchema, formatValidationError } from './schemas.js';
import type { IConfig } from '../config/IConfig.js';
import { defaultConfig } from '../config/IConfig.js';

/**
 * Find the analyzer directory relative to this module's location.
 *
 * This works regardless of:
 * - User's current working directory
 * - Whether code is in src/ or dist/
 * - Whether CLI is installed globally or locally
 * - Whether running in development or production
 *
 * Resolution order:
 * 1. DOCIMP_ANALYZER_PATH environment variable (for custom setups)
 * 2. Relative to this module: ../../../analyzer (works for both src/ and dist/)
 *
 * @returns Path to analyzer directory
 * @throws Error if analyzer directory not found
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

  // Get the directory containing this file
  // In production: cli/dist/python-bridge/PythonBridge.js
  // In development: cli/src/python-bridge/PythonBridge.ts
  //
  // IMPORTANT: Jest/CommonJS compatibility
  // - Jest parses the ENTIRE file and fails if it sees 'import.meta' anywhere
  // - We MUST hide import.meta from Jest's parser using new Function()
  // - We detect Jest via JEST_WORKER_ID to ensure new Function() only runs in production
  // - This is a known limitation of mixing ESM (import.meta) with Jest (CommonJS)

  let analyzerPath: string;
  let moduleInfo: string;

  // Detect if we're in a Jest/test environment
  // Jest sets JEST_WORKER_ID when running tests
  const isJestEnvironment = process.env.JEST_WORKER_ID !== undefined;

  if (isJestEnvironment) {
    // Jest/test environment: Tests run from cli/ directory
    // Go up one level to repo root, then into analyzer/
    analyzerPath = resolve(process.cwd(), '..', 'analyzer');
    moduleInfo = '(test environment)';
  } else {
    // Production/development: Use import.meta.url for module-relative resolution
    //
    // NOTE: new Function() is necessary here to hide import.meta from Jest's parser.
    // Jest parses the entire file even if this branch doesn't execute, so we cannot
    // reference import.meta directly anywhere in the source code.
    //
    // This is safe because:
    // 1. This branch only executes in production (JEST_WORKER_ID check above)
    // 2. The string 'import.meta.url' is a hardcoded constant
    // 3. No user input is involved
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const getUrl = new Function('return import.meta.url');
    const currentFileUrl = getUrl();
    const currentFilePath = fileURLToPath(currentFileUrl);
    const currentDir = dirname(currentFilePath);

    // Go up 3 levels to repo root: python-bridge -> src|dist -> cli -> root
    // Then into analyzer/
    analyzerPath = resolve(currentDir, '..', '..', '..', 'analyzer');
    moduleInfo = currentFilePath;
  }

  if (existsSync(analyzerPath)) {
    return analyzerPath;
  }

  throw new Error(
    `Could not find analyzer directory.\n` +
    `Expected location: ${analyzerPath}\n` +
    `Current module: ${moduleInfo}\n` +
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
}
