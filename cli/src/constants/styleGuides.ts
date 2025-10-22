/**
 * Style guide constants and choices for documentation generation.
 *
 * This module provides centralized definitions for all supported style guides
 * across different languages, ensuring consistency and reusability.
 */

import type { SupportedLanguage } from '../types/analysis.js';

/**
 * Structure for a style guide choice option.
 */
export interface StyleGuideChoice {
  title: string;
  value: string;
}

/**
 * Style guide choices organized by language.
 * Each language has an array of available style guide options with display titles and values.
 */
export const STYLE_GUIDE_CHOICES: Record<SupportedLanguage, StyleGuideChoice[]> = {
  python: [
    { title: 'Google', value: 'google' },
    { title: 'NumPy + reST', value: 'numpy-rest' },
    { title: 'NumPy + Markdown', value: 'numpy-markdown' },
    { title: 'Pure reST (Sphinx)', value: 'sphinx' },
  ],
  javascript: [
    { title: 'JSDoc (Vanilla)', value: 'jsdoc-vanilla' },
    { title: 'Google JSDoc', value: 'jsdoc-google' },
    { title: 'Closure (JSDoc/Closure)', value: 'jsdoc-closure' },
  ],
  typescript: [
    { title: 'TSDoc (TypeDoc)', value: 'tsdoc-typedoc' },
    { title: 'TSDoc (API Extractor/AEDoc)', value: 'tsdoc-aedoc' },
    { title: 'JSDoc-in-TS', value: 'jsdoc-ts' },
  ],
};

/**
 * Valid style guide values for each language (extracted from choices).
 * Used for validation of CLI flags and configuration values.
 */
export const VALID_STYLE_GUIDES: Record<SupportedLanguage, string[]> = {
  python: STYLE_GUIDE_CHOICES.python.map(c => c.value),
  javascript: STYLE_GUIDE_CHOICES.javascript.map(c => c.value),
  typescript: STYLE_GUIDE_CHOICES.typescript.map(c => c.value),
};

/**
 * Valid documentation tone values.
 * Defines the style and verbosity of generated documentation.
 */
export const VALID_TONES = ['concise', 'detailed', 'friendly'] as const;

/**
 * Type for valid tone values.
 */
export type Tone = typeof VALID_TONES[number];

/**
 * Tone choice options for interactive prompts.
 */
export const TONE_CHOICES: StyleGuideChoice[] = [
  { title: 'Concise', value: 'concise' },
  { title: 'Detailed', value: 'detailed' },
  { title: 'Friendly', value: 'friendly' },
];
