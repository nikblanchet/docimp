/**
 * Launches external editor for manual editing of documentation.
 *
 * Uses the tmp library for automatic temp file cleanup on process exit.
 * Cleanup failures are logged but don't fail the operation.
 *
 * Supports common editors like vim, emacs, nano, VS Code, etc.
 */

import { spawn } from 'child_process';
import { promises as fs, close as fsCloseCallback } from 'fs';
import { promisify } from 'util';
import tmp from 'tmp';
import type { IEditorLauncher } from './IEditorLauncher.js';

// Promisify tmp.file for async/await usage
const tmpFile = (
  options: tmp.FileOptions
): Promise<{
  name: string;
  fd: number;
  removeCallback: () => void;
}> => {
  return new Promise((resolve, reject) => {
    tmp.file(options, (err, name, fd, removeCallback) => {
      if (err) {
        reject(err);
      } else {
        resolve({ name, fd, removeCallback });
      }
    });
  });
};

// Promisify fs.close for closing file descriptors
const fsClose = promisify(fsCloseCallback);

/**
 * Launches an external editor for editing text.
 */
export class EditorLauncher implements IEditorLauncher {
  /**
   * Get the preferred editor from environment variables.
   *
   * Checks VISUAL, EDITOR, and falls back to 'nano'.
   *
   * @returns Editor command
   */
  private getEditorCommand(): string {
    return process.env.VISUAL || process.env.EDITOR || 'nano';
  }

  /**
   * Launch an editor to edit the given text.
   *
   * Creates a temporary file, opens it in the user's preferred editor,
   * waits for the editor to close, then reads the edited content.
   *
   * Uses tmp library for automatic cleanup on process exit.
   *
   * @param initialText - Initial text to edit
   * @param extension - File extension for syntax highlighting (default: '.txt')
   * @returns Promise resolving to edited text, or null if editing was cancelled
   */
  async editText(
    initialText: string,
    extension: string = '.txt'
  ): Promise<string | null> {
    // Create temporary file with automatic cleanup
    // tmp.file returns: { name: string, fd: number, removeCallback: () => void }
    const {
      name: tempPath,
      fd,
      removeCallback,
    } = await tmpFile({
      prefix: 'docimp-edit-',
      postfix: extension,
      keep: false, // Auto-cleanup on process exit
      discardDescriptor: false, // We need the file descriptor
    });

    try {
      // Close the file descriptor (tmp opens it, we don't need it)
      await fsClose(fd);

      // Write initial text to temp file
      await fs.writeFile(tempPath, initialText, 'utf-8');

      // Get editor command
      const editorCmd = this.getEditorCommand();

      // Launch editor
      await this.launchEditor(editorCmd, tempPath);

      // Read edited content
      const editedText = await fs.readFile(tempPath, 'utf-8');

      // Manual cleanup (removeCallback)
      // tmp library will also cleanup on process exit as fallback
      try {
        removeCallback();
      } catch (cleanupError) {
        // Log cleanup failure but don't fail the operation
        console.warn(
          `Warning: Failed to cleanup temp file ${tempPath}:`,
          cleanupError
        );
        // File will still be cleaned up on process exit
      }

      // Check if content changed
      if (editedText.trim() === initialText.trim()) {
        return null; // No changes
      }

      return editedText;
    } catch (error) {
      // Cleanup on error
      try {
        removeCallback();
      } catch (cleanupError) {
        console.warn(
          `Warning: Failed to cleanup temp file ${tempPath} after error:`,
          cleanupError
        );
      }
      throw error;
    }
  }

  /**
   * Launch editor as a child process and wait for it to exit.
   *
   * @param editorCmd - Editor command to run
   * @param filepath - Path to file to edit
   * @returns Promise that resolves when editor exits
   */
  private launchEditor(editorCmd: string, filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse editor command to separate command from arguments
      // Split on spaces to handle editors with flags (e.g., "code --wait")
      const parts = editorCmd.trim().split(/\s+/);
      const cmd = parts[0];
      const args = [...parts.slice(1), filepath];

      const editor = spawn(cmd, args, {
        stdio: 'inherit', // Connect editor to terminal
        // NOTE: shell:true removed to prevent command injection vulnerability
      });

      editor.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Editor exited with code ${code}`));
        }
      });

      editor.on('error', (error) => {
        reject(new Error(`Failed to launch editor: ${error.message}`));
      });
    });
  }
}
