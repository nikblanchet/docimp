/**
 * Interface for external editor launcher.
 *
 * Defines the contract for launching editors to manually edit text.
 */

/**
 * Editor launcher interface.
 *
 * Implementations launch external editors (vim, emacs, VS Code, etc.)
 * and return the edited content.
 */
export interface IEditorLauncher {
  /**
   * Launch an editor to edit the given text.
   *
   * @param initialText - Initial text to edit
   * @param extension - File extension for syntax highlighting (default: '.txt')
   * @returns Promise resolving to edited text, or null if editing was cancelled
   */
  editText(initialText: string, extension?: string): Promise<string | null>;
}
