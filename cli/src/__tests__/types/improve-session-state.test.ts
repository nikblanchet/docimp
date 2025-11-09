/**
 * Tests for ImproveSessionState Zod schemas.
 *
 * Validates that the Zod schemas correctly parse valid data and reject invalid data.
 */

import {
  ImproveConfigSchema,
  ImproveSessionStateSchema,
  ImproveStatusRecordSchema,
} from '../../types/improve-session-state';

describe('ImproveStatusRecordSchema', () => {
  it('should validate valid status record with all fields', () => {
    const validRecord = {
      status: 'accepted',
      timestamp: '2025-11-05T10:30:00.000Z',
      suggestion: 'Calculate priority score based on complexity',
    };

    const result = ImproveStatusRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validRecord);
    }
  });

  it('should validate status record without optional suggestion', () => {
    const validRecord = {
      status: 'skipped',
      timestamp: '2025-11-05T10:31:00.000Z',
    };

    const result = ImproveStatusRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('skipped');
      expect(result.data.suggestion).toBeUndefined();
    }
  });

  it('should validate all status values', () => {
    const statuses = ['accepted', 'skipped', 'error'];

    for (const status of statuses) {
      const record = {
        status,
        timestamp: '2025-11-05T10:30:00.000Z',
      };
      const result = ImproveStatusRecordSchema.safeParse(record);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid status value', () => {
    const invalidRecord = {
      status: 'invalid-status',
      timestamp: '2025-11-05T10:30:00.000Z',
    };

    const result = ImproveStatusRecordSchema.safeParse(invalidRecord);
    expect(result.success).toBe(false);
  });

  it('should reject missing timestamp', () => {
    const invalidRecord = {
      status: 'accepted',
      // Missing timestamp
    };

    const result = ImproveStatusRecordSchema.safeParse(invalidRecord);
    expect(result.success).toBe(false);
  });
});

describe('ImproveConfigSchema', () => {
  it('should validate valid improve config', () => {
    const validConfig = {
      styleGuides: {
        python: 'google',
        typescript: 'tsdoc-typedoc',
      },
      tone: 'concise',
    };

    const result = ImproveConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.styleGuides.python).toBe('google');
      expect(result.data.tone).toBe('concise');
    }
  });

  it('should validate config with single language', () => {
    const validConfig = {
      styleGuides: {
        python: 'google',
      },
      tone: 'detailed',
    };

    const result = ImproveConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should validate config with multiple languages', () => {
    const validConfig = {
      styleGuides: {
        python: 'google',
        typescript: 'tsdoc-typedoc',
        javascript: 'jsdoc-vanilla',
      },
      tone: 'friendly',
    };

    const result = ImproveConfigSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
  });

  it('should reject missing tone', () => {
    const invalidConfig = {
      styleGuides: {
        python: 'google',
      },
      // Missing tone
    };

    const result = ImproveConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('should reject missing styleGuides', () => {
    const invalidConfig = {
      tone: 'concise',
      // Missing styleGuides
    };

    const result = ImproveConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });
});

describe('ImproveSessionStateSchema', () => {
  const validSessionState = {
    session_id: '550e8400-e29b-41d4-a716-446655440000',
    transaction_id: '660f9511-f39c-52e5-b827-557766551111',
    started_at: '2025-11-05T10:30:00.000Z',
    current_index: 5,
    total_items: 20,
    partial_improvements: {
      'src/file1.ts': {
        calculateScore: {
          status: 'accepted',
          timestamp: '2025-11-05T10:30:00.000Z',
          suggestion: 'Calculate priority score based on complexity',
        },
        formatOutput: {
          status: 'skipped',
          timestamp: '2025-11-05T10:31:00.000Z',
        },
      },
      'src/file2.ts': {
        parseData: {
          status: 'error',
          timestamp: '2025-11-05T10:32:00.000Z',
        },
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
      styleGuides: {
        python: 'google',
        typescript: 'tsdoc-typedoc',
      },
      tone: 'concise',
    },
    completed_at: null,
  };

  it('should validate valid improve session state', () => {
    const result = ImproveSessionStateSchema.safeParse(validSessionState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.session_id).toBe(validSessionState.session_id);
      expect(result.data.transaction_id).toBe(validSessionState.transaction_id);
      expect(result.data.current_index).toBe(5);
      expect(result.data.total_items).toBe(20);
    }
  });

  it('should reject invalid session_id (not UUID)', () => {
    const invalidState = {
      ...validSessionState,
      session_id: 'not-a-uuid',
    };

    const result = ImproveSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should reject invalid transaction_id (not UUID)', () => {
    const invalidState = {
      ...validSessionState,
      transaction_id: 'not-a-uuid',
    };

    const result = ImproveSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should validate session with completed_at timestamp', () => {
    const completedState = {
      ...validSessionState,
      completed_at: '2025-11-05T12:45:00.000Z',
    };

    const result = ImproveSessionStateSchema.safeParse(completedState);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completed_at).toBe('2025-11-05T12:45:00.000Z');
    }
  });

  it('should validate nested file_snapshot objects', () => {
    const result = ImproveSessionStateSchema.safeParse(validSessionState);
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
    const result = ImproveSessionStateSchema.safeParse(validSessionState);
    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.config.styleGuides.python).toBe('google');
      expect(result.data.config.tone).toBe('concise');
    }
  });

  it('should validate nested partial_improvements with status records', () => {
    const result = ImproveSessionStateSchema.safeParse(validSessionState);
    expect(result.success).toBe(true);

    if (result.success) {
      const calcScore =
        result.data.partial_improvements['src/file1.ts'].calculateScore;
      expect(calcScore).toBeDefined();
      expect(calcScore).toHaveProperty('status', 'accepted');
      expect(calcScore).toHaveProperty('timestamp');
      expect(calcScore).toHaveProperty('suggestion');

      const formatOut =
        result.data.partial_improvements['src/file1.ts'].formatOutput;
      expect(formatOut).toBeDefined();
      expect(formatOut).toHaveProperty('status', 'skipped');
    }
  });

  it('should validate partial_improvements with empty dict for unprocessed items', () => {
    const stateWithEmpty = {
      ...validSessionState,
      partial_improvements: {
        'src/file1.ts': {
          func1: {}, // Not yet processed
        },
      },
    };

    const result = ImproveSessionStateSchema.safeParse(stateWithEmpty);
    expect(result.success).toBe(true);
  });

  it('should allow extra fields with passthrough', () => {
    const stateWithExtraFields = {
      ...validSessionState,
      extraField: 'this should be allowed',
      anotherExtra: 123,
    };

    const result = ImproveSessionStateSchema.safeParse(stateWithExtraFields);
    expect(result.success).toBe(true);
  });

  it('should reject negative current_index', () => {
    const invalidState = {
      ...validSessionState,
      current_index: -1,
    };

    const result = ImproveSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should reject zero or negative total_items', () => {
    const invalidState = {
      ...validSessionState,
      total_items: 0,
    };

    const result = ImproveSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });

  it('should reject invalid status in partial_improvements', () => {
    const invalidState = {
      ...validSessionState,
      partial_improvements: {
        'src/file1.ts': {
          func1: {
            status: 'invalid-status',
            timestamp: '2025-11-05T10:30:00.000Z',
          },
        },
      },
    };

    const result = ImproveSessionStateSchema.safeParse(invalidState);
    expect(result.success).toBe(false);
  });
});
