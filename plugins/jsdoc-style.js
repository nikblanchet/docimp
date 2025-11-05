/**
 * JSDoc Style Enforcement Plugin
 *
 * This plugin enforces JSDoc style conventions:
 * - Preferred tag aliases (@returns instead of @return)
 * - Description formatting (ending with punctuation)
 * - Required @example tags for complex public APIs
 * - Consistent formatting
 *
 * All rules respect the jsdocStyle configuration options.
 *
 * @module plugins/jsdoc-style
 */

/**
 * Parse JSDoc comment into structured tags using comment-parser.
 *
 * Uses the comment-parser library to properly handle multi-line content,
 * code examples, and complex JSDoc patterns without losing formatting.
 *
 * IMPORTANT: This function requires comment-parser to be injected.
 *
 * The defensive check below should never trigger in practice because
 * beforeAccept() validates dependencies before calling this function.
 * However, we include it as a safety net to return empty results rather
 * than throwing if called incorrectly.
 *
 * Note: Issue #95 was caused by the previous custom parser concatenating
 * multi-line content with spaces, destroying formatting. We removed that
 * broken fallback and now use comment-parser to properly preserve formatting.
 *
 * @param {string} docstring - JSDoc comment text
 * @param {object} commentParser - Injected comment-parser dependency
 * @returns {{description: string, tags: Array<{name: string, text: string}>}}
 */
function parseJSDoc(docstring, commentParser) {
  // Defensive check: return empty result if dependencies missing (should never happen)
  if (!commentParser || !commentParser.parse) {
    console.warn(
      '[jsdoc-style] comment-parser not available, returning empty parse result'
    );
    return { description: '', tags: [] };
  }

  try {
    const parsed = commentParser.parse(docstring);

    if (!parsed || parsed.length === 0) {
      console.warn(
        '[jsdoc-style] comment-parser returned empty results for docstring'
      );
      return { description: '', tags: [] };
    }

    const block = parsed[0];

    // Extract description (preserves formatting)
    const description = block.description || '';

    // Extract tags with preserved multi-line content
    const tags = block.tags.map((tag) => ({
      name: tag.tag,
      text: tag.description || '', // Preserves multi-line content
    }));

    return { description, tags };
  } catch (error) {
    console.error(
      '[jsdoc-style] comment-parser failed to parse docstring:',
      error.message
    );
    return { description: '', tags: [] };
  }
}

/**
 * Check for deprecated tag aliases.
 *
 * @param {Array<{name: string}>} tags - Parsed JSDoc tags
 * @param {Record<string, string>} preferredTags - Map of deprecated to preferred tags
 * @returns {string[]} Array of style violations
 */
function checkTagAliases(tags, preferredTags) {
  const violations = [];

  for (const tag of tags) {
    if (preferredTags[tag.name]) {
      violations.push(
        `Use @${preferredTags[tag.name]} instead of @${tag.name}`
      );
    }
  }

  return violations;
}

/**
 * Check that description ends with proper punctuation.
 *
 * @param {string} description - JSDoc description text
 * @returns {string | null} Error message or null
 */
function checkDescriptionPunctuation(description) {
  if (!description) {
    return null;
  }

  // Check if description ends with punctuation
  const endsWithPunctuation = /[.!?]$/.test(description);

  if (!endsWithPunctuation) {
    return 'Description should end with punctuation (. ! or ?)';
  }

  return null;
}

/**
 * Check for required @example tags.
 *
 * @param {Array<{name: string}>} tags - Parsed JSDoc tags
 * @param {object} item - Code item metadata
 * @param {object} config - User configuration
 * @returns {string | null} Error message or null
 */
function checkExampleRequired(tags, item, config) {
  const requireExamples = config.jsdocStyle?.requireExamples || 'public';

  // Skip if examples are not required
  if (requireExamples === 'none') {
    return null;
  }

  // Check if item is public (exported)
  const isPublic =
    item.export_type === 'named' ||
    item.export_type === 'default' ||
    item.export_type === 'commonjs';

  // Determine if example is required
  let exampleRequired = false;

  if (requireExamples === 'all') {
    exampleRequired = true;
  } else if (requireExamples === 'public') {
    // Require examples for:
    // - Public APIs (exported)
    // - Complex functions (complexity > 5)
    exampleRequired = isPublic && (item.complexity || 0) > 5;
  }

  if (!exampleRequired) {
    return null;
  }

  // Check if @example tag exists
  const hasExample = tags.some((tag) => tag.name === 'example');

  if (!hasExample) {
    return `Missing @example tag for ${isPublic ? 'public' : 'complex'} API (complexity: ${item.complexity})`;
  }

  return null;
}

