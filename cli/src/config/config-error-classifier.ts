/**
 * Configuration error classifier for DocImp.
 *
 * Categorizes configuration loading errors and provides helpful user-facing
 * messages with actionable suggestions.
 */

/**
 * Categorized error details for configuration loading failures.
 */
export interface ConfigErrorDetails {
  /** Error category: syntax, runtime, or unknown */
  type: 'syntax' | 'runtime' | 'unknown';
  /** User-friendly error message */
  userMessage: string;
  /** Technical error details from the underlying error */
  technicalDetails: string;
  /** Actionable suggestions to help resolve the error */
  suggestions: string[];
}

/**
 * Error classifier for configuration loading failures.
 *
 * Analyzes errors thrown during config file loading and categorizes them
 * as syntax errors (invalid JavaScript) or runtime errors (missing modules,
 * import failures, etc.).
 */
export class ConfigErrorClassifier {
  /**
   * Classify and format a configuration loading error.
   *
   * Detects error type (syntax vs runtime) and generates user-friendly
   * messages with contextual suggestions.
   *
   * @param error - The error thrown during config loading
   * @param _configPath - The path to the config file (unused, kept for API consistency)
   * @returns Formatted error details with categorization and suggestions
   */
  static classify(error: unknown, _configPath: string): ConfigErrorDetails {
    const errorMessage = this.extractErrorMessage(error);
    const errorType = this.detectErrorType(error, errorMessage);

    return {
      type: errorType,
      userMessage: this.createUserMessage(errorType),
      technicalDetails: this.createTechnicalDetails(error, errorMessage),
      suggestions: this.createSuggestions(errorType, errorMessage),
    };
  }

  /**
   * Extract error message from unknown error object.
   *
   * @returns The error message string
   */
  private static extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Detect error type based on error instance and message.
   *
   * @returns Error category: 'syntax', 'runtime', or 'unknown'
   */
  private static detectErrorType(
    error: unknown,
    errorMessage: string
  ): 'syntax' | 'runtime' | 'unknown' {
    // Check if it's a SyntaxError instance
    if (error instanceof SyntaxError) {
      return 'syntax';
    }

    // Check error message for syntax error patterns
    if (
      errorMessage.includes('Unexpected token') ||
      errorMessage.includes('Unexpected end of input') ||
      errorMessage.includes('Invalid or unexpected token') ||
      errorMessage.includes('Unexpected identifier') ||
      errorMessage.includes('Unexpected string') ||
      errorMessage.includes('Unexpected number')
    ) {
      return 'syntax';
    }

    // Check for runtime error patterns (module loading failures)
    const errorWithCode = error as { code?: string };
    const isModuleError =
      errorMessage.includes('Cannot find module') ||
      errorMessage.includes('does not provide an export') ||
      errorMessage.includes('MODULE_NOT_FOUND') ||
      (error instanceof Error &&
        'code' in error &&
        errorWithCode.code === 'MODULE_NOT_FOUND');

    if (isModuleError) {
      return 'runtime';
    }

    // Check for circular dependency errors
    if (errorMessage.includes('Circular dependency')) {
      return 'runtime';
    }

    // Default to unknown
    return 'unknown';
  }

  /**
   * Create user-friendly message based on error type.
   *
   * @returns User-facing error message
   */
  private static createUserMessage(
    type: 'syntax' | 'runtime' | 'unknown'
  ): string {
    switch (type) {
      case 'syntax': {
        return 'Configuration file has invalid JavaScript syntax';
      }
      case 'runtime': {
        return 'Configuration file failed to load';
      }
      case 'unknown': {
        return 'Failed to load configuration file';
      }
    }
  }

  /**
   * Create technical details section with line/column info if available.
   *
   * @returns Technical error details with location information
   */
  private static createTechnicalDetails(
    error: unknown,
    errorMessage: string
  ): string {
    let details = errorMessage;

    // Try to extract line and column numbers if available
    interface ErrorWithLocation {
      lineNumber?: number;
      columnNumber?: number;
    }
    const errorWithLocation = error as ErrorWithLocation;
    if (
      error instanceof Error &&
      'lineNumber' in error &&
      'columnNumber' in error
    ) {
      const lineNumber = errorWithLocation.lineNumber;
      const colNumber = errorWithLocation.columnNumber;
      details += `\nLocation: line ${lineNumber}, column ${colNumber}`;
    }

    // Try to extract stack trace info for more context (first line only)
    if (error instanceof Error && error.stack) {
      const stackLines = error.stack.split('\n');
      // Look for the first line with a file location
      const locationLine = stackLines.find(
        (line) =>
          line.includes('.js') || line.includes('.cjs') || line.includes('.mjs')
      );
      if (locationLine) {
        const match = locationLine.match(/at (.+):(\d+):(\d+)/);
        if (match) {
          details += `\nLocation: line ${match[2]}, column ${match[3]}`;
        }
      }
    }

    return details;
  }

  /**
   * Create contextual suggestions based on error type and message.
   *
   * @returns Array of actionable suggestions
   */
  private static createSuggestions(
    type: 'syntax' | 'runtime' | 'unknown',
    errorMessage: string
  ): string[] {
    switch (type) {
      case 'syntax': {
        return this.createSyntaxSuggestions(errorMessage);
      }
      case 'runtime': {
        return this.createRuntimeSuggestions(errorMessage);
      }
      case 'unknown': {
        return [
          'Verify the configuration file is valid JavaScript',
          'Check the Node.js error message for more details',
          'Try testing your config with: node docimp.config.js',
        ];
      }
    }
  }

  /**
   * Create suggestions specific to syntax errors.
   *
   * @returns Array of syntax-error-specific suggestions
   */
  private static createSyntaxSuggestions(errorMessage: string): string[] {
    const suggestions: string[] = [];

    // Check for common syntax error patterns
    if (errorMessage.includes('Unexpected end of input')) {
      suggestions.push(
        'Check for unclosed brackets, braces, or parentheses',
        'Ensure all opening brackets have matching closing brackets'
      );
    } else if (
      errorMessage.includes('Unexpected token') &&
      (errorMessage.includes('}') ||
        errorMessage.includes(']') ||
        errorMessage.includes(')'))
    ) {
      suggestions.push(
        'Check for missing commas between object properties or array elements',
        'Verify proper nesting of brackets and braces'
      );
    } else {
      suggestions.push(
        'Check for missing commas between object properties',
        'Verify all brackets and braces are properly closed'
      );
    }

    suggestions.push(
      'Validate JavaScript syntax in your editor',
      'Try testing your config with: node docimp.config.js'
    );

    return suggestions;
  }

  /**
   * Create suggestions specific to runtime errors.
   *
   * @returns Array of runtime-error-specific suggestions
   */
  private static createRuntimeSuggestions(errorMessage: string): string[] {
    const suggestions: string[] = [];

    // Check for module-specific errors
    if (errorMessage.includes('Cannot find module')) {
      suggestions.push(
        'Verify all import/require paths are correct',
        'Check that imported modules exist',
        'Ensure relative paths start with ./ or ../'
      );
    } else if (errorMessage.includes('does not provide an export')) {
      suggestions.push(
        'Check that the imported module exports the expected value',
        'Verify you are using the correct export name (default vs named)'
      );
    } else if (errorMessage.includes('Circular dependency')) {
      suggestions.push(
        'Check for circular dependencies in your imports',
        'Restructure imports to break the circular dependency'
      );
    } else {
      suggestions.push(
        'Verify all import/require statements are valid',
        'Check file permissions allow reading'
      );
    }

    suggestions.push('Try testing your config with: node docimp.config.js');

    return suggestions;
  }
}
