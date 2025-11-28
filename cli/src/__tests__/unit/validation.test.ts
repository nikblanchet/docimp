/**
 * Unit tests for validation utilities.
 *
 * Tests UUID validation, shortuuid validation, and session ID utilities
 * including format detection, normalization, and display formatting.
 */

import {
  detectSessionIdFormat,
  formatSessionIdForDisplay,
  isValidSessionId,
  isValidShortUuid,
  isValidUuid,
  normalizeSessionId,
} from '../../utils/validation.js';

describe('isValidUuid', () => {
  describe('valid UUIDs', () => {
    it('should accept UUID v4 format', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should accept UUID v1 format', () => {
      expect(isValidUuid('550e8400-e29b-11d4-a716-446655440000')).toBe(true);
    });

    it('should accept uppercase UUIDs', () => {
      expect(isValidUuid('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('should accept mixed case UUIDs', () => {
      expect(isValidUuid('550e8400-E29B-41d4-A716-446655440000')).toBe(true);
    });

    it('should accept generated test UUIDs', () => {
      expect(isValidUuid('00000000-0000-4000-8000-000000000001')).toBe(true);
      expect(isValidUuid('11111111-1111-4111-8111-111111111111')).toBe(true);
    });
  });

  describe('invalid UUIDs', () => {
    it('should reject empty string', () => {
      expect(isValidUuid('')).toBe(false);
    });

    it('should reject simple strings', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('test-session-123')).toBe(false);
    });

    it('should reject UUIDs with wrong length', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // Too short
      expect(isValidUuid('550e8400-e29b-41d4-a716-4466554400000')).toBe(false); // Too long
    });

    it('should reject UUIDs with invalid version', () => {
      // Version must be 1-5 (first char of 3rd group)
      expect(isValidUuid('550e8400-e29b-01d4-a716-446655440000')).toBe(false); // Version 0
      expect(isValidUuid('550e8400-e29b-61d4-a716-446655440000')).toBe(false); // Version 6
      expect(isValidUuid('550e8400-e29b-a1d4-a716-446655440000')).toBe(false); // Version a
    });

    it('should reject UUIDs with invalid variant', () => {
      // Variant must be 8, 9, a, or b (first char of 4th group)
      expect(isValidUuid('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
      expect(isValidUuid('550e8400-e29b-41d4-7716-446655440000')).toBe(false);
      expect(isValidUuid('550e8400-e29b-41d4-c716-446655440000')).toBe(false);
    });

    it('should reject UUIDs with invalid characters', () => {
      expect(isValidUuid('550g8400-e29b-41d4-a716-446655440000')).toBe(false);
      expect(isValidUuid('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
    });

    it('should reject UUIDs without hyphens', () => {
      expect(isValidUuid('550e8400e29b41d4a716446655440000')).toBe(false);
    });

    it('should reject special keyword "last"', () => {
      // "last" is a special keyword handled separately, not a valid UUID
      expect(isValidUuid('last')).toBe(false);
    });
  });
});

describe('isValidShortUuid', () => {
  describe('valid shortuuids', () => {
    it('should accept valid 22-character shortuuids', () => {
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TRYb')).toBe(true);
      expect(isValidShortUuid('vytxeTZskVKR7C7WgdSP3d')).toBe(true);
    });

    it('should accept shortuuids with hyphens', () => {
      expect(isValidShortUuid('CXc8-5b4r-qinB-7s5J-52TR-Yb')).toBe(true);
      expect(isValidShortUuid('vy-txeT-ZskV-KR7C-7Wgd-SP3d')).toBe(true);
    });

    it('should accept zero UUID encoding', () => {
      // UUID 00000000-0000-0000-0000-000000000000 encodes to all 2s
      expect(isValidShortUuid('2222222222222222222222')).toBe(true);
    });
  });

  describe('invalid shortuuids', () => {
    it('should reject strings that are too short', () => {
      expect(isValidShortUuid('tooshort')).toBe(false);
      expect(isValidShortUuid('CXc85b4rqinB')).toBe(false);
    });

    it('should reject strings that are too long', () => {
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TRYbX')).toBe(false);
    });

    it('should reject strings with invalid characters', () => {
      // '0' is not in base57 alphabet
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TR0b')).toBe(false);
      // '1' is not in base57 alphabet
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TR1b')).toBe(false);
      // 'I' is not in base57 alphabet
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TRIb')).toBe(false);
      // 'O' is not in base57 alphabet
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TROb')).toBe(false);
      // 'l' is not in base57 alphabet
      expect(isValidShortUuid('CXc85b4rqinB7s5J52TRlb')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidShortUuid('')).toBe(false);
    });
  });
});

describe('isValidSessionId', () => {
  describe('valid session IDs', () => {
    it('should accept standard UUIDs', () => {
      expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(
        true
      );
      expect(isValidSessionId('00000000-0000-4000-8000-000000000001')).toBe(
        true
      );
    });

    it('should accept shortuuids', () => {
      expect(isValidSessionId('CXc85b4rqinB7s5J52TRYb')).toBe(true);
      expect(isValidSessionId('vytxeTZskVKR7C7WgdSP3d')).toBe(true);
    });

    it('should accept hyphenated shortuuids', () => {
      expect(isValidSessionId('CXc8-5b4r-qinB-7s5J-52TR-Yb')).toBe(true);
    });
  });

  describe('invalid session IDs', () => {
    it('should reject invalid formats', () => {
      expect(isValidSessionId('invalid-session')).toBe(false);
      expect(isValidSessionId('not-valid')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidSessionId('')).toBe(false);
    });

    it('should reject strings that are neither UUID nor shortuuid', () => {
      expect(isValidSessionId('12345')).toBe(false);
      expect(isValidSessionId('abcdefghijklmnopqrstuvwxyz')).toBe(false);
    });
  });
});

describe('detectSessionIdFormat', () => {
  it('should detect UUID format', () => {
    expect(detectSessionIdFormat('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'uuid'
    );
    expect(detectSessionIdFormat('00000000-0000-4000-8000-000000000001')).toBe(
      'uuid'
    );
  });

  it('should detect shortuuid format', () => {
    expect(detectSessionIdFormat('CXc85b4rqinB7s5J52TRYb')).toBe('shortuuid');
    expect(detectSessionIdFormat('vytxeTZskVKR7C7WgdSP3d')).toBe('shortuuid');
  });

  it('should detect shortuuid with hyphens', () => {
    expect(detectSessionIdFormat('CXc8-5b4r-qinB-7s5J-52TR-Yb')).toBe(
      'shortuuid'
    );
  });

  it('should return invalid for bad input', () => {
    expect(detectSessionIdFormat('invalid-session')).toBe('invalid');
    expect(detectSessionIdFormat('')).toBe('invalid');
    expect(detectSessionIdFormat('12345')).toBe('invalid');
  });
});

describe('normalizeSessionId', () => {
  it('should preserve UUIDs unchanged', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    expect(normalizeSessionId(uuid)).toBe(uuid);
  });

  it('should preserve shortuuids without hyphens', () => {
    const shortuuid = 'CXc85b4rqinB7s5J52TRYb';
    expect(normalizeSessionId(shortuuid)).toBe(shortuuid);
  });

  it('should strip hyphens from hyphenated shortuuids', () => {
    expect(normalizeSessionId('CXc8-5b4r-qinB-7s5J-52TR-Yb')).toBe(
      'CXc85b4rqinB7s5J52TRYb'
    );
    expect(normalizeSessionId('vy-txeT-ZskV-KR7C-7Wgd-SP3d')).toBe(
      'vytxeTZskVKR7C7WgdSP3d'
    );
  });
});

describe('formatSessionIdForDisplay', () => {
  describe('UUID formatting', () => {
    it('should truncate UUIDs without adding hyphens', () => {
      expect(
        formatSessionIdForDisplay('550e8400-e29b-41d4-a716-446655440000', 8)
      ).toBe('550e8400');
      expect(
        formatSessionIdForDisplay('550e8400-e29b-41d4-a716-446655440000', 12)
      ).toBe('550e8400-e29');
    });
  });

  describe('shortuuid formatting', () => {
    it('should format shortuuids with truncation and hyphens', () => {
      expect(formatSessionIdForDisplay('CXc85b4rqinB7s5J52TRYb', 8)).toBe(
        'CXc8-5b4r'
      );
      expect(formatSessionIdForDisplay('vytxeTZskVKR7C7WgdSP3d', 8)).toBe(
        'vytx-eTZs'
      );
    });

    it('should format with truncate 12', () => {
      expect(formatSessionIdForDisplay('CXc85b4rqinB7s5J52TRYb', 12)).toBe(
        'CXc8-5b4r-qinB'
      );
    });

    it('should handle already-hyphenated shortuuids', () => {
      expect(formatSessionIdForDisplay('CXc8-5b4r-qinB-7s5J-52TR-Yb', 8)).toBe(
        'CXc8-5b4r'
      );
    });

    it('should format full shortuuid without truncation', () => {
      // When truncate >= 22, shows full formatted output
      expect(formatSessionIdForDisplay('CXc85b4rqinB7s5J52TRYb', 22)).toBe(
        'CX-c85b-4rqi-nB7s-5J52-TRYb'
      );
    });
  });
});
