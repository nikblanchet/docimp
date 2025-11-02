/**
 * Test fixture for Unicode identifiers in JavaScript.
 *
 * JavaScript and TypeScript allow Unicode characters in identifiers.
 * This file demonstrates that the parser handles non-ASCII function names.
 *
 * ECMAScript specification allows:
 * - Letters from any language (Latin, Cyrillic, Chinese, Japanese, Arabic, etc.)
 * - Mathematical symbols (π, Σ, etc.)
 * - Emoji (with some restrictions)
 */

/**
 * Chinese function name (means "hello").
 * @returns {string} Greeting in Chinese
 */
function 你好() {
    return '你好世界';
}

/**
 * Japanese function name (means "calculation").
 * @param {number} x - First number
 * @param {number} y - Second number
 * @returns {number} Sum
 */
function 計算(x, y) {
    return x + y;
}

/**
 * Greek letter pi as constant.
 */
const π = 3.14159265359;

/**
 * Calculate circle circumference using pi.
 * @param {number} radius - Circle radius
 * @returns {number} Circumference
 */
function calculateCircumference(radius) {
    return 2 * π * radius;
}

/**
 * Greek letter sigma for summation.
 */
const Σ = (numbers) => numbers.reduce((a, b) => a + b, 0);

/**
 * Russian function name (means "data").
 * @returns {object} Sample data
 */
function данные() {
    return {
        имя: 'Пользователь',
        возраст: 25
    };
}

/**
 * Arabic function name (means "calculation").
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Product
 */
function حساب(a, b) {
    return a * b;
}

/**
 * Spanish function name with accent.
 * @returns {string} Greeting in Spanish
 */
function salutación() {
    return 'Hola';
}

/**
 * French function name with accents.
 * @param {string} texte - Text to transform
 * @returns {string} Transformed text
 */
function transforméTexte(texte) {
    return texte.toUpperCase();
}

/**
 * Mathematical symbol as function name.
 * @param {number} x - Input value
 * @returns {number} Absolute value
 */
const Δ = (x) => Math.abs(x);

/**
 * Export all Unicode functions for testing.
 */
export {
    你好,
    計算,
    π,
    Σ,
    данные,
    حساب,
    salutación,
    transforméTexte,
    Δ,
    calculateCircumference
};
