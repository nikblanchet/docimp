/**
 * TypeScript/JavaScript Parser Helper
 *
 * Uses TypeScript compiler API to parse .ts, .js, .cjs, .mjs files with full JSDoc validation.
 * This file is invoked as a Node.js subprocess by the Python analyzer.
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a parsed code item extracted from TypeScript/JavaScript source
 */
interface CodeItem {
    name: string;
    type: 'function' | 'class' | 'method' | 'interface';
    filepath: string;
    line_number: number;
    end_line: number;
    language: 'typescript' | 'javascript';
    complexity: number;
    impact_score: number;
    has_docs: boolean;
    parameters: string[];
    return_type: string | null;
    docstring: string | null;
    export_type: 'named' | 'default' | 'commonjs' | 'internal';
    module_system: 'esm' | 'commonjs' | 'unknown';
}

/**
 * Calculate cyclomatic complexity for a node
 *
 * Cyclomatic complexity = number of decision points + 1
 * Decision points: if, else if, for, while, case, catch, &&, ||, ?
 */
function calculateComplexity(node: ts.Node): number {
    let complexity = 1; // Base complexity

    function visit(node: ts.Node) {
        switch (node.kind) {
            case ts.SyntaxKind.IfStatement:
            case ts.SyntaxKind.WhileStatement:
            case ts.SyntaxKind.ForStatement:
            case ts.SyntaxKind.ForInStatement:
            case ts.SyntaxKind.ForOfStatement:
            case ts.SyntaxKind.CaseClause:
            case ts.SyntaxKind.CatchClause:
            case ts.SyntaxKind.ConditionalExpression:
                complexity++;
                break;
            case ts.SyntaxKind.BinaryExpression: {
                const binExpr = node as ts.BinaryExpression;
                if (binExpr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
                    binExpr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    complexity++;
                }
                break;
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(node);
    return complexity;
}

/**
 * Extract JSDoc comment from a node
 */
function getDocstring(node: ts.Node, sourceFile: ts.SourceFile): string | null {
    const fullText = sourceFile.getFullText();
    const jsDocComments = ts.getJSDocCommentsAndTags(node);

    if (jsDocComments.length > 0) {
        const firstComment = jsDocComments[0];
        return fullText.substring(firstComment.pos, firstComment.end).trim();
    }

    return null;
}

/**
 * Check if node has JSDoc documentation
 */
function hasDocumentation(node: ts.Node): boolean {
    return ts.getJSDocCommentsAndTags(node).length > 0;
}

/**
 * Extract parameter names from function/method
 */
function extractParameters(node: ts.FunctionLikeDeclaration): string[] {
    return node.parameters.map(param => {
        if (ts.isIdentifier(param.name)) {
            return param.name.text;
        } else if (ts.isObjectBindingPattern(param.name) || ts.isArrayBindingPattern(param.name)) {
            return `{destructured}`;
        }
        return 'unknown';
    });
}

/**
 * Extract return type annotation if present
 */
function extractReturnType(node: ts.FunctionLikeDeclaration): string | null {
    if (node.type) {
        return node.type.getText();
    }
    return null;
}

/**
 * Determine export type for a node
 */
function getExportType(node: ts.Node): 'named' | 'default' | 'internal' {
    // Check if node has export modifier
    if (ts.canHaveModifiers(node)) {
        const modifiers = ts.getModifiers(node);
        if (modifiers) {
            const hasExport = modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
            const hasDefault = modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);

            if (hasExport && hasDefault) {
                return 'default';
            }
            if (hasExport) {
                return 'named';
            }
        }
    }

    // Check parent for export assignment (export default ...)
    if (node.parent && ts.isExportAssignment(node.parent)) {
        return 'default';
    }

    return 'internal';
}

/**
 * Detect module system used in the file
 */
function detectModuleSystem(sourceFile: ts.SourceFile): 'esm' | 'commonjs' | 'unknown' {
    let hasEsmExport = false;
    let hasEsmImport = false;
    let hasCommonJs = false;

    function visit(node: ts.Node) {
        // ESM exports
        if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
            hasEsmExport = true;
        }

        // ESM imports
        if (ts.isImportDeclaration(node)) {
            hasEsmImport = true;
        }

        // Check for export modifiers on declarations (export function, export const, export class)
        if (ts.canHaveModifiers(node)) {
            const modifiers = ts.getModifiers(node);
            if (modifiers) {
                for (const modifier of modifiers) {
                    if (modifier.kind === ts.SyntaxKind.ExportKeyword) {
                        hasEsmExport = true;
                        break;
                    }
                }
            }
        }

        // Check for CommonJS patterns in property access (module.exports, exports.foo)
        if (ts.isPropertyAccessExpression(node)) {
            const text = node.getText(sourceFile);
            if (text.startsWith('module.exports') || text.startsWith('exports.')) {
                hasCommonJs = true;
            }
        }

        // Check for require() calls
        if (ts.isCallExpression(node)) {
            if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                hasCommonJs = true;
            }
        }

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    // File extension hints
    const ext = path.extname(sourceFile.fileName);
    if (ext === '.mjs') return 'esm';
    if (ext === '.cjs') return 'commonjs';

    // Detect based on content
    if (hasEsmExport || hasEsmImport) return 'esm';
    if (hasCommonJs) return 'commonjs';

    return 'unknown';
}

/**
 * Parse a TypeScript or JavaScript file and extract code items
 */
function parseFile(filepath: string): CodeItem[] {
    const items: CodeItem[] = [];

    // Read source file
    const sourceCode = fs.readFileSync(filepath, 'utf-8');

    // Determine language from extension
    const ext = path.extname(filepath);
    const language: 'typescript' | 'javascript' =
        ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript';

    // Create source file with proper script kind
    const scriptKind = ext === '.ts' || ext === '.tsx'
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
        filepath,
        sourceCode,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
    );

    // Detect module system
    const moduleSystem = detectModuleSystem(sourceFile);

    // Special handling for CommonJS exports
    function extractCommonJsExports(node: ts.Node) {
        // Handle: module.exports = { foo() {}, bar: function() {} }
        if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(node.left)) {

            const leftText = node.left.getText(sourceFile);
            if (leftText === 'module.exports' && ts.isObjectLiteralExpression(node.right)) {
                // Extract each method/property
                for (const prop of node.right.properties) {
                    if (ts.isMethodDeclaration(prop) || ts.isPropertyAssignment(prop)) {
                        const name = prop.name && ts.isIdentifier(prop.name) ? prop.name.text : 'anonymous';

                        let funcNode: ts.FunctionLikeDeclaration | null = null;
                        if (ts.isMethodDeclaration(prop)) {
                            funcNode = prop;
                        } else if (ts.isPropertyAssignment(prop) &&
                                   (ts.isFunctionExpression(prop.initializer) ||
                                    ts.isArrowFunction(prop.initializer))) {
                            funcNode = prop.initializer;
                        }

                        if (funcNode) {
                            items.push({
                                name,
                                type: 'function',
                                filepath,
                                line_number: sourceFile.getLineAndCharacterOfPosition(prop.getStart()).line + 1,
                                end_line: sourceFile.getLineAndCharacterOfPosition(prop.getEnd()).line + 1,
                                language,
                                complexity: calculateComplexity(funcNode),
                                impact_score: 0,
                                has_docs: hasDocumentation(prop),
                                parameters: extractParameters(funcNode),
                                return_type: extractReturnType(funcNode),
                                docstring: getDocstring(prop, sourceFile),
                                export_type: 'commonjs',
                                module_system: 'commonjs'
                            });
                        }
                    }
                }
            }
        }

        // Handle: exports.foo = function() {} or module.exports.foo = function() {}
        if (ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isPropertyAccessExpression(node.left)) {

            const leftText = node.left.getText(sourceFile);
            if ((leftText.startsWith('exports.') || leftText.startsWith('module.exports.')) &&
                (ts.isFunctionExpression(node.right) || ts.isArrowFunction(node.right))) {

                const nameParts = leftText.split('.');
                const name = nameParts[nameParts.length - 1];

                items.push({
                    name,
                    type: 'function',
                    filepath,
                    line_number: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                    end_line: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
                    language,
                    complexity: calculateComplexity(node.right),
                    impact_score: 0,
                    has_docs: hasDocumentation(node),
                    parameters: extractParameters(node.right),
                    return_type: extractReturnType(node.right),
                    docstring: getDocstring(node, sourceFile),
                    export_type: 'commonjs',
                    module_system: 'commonjs'
                });
            }
        }
    }

    // Visit all nodes in the AST
    function visit(node: ts.Node) {
        // Extract functions
        if (ts.isFunctionDeclaration(node) && node.name) {
            const exportType = getExportType(node);
            items.push({
                name: node.name.text,
                type: 'function',
                filepath,
                line_number: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                end_line: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
                language,
                complexity: calculateComplexity(node),
                impact_score: 0,
                has_docs: hasDocumentation(node),
                parameters: extractParameters(node),
                return_type: extractReturnType(node),
                docstring: getDocstring(node, sourceFile),
                export_type: exportType,
                module_system: moduleSystem
            });
        }

        // Extract variable declarations with arrow functions
        if (ts.isVariableStatement(node)) {
            const exportType = getExportType(node);
            for (const declaration of node.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) &&
                    declaration.initializer &&
                    (ts.isArrowFunction(declaration.initializer) ||
                     ts.isFunctionExpression(declaration.initializer))) {

                    items.push({
                        name: declaration.name.text,
                        type: 'function',
                        filepath,
                        line_number: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                        end_line: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
                        language,
                        complexity: calculateComplexity(declaration.initializer),
                        impact_score: 0,
                        has_docs: hasDocumentation(node),
                        parameters: extractParameters(declaration.initializer),
                        return_type: extractReturnType(declaration.initializer),
                        docstring: getDocstring(node, sourceFile),
                        export_type: exportType,
                        module_system: moduleSystem
                    });
                }
            }
        }

        // Extract classes
        if (ts.isClassDeclaration(node) && node.name) {
            const exportType = getExportType(node);
            items.push({
                name: node.name.text,
                type: 'class',
                filepath,
                line_number: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                end_line: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
                language,
                complexity: calculateComplexity(node),
                impact_score: 0,
                has_docs: hasDocumentation(node),
                parameters: [],
                return_type: null,
                docstring: getDocstring(node, sourceFile),
                export_type: exportType,
                module_system: moduleSystem
            });

            // Extract methods from class
            for (const member of node.members) {
                if ((ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member))
                    && member.name && ts.isIdentifier(member.name)) {

                    const methodName = `${node.name!.text}.${member.name.text}`;
                    items.push({
                        name: methodName,
                        type: 'method',
                        filepath,
                        line_number: sourceFile.getLineAndCharacterOfPosition(member.getStart()).line + 1,
                        end_line: sourceFile.getLineAndCharacterOfPosition(member.getEnd()).line + 1,
                        language,
                        complexity: calculateComplexity(member),
                        impact_score: 0,
                        has_docs: hasDocumentation(member),
                        parameters: ts.isMethodDeclaration(member) ? extractParameters(member) : [],
                        return_type: ts.isMethodDeclaration(member) ? extractReturnType(member) : null,
                        docstring: getDocstring(member, sourceFile),
                        export_type: exportType,
                        module_system: moduleSystem
                    });
                }
            }
        }

        // Extract interfaces (TypeScript only)
        if (ts.isInterfaceDeclaration(node)) {
            const exportType = getExportType(node);
            items.push({
                name: node.name.text,
                type: 'interface',
                filepath,
                line_number: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
                end_line: sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1,
                language: 'typescript',
                complexity: 1, // Interfaces have minimal complexity
                impact_score: 0,
                has_docs: hasDocumentation(node),
                parameters: [],
                return_type: null,
                docstring: getDocstring(node, sourceFile),
                export_type: exportType,
                module_system: moduleSystem
            });
        }

        // Check for CommonJS exports
        extractCommonJsExports(node);

        ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return items;
}

export { parseFile, CodeItem };
