/**
 * Code extraction utility for displaying code blocks during audit.
 *
 * Provides methods for extracting complete code blocks and signatures
 * from source files with line numbers and truncation support.
 */

import * as fs from 'fs';

/**
 * Result from extracting a code block.
 */
export interface CodeExtractionResult {
  /** The extracted code with line numbers */
  code: string;
  /** Whether truncation occurred */
  truncated: boolean;
  /** Total lines in original code */
  totalLines: number;
  /** Lines shown (may be less if truncated) */
  displayedLines: number;
}

/**
 * Result from extracting a signature.
 */
export interface SignatureExtractionResult {
  /** Function/class signature line(s) */
  signature: string;
  /** Total lines in full code */
  totalLines: number;
}

/**
 * Utility class for extracting code blocks from source files.
 */
export class CodeExtractor {
  /**
   * Extract code block from file given line range.
   *
   * @param filepath - Absolute path to source file
   * @param startLine - Start line (1-indexed)
   * @param endLine - End line (1-indexed, inclusive)
   * @param maxLines - Maximum lines to return (0 = no limit)
   * @param includeLineNumbers - Add line numbers to each line
   * @returns Extraction result with truncation info
   */
  static extractCodeBlock(
    filepath: string,
    startLine: number,
    endLine: number,
    maxLines: number = 0,
    includeLineNumbers: boolean = true
  ): CodeExtractionResult {
    // Read file and split into lines
    const fileContent = fs.readFileSync(filepath, 'utf-8');
    const allLines = fileContent.split('\n');

    // Extract the target range (1-indexed to 0-indexed)
    const startIdx = startLine - 1;
    const endIdx = endLine; // endLine is inclusive, so we use endLine (not endLine - 1) for slice
    const codeLines = allLines.slice(startIdx, endIdx);

    const totalLines = codeLines.length;
    let displayedLines = totalLines;
    let truncated = false;

    // Apply truncation if maxLines > 0 and we exceed it
    if (maxLines > 0 && totalLines > maxLines) {
      codeLines.splice(maxLines); // Keep only first maxLines
      displayedLines = maxLines;
      truncated = true;
    }

    // Format lines with line numbers if requested
    const formattedLines = codeLines.map((line, index) => {
      const lineNum = startLine + index;
      if (includeLineNumbers) {
        // Format: "  45 | code here"
        // Right-align line numbers to 4 characters for consistency
        const paddedLineNum = String(lineNum).padStart(4, ' ');
        return `${paddedLineNum} | ${line}`;
      }
      return line;
    });

    return {
      code: formattedLines.join('\n'),
      truncated,
      totalLines,
      displayedLines,
    };
  }

  /**
   * Extract just the signature (first line or opening bracket) of a code block.
   *
   * @param filepath - Absolute path to source file
   * @param startLine - Start line (1-indexed)
   * @param endLine - End line (1-indexed, inclusive)
   * @param language - Language for signature detection
   * @param maxLines - Maximum lines for signature (usually small)
   * @returns Signature extraction result
   */
  static extractSignature(
    filepath: string,
    startLine: number,
    endLine: number,
    language: string,
    maxLines: number = 5
  ): SignatureExtractionResult {
    // Read file and split into lines
    const fileContent = fs.readFileSync(filepath, 'utf-8');
    const allLines = fileContent.split('\n');

    // Extract the target range
    const startIdx = startLine - 1;
    const endIdx = endLine;
    const codeLines = allLines.slice(startIdx, endIdx);
    const totalLines = codeLines.length;

    // Find the signature based on language conventions
    const signatureLines: string[] = [];

    for (let i = 0; i < Math.min(codeLines.length, maxLines); i++) {
      const line = codeLines[i];
      const trimmed = line.trim();

      signatureLines.push(line);

      // For languages with braces (JavaScript, TypeScript, Java, C++, etc.)
      if (language === 'javascript' || language === 'typescript') {
        // Check if line contains opening brace
        if (trimmed.includes('{')) {
          break;
        }
      }

      // For Python, just take the first line (def or class line)
      if (language === 'python') {
        // First line is the signature for Python
        break;
      }
    }

    // Format with line numbers
    const formattedLines = signatureLines.map((line, index) => {
      const lineNum = startLine + index;
      const paddedLineNum = String(lineNum).padStart(4, ' ');
      return `${paddedLineNum} | ${line}`;
    });

    return {
      signature: formattedLines.join('\n'),
      totalLines,
    };
  }
}
