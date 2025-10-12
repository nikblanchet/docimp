/**
 * Example CommonJS module for testing parser.
 */

/**
 * Calculate sum of numbers
 * @param {number[]} numbers - Array of numbers
 * @returns {number} Sum of all numbers
 */
function sum(numbers) {
    if (!Array.isArray(numbers)) {
        throw new TypeError('Expected an array of numbers');
    }

    return numbers.reduce((acc, num) => {
        if (typeof num !== 'number') {
            throw new TypeError('All elements must be numbers');
        }
        return acc + num;
    }, 0);
}

/**
 * Calculate product of numbers
 * @param {number[]} numbers - Array of numbers
 * @returns {number} Product of all numbers
 */
function product(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
        return 0;
    }

    return numbers.reduce((acc, num) => acc * num, 1);
}

/**
 * Math utilities object exported via CommonJS
 */
module.exports = {
    sum,
    product,

    /**
     * Calculate average of numbers
     * @param {number[]} numbers - Array of numbers
     * @returns {number} Average value
     */
    average(numbers) {
        if (!numbers || numbers.length === 0) {
            return 0;
        }
        return sum(numbers) / numbers.length;
    },

    /**
     * Find maximum value
     * @param {number[]} numbers - Array of numbers
     * @returns {number} Maximum value
     */
    max(numbers) {
        if (!numbers || numbers.length === 0) {
            return -Infinity;
        }
        return Math.max(...numbers);
    },

    /**
     * Find minimum value
     * @param {number[]} numbers - Array of numbers
     * @returns {number} Minimum value
     */
    min(numbers) {
        if (!numbers || numbers.length === 0) {
            return Infinity;
        }
        return Math.min(...numbers);
    }
};

/**
 * Calculate median value
 * @param {number[]} numbers - Array of numbers
 * @returns {number} Median value
 */
module.exports.median = function(numbers) {
    if (!numbers || numbers.length === 0) {
        return 0;
    }

    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
        return sorted[mid];
    }
};

// Export helper without documentation
exports.undocumentedHelper = (a, b) => {
    if (a && b) {
        return a + b;
    }
    return a || b || 0;
};
