/**
 * Python subprocess bridge implementation.
 *
 * This class spawns Python analyzer processes, passes configuration,
 * and parses JSON responses from stdout.
 */

import { spawn } from 'child_process';
import { resolve } from 'path';
import type { IPythonBridge, AnalyzeOptions, AuditOptions } from './IPythonBridge.js';
import type { AnalysisResult, AuditListResult, AuditRatings } from '../types/analysis.js';

/**
 * Default implementation of Python bridge using subprocess.
 */
export class PythonBridge implements IPythonBridge {
  private readonly pythonPath: string;
  private readonly analyzerModule: string;

  /**
   * Create a new Python bridge.
   *
   * @param pythonPath - Path to Python executable (default: 'python')
   * @param analyzerPath - Path to analyzer module (default: auto-detected)
   */
  constructor(
    pythonPath: string = 'python',
    analyzerPath?: string
  ) {
    this.pythonPath = pythonPath;

    // Auto-detect analyzer path relative to this file
    // cli/src/python-bridge/PythonBridge.ts -> analyzer/
    if (!analyzerPath) {
      const currentFile = new URL(import.meta.url).pathname;
      const cliDir = resolve(currentFile, '../../..');
      const projectRoot = resolve(cliDir, '..');
      this.analyzerModule = resolve(projectRoot, 'analyzer');
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
    const args = [
      '-m',
      'src.main',
      'analyze',
      options.path,
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
    const args = [
      '-m',
      'src.main',
      'audit',
      options.path,
    ];

    if (options.auditFile) {
      args.push('--audit-file', options.auditFile);
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
      args.push('--audit-file', auditFile);
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
