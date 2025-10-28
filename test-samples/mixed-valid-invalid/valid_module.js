/**
 * Valid JavaScript file with proper documentation.
 */

/**
 * Add two numbers together.
 *
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
export function add(a, b) {
    return a + b;
}

/**
 * Multiply two numbers.
 *
 * @param {number} x - First number
 * @param {number} y - Second number
 * @returns {number} Product of x and y
 */
export const multiply = (x, y) => x * y;

export default class Calculator {
    /**
     * Create a new calculator.
     */
    constructor() {
        this.result = 0;
    }

    /**
     * Get the current result.
     *
     * @returns {number} Current result value
     */
    getResult() {
        return this.result;
    }
}
