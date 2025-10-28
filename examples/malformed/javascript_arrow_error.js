/**
 * Test file with intentional syntax error: arrow function with syntax error.
 */

export const multiply = (x, y) => {
    const result = x * y
    return result
};

export const divide = (x, y) => x /  // Incomplete expression
