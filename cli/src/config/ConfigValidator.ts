/**
 * Configuration validation functions.
 *
 * Pure functions for validating and merging user configuration with defaults.
 * Separated from ConfigLoader to enable testing without file I/O.
 */

import type { IConfig } from './IConfig.js';
import { defaultConfig } from './IConfig.js';

/**
 * Validate user configuration and merge with defaults.
 *
 * @param userConfig - User-provided configuration (partial)
 * @returns Validated and merged configuration
 * @throws Error if validation fails
 */
export function validateAndMerge(userConfig: Partial<IConfig>): IConfig {
  // Validate styleGuides per language
  if (userConfig.styleGuides !== undefined) {
    const validStylesByLang = {
      python: ['google', 'numpy-rest', 'numpy-markdown', 'sphinx'],
      javascript: ['jsdoc-vanilla', 'jsdoc-google', 'jsdoc-closure'],
      typescript: ['tsdoc-typedoc', 'tsdoc-aedoc', 'jsdoc-ts'],
    };

    for (const [lang, style] of Object.entries(userConfig.styleGuides)) {
      if (lang !== 'python' && lang !== 'javascript' && lang !== 'typescript') {
        throw new Error(
          `Invalid language in styleGuides: ${lang}. Must be one of: python, javascript, typescript`
        );
      }

      const validStyles = validStylesByLang[lang as keyof typeof validStylesByLang];
      if (style && !validStyles.includes(style)) {
        throw new Error(
          `Invalid styleGuides.${lang}: ${style}. Must be one of: ${validStyles.join(', ')}`
        );
      }
    }
  }

  // Validate tone
  if (userConfig.tone !== undefined) {
    const validTones = ['concise', 'detailed', 'friendly'];
    if (!validTones.includes(userConfig.tone)) {
      throw new Error(
        `Invalid tone: ${userConfig.tone}. Must be one of: ${validTones.join(', ')}`
      );
    }
  }

  // Validate jsdocStyle
  if (userConfig.jsdocStyle !== undefined) {
    if (userConfig.jsdocStyle.requireExamples !== undefined) {
      const validValues = ['all', 'public', 'none'];
      if (!validValues.includes(userConfig.jsdocStyle.requireExamples)) {
        throw new Error(
          `Invalid jsdocStyle.requireExamples: ${userConfig.jsdocStyle.requireExamples}. Must be one of: ${validValues.join(', ')}`
        );
      }
    }
  }

  // Validate impactWeights
  if (userConfig.impactWeights !== undefined) {
    const { complexity, quality } = userConfig.impactWeights;
    if (complexity !== undefined) {
      if (complexity < 0 || complexity > 1) {
        throw new Error(
          `Invalid impactWeights.complexity: ${complexity}. Must be between 0 and 1`
        );
      }
    }
    if (quality !== undefined) {
      if (quality < 0 || quality > 1) {
        throw new Error(
          `Invalid impactWeights.quality: ${quality}. Must be between 0 and 1`
        );
      }
    }
    // Warn if weights don't sum to 1
    const complexityWeight = complexity ?? defaultConfig.impactWeights!.complexity;
    const qualityWeight = quality ?? defaultConfig.impactWeights!.quality;
    const sum = complexityWeight + qualityWeight;
    if (Math.abs(sum - 1.0) > 0.01) {
      console.warn(
        `Warning: impactWeights.complexity (${complexityWeight}) + impactWeights.quality (${qualityWeight}) = ${sum}, not 1.0`
      );
    }
  }

  // Validate plugins array
  if (userConfig.plugins !== undefined) {
    if (!Array.isArray(userConfig.plugins)) {
      throw new Error('plugins must be an array of strings');
    }
    for (const plugin of userConfig.plugins) {
      if (typeof plugin !== 'string') {
        throw new Error('Each plugin must be a string path');
      }
    }
  }

  // Validate exclude array
  if (userConfig.exclude !== undefined) {
    if (!Array.isArray(userConfig.exclude)) {
      throw new Error('exclude must be an array of strings');
    }
    for (const pattern of userConfig.exclude) {
      if (typeof pattern !== 'string') {
        throw new Error('Each exclude pattern must be a string');
      }
    }
  }

  // Validate claude configuration
  if (userConfig.claude !== undefined) {
    if (userConfig.claude.timeout !== undefined) {
      if (typeof userConfig.claude.timeout !== 'number' || userConfig.claude.timeout <= 0) {
        throw new Error('claude.timeout must be a positive number');
      }
      if (userConfig.claude.timeout > 600) {
        console.warn(
          `Warning: claude.timeout (${userConfig.claude.timeout}s) is very high. ` +
          `Did you mean ${userConfig.claude.timeout / 60} minutes? ` +
          `Recommended range: 5-600 seconds.`
        );
      }
    }
    if (userConfig.claude.maxRetries !== undefined) {
      if (typeof userConfig.claude.maxRetries !== 'number') {
        throw new Error('claude.maxRetries must be a number');
      }
      if (!Number.isInteger(userConfig.claude.maxRetries)) {
        throw new Error('claude.maxRetries must be an integer (not a decimal)');
      }
      if (userConfig.claude.maxRetries < 0) {
        throw new Error('claude.maxRetries must be non-negative');
      }
    }
    if (userConfig.claude.retryDelay !== undefined) {
      if (typeof userConfig.claude.retryDelay !== 'number' || userConfig.claude.retryDelay <= 0) {
        throw new Error('claude.retryDelay must be a positive number');
      }
    }
  }

  // Merge with defaults
  const config: IConfig = {
    styleGuides: {
      ...defaultConfig.styleGuides,
      ...userConfig.styleGuides,
    },
    tone: userConfig.tone ?? defaultConfig.tone,
    jsdocStyle: {
      ...defaultConfig.jsdocStyle,
      ...userConfig.jsdocStyle,
    },
    impactWeights: {
      ...defaultConfig.impactWeights!,
      ...userConfig.impactWeights,
    },
    plugins: userConfig.plugins ?? defaultConfig.plugins,
    exclude: userConfig.exclude ?? defaultConfig.exclude,
    audit: userConfig.audit ?? defaultConfig.audit,
    claude: {
      ...defaultConfig.claude!,
      ...userConfig.claude,
    },
  };

  return config;
}
