/**
 * Schema migration framework for workflow-state.json.
 *
 * Provides migration registry, chain execution, and version-specific migration functions
 * to enable safe schema evolution without breaking existing workflow state files.
 */

// Current latest version (update when schema changes)
export const CURRENT_WORKFLOW_STATE_VERSION = '1.0';

// Type for migration functions
export type MigrationFunction = (data: unknown) => unknown;

// Type for migration log entries
export interface MigrationLogEntry {
  from: string;
  to: string;
  timestamp: string; // ISO 8601
}

// Migration registry: maps "from->to" transitions to migration functions
export const WORKFLOW_STATE_MIGRATIONS: Record<string, MigrationFunction> = {
  // Example for future v1.1:
  // '1.0->1.1': migrateV1_0ToV1_1,
};

// Known schema versions in order
export const KNOWN_VERSIONS = ['1.0']; // Add '1.1', '1.2', etc. as needed

/**
 * Build migration path from source to target version.
 *
 * @param fromVersion - Starting version
 * @param toVersion - Target version (default: CURRENT_WORKFLOW_STATE_VERSION)
 * @returns Array of migration keys (e.g., ['1.0->1.1', '1.1->1.2'])
 * @throws Error if versions are unknown or path doesn't exist
 */
export function buildMigrationPath(
  fromVersion: string,
  toVersion: string = CURRENT_WORKFLOW_STATE_VERSION
): string[] {
  if (fromVersion === toVersion) {
    return []; // No migration needed
  }

  const fromIndex = KNOWN_VERSIONS.indexOf(fromVersion);
  const toIndex = KNOWN_VERSIONS.indexOf(toVersion);

  if (fromIndex === -1) {
    throw new Error(
      `Unknown source version: ${fromVersion}. ` +
        `Known versions: ${KNOWN_VERSIONS.join(', ')}`
    );
  }

  if (toIndex === -1) {
    throw new Error(
      `Unknown target version: ${toVersion}. ` +
        `Known versions: ${KNOWN_VERSIONS.join(', ')}`
    );
  }

  if (fromIndex > toIndex) {
    throw new Error(
      `Cannot migrate backwards from ${fromVersion} to ${toVersion}. ` +
        `Downgrading schema versions is not supported.`
    );
  }

  const path: string[] = [];
  for (let i = fromIndex; i < toIndex; i++) {
    const key = `${KNOWN_VERSIONS[i]}->${KNOWN_VERSIONS[i + 1]}`;
    if (!WORKFLOW_STATE_MIGRATIONS[key]) {
      throw new Error(
        `Missing migration function for ${key}. ` +
          `This indicates a bug in the migration registry.`
      );
    }
    path.push(key);
  }

  return path;
}

/**
 * Apply migration chain to workflow state data.
 *
 * @param data - Raw workflow state data (parsed JSON)
 * @param toVersion - Target version (default: CURRENT_WORKFLOW_STATE_VERSION)
 * @returns Migrated data with migration_log updated
 * @throws Error if migration fails or validation fails
 */
export function applyMigrations(
  data: unknown,
  toVersion: string = CURRENT_WORKFLOW_STATE_VERSION
): unknown {
  const dataObject = data as {
    schema_version?: string;
    migration_log?: MigrationLogEntry[];
    [key: string]: unknown;
  };

  const fromVersion = dataObject.schema_version || 'legacy';

  // Handle legacy files (no schema_version field)
  if (fromVersion === 'legacy') {
    dataObject.schema_version = '1.0';
    dataObject.migration_log = dataObject.migration_log || [];
    dataObject.migration_log.push({
      from: 'legacy',
      to: '1.0',
      timestamp: new Date().toISOString(),
    });
    return dataObject;
  }

  // Build migration path
  const migrationPath = buildMigrationPath(fromVersion, toVersion);

  if (migrationPath.length === 0) {
    return dataObject; // Already at target version
  }

  // Initialize migration_log if not present
  if (!dataObject.migration_log) {
    dataObject.migration_log = [];
  }

  // Apply migrations sequentially
  let current: unknown = dataObject;
  for (const migrationKey of migrationPath) {
    const migrationFunction = WORKFLOW_STATE_MIGRATIONS[migrationKey];
    const [from, to] = migrationKey.split('->');

    try {
      current = migrationFunction(current);

      // Add migration log entry
      const currentObject = current as {
        migration_log?: MigrationLogEntry[];
        [key: string]: unknown;
      };
      if (currentObject.migration_log) {
        currentObject.migration_log.push({
          from,
          to,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      throw new Error(
        `Migration failed at step ${migrationKey}: ${error instanceof Error ? error.message : String(error)}\n` +
          `Backup your workflow-state.json and inspect the file manually.\n` +
          `If issue persists, delete the file and re-run 'docimp analyze'.`
      );
    }
  }

  return current;
}

/**
 * Check if a schema version is supported (known and has migration path).
 *
 * @param version - Schema version to check
 * @returns True if version is known and can be migrated to current
 */
export function isVersionSupported(version: string): boolean {
  return KNOWN_VERSIONS.includes(version) || version === 'legacy';
}

// Example migration function (for future v1.1):
// function migrateV1_0ToV1_1(data: unknown): unknown {
//   const dataObj = data as {
//     schema_version: string;
//     last_status?: unknown;
//     [key: string]: unknown;
//   };
//   return {
//     ...dataObj,
//     schema_version: '1.1',
//     last_status: null, // New field with default
//   };
// }
