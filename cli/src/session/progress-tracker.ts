/**
 * Progress tracking for interactive improvement sessions.
 *
 * Tracks which items have been processed and provides progress indicators.
 */

export interface SessionProgress {
  /** Total number of items in the session */
  totalItems: number;

  /** Number of items completed */
  completedItems: number;

  /** Number of items accepted */
  acceptedItems: number;

  /** Number of items skipped */
  skippedItems: number;

  /** Number of items that encountered errors */
  errorItems: number;

  /** Number of items where user quit */
  quitAt: number | null;
}

/**
 * Tracks progress through an interactive improvement session.
 */
export class ProgressTracker {
  private totalItems: number;
  private completedItems: number;
  private acceptedItems: number;
  private skippedItems: number;
  private errorItems: number;
  private quitAt: number | null;

  /**
   * Create a new progress tracker.
   *
   * @param totalItems - Total number of items in the session
   */
  constructor(totalItems: number) {
    this.totalItems = totalItems;
    this.completedItems = 0;
    this.acceptedItems = 0;
    this.skippedItems = 0;
    this.errorItems = 0;
    this.quitAt = null;
  }

  /**
   * Record that an item was accepted.
   */
  recordAccepted(): void {
    this.completedItems++;
    this.acceptedItems++;
  }

  /**
   * Record that an item was skipped.
   */
  recordSkipped(): void {
    this.completedItems++;
    this.skippedItems++;
  }

  /**
   * Record that an item encountered an error.
   */
  recordError(): void {
    this.completedItems++;
    this.errorItems++;
  }

  /**
   * Record that the user quit at a specific item index.
   *
   * @param itemIndex - Index of the item where user quit
   */
  recordQuit(itemIndex: number): void {
    this.quitAt = itemIndex;
  }

  /**
   * Get current progress statistics.
   *
   * @returns Progress statistics
   */
  getProgress(): SessionProgress {
    return {
      totalItems: this.totalItems,
      completedItems: this.completedItems,
      acceptedItems: this.acceptedItems,
      skippedItems: this.skippedItems,
      errorItems: this.errorItems,
      quitAt: this.quitAt,
    };
  }

  /**
   * Get a formatted progress string.
   *
   * @returns Progress string like "5/10 items (3 accepted, 2 skipped)" or with errors if any
   */
  getProgressString(): string {
    const {
      completedItems,
      totalItems,
      acceptedItems,
      skippedItems,
      errorItems,
    } = this.getProgress();
    const parts = [`${acceptedItems} accepted`, `${skippedItems} skipped`];
    if (errorItems > 0) {
      const errorText = errorItems === 1 ? 'error' : 'errors';
      parts.push(`${errorItems} ${errorText}`);
    }
    return `${completedItems}/${totalItems} items (${parts.join(', ')})`;
  }

  /**
   * Check if the session is complete.
   *
   * @returns True if all items have been processed or user quit
   */
  isComplete(): boolean {
    return this.completedItems >= this.totalItems || this.quitAt !== null;
  }
}
