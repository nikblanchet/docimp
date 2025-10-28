/**
 * Test file with intentional syntax error: missing closing brace.
 */

export function processData(items: string[]): number {
    let count = 0;
    for (const item of items) {
        count++;
    }
    return count;
// Missing closing brace for function
