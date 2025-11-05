/**
 * Session state manager for audit and improve sessions.
 *
 * Provides atomic save/load operations for session state with file-based persistence.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StateManager } from './state-manager.js';

export interface SessionState {
  session_id: string;
  [key: string]: unknown;
}

/**
 * Manages session state persistence with atomic write operations.
 */
export const SessionStateManager = {
  /**
   * Save session state to JSON file with atomic write.
   *
   * Uses temp file + rename pattern to prevent corruption on crash or interrupt.
   *
   * @param state - Session state object (must include 'session_id' field)
   * @param sessionType - Type of session ('audit' or 'improve')
   * @returns Session ID
   * @throws {Error} If sessionType is invalid or state missing session_id
   */
  async saveSessionState(
    state: SessionState,
    sessionType: 'audit' | 'improve'
  ): Promise<string> {
    if (sessionType !== 'audit' && sessionType !== 'improve') {
      throw new Error(
        `Invalid session_type '${sessionType}'. Must be 'audit' or 'improve'`
      );
    }

    const sessionId = state.session_id;
    if (!sessionId) {
      throw new Error("Session state must include 'session_id' field");
    }

    // Ensure session reports directory exists
    StateManager.ensureStateDir();

    // Determine target file path
    const sessionReportsDirectory = StateManager.getSessionReportsDir();
    const filename = `${sessionType}-session-${sessionId}.json`;
    const targetPath = path.join(sessionReportsDirectory, filename);

    // Atomic write: write to temp file, then rename
    const temporaryPath = path.join(sessionReportsDirectory, `${filename}.tmp`);

    try {
      // Write to temp file
      const jsonContent = JSON.stringify(state, null, 2);
      await fs.writeFile(temporaryPath, jsonContent, 'utf8');

      // Atomic rename
      await fs.rename(temporaryPath, targetPath);

      return sessionId;
    } catch (error) {
      // Clean up temp file if it exists
      try {
        await fs.unlink(temporaryPath);
      } catch {
        // Ignore if temp file doesn't exist
      }
      throw error;
    }
  },

  /**
   * Load session state from JSON file.
   *
   * @param sessionId - Session ID (UUID string)
   * @param sessionType - Type of session ('audit' or 'improve')
   * @returns Session state
   * @throws {Error} If sessionType is invalid
   * @throws {Error} If session file doesn't exist (ENOENT)
   * @throws {SyntaxError} If file contains invalid JSON
   */
  async loadSessionState(
    sessionId: string,
    sessionType: 'audit' | 'improve'
  ): Promise<SessionState> {
    if (sessionType !== 'audit' && sessionType !== 'improve') {
      throw new Error(
        `Invalid session_type '${sessionType}'. Must be 'audit' or 'improve'`
      );
    }

    const sessionReportsDirectory = StateManager.getSessionReportsDir();
    const filename = `${sessionType}-session-${sessionId}.json`;
    const filePath = path.join(sessionReportsDirectory, filename);

    try {
      const fileContent = await fs.readFile(filePath, 'utf8');
      return JSON.parse(fileContent) as SessionState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `Session file not found: ${filename}. Session may not exist or was deleted.`
        );
      }
      throw error;
    }
  },

  /**
   * List all sessions of given type, sorted by started_at descending.
   *
   * @param sessionType - Type of session ('audit' or 'improve')
   * @returns List of session state objects, newest first
   * @throws {Error} If sessionType is invalid
   */
  async listSessions(
    sessionType: 'audit' | 'improve'
  ): Promise<SessionState[]> {
    if (sessionType !== 'audit' && sessionType !== 'improve') {
      throw new Error(
        `Invalid session_type '${sessionType}'. Must be 'audit' or 'improve'`
      );
    }

    const sessionReportsDirectory = StateManager.getSessionReportsDir();

    // Ensure directory exists
    try {
      await fs.access(sessionReportsDirectory);
    } catch {
      return [];
    }

    // Find all session files matching pattern
    const pattern = `${sessionType}-session-`;
    const files = await fs.readdir(sessionReportsDirectory);
    const sessionFiles = files.filter(
      (file) => file.startsWith(pattern) && file.endsWith('.json')
    );

    // Load and parse all sessions
    const sessions: SessionState[] = [];
    for (const file of sessionFiles) {
      try {
        const filePath = path.join(sessionReportsDirectory, file);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const session = JSON.parse(fileContent) as SessionState;
        sessions.push(session);
      } catch {
        // Skip corrupted or unreadable files
        continue;
      }
    }

    // Sort by started_at descending (newest first)
    sessions.sort((a, b) => {
      const aStartedAt = (a.started_at as string) || '';
      const bStartedAt = (b.started_at as string) || '';
      return bStartedAt.localeCompare(aStartedAt);
    });

    return sessions;
  },

  /**
   * Delete session state file.
   *
   * @param sessionId - Session ID (UUID string)
   * @param sessionType - Type of session ('audit' or 'improve')
   * @throws {Error} If sessionType is invalid
   *
   * Note: Does not throw error if file doesn't exist (idempotent operation)
   */
  async deleteSessionState(
    sessionId: string,
    sessionType: 'audit' | 'improve'
  ): Promise<void> {
    if (sessionType !== 'audit' && sessionType !== 'improve') {
      throw new Error(
        `Invalid session_type '${sessionType}'. Must be 'audit' or 'improve'`
      );
    }

    const sessionReportsDirectory = StateManager.getSessionReportsDir();
    const filename = `${sessionType}-session-${sessionId}.json`;
    const filePath = path.join(sessionReportsDirectory, filename);

    // Idempotent: no error if file doesn't exist
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // Ignore ENOENT - file already deleted
    }
  },

  /**
   * Get the most recent session (by started_at timestamp).
   *
   * @param sessionType - Type of session ('audit' or 'improve')
   * @returns Latest session state, or null if no sessions exist
   * @throws {Error} If sessionType is invalid
   */
  async getLatestSession(
    sessionType: 'audit' | 'improve'
  ): Promise<SessionState | null> {
    const sessions = await this.listSessions(sessionType);
    return sessions.length > 0 ? sessions[0] : null;
  },
};
