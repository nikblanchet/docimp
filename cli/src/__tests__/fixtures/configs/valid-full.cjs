/**
 * Valid full configuration with all options.
 */
module.exports = {
  styleGuides: {
    python: 'google',
    javascript: 'jsdoc-vanilla',
    typescript: 'tsdoc-typedoc',
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
};
