/**
 * Test file with intentional syntax error: malformed statement.
 */

export function calculate(x: number, y: number): number {
    const result = x + y
    return result +  // Incomplete expression
}
