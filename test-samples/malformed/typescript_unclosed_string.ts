/**
 * Test file with intentional syntax error: unclosed string literal.
 */

export function getMessage(): string {
    return "This string is never closed;
}
