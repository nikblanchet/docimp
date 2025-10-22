/**
 * Python subprocess bridge implementation.
 *
 * This class spawns Python analyzer processes, passes configuration,
 * and parses JSON responses from stdout.
 */

import { spawn, spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
import { existsSync } from 'fs';
import { z } from 'zod';
import type { IPythonBridge, AnalyzeOptions, AuditOptions, PlanOptions, SuggestOptions, ApplyData } from './IPythonBridge.js';
import type { AnalysisResult, AuditListResult, AuditRatings, PlanResult } from '../types/analysis.js';
import { AnalysisResultSchema, AuditListResultSchema, PlanResultSchema, formatValidationError } from './schemas.js';

/**
 * Find the analyzer directory by searching upwards from a starting directory.
 *
 * This works regardless of:
 * - User's current working directory
 * - Whether code is in src/ or dist/
 * - Whether running in ES modules or CommonJS (Jest)
 *
 * @param startDir - Directory to start searching from
 * @returns Path to analyzer directory
 * @throws Error if analyzer directory not found
 */
function findAnalyzerDir(startDir: string): string {
  let currentDir = startDir;
  const root = resolve('/');

  while (currentDir !== root) {
    const analyzerPath = join(currentDir, 'analyzer');
    if (existsSync(analyzerPath)) {
      return analyzerPath;
    }
    currentDir = dirname(currentDir);
  }

  throw new Error(
    `Could not find analyzer directory. Searched upwards from: ${startDir}`
  );
}

/**
 * Detect available Python executable.
 * Checks GitHub Actions pythonLocation first, then DOCIMP_PYTHON_PATH,
 * then tries python3, python, and py.
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

  /**
   * Create a new Python bridge.
   *
   * @param pythonPath - Path to Python executable (default: auto-detected)
   * @param analyzerPath - Path to analyzer module (default: auto-detected)
   */
  constructor(
    pythonPath?: string,
    analyzerPath?: string
  ) {
    this.pythonPath = pythonPath || detectPythonExecutable();

    // Auto-detect analyzer path by searching upwards from current working directory
    // This works regardless of where docimp is invoked from
    if (!analyzerPath) {
      this.analyzerModule = findAnalyzerDir(process.cwd());
    } else {
      this.analyzerModule = analyzerPath;
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

    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, args, {
        cwd: this.analyzerModule,
        env: { ...process.env },
      });

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

    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, args, {
        cwd: this.analyzerModule,
        env: { ...process.env },
      });

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
  }

  /**
   * Execute Python subprocess and return text output (not JSON).
   *
   * @param args - Command-line arguments for Python
   * @param verbose - Whether to show verbose output
   * @returns Promise resolving to text output
   * @throws Error if process fails
   */
  private async executePythonText(
    args: string[],
    verbose: boolean = false
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, args, {
        cwd: this.analyzerModule,
        env: { ...process.env },
      });

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
  }

  /**
   * Execute Python subprocess and parse JSON output.
   *
   * @param args - Command-line arguments for Python
   * @param verbose - Whether to show verbose output
   * @param schema - Optional Zod schema for runtime validation
   * @returns Promise resolving to parsed and validated JSON result
   * @throws Error if process fails, JSON is invalid, or validation fails
   */
  private async executePython<T>(
    args: string[],
    verbose: boolean = false,
    schema?: z.ZodType<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const childProcess = spawn(this.pythonPath, args, {
        cwd: this.analyzerModule,
        env: { ...process.env },
      });

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
  }
}
