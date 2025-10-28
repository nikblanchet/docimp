/**
 * Tests for ConfigValidator.
 *
 * Tests validation and merging logic in isolation (no file I/O).
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { validateAndMerge } from '../../config/ConfigValidator.js';
import type { IConfig } from '../../config/IConfig.js';

describe('ConfigValidator', () => {
  let consoleWarnSpy: jest.SpiedFunction<typeof console.warn>;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('validateAndMerge', () => {
    it('should return defaults when given empty config', () => {
      const config = validateAndMerge({});

      expect(config.styleGuides).toBeDefined();
      expect(config.styleGuides.python).toBe('google');
      expect(config.styleGuides.javascript).toBe('jsdoc-vanilla');
      expect(config.styleGuides.typescript).toBe('tsdoc-typedoc');
      expect(config.tone).toBe('concise');
      expect(config.jsdocStyle).toBeDefined();
      expect(config.impactWeights).toBeDefined();
      expect(config.plugins).toBeDefined();
      expect(config.exclude).toBeDefined();
    });

    it('should merge user config with defaults', () => {
      const userConfig: Partial<IConfig> = {
        styleGuides: {
          javascript: 'jsdoc-google',
        },
        tone: 'detailed',
      };

      const config = validateAndMerge(userConfig);

      expect(config.styleGuides.javascript).toBe('jsdoc-google');
      expect(config.styleGuides.python).toBe('google'); // from defaults
      expect(config.tone).toBe('detailed');
      // Defaults should be present
      expect(config.plugins).toBeDefined();
      expect(config.exclude).toBeDefined();
    });

    it('should merge partial jsdocStyle with defaults', () => {
      const userConfig: Partial<IConfig> = {
        jsdocStyle: {
          requireExamples: 'all',
        },
      };

      const config = validateAndMerge(userConfig);

      // User value
      expect(config.jsdocStyle.requireExamples).toBe('all');
      // Defaults should be present
      expect(config.jsdocStyle.preferredTags).toBeDefined();
      expect(config.jsdocStyle.requireDescriptions).toBeDefined();
      expect(config.jsdocStyle.enforceTypes).toBeDefined();
    });
  });

  describe('styleGuides validation', () => {
    it('should accept valid styleGuide values per language', () => {
      const validConfig = {
        styleGuides: {
          python: 'google',
          javascript: 'jsdoc-vanilla',
          typescript: 'tsdoc-typedoc',
        },
      };

      const config = validateAndMerge(validConfig);
      expect(config.styleGuides.python).toBe('google');
      expect(config.styleGuides.javascript).toBe('jsdoc-vanilla');
      expect(config.styleGuides.typescript).toBe('tsdoc-typedoc');
    });

    it('should reject invalid styleGuide for python', () => {
      expect(() => {
        validateAndMerge({ styleGuides: { python: 'invalid-style' } } as any);
      }).toThrow('Invalid styleGuides.python');
    });

    it('should reject invalid styleGuide for javascript', () => {
      expect(() => {
        validateAndMerge({ styleGuides: { javascript: 'invalid-style' } } as any);
      }).toThrow('Invalid styleGuides.javascript');
    });

    it('should reject invalid language key', () => {
      expect(() => {
        validateAndMerge({ styleGuides: { ruby: 'some-style' } } as any);
      }).toThrow('Invalid language in styleGuides: ruby');
    });
  });

  describe('tone validation', () => {
    it('should accept valid tone values', () => {
      const validTones = ['concise', 'detailed', 'friendly'];

      for (const tone of validTones) {
        const config = validateAndMerge({ tone: tone as any });
        expect(config.tone).toBe(tone);
      }
    });

    it('should reject invalid tone', () => {
      expect(() => {
        validateAndMerge({ tone: 'invalid-tone' as any });
      }).toThrow('Invalid tone');
    });
  });

  describe('jsdocStyle validation', () => {
    it('should accept valid requireExamples values', () => {
      const validValues = ['all', 'public', 'none'];

      for (const value of validValues) {
        const config = validateAndMerge({
          jsdocStyle: { requireExamples: value as any },
        });
        expect(config.jsdocStyle.requireExamples).toBe(value);
      }
    });

    it('should reject invalid requireExamples', () => {
      expect(() => {
        validateAndMerge({
          jsdocStyle: { requireExamples: 'invalid-value' as any },
        });
      }).toThrow('Invalid jsdocStyle.requireExamples');
    });
  });

  describe('impactWeights validation', () => {
    it('should accept valid complexity weight', () => {
      const config = validateAndMerge({
        impactWeights: { complexity: 0.7, quality: 0.3 },
      });
      expect(config.impactWeights.complexity).toBe(0.7);
    });

    it('should reject complexity weight > 1', () => {
      expect(() => {
        validateAndMerge({
          impactWeights: { complexity: 1.5, quality: 0.4 },
        });
      }).toThrow('Invalid impactWeights.complexity');
    });

    it('should reject complexity weight < 0', () => {
      expect(() => {
        validateAndMerge({
          impactWeights: { complexity: -0.1, quality: 0.4 },
        });
      }).toThrow('Invalid impactWeights.complexity');
    });

    it('should accept valid quality weight', () => {
      const config = validateAndMerge({
        impactWeights: { complexity: 0.6, quality: 0.4 },
      });
      expect(config.impactWeights.quality).toBe(0.4);
    });

    it('should reject quality weight > 1', () => {
      expect(() => {
        validateAndMerge({
          impactWeights: { complexity: 0.6, quality: 1.5 },
        });
      }).toThrow('Invalid impactWeights.quality');
    });

    it('should reject quality weight < 0', () => {
      expect(() => {
        validateAndMerge({
          impactWeights: { complexity: 0.6, quality: -0.2 },
        });
      }).toThrow('Invalid impactWeights.quality');
    });

    it('should warn if weights do not sum to 1.0', () => {
      validateAndMerge({
        impactWeights: { complexity: 0.5, quality: 0.3 },
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('impactWeights')
      );
    });

    it('should warn for weights outside 0.01 tolerance', () => {
      // Test that 0.6 + 0.42 = 1.02 produces a warning (exceeds tolerance)
      validateAndMerge({
        impactWeights: { complexity: 0.6, quality: 0.42 },
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('1.02')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not 1.0')
      );
    });

    it('should not warn for weights within 0.01 tolerance', () => {
      // Test that 0.504 + 0.504 = 1.008 does NOT produce a warning (within tolerance)
      consoleWarnSpy.mockClear(); // Clear any previous warnings
      validateAndMerge({
        impactWeights: { complexity: 0.504, quality: 0.504 },
      });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should not warn if weights sum to 1.0', () => {
      validateAndMerge({
        impactWeights: { complexity: 0.6, quality: 0.4 },
      });

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('plugins validation', () => {
    it('should accept valid plugins array', () => {
      const config = validateAndMerge({
        plugins: ['./plugin1.js', './plugin2.js'],
      });
      expect(config.plugins).toHaveLength(2);
    });

    it('should reject non-array plugins', () => {
      expect(() => {
        validateAndMerge({ plugins: 'not-an-array' as any });
      }).toThrow('plugins must be an array');
    });

    it('should reject non-string plugin items', () => {
      expect(() => {
        validateAndMerge({ plugins: ['./valid.js', 123] as any });
      }).toThrow('Each plugin must be a string');
    });
  });

  describe('exclude validation', () => {
    it('should accept valid exclude array', () => {
      const config = validateAndMerge({
        exclude: ['**/*.test.js', '**/node_modules/**'],
      });
      expect(config.exclude).toHaveLength(2);
    });

    it('should reject non-array exclude', () => {
      expect(() => {
        validateAndMerge({ exclude: 'not-an-array' as any });
      }).toThrow('exclude must be an array');
    });

    it('should reject non-string exclude items', () => {
      expect(() => {
        validateAndMerge({ exclude: ['**/*.test.js', 123] as any });
      }).toThrow('Each exclude pattern must be a string');
    });
  });

  describe('claude configuration validation', () => {
    it('should merge partial claude config with defaults', () => {
      const userConfig: Partial<IConfig> = {
        claude: {
          timeout: 60.0,
        },
      };

      const config = validateAndMerge(userConfig);

      expect(config.claude.timeout).toBe(60.0);
      expect(config.claude.maxRetries).toBe(3);
      expect(config.claude.retryDelay).toBe(1.0);
    });

    it('should accept custom claude configuration', () => {
      const userConfig: Partial<IConfig> = {
        claude: {
          timeout: 45.0,
          maxRetries: 5,
          retryDelay: 2.0,
        },
      };

      const config = validateAndMerge(userConfig);

      expect(config.claude.timeout).toBe(45.0);
      expect(config.claude.maxRetries).toBe(5);
      expect(config.claude.retryDelay).toBe(2.0);
    });

    it('should use defaults when claude config is omitted', () => {
      const config = validateAndMerge({});

      expect(config.claude).toBeDefined();
      expect(config.claude.timeout).toBe(30.0);
      expect(config.claude.maxRetries).toBe(3);
      expect(config.claude.retryDelay).toBe(1.0);
    });

    it('should reject negative timeout', () => {
      expect(() => {
        validateAndMerge({ claude: { timeout: -5 } } as any);
      }).toThrow('claude.timeout must be a positive number');
    });

    it('should warn for very high timeout values', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const userConfig: Partial<IConfig> = {
        claude: {
          timeout: 900, // 15 minutes
        },
      };

      const config = validateAndMerge(userConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('claude.timeout (900s) is very high')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Did you mean 15 minutes?')
      );
      expect(config.claude.timeout).toBe(900); // Should still accept the value

      consoleWarnSpy.mockRestore();
    });

    it('should accept maxRetries = 0 (no retries)', () => {
      const userConfig: Partial<IConfig> = {
        claude: {
          maxRetries: 0,
        },
      };

      const config = validateAndMerge(userConfig);

      expect(config.claude.maxRetries).toBe(0);
    });

    it('should reject negative maxRetries', () => {
      expect(() => {
        validateAndMerge({ claude: { maxRetries: -1 } } as any);
      }).toThrow('claude.maxRetries must be non-negative');
    });

    it('should reject non-integer maxRetries', () => {
      expect(() => {
        validateAndMerge({ claude: { maxRetries: 2.5 } } as any);
      }).toThrow('claude.maxRetries must be an integer (not a decimal)');
    });

    it('should reject non-number maxRetries', () => {
      expect(() => {
        validateAndMerge({ claude: { maxRetries: 'three' } } as any);
      }).toThrow('claude.maxRetries must be a number');
    });

    it('should reject negative retryDelay', () => {
      expect(() => {
        validateAndMerge({ claude: { retryDelay: -1.0 } } as any);
      }).toThrow('claude.retryDelay must be a positive number');
    });

    it('should reject zero timeout', () => {
      expect(() => {
        validateAndMerge({ claude: { timeout: 0 } } as any);
      }).toThrow('claude.timeout must be a positive number');
    });

    it('should reject zero retryDelay', () => {
      expect(() => {
        validateAndMerge({ claude: { retryDelay: 0 } } as any);
      }).toThrow('claude.retryDelay must be a positive number');
    });

    it('should warn for very high retryDelay values', () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const userConfig: Partial<IConfig> = {
        claude: {
          retryDelay: 120, // 2 minutes
        },
      };

      const config = validateAndMerge(userConfig);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('claude.retryDelay (120s) is very high')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('With exponential backoff, this may cause very long waits')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Recommended range: 0.5-60 seconds')
      );
      expect(config.claude.retryDelay).toBe(120); // Should still accept the value

      consoleWarnSpy.mockRestore();
    });

    it('should reject claude config as string', () => {
      expect(() => {
        validateAndMerge({ claude: 'fast' } as any);
      }).toThrow('claude must be an object');
    });

    it('should reject claude config as number', () => {
      expect(() => {
        validateAndMerge({ claude: 30 } as any);
      }).toThrow('claude must be an object');
    });

    it('should reject claude config as array', () => {
      expect(() => {
        validateAndMerge({ claude: [30, 3, 1] } as any);
      }).toThrow('claude must be an object');
    });

    it('should reject claude config as null', () => {
      expect(() => {
        validateAndMerge({ claude: null } as any);
      }).toThrow('claude must be an object');
    });

    it('should reject timeout with NaN', () => {
      expect(() => {
        validateAndMerge({ claude: { timeout: NaN } } as any);
      }).toThrow('claude.timeout must be a finite number (not Infinity or NaN)');
    });

    it('should reject timeout with Infinity', () => {
      expect(() => {
        validateAndMerge({ claude: { timeout: Infinity } } as any);
      }).toThrow('claude.timeout must be a finite number (not Infinity or NaN)');
    });

    it('should reject timeout with -Infinity', () => {
      expect(() => {
        validateAndMerge({ claude: { timeout: -Infinity } } as any);
      }).toThrow('claude.timeout must be a positive number');
    });

    it('should reject maxRetries with NaN', () => {
      expect(() => {
        validateAndMerge({ claude: { maxRetries: NaN } } as any);
      }).toThrow('claude.maxRetries must be a finite number (not Infinity or NaN)');
    });

    it('should reject maxRetries with Infinity', () => {
      expect(() => {
        validateAndMerge({ claude: { maxRetries: Infinity } } as any);
      }).toThrow('claude.maxRetries must be a finite number (not Infinity or NaN)');
    });

    it('should reject retryDelay with NaN', () => {
      expect(() => {
        validateAndMerge({ claude: { retryDelay: NaN } } as any);
      }).toThrow('claude.retryDelay must be a finite number (not Infinity or NaN)');
    });

    it('should reject retryDelay with Infinity', () => {
      expect(() => {
        validateAndMerge({ claude: { retryDelay: Infinity } } as any);
      }).toThrow('claude.retryDelay must be a finite number (not Infinity or NaN)');
    });
  });

  describe('complex configurations', () => {
    it('should validate and merge full configuration', () => {
      const userConfig: Partial<IConfig> = {
        styleGuides: {
          javascript: 'jsdoc-vanilla',
          python: 'numpy-rest',
          typescript: 'tsdoc-aedoc',
        },
        tone: 'friendly',
        jsdocStyle: {
          preferredTags: { return: 'returns' },
          requireDescriptions: true,
          requireExamples: 'public',
          enforceTypes: true,
        },
        impactWeights: {
          complexity: 0.7,
          quality: 0.3,
        },
        plugins: ['./plugins/validate-types.js', './plugins/jsdoc-style.js'],
        exclude: ['**/test_*.py', '**/node_modules/**', '**/__pycache__/**'],
        claude: {
          timeout: 45.0,
          maxRetries: 5,
          retryDelay: 2.0,
        },
      };

      const config = validateAndMerge(userConfig);

      expect(config.styleGuides.javascript).toBe('jsdoc-vanilla');
      expect(config.styleGuides.python).toBe('numpy-rest');
      expect(config.styleGuides.typescript).toBe('tsdoc-aedoc');
      expect(config.tone).toBe('friendly');
      expect(config.jsdocStyle.requireExamples).toBe('public');
      expect(config.impactWeights.complexity).toBe(0.7);
      expect(config.impactWeights.quality).toBe(0.3);
      expect(config.plugins).toHaveLength(2);
      expect(config.exclude).toHaveLength(3);
      expect(config.claude.timeout).toBe(45.0);
      expect(config.claude.maxRetries).toBe(5);
      expect(config.claude.retryDelay).toBe(2.0);
    });
  });
});
