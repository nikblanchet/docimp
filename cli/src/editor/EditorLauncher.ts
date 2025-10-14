/**
 * Launches external editor for manual editing of documentation.
 *
 * Supports common editors like vim, emacs, nano, VS Code, etc.
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Launches an external editor for editing text.
 */
export class EditorLauncher {
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
   * @param initialText - Initial text to edit
   * @param extension - File extension for syntax highlighting (default: '.txt')
   * @returns Promise resolving to edited text, or null if editing was cancelled
   */
  async editText(initialText: string, extension: string = '.txt'): Promise<string | null> {
    // Create temporary file
    const tempPath = join(tmpdir(), `docimp-edit-${Date.now()}${extension}`);

    try {
      // Write initial text to temp file
      writeFileSync(tempPath, initialText, 'utf-8');

      // Get editor command
      const editorCmd = this.getEditorCommand();

      // Launch editor
      await this.launchEditor(editorCmd, tempPath);

      // Read edited content
      const editedText = readFileSync(tempPath, 'utf-8');

      // Clean up temp file
      unlinkSync(tempPath);

      // Check if content changed
      if (editedText.trim() === initialText.trim()) {
        return null; // No changes
      }

      return editedText;

    } catch (error) {
      // Clean up temp file on error
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup errors
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
      const editor = spawn(editorCmd, [filepath], {
        stdio: 'inherit', // Connect editor to terminal
        shell: true,      // Allow shell commands
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
