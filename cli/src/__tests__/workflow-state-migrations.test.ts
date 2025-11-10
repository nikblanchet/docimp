/**
 * Tests for workflow state migration framework.
 *
 * Covers migration path building, migration application, legacy file handling,
 * and migration log tracking.
 */

import {
  applyMigrations,
  buildMigrationPath,
  CURRENT_WORKFLOW_STATE_VERSION,
  isVersionSupported,
  KNOWN_VERSIONS,
  type MigrationFunction,
  type MigrationLogEntry,
  WORKFLOW_STATE_MIGRATIONS,
} from '../types/workflow-state-migrations.js';

describe('buildMigrationPath', () => {
  test('returns empty array when fromVersion equals toVersion', () => {
    const path = buildMigrationPath('1.0', '1.0');
    expect(path).toEqual([]);
  });

  test('returns single-step path for adjacent versions', () => {
    // Mock KNOWN_VERSIONS temporarily
    const originalVersions = [...KNOWN_VERSIONS];
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push('1.0', '1.1');

    // Mock migration registry
    const originalMigrations = { ...WORKFLOW_STATE_MIGRATIONS };
    WORKFLOW_STATE_MIGRATIONS['1.0->1.1'] = (data) => data;

    const path = buildMigrationPath('1.0', '1.1');
    expect(path).toEqual(['1.0->1.1']);

    // Restore
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push(...originalVersions);
    Object.keys(WORKFLOW_STATE_MIGRATIONS).forEach((key) => {
      delete WORKFLOW_STATE_MIGRATIONS[key];
    });
    Object.assign(WORKFLOW_STATE_MIGRATIONS, originalMigrations);
  });

  test('returns multi-step path for non-adjacent versions', () => {
    // Mock KNOWN_VERSIONS temporarily
    const originalVersions = [...KNOWN_VERSIONS];
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push('1.0', '1.1', '1.2', '1.3');

    // Mock migration registry
    const originalMigrations = { ...WORKFLOW_STATE_MIGRATIONS };
    WORKFLOW_STATE_MIGRATIONS['1.0->1.1'] = (data) => data;
    WORKFLOW_STATE_MIGRATIONS['1.1->1.2'] = (data) => data;
    WORKFLOW_STATE_MIGRATIONS['1.2->1.3'] = (data) => data;

    const path = buildMigrationPath('1.0', '1.3');
    expect(path).toEqual(['1.0->1.1', '1.1->1.2', '1.2->1.3']);

    // Restore
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push(...originalVersions);
    Object.keys(WORKFLOW_STATE_MIGRATIONS).forEach((key) => {
      delete WORKFLOW_STATE_MIGRATIONS[key];
    });
    Object.assign(WORKFLOW_STATE_MIGRATIONS, originalMigrations);
  });

  test('throws error for unknown source version', () => {
    expect(() => buildMigrationPath('2.0', '1.0')).toThrow(
      'Unknown source version: 2.0'
    );
  });

  test('throws error for unknown target version', () => {
    expect(() => buildMigrationPath('1.0', '3.0')).toThrow(
      'Unknown target version: 3.0'
    );
  });

  test('throws error for backwards migration', () => {
    // Mock KNOWN_VERSIONS temporarily
    const originalVersions = [...KNOWN_VERSIONS];
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push('1.0', '1.1');

    expect(() => buildMigrationPath('1.1', '1.0')).toThrow(
      'Cannot migrate backwards from 1.1 to 1.0'
    );

    // Restore
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push(...originalVersions);
  });
});

