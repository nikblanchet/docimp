/**
 * Python subprocess bridge implementation.
 *
 * This class spawns Python analyzer processes, passes configuration,
 * and parses JSON responses from stdout.
 */

import { spawn, spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { IPythonBridge, AnalyzeOptions, AuditOptions, PlanOptions, SuggestOptions, ApplyData } from './IPythonBridge.js';
import type { AnalysisResult, AuditListResult, AuditRatings, PlanResult } from '../types/analysis.js';

/**
 * Get directory path for this module, compatible with both ES modules and CommonJS.
 *
 * In ES modules (production), use import.meta.url.
 * In CommonJS (Jest tests), __dirname is globally available.
 *
 * @returns Directory path of this module
 */
function getCurrentDirPath(): string {
  // Check if running in CommonJS environment (Jest)
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  // ES modules: use import.meta.url
  // Use indirect eval to avoid syntax error in CommonJS/Jest
  const importMetaUrl = new Function('return import.meta.url')();
  return dirname(fileURLToPath(importMetaUrl));
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

    // Auto-detect analyzer path relative to this file location
    // cli/src/python-bridge/PythonBridge.ts -> ../../analyzer/
    // This works regardless of process.cwd(), making it safe to call
    // docimp from any working directory
    if (!analyzerPath) {
      // Go up from cli/src/python-bridge/ (or cli/dist/python-bridge/ after build)
      // to repo root, then into analyzer/
      this.analyzerModule = resolve(getCurrentDirPath(), '..', '..', '..', 'analyzer');
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

    return this.executePython<AnalysisResult>(args, options.verbose);
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

    return this.executePython<AuditListResult>(args, options.verbose);
  }

  /**
   * Save audit ratings to file.
   *
   * @param ratings - Audit ratings to persist
   * @param auditFile - Path to audit file (default: .docimp-audit.json)
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

    return this.executePython<PlanResult>(args, options.verbose);
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
   * @returns Promise resolving to parsed JSON result
   * @throws Error if process fails or JSON is invalid
   */
  private async executePython<T>(
    args: string[],
    verbose: boolean = false
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
          const result = JSON.parse(stdout) as T;
          resolve(result);
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
