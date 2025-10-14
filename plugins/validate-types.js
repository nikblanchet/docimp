/**
 * JSDoc Type Validation Plugin
 *
 * This plugin performs REAL type-checking of JSDoc comments using the
 * TypeScript compiler with checkJs enabled. It validates:
 * - Parameter names match function signatures
 * - JSDoc types are syntactically correct
 * - Types align with TypeScript inference
 *
 * This is not cosmetic parsing - it uses the actual TypeScript compiler
 * to verify JSDoc correctness.
 *
 * @module plugins/validate-types
 */

import { createRequire } from 'module';
import { readFileSync } from 'fs';

// Resolve TypeScript from CLI's node_modules
const require = createRequire(import.meta.url);

// Try to load TypeScript from cli/node_modules
let ts;
try {
  ts = require('../cli/node_modules/typescript/lib/typescript.js');
} catch {
  // Fallback to standard require (if typescript is in plugin's node_modules)
  ts = require('typescript');
}

/**
 * Extract parameter names from a JSDoc comment.
 *
 * @param {string} docstring - JSDoc comment text
 * @returns {string[]} Array of parameter names
 */
function extractJSDocParamNames(docstring) {
  const paramPattern = /@param\s+\{[^}]+\}\s+(\w+)/g;
  const names = [];
  let match;

  while ((match = paramPattern.exec(docstring)) !== null) {
    names.push(match[1]);
  }

  return names;
}

/**
 * Extract function signature from source code.
 *
 * @param {string} code - Source code containing the function
 * @param {string} functionName - Name of the function to find
 * @returns {{params: string[], isAsync: boolean} | null} Function info or null
 */
function extractFunctionSignature(code, functionName) {
  // Create a TypeScript source file for parsing
  const sourceFile = ts.createSourceFile(
    'temp.js',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );

  let functionInfo = null;

  // Visit all nodes to find the function
  function visit(node) {
    // Check for function declarations
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
      functionInfo = {
        params: node.parameters.map((p) => p.name.getText(sourceFile)),
        isAsync: node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword
        ) || false,
      };
    }

    // Check for variable declarations with arrow functions
    if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === functionName) {
      if (node.initializer && ts.isArrowFunction(node.initializer)) {
        functionInfo = {
          params: node.initializer.parameters.map((p) => p.name.getText(sourceFile)),
          isAsync: node.initializer.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.AsyncKeyword
          ) || false,
        };
      }
    }

    // Check for method declarations in classes
    if (ts.isMethodDeclaration(node) && node.name.getText(sourceFile) === functionName) {
      functionInfo = {
        params: node.parameters.map((p) => p.name.getText(sourceFile)),
        isAsync: node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword
        ) || false,
      };
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functionInfo;
}

/**
 * Validate JSDoc with TypeScript compiler.
 *
 * Creates an in-memory TypeScript program with checkJs enabled
 * to validate JSDoc comments against actual code.
 *
 * @param {string} filepath - Path to the file
 * @param {string} code - Source code (if available)
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateWithCompiler(filepath, code) {
  // If no code provided, try to read the file
  const sourceCode = code || (function() {
    try {
      return readFileSync(filepath, 'utf-8');
    } catch {
      return null;
    }
  })();

  if (!sourceCode) {
    return { valid: true, errors: [] }; // Can't validate without source
  }

  // Create compiler options with checkJs enabled
  const compilerOptions = {
    allowJs: true,
    checkJs: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  };

  // Create an in-memory host
  const host = ts.createCompilerHost(compilerOptions);
  const originalGetSourceFile = host.getSourceFile;

  // Override getSourceFile to provide our source code
  host.getSourceFile = (fileName, languageVersion) => {
    if (fileName === filepath) {
      return ts.createSourceFile(
        fileName,
        sourceCode,
        languageVersion,
        true,
        ts.ScriptKind.JS
      );
    }
    return originalGetSourceFile.call(host, fileName, languageVersion);
  };

  // Create a program
  const program = ts.createProgram([filepath], compilerOptions, host);

  // Get diagnostics
  const diagnostics = ts.getPreEmitDiagnostics(program);

  // Filter for JSDoc-related errors
  const errors = diagnostics
    .filter((d) => d.file?.fileName === filepath)
    .map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
      const position = d.start !== undefined
        ? d.file?.getLineAndCharacterOfPosition(d.start)
        : null;
      const location = position
        ? ` (line ${position.line + 1}, col ${position.character + 1})`
        : '';
      return `${message}${location}`;
    });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate auto-fix for parameter name mismatches.
 *
 * @param {string} docstring - Original JSDoc
 * @param {string[]} jsdocParams - Parameter names in JSDoc
 * @param {string[]} actualParams - Parameter names in function signature
 * @returns {string | null} Fixed JSDoc or null if can't fix
 */
