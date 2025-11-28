/**
 * Unit tests for validation utilities.
 */

import { isValidUuid } from '../../utils/validation.js';

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