describe('applyMigrations', () => {
  test('returns data unchanged when already at target version', () => {
    const data = {
      schema_version: '1.0',
      last_analyze: null,
      last_audit: null,
      last_plan: null,
      last_improve: null,
    };

    const result = applyMigrations(data, '1.0');

    expect(result).toEqual(data);
  });

  test('migrates legacy file and adds migration_log', () => {
    const data = {
      last_analyze: null,
      last_audit: null,
      last_plan: null,
      last_improve: null,
    };

    const result = applyMigrations(data) as {
      schema_version: string;
      migration_log: MigrationLogEntry[];
      [key: string]: unknown;
    };

    expect(result.schema_version).toBe('1.0');
    expect(result.migration_log).toBeDefined();
    expect(result.migration_log.length).toBe(1);
    expect(result.migration_log[0].from).toBe('legacy');
    expect(result.migration_log[0].to).toBe('1.0');
    expect(result.migration_log[0].timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  });

  test('applies single migration and updates migration_log', () => {
    // Mock KNOWN_VERSIONS temporarily
    const originalVersions = [...KNOWN_VERSIONS];
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push('1.0', '1.1');

    // Mock migration function
    const originalMigrations = { ...WORKFLOW_STATE_MIGRATIONS };
    const mockMigration: MigrationFunction = (data) => {
      const dataObj = data as {
        schema_version: string;
        new_field?: string;
        [key: string]: unknown;
      };
      return {
        ...dataObj,
        schema_version: '1.1',
        new_field: 'added',
      };
    };
    WORKFLOW_STATE_MIGRATIONS['1.0->1.1'] = mockMigration;

    const data = {
      schema_version: '1.0',
      migration_log: [] as MigrationLogEntry[],
    };

    const result = applyMigrations(data, '1.1') as {
      schema_version: string;
      migration_log: MigrationLogEntry[];
      new_field: string;
      [key: string]: unknown;
    };

    expect(result.schema_version).toBe('1.1');
    expect(result.new_field).toBe('added');
    expect(result.migration_log.length).toBe(1);
    expect(result.migration_log[0].from).toBe('1.0');
    expect(result.migration_log[0].to).toBe('1.1');

    // Restore
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push(...originalVersions);
    Object.keys(WORKFLOW_STATE_MIGRATIONS).forEach((key) => {
      delete WORKFLOW_STATE_MIGRATIONS[key];
    });
    Object.assign(WORKFLOW_STATE_MIGRATIONS, originalMigrations);
  });

  test('initializes migration_log if not present', () => {
    // Mock KNOWN_VERSIONS temporarily
    const originalVersions = [...KNOWN_VERSIONS];
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push('1.0', '1.1');

    // Mock migration function
    const originalMigrations = { ...WORKFLOW_STATE_MIGRATIONS };
    const mockMigration: MigrationFunction = (data) => {
      const dataObj = data as {
        schema_version: string;
        [key: string]: unknown;
      };
      return {
        ...dataObj,
        schema_version: '1.1',
      };
    };
    WORKFLOW_STATE_MIGRATIONS['1.0->1.1'] = mockMigration;

    const data = {
      schema_version: '1.0',
      // No migration_log field
    };

    const result = applyMigrations(data, '1.1') as {
      schema_version: string;
      migration_log: MigrationLogEntry[];
      [key: string]: unknown;
    };

    expect(result.migration_log).toBeDefined();
    expect(Array.isArray(result.migration_log)).toBe(true);

    // Restore
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push(...originalVersions);
    Object.keys(WORKFLOW_STATE_MIGRATIONS).forEach((key) => {
      delete WORKFLOW_STATE_MIGRATIONS[key];
    });
    Object.assign(WORKFLOW_STATE_MIGRATIONS, originalMigrations);
  });

  test('throws error when migration function fails', () => {
    // Mock KNOWN_VERSIONS temporarily
    const originalVersions = [...KNOWN_VERSIONS];
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push('1.0', '1.1');

    // Mock migration function that throws
    const originalMigrations = { ...WORKFLOW_STATE_MIGRATIONS };
    const failingMigration: MigrationFunction = () => {
      throw new Error('Migration failed');
    };
    WORKFLOW_STATE_MIGRATIONS['1.0->1.1'] = failingMigration;

    const data = {
      schema_version: '1.0',
      migration_log: [] as MigrationLogEntry[],
    };

    expect(() => applyMigrations(data, '1.1')).toThrow(
      'Migration failed at step 1.0->1.1'
    );

    // Restore
    KNOWN_VERSIONS.length = 0;
    KNOWN_VERSIONS.push(...originalVersions);
    Object.keys(WORKFLOW_STATE_MIGRATIONS).forEach((key) => {
      delete WORKFLOW_STATE_MIGRATIONS[key];
    });
    Object.assign(WORKFLOW_STATE_MIGRATIONS, originalMigrations);
  });
});

describe('isVersionSupported', () => {
  test('returns true for known versions', () => {
    expect(isVersionSupported('1.0')).toBe(true);
  });

  test('returns true for legacy version', () => {
    expect(isVersionSupported('legacy')).toBe(true);
  });

  test('returns false for unknown versions', () => {
    expect(isVersionSupported('2.0')).toBe(false);
    expect(isVersionSupported('0.9')).toBe(false);
  });
});

describe('CURRENT_WORKFLOW_STATE_VERSION', () => {
  test('is set to 1.0', () => {
    expect(CURRENT_WORKFLOW_STATE_VERSION).toBe('1.0');
  });
});