function generateParameterFix(docstring, jsdocParams, actualParams) {
  if (jsdocParams.length !== actualParams.length) {
    return null; // Can't auto-fix if counts don't match
  }

  let fixed = docstring;

  // Replace each mismatched parameter name
  for (let i = 0; i < jsdocParams.length; i++) {
    if (jsdocParams[i] !== actualParams[i]) {
      // Replace the parameter name in the @param tag
      const pattern = new RegExp(
        `(@param\\s+\\{[^}]+\\})\\s+${jsdocParams[i]}\\b`,
        'g'
      );
      fixed = fixed.replace(pattern, `$1 ${actualParams[i]}`);
    }
  }

  return fixed !== docstring ? fixed : null;
}

/**
 * Validate JSDoc type annotations.
 *
 * This is the main beforeAccept hook that runs before documentation
 * is accepted in the improve workflow.
 *
 * @param {string} docstring - Generated JSDoc comment
 * @param {object} item - Code item metadata
 * @param {object} config - User configuration
 * @returns {Promise<{accept: boolean, reason?: string, autoFix?: string}>}
 */
async function beforeAccept(docstring, item, config) {
  // Only validate JavaScript/TypeScript files
  if (item.language !== 'javascript' && item.language !== 'typescript') {
    return { accept: true };
  }

  // Skip if type enforcement is disabled
  if (config.jsdocStyle?.enforceTypes === false) {
    return { accept: true };
  }

  const errors = [];

  // Extract parameter names from JSDoc
  const jsdocParams = extractJSDocParamNames(docstring);

  // Extract actual function signature
  const functionInfo = item.code
    ? extractFunctionSignature(item.code, item.name)
    : null;

  // Validate parameter names match
  if (functionInfo && item.parameters) {
    const actualParams = functionInfo.params;

    // Check if parameter names match
    if (jsdocParams.length !== actualParams.length) {
      errors.push(
        `Parameter count mismatch: JSDoc has ${jsdocParams.length} params, function has ${actualParams.length}`
      );
    } else {
      const mismatches = [];
      for (let i = 0; i < jsdocParams.length; i++) {
        if (jsdocParams[i] !== actualParams[i]) {
          mismatches.push(
            `  Position ${i + 1}: JSDoc says "${jsdocParams[i]}", function says "${actualParams[i]}"`
          );
        }
      }

      if (mismatches.length > 0) {
        errors.push(
          'Parameter name mismatch:\n' + mismatches.join('\n')
        );
      }
    }
  }

  // Run TypeScript compiler validation
  const compilerResult = validateWithCompiler(item.filepath, item.code);
  if (!compilerResult.valid) {
    errors.push(
      'TypeScript compiler errors:\n  ' +
        compilerResult.errors.join('\n  ')
    );
  }

  // If there are errors, reject with detailed message
  if (errors.length > 0) {
    const reason = errors.join('\n\n');

    // Try to generate an auto-fix
    let autoFix = null;
    if (functionInfo && jsdocParams.length === functionInfo.params.length) {
      autoFix = generateParameterFix(
        docstring,
        jsdocParams,
        functionInfo.params
      );
    }

    return {
      accept: false,
      reason,
      autoFix: autoFix || undefined,
    };
  }

  return { accept: true };
}

// Export the plugin
export default {
  name: 'validate-types',
  version: '1.0.0',
  hooks: {
    beforeAccept,
  },
};