/**
 * Check for empty descriptions.
 *
 * @param {string} description - JSDoc description text
 * @param {boolean} requireDescriptions - Whether descriptions are required
 * @returns {string | null} Error message or null
 */
function checkDescriptionRequired(description, requireDescriptions) {
  if (!requireDescriptions) {
    return null;
  }

  if (!description || description.trim() === '') {
    return 'Description is required but missing';
  }

  return null;
}

/**
 * Generate auto-fix for tag aliases.
 *
 * @param {string} docstring - Original JSDoc
 * @param {Record<string, string>} preferredTags - Map of deprecated to preferred tags
 * @returns {string | null} Fixed JSDoc or null
 */
function generateTagAliasFix(docstring, preferredTags) {
  let fixed = docstring;
  let hasChanges = false;

  for (const [deprecated, preferred] of Object.entries(preferredTags)) {
    const pattern = new RegExp(`@${deprecated}\\b`, 'g');
    if (pattern.test(fixed)) {
      fixed = fixed.replace(pattern, `@${preferred}`);
      hasChanges = true;
    }
  }

  return hasChanges ? fixed : null;
}

/**
 * Generate auto-fix for description punctuation.
 *
 * DISABLED: Auto-fix for punctuation is disabled to prevent corruption of
 * descriptions containing code blocks, lists, or other formatted content.
 * The plugin will only report punctuation violations without offering auto-fix.
 *
 * Issue #96: The previous heuristic-based approach could add periods in wrong
 * places (after blank lines, after code, in lists). Proper detection requires
 * sophisticated parsing that understands JSDoc structure, which is beyond the
 * scope of this simple fix.
 *
 * @param {string} docstring - Original JSDoc
 * @param {string} description - Parsed description text
 * @returns {string | null} Always returns null (auto-fix disabled)
 */
function generatePunctuationFix(docstring, description) {
  // Auto-fix disabled to prevent corruption (Issue #96)
  // Users must manually add punctuation to avoid incorrect placements
  return null;
}

/**
 * Enforce JSDoc style conventions.
 *
 * This is the main beforeAccept hook that runs before documentation
 * is accepted in the improve workflow.
 *
 * @param {string} docstring - Generated JSDoc comment
 * @param {object} item - Code item metadata
 * @param {object} config - User configuration
 * @param {object} dependencies - Injected dependencies (comment-parser)
 * @returns {Promise<{accept: boolean, reason?: string, autoFix?: string}>}
 */
async function beforeAccept(docstring, item, config, dependencies) {
  // Only validate JavaScript/TypeScript files
  if (item.language !== 'javascript' && item.language !== 'typescript') {
    return { accept: true };
  }

  // Validate that required dependencies are available
  if (!dependencies?.commentParser) {
    return {
      accept: false,
      reason:
        'comment-parser dependency not available. This plugin requires comment-parser to be injected by the PluginManager.',
    };
  }

  const jsdocStyle = config.jsdocStyle || {};
  const violations = [];

  // Parse the JSDoc with injected comment-parser
  const parsed = parseJSDoc(docstring, dependencies.commentParser);

  // Check tag aliases
  if (jsdocStyle.preferredTags) {
    const tagViolations = checkTagAliases(
      parsed.tags,
      jsdocStyle.preferredTags
    );
    violations.push(...tagViolations);
  }

  // Check description required
  const descriptionError = checkDescriptionRequired(
    parsed.description,
    jsdocStyle.requireDescriptions !== false
  );
  if (descriptionError) {
    violations.push(descriptionError);
  }

  // Check description punctuation (only if description exists)
  if (parsed.description) {
    const punctuationError = checkDescriptionPunctuation(parsed.description);
    if (punctuationError) {
      violations.push(punctuationError);
    }
  }

  // Check for required @example tags
  const exampleError = checkExampleRequired(parsed.tags, item, config);
  if (exampleError) {
    violations.push(exampleError);
  }

  // If there are violations, try to generate auto-fixes
  if (violations.length > 0) {
    let autoFix = null;

    // Try tag alias fix first
    if (jsdocStyle.preferredTags) {
      autoFix = generateTagAliasFix(docstring, jsdocStyle.preferredTags);
    }

    // Try punctuation fix if no alias fix
    if (!autoFix && parsed.description) {
      autoFix = generatePunctuationFix(docstring, parsed.description);
    }

    return {
      accept: false,
      reason: 'JSDoc style violations:\n  ' + violations.join('\n  '),
      autoFix: autoFix || undefined,
    };
  }

  return { accept: true };
}

// Export the plugin
export default {
  name: 'jsdoc-style',
  version: '1.0.0',
  hooks: {
    beforeAccept,
  },
};
