/**
 * Unit tests for terminal width detection utilities.
 */

import {
  getTerminalWidth,
  shouldUseCompactMode,
  COMPACT_TABLE_CHARS,
  COMPACT_TABLE_STYLE,
} from '../../utils/terminalWidth.js';

describe('terminalWidth', () => {
  let originalColumns: number | undefined;

  beforeEach(() => {
    // Save original columns value
    originalColumns = process.stdout.columns;
  });

  afterEach(() => {
    // Restore original columns value
    if (originalColumns !== undefined) {
      process.stdout.columns = originalColumns;
    } else {
      // @ts-expect-error: Allow setting to undefined for restoration
      process.stdout.columns = undefined;
    }
  });

  describe('getTerminalWidth', () => {
    it('should return actual terminal width when columns is set', () => {
      process.stdout.columns = 120;
      expect(getTerminalWidth()).toBe(120);
    });

    it('should return 120 as default when columns is undefined', () => {
      // @ts-expect-error: Allow setting to undefined for testing
      process.stdout.columns = undefined;
      expect(getTerminalWidth()).toBe(120);
    });

    it('should handle various terminal widths correctly', () => {
      const testWidths = [60, 80, 100, 120, 160, 200];
      for (const width of testWidths) {
        process.stdout.columns = width;
        expect(getTerminalWidth()).toBe(width);
      }
    });

    it('should handle edge case of 0 columns', () => {
      process.stdout.columns = 0;
      // 0 is falsy, so should default to 120
      expect(getTerminalWidth()).toBe(120);
    });
  });

  describe('shouldUseCompactMode', () => {
    it('should return true for terminal width below 80', () => {
      process.stdout.columns = 60;
      expect(shouldUseCompactMode()).toBe(true);
    });

    it('should return false for terminal width at 80', () => {
      process.stdout.columns = 80;
      expect(shouldUseCompactMode()).toBe(false);
    });

    it('should return false for terminal width above 80', () => {
      process.stdout.columns = 120;
      expect(shouldUseCompactMode()).toBe(false);
    });

    it('should handle boundary condition at threshold - 1', () => {
      process.stdout.columns = 79;
      expect(shouldUseCompactMode()).toBe(true);
    });

    it('should handle boundary condition at threshold + 1', () => {
      process.stdout.columns = 81;
      expect(shouldUseCompactMode()).toBe(false);
    });

    it('should accept custom threshold', () => {
      process.stdout.columns = 100;
      expect(shouldUseCompactMode(120)).toBe(true);
      expect(shouldUseCompactMode(80)).toBe(false);
    });

    it('should use default of 120 for undefined columns', () => {
      // @ts-expect-error: Allow setting to undefined for testing
      process.stdout.columns = undefined;
      expect(shouldUseCompactMode()).toBe(false); // 120 >= 80
    });

    it('should handle very narrow terminals', () => {
      process.stdout.columns = 40;
      expect(shouldUseCompactMode()).toBe(true);
    });

    it('should handle very wide terminals', () => {
      process.stdout.columns = 200;
      expect(shouldUseCompactMode()).toBe(false);
    });
  });

  describe('COMPACT_TABLE_CHARS', () => {
    it('should have all border characters as empty strings', () => {
      expect(COMPACT_TABLE_CHARS.top).toBe('');
      expect(COMPACT_TABLE_CHARS['top-mid']).toBe('');
      expect(COMPACT_TABLE_CHARS['top-left']).toBe('');
      expect(COMPACT_TABLE_CHARS['top-right']).toBe('');
      expect(COMPACT_TABLE_CHARS.bottom).toBe('');
      expect(COMPACT_TABLE_CHARS['bottom-mid']).toBe('');
      expect(COMPACT_TABLE_CHARS['bottom-left']).toBe('');
      expect(COMPACT_TABLE_CHARS['bottom-right']).toBe('');
      expect(COMPACT_TABLE_CHARS.left).toBe('');
      expect(COMPACT_TABLE_CHARS['left-mid']).toBe('');
      expect(COMPACT_TABLE_CHARS.mid).toBe('');
      expect(COMPACT_TABLE_CHARS['mid-mid']).toBe('');
      expect(COMPACT_TABLE_CHARS.right).toBe('');
      expect(COMPACT_TABLE_CHARS['right-mid']).toBe('');
    });

    it('should have middle character as single space', () => {
      expect(COMPACT_TABLE_CHARS.middle).toBe(' ');
    });

    it('should be a const object', () => {
      // Verify it is read-only by checking TypeScript type constraint
      // (actual runtime test not possible, but structure test is)
      expect(typeof COMPACT_TABLE_CHARS).toBe('object');
      expect(Object.isFrozen(COMPACT_TABLE_CHARS)).toBe(false); // const doesn't freeze
    });
  });

  describe('COMPACT_TABLE_STYLE', () => {
    it('should have no left padding', () => {
      expect(COMPACT_TABLE_STYLE['padding-left']).toBe(0);
    });

    it('should have minimal right padding', () => {
      expect(COMPACT_TABLE_STYLE['padding-right']).toBe(1);
    });

    it('should have empty head style array', () => {
      expect(COMPACT_TABLE_STYLE.head).toEqual([]);
    });

    it('should be a const object', () => {
      expect(typeof COMPACT_TABLE_STYLE).toBe('object');
    });
  });
});
