/**
 * Test fixture for mixed ESM and CommonJS module patterns.
 *
 * This file intentionally mixes ES Module syntax with CommonJS patterns
 * to test the parser's module system detection logic.
 *
 * Expected behavior: Parser should classify this as ESM since the presence
 * of `export` keyword indicates ES Module syntax takes precedence.
 *
 * Note: This pattern is uncommon but can occur in legacy codebases
 * during migration from CommonJS to ESM.
 */

/**
 * ESM named export (indicates ESM module system).
 * @returns {string} ESM identifier
 */
export function esmFunction() {
    return 'This is an ESM export';
}

/**
 * Another ESM named export.
 * @param {string} message - Message to process
 * @returns {string} Processed message
 */
export function processMessage(message) {
    return message.toUpperCase();
}

/**
 * Internal helper function (not exported).
 * @param {number} x - Input value
 * @returns {number} Doubled value
 */
function internalHelper(x) {
    return x * 2;
}

/**
 * CommonJS-style export (mixed with ESM).
 * This should NOT change the module system classification to CommonJS.
 *
 * @type {{cjsFlag: boolean, getValue: () => string}}
 */
module.exports.commonJsProperty = {
    cjsFlag: true,
    getValue() {
        return 'Mixed pattern';
    }
};

/**
 * Another function using ESM export.
 * @param {Array<number>} numbers - Numbers to sum
 * @returns {number} Sum of numbers
 */
export function sumNumbers(numbers) {
    return numbers.reduce((a, b) => a + b, 0);
}

/**
 * Default export (ESM syntax).
 */
export default class MixedModuleClass {
    /**
     * Constructor for mixed module class.
     * @param {string} name - Class instance name
     */
    constructor(name) {
        this.name = name;
    }

    /**
     * Get class instance name.
     * @returns {string} Instance name
     */
    getName() {
        return this.name;
    }

    /**
     * Static method.
     * @returns {string} Class identifier
     */
    static getType() {
        return 'MixedModuleClass';
    }
}

/**
 * Additional exports property (CommonJS pattern).
 * Parser should still classify file as ESM due to export keywords above.
 */
exports.anotherCjsExport = function() {
    return 'This is a CommonJS-style export';
};
