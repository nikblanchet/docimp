/**
 * Tests for AuditSessionState Zod schemas.
 *
 * Validates that the Zod schemas correctly parse valid data and reject invalid data.
 */

import {
  AuditConfigSchema,
  AuditSessionStateSchema,
  FileSnapshotSchema,
} from '../../types/audit-session-state';

describe('FileSnapshotSchema', () => {
  it('should validate valid file snapshot', () => {
    const validSnapshot = {
      filepath: 'src/example.ts',
      timestamp: 1699123456.789,
      checksum: 'abc123def456',
      size: 1024,
    };

    const result = FileSnapshotSchema.safeParse(validSnapshot);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validSnapshot);
    }
  });

  it('should reject file snapshot with invalid size', () => {
    const invalidSnapshot = {
      filepath: 'src/example.ts',
      timestamp: 1699123456.789,
      checksum: 'abc123def456',
      size: -100, // Negative size not allowed
    };

    const result = FileSnapshotSchema.safeParse(invalidSnapshot);
    expect(result.success).toBe(false);
  });

  it('should reject file snapshot with missing fields', () => {
    const invalidSnapshot = {
      filepath: 'src/example.ts',
      timestamp: 1699123456.789,
      // Missing checksum and size
    };

    const result = FileSnapshotSchema.safeParse(invalidSnapshot);
    expect(result.success).toBe(false);
  });
});

describe('AuditConfigSchema', () => {
  it('should validate valid audit config', () => {
    const validConfig = {
      showCodeMode: 'truncated',
      maxLines: 20,
    };

    const result = AuditConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.showCodeMode).toBe('truncated');
      expect(result.data.maxLines).toBe(20);
    }
  });

  it('should validate all show code modes', () => {
    const modes = ['complete', 'truncated', 'signature', 'on-demand'];

    for (const mode of modes) {
      const config = { showCodeMode: mode, maxLines: 30 };
      const result = AuditConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid show code mode', () => {
    const invalidConfig = {
      showCodeMode: 'invalid-mode',
      maxLines: 20,
    };

    const result = AuditConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should reject non-positive maxLines', () => {
    const invalidConfig = {
      showCodeMode: 'complete',
      maxLines: 0,
    };

    const result = AuditConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});

describe('AuditSessionStateSchema', () => {
  const validSessionState = {
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    started_at: '2025-11-05T10:30:00.000Z',
    current_index: 5,
    total_items: 20,
    partial_ratings: {
      'src/file1.ts': {
        calculateScore: 3,
        formatOutput: null, // Skipped
      },
      'src/file2.ts': {
        parseData: 4,
      },
    },
    file_snapshot: {
      'src/file1.ts': {
        filepath: 'src/file1.ts',
        timestamp: 1699123456.789,
        checksum: 'abc123def456',
        size: 1024,
      },
      'src/file2.ts': {
        filepath: 'src/file2.ts',
        timestamp: 1699123457.89,
        checksum: 'def456ghi789',
        size: 2048,
      },
    },
    config: {
      showCodeMode: 'truncated',
      maxLines: 20,
    },
    completed_at: null,
  };

  it('should validate valid audit session state', () => {
    const result = AuditSessionStateSchema.safeParse(validSessionState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session_id).toBe(validSessionState.session_id);
      expect(result.data.current_index).toBe(5);
      expect(result.data.total_items).toBe(20);
    }
  });

  it('should reject invalid session_id (not UUID)', () => {
    const invalidState = {
      ...validSessionState,
      session_id: 'not-a-uuid',
    };

    const result = AuditSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should reject invalid partial_ratings structure', () => {
    const invalidState = {
      ...validSessionState,
      partial_ratings: {
        'src/file1.ts': {
          calculateScore: 5, // Rating > 4 not allowed
        },
      },
    };

    const result = AuditSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should validate session with completed_at timestamp', () => {
    const completedState = {
      ...validSessionState,
      completed_at: '2025-11-05T12:45:00.000Z',
    };

    const result = AuditSessionStateSchema.safeParse(completedState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completed_at).toBe('2025-11-05T12:45:00.000Z');
    }
  });

  it('should validate nested file_snapshot objects', () => {
    const result = AuditSessionStateSchema.safeParse(validSessionState);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.file_snapshot['src/file1.ts']).toBeDefined();
      expect(result.data.file_snapshot['src/file1.ts'].filepath).toBe(
        'src/file1.ts'
      );
      expect(result.data.file_snapshot['src/file1.ts'].checksum).toBe(
        'abc123def456'
      );

      expect(result.data.file_snapshot['src/file2.ts']).toBeDefined();
      expect(result.data.file_snapshot['src/file2.ts'].filepath).toBe(
        'src/file2.ts'
      );
    }
  });

  it('should validate config object within session state', () => {
    const result = AuditSessionStateSchema.safeParse(validSessionState);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.config.showCodeMode).toBe('truncated');
      expect(result.data.config.maxLines).toBe(20);
    }
  });

  it('should allow extra fields with passthrough', () => {
    const stateWithExtraFields = {
      ...validSessionState,
      extraField: 'this should be allowed',
      anotherExtra: 123,
    };

    const result = AuditSessionStateSchema.safeParse(stateWithExtraFields);
    expect(result.success).toBe(true);
  });

  it('should reject negative current_index', () => {
    const invalidState = {
      ...validSessionState,
      current_index: -1,
    };

    const result = AuditSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should reject zero or negative total_items', () => {
    const invalidState = {
      ...validSessionState,
      total_items: 0,
    };

    const result = AuditSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });
});
