/**
 * ShortUUID utilities for DocImp session and transaction IDs.
 *
 * Generates concise, URL-safe UUIDs using base57 encoding (excludes ambiguous
 * characters: 0, 1, I, O, l). Produces 22-character strings from UUID4.
 *
 * Display formatting inserts hyphens every 4 characters from the right for
 * improved readability (e.g., `vytx-eTZs-kVKR`).
 *
 * IMPORTANT: This implementation must produce byte-for-byte identical output
 * to the Python shortuuid module for cross-language compatibility.
 *
 * Based on shortuuid library (https://github.com/skorokithakis/shortuuid).
 */

import { randomUUID } from 'node:crypto';

/** Base57 alphabet - excludes similar-looking characters (0, 1, I, O, l) */
export const DEFAULT_ALPHABET =
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Pre-computed values for default alphabet */
const ALPHABET_LIST = [...DEFAULT_ALPHABET];
const ALPHABET_SET = new Set(DEFAULT_ALPHABET);
const ENCODED_LENGTH = 22; // ceil(log(2^128) / log(57))

/**
 * Convert a BigInt to a string using the given alphabet.
 *
 * The output has the most significant digit first.
 *
 * @param number - Non-negative BigInt to convert.
 * @param alphabet - Array of characters to use as digits.
 * @param padding - Minimum output length (pads with first alphabet char).
 * @returns Encoded string representation.
 */
function intToString(
  number: bigint,
  alphabet: string[],
  padding?: number
): string {
  const alphabetLength = BigInt(alphabet.length);
  const digits: string[] = [];

  while (number > 0n) {
    const remainder = number % alphabetLength;
    number = number / alphabetLength;
    digits.push(alphabet[Number(remainder)]);
  }

  if (padding) {
    const remainderCount = Math.max(padding - digits.length, 0);
    for (let i = 0; i < remainderCount; i++) {
      digits.push(alphabet[0]);
    }
  }

  digits.reverse();
  return digits.join('');
}

/**
 * Convert a string to a BigInt using the given alphabet.
 *
 * The input is assumed to have the most significant digit first.
 *
 * @param encoded - Encoded string to convert.
 * @param alphabet - Array of characters used as digits.
 * @returns Decoded BigInt value.
 * @throws Error if string contains characters not in alphabet.
 */
function stringToInt(encoded: string, alphabet: string[]): bigint {
  const alphabetLength = BigInt(alphabet.length);
  let number = 0n;

  for (const char of encoded) {
    const index = alphabet.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid character '${char}' not in alphabet`);
    }
    number = number * alphabetLength + BigInt(index);
  }

  return number;
}

/**
 * Convert a UUID string to a BigInt.
 *
 * @param uuid - UUID string in standard format (with or without hyphens).
 * @returns BigInt representation of the UUID.
 */
function uuidToInt(uuid: string): bigint {
  const hex = uuid.replaceAll('-', '');
  return BigInt('0x' + hex);
}

/**
 * Convert a BigInt to a UUID string.
 *
 * @param value - BigInt representation of a UUID (0 to 2^128 - 1).
 * @returns UUID string in standard format with hyphens.
 */
function intToUuid(value: bigint): string {
  const hex = value.toString(16).padStart(32, '0');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Generate a new short UUID from a random UUID4.
 *
 * @returns 22-character base57-encoded string.
 */
export function generate(): string {
  const uuid = randomUUID();
  return encode(uuid);
}

/**
 * Encode a UUID string to a short UUID string.
 *
 * @param uuid - Standard UUID string (36 chars with hyphens).
 * @returns 22-character base57-encoded string.
 */
export function encode(uuid: string): string {
  const value = uuidToInt(uuid);
  return intToString(value, ALPHABET_LIST, ENCODED_LENGTH);
}

/**
 * Decode a short UUID string back to a standard UUID string.
 *
 * Automatically strips hyphens before processing.
 *
 * @param shortUuid - Base57-encoded string (hyphens are stripped).
 * @returns Standard UUID string (36 chars with hyphens).
 * @throws Error if string contains invalid characters or has wrong length.
 */
export function decode(shortUuid: string): string {
  const cleaned = stripHyphens(shortUuid);
  if (cleaned.length !== ENCODED_LENGTH) {
    throw new Error(
      `Invalid short UUID length: ${cleaned.length} (expected ${ENCODED_LENGTH})`
    );
  }
  const value = stringToInt(cleaned, ALPHABET_LIST);
  return intToUuid(value);
}

/**
 * Format short UUID for display with hyphens every 4 chars from right.
 *
 * @param shortUuid - Raw short UUID string (22 chars) or hyphenated format.
 * @param options - Optional configuration.
 * @param options.truncate - Truncation length (e.g., 8 or 12). If provided,
 * takes first N characters before adding hyphens.
 * @returns Formatted string with hyphens inserted every 4 characters from right.
 *
 * @example
 * formatDisplay('vytxeTZskVKR7C7WgdSP3d')
 * // Returns: 'vy-txeT-ZskV-KR7C-7Wgd-SP3d'
 *
 * formatDisplay('vytxeTZskVKR7C7WgdSP3d', { truncate: 8 })
 * // Returns: 'vytx-eTZs'
 *
 * formatDisplay('vytxeTZskVKR7C7WgdSP3d', { truncate: 12 })
 * // Returns: 'vytx-eTZs-kVKR'
 */
export function formatDisplay(
  shortUuid: string,
  options?: { truncate?: number }
): string {
  // Strip any existing hyphens first
  let cleaned = stripHyphens(shortUuid);

  // Apply truncation if requested
  if (options?.truncate !== undefined) {
    cleaned = cleaned.slice(0, options.truncate);
  }

  // Insert hyphens every 4 characters from the right
  if (cleaned.length <= 4) {
    return cleaned;
  }

  const result: string[] = [];
  const remainder = cleaned.length % 4;

  if (remainder > 0) {
    result.push(cleaned.slice(0, remainder));
  }

  for (let i = remainder; i < cleaned.length; i += 4) {
    result.push(cleaned.slice(i, i + 4));
  }

  return result.join('-');
}

/**
 * Strip all hyphens from a formatted short UUID.
 *
 * @param formatted - Short UUID string, possibly with hyphens.
 * @returns String with all hyphens removed.
 */
export function stripHyphens(formatted: string): string {
  return formatted.replaceAll('-', '');
}

/**
 * Check if a string is a valid short UUID (hyphens allowed).
 *
 * Validates that after stripping hyphens:
 * - Length is exactly 22 characters
 * - All characters are in the base57 alphabet
 *
 * @param value - String to validate.
 * @returns True if valid short UUID format, false otherwise.
 */
export function isValid(value: string): boolean {
  const cleaned = stripHyphens(value);
  if (cleaned.length !== ENCODED_LENGTH) {
    return false;
  }
  return [...cleaned].every((char) => ALPHABET_SET.has(char));
}

/**
 * Return the alphabet used for encoding.
 *
 * @returns 57-character string of allowed characters.
 */
export function getAlphabet(): string {
  return DEFAULT_ALPHABET;
}
