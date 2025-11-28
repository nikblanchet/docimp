/**
 * Unit tests for shortuuid module.
 *
 * Tests encode/decode functions, display formatting, and validation against
 * shared test vectors for cross-language compatibility verification.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  decode,
  DEFAULT_ALPHABET,
  encode,
  formatDisplay,
  generate,
  getAlphabet,
  isValid,
  stripHyphens,
} from '../../utils/shortuuid.js';

interface TestVectors {
  alphabet: string;
  encode_decode_vectors: Array<{
    comment: string;
    uuid: string;
    shortuuid: string;
  }>;
  format_display_vectors: Array<{
    input: string;
    full: string;
    truncate_8: string;
    truncate_12: string;
  }>;
  validation_vectors: Array<{
    input: string;
    valid: boolean;
    comment: string;
  }>;
}

function loadTestVectors(): TestVectors {
  const vectorsPath = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'test-fixtures',
    'shortuuid-vectors.json'
  );
  return JSON.parse(readFileSync(vectorsPath, 'utf-8'));
}

describe('shortuuid', () => {
  const testVectors = loadTestVectors();

  describe('encode/decode', () => {
    it('should roundtrip encode/decode correctly', () => {
      // Generate a random UUID and verify roundtrip
      const shortuuid = generate();
      const decoded = decode(shortuuid);
      const reEncoded = encode(decoded);
      expect(reEncoded).toBe(shortuuid);
    });

    it('should produce 22-character output', () => {
      for (let i = 0; i < 10; i++) {
        const encoded = generate();
        expect(encoded).toHaveLength(22);
      }
    });

    it('should only use valid alphabet characters', () => {
      for (let i = 0; i < 10; i++) {
        const encoded = generate();
        for (const char of encoded) {
          expect(DEFAULT_ALPHABET).toContain(char);
        }
      }
    });

    it('should match encode/decode test vectors', () => {
      for (const vector of testVectors.encode_decode_vectors) {
        // Test encode
        const encoded = encode(vector.uuid);
        expect(encoded).toBe(vector.shortuuid);

        // Test decode
        const decoded = decode(vector.shortuuid);
        expect(decoded).toBe(vector.uuid);
      }
    });

    it('should decode hyphenated input', () => {
      const uuidStr = '3b1f8b40-222c-4a6e-b77e-779d5a94e21c';
      const shortuuid = 'CXc85b4rqinB7s5J52TRYb';
      const hyphenated = 'CXc8-5b4r-qinB-7s5J-52TR-Yb';

      // Both should decode to same UUID
      expect(decode(shortuuid)).toBe(uuidStr);
      expect(decode(hyphenated)).toBe(uuidStr);
    });

    it('should throw on invalid length', () => {
      expect(() => decode('tooshort')).toThrow('Invalid short UUID length');
      expect(() => decode('waytoolongtobevalidshortuuid')).toThrow(
        'Invalid short UUID length'
      );
    });

    it('should throw on invalid character', () => {
      // Contains '0' which is not in alphabet
      expect(() => decode('CXc85b4rqinB7s5J52TR0b')).toThrow(
        'Invalid character'
      );
    });
  });

  describe('formatDisplay', () => {
    it('should format full shortuuid with hyphens', () => {
      for (const vector of testVectors.format_display_vectors) {
        expect(formatDisplay(vector.input)).toBe(vector.full);
      }
    });

    it('should format with truncate 8', () => {
      for (const vector of testVectors.format_display_vectors) {
        expect(formatDisplay(vector.input, { truncate: 8 })).toBe(
          vector.truncate_8
        );
      }
    });

    it('should format with truncate 12', () => {
      for (const vector of testVectors.format_display_vectors) {
        expect(formatDisplay(vector.input, { truncate: 12 })).toBe(
          vector.truncate_12
        );
      }
    });

    it('should strip existing hyphens before formatting', () => {
      const hyphenated = 'CXc8-5b4r-qinB';
      expect(formatDisplay(hyphenated, { truncate: 8 })).toBe('CXc8-5b4r');
    });

    it('should handle input shorter than 4 chars', () => {
      expect(formatDisplay('abc')).toBe('abc');
      expect(formatDisplay('ab')).toBe('ab');
      expect(formatDisplay('a')).toBe('a');
    });

    it('should handle exactly 4 chars without hyphen', () => {
      expect(formatDisplay('abcd')).toBe('abcd');
    });
  });

  describe('isValid', () => {
    it('should accept valid shortuuids', () => {
      for (const vector of testVectors.validation_vectors) {
        if (vector.valid) {
          expect(isValid(vector.input)).toBe(true);
        }
      }
    });

    it('should reject invalid shortuuids', () => {
      for (const vector of testVectors.validation_vectors) {
        if (!vector.valid) {
          expect(isValid(vector.input)).toBe(false);
        }
      }
    });

    it('should validate generated shortuuids', () => {
      for (let i = 0; i < 10; i++) {
        const shortuuid = generate();
        expect(isValid(shortuuid)).toBe(true);
      }
    });
  });

  describe('stripHyphens', () => {
    it('should remove all hyphens', () => {
      expect(stripHyphens('CXc8-5b4r-qinB')).toBe('CXc85b4rqinB');
      expect(stripHyphens('no-hyphens')).toBe('nohyphens');
      expect(stripHyphens('nohyphens')).toBe('nohyphens');
      expect(stripHyphens('')).toBe('');
    });
  });

  describe('getAlphabet', () => {
    it('should return expected alphabet', () => {
      const alphabet = getAlphabet();
      expect(alphabet).toBe(DEFAULT_ALPHABET);
      expect(alphabet).toHaveLength(57);
    });

    it('should exclude ambiguous characters', () => {
      const alphabet = getAlphabet();
      const excluded = '01IOl';
      for (const char of excluded) {
        expect(alphabet).not.toContain(char);
      }
    });
  });

  describe('generate', () => {
    it('should produce unique values', () => {
      const generated = new Set<string>();
      for (let i = 0; i < 100; i++) {
        generated.add(generate());
      }
      expect(generated.size).toBe(100);
    });

    it('should produce valid 22-char strings', () => {
      for (let i = 0; i < 10; i++) {
        const shortuuid = generate();
        expect(shortuuid).toHaveLength(22);
        expect(isValid(shortuuid)).toBe(true);
      }
    });
  });

  describe('cross-language compatibility', () => {
    it('should use matching alphabet', () => {
      expect(getAlphabet()).toBe(testVectors.alphabet);
    });

    it('should produce deterministic encoding', () => {
      // Verify that encoding is deterministic by checking all test vectors
      for (const vector of testVectors.encode_decode_vectors) {
        const encoded = encode(vector.uuid);
        expect(encoded).toBe(vector.shortuuid);
      }
    });
  });
});
