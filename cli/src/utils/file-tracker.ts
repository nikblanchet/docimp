/**
 * File tracker for detecting source file modifications.
 *
 * Provides checksum and timestamp-based file modification detection for session resume.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';

export interface FileSnapshot {
  filepath: string;
  timestamp: number;
  checksum: string;
  size: number;
}

export interface CodeItem {
  filepath: string;
  [key: string]: unknown;
}

/**
 * Tracks file modifications using checksums and timestamps.
 */
export const FileTracker = {
  /**
   * Create snapshots of files for modification detection.
   *
   * Checksums are calculated in parallel for improved performance on large file sets.
   *
   * @param filepaths - List of file paths to snapshot
   * @returns Mapping of filepath to FileSnapshot
   *
   * Note: Missing or unreadable files are skipped silently
   */
  async createSnapshot(
    filepaths: string[]
  ): Promise<Record<string, FileSnapshot>> {
    // Process all files in parallel
    const snapshotPromises = filepaths.map(async (filepath) => {
      try {
        // Get file metadata
        const stats = await fs.stat(filepath);

        // Skip if not a regular file
        if (!stats.isFile()) {
          return null;
        }

        const timestamp = stats.mtimeMs;
        const size = stats.size;

        // Compute SHA256 checksum
        const fileBuffer = await fs.readFile(filepath);
        const hash = createHash('sha256');
        hash.update(fileBuffer);
        const checksum = hash.digest('hex');

        // Create snapshot
        return {
          filepath,
          timestamp,
          checksum,
          size,
        };
      } catch (error) {
        // Log permission errors but continue with other files
        const nodeError = error as NodeJS.ErrnoException;
        if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
          console.warn(`Warning: Permission denied when reading ${filepath}`);
        }
        // Skip files we can't read (permission errors, non-existent files, etc.)
        return null;
      }
    });

    // Wait for all snapshot operations to complete
    const results = await Promise.all(snapshotPromises);

    // Convert array to record, filtering out null entries
    const snapshots: Record<string, FileSnapshot> = {};
    for (const snapshot of results) {
      if (snapshot !== null) {
        snapshots[snapshot.filepath] = snapshot;
      }
    }

    return snapshots;
  },

  /**
   * Detect which files have changed since snapshot was created.
   *
   * Files are considered changed if:
   * - Checksum differs (content modified)
   * - File no longer exists (deleted)
   *
   * Timestamp-only changes (same checksum) are NOT considered modifications.
   *
   * Checksums are recalculated in parallel for improved performance on large file sets.
   *
   * Note: Missing files and permission errors are both treated as changes
   * to trigger re-analysis. This matches Python implementation behavior.
   *
   * @param snapshot - File snapshots from createSnapshot()
   * @returns List of filepaths that have changed
   */
  async detectChanges(
    snapshot: Record<string, FileSnapshot>
  ): Promise<string[]> {
    // Check all files in parallel
    const changePromises = Object.entries(snapshot).map(
      async ([filepath, oldSnapshot]) => {
        try {
          // Check if file still exists
          await fs.access(filepath);

          // Recompute checksum
          const fileBuffer = await fs.readFile(filepath);
          const hash = createHash('sha256');
          hash.update(fileBuffer);
          const newChecksum = hash.digest('hex');

          // Compare checksums (timestamp changes alone don't count)
          if (newChecksum !== oldSnapshot.checksum) {
            return filepath;
          }
          return null;
        } catch (error) {
          const nodeError = error as NodeJS.ErrnoException;
          // Handle different error types explicitly (matches Python implementation)
          if (nodeError.code === 'ENOENT') {
            // File deleted - mark as changed
            return filepath;
          } else if (
            nodeError.code === 'EACCES' ||
            nodeError.code === 'EPERM'
          ) {
            // Permission denied - log warning and mark as changed
            console.warn(`Warning: Permission denied when reading ${filepath}`);
            return filepath;
          } else {
            // Other errors (OS errors, etc.) - mark as changed
            return filepath;
          }
        }
      }
    );

    // Wait for all change detection operations to complete
    const results = await Promise.all(changePromises);

    // Filter out null entries (unchanged files)
    return results.filter((filepath): filepath is string => filepath !== null);
  },

  /**
   * Filter items to only those whose files have changed.
   *
   * @param changedFiles - List of changed file paths from detectChanges()
   * @param items - List of CodeItem objects (or any objects with 'filepath' property)
   * @returns Items whose filepath is in changedFiles
   */
  getChangedItems<T extends CodeItem>(changedFiles: string[], items: T[]): T[] {
    const changedSet = new Set(changedFiles);
    return items.filter((item) => changedSet.has(item.filepath));
  },
};
