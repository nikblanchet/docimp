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
   * @param filepaths - List of file paths to snapshot
   * @returns Mapping of filepath to FileSnapshot
   *
   * Note: Missing or unreadable files are skipped silently
   */
  async createSnapshot(
    filepaths: string[]
  ): Promise<Record<string, FileSnapshot>> {
    const snapshots: Record<string, FileSnapshot> = {};

    for (const filepath of filepaths) {
      try {
        // Get file metadata
        const stats = await fs.stat(filepath);

        // Skip if not a regular file
        if (!stats.isFile()) {
          continue;
        }

        const timestamp = stats.mtimeMs;
        const size = stats.size;

        // Compute SHA256 checksum
        const fileBuffer = await fs.readFile(filepath);
        const hash = createHash('sha256');
        hash.update(fileBuffer);
        const checksum = hash.digest('hex');

        // Create snapshot
        snapshots[filepath] = {
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
        continue;
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
   * @param snapshot - File snapshots from createSnapshot()
   * @returns List of filepaths that have changed
   */
  async detectChanges(
    snapshot: Record<string, FileSnapshot>
  ): Promise<string[]> {
    const changedFiles: string[] = [];

    for (const [filepath, oldSnapshot] of Object.entries(snapshot)) {
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
          changedFiles.push(filepath);
        }
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException;
        // File deleted or can't read - consider it changed
        if (nodeError.code === 'ENOENT') {
          changedFiles.push(filepath);
        } else if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
          // Log permission errors
          console.warn(`Warning: Permission denied when reading ${filepath}`);
          changedFiles.push(filepath);
        } else {
          // Can't read file for other reasons - consider it changed
          changedFiles.push(filepath);
        }
      }
    }

    return changedFiles;
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
