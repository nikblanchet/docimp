/**
 * Test fixture for complex JSDoc patterns in JavaScript.
 *
 * This file demonstrates advanced JSDoc patterns that the parser should handle:
 * - Complex nested types (Array<Promise<T>>)
 * - Type imports from other modules
 * - Union and intersection types
 * - Generic types in JSDoc
 * - Special characters in descriptions
 * - Multiline descriptions with formatting
 */

/**
 * Process items asynchronously with complex type annotations.
 *
 * This function demonstrates nested generic types in JSDoc.
 * The parser should handle Array<Promise<Result>> without errors.
 *
 * @param {Array<Promise<string>>} items - Array of promises resolving to strings
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Array<string>>} Resolved items
 */
async function processItems(items, timeout) {
    return Promise.all(items);
}

/**
 * Transform data using imported type definitions.
 *
 * This demonstrates JSDoc type imports which reference external type definitions.
 *
 * @param {import('./types').UserData} userData - User data object
 * @param {import('./config').AppConfig} config - Application configuration
 * @returns {import('./models').TransformedUser} Transformed user object
 */
function transformUserData(userData, config) {
    return {
        id: userData.id,
        name: userData.name,
        settings: config.defaultSettings
    };
}

/**
 * Handle union types in JSDoc.
 *
 * Description with <special> HTML-like characters & symbols.
 * Also includes "quotes" and 'apostrophes' in description.
 *
 * @param {string | number | boolean} value - Value can be multiple types
 * @param {('strict' | 'loose' | 'auto')} mode - String literal union type
 * @returns {string} Stringified value
 */
function stringify(value, mode = 'auto') {
    return String(value);
}

/**
 * Complex object shape with nested properties.
 *
 * @param {{
 *   id: number,
 *   name: string,
 *   metadata: {
 *     createdAt: Date,
 *     updatedAt: Date,
 *     tags: Array<string>
 *   },
 *   permissions: Array<{
 *     resource: string,
 *     actions: Array<'read' | 'write' | 'delete'>
 *   }>
 * }} entity - Complex nested object
 * @returns {boolean} Validation result
 */
function validateEntity(entity) {
    return entity.id > 0 && entity.name.length > 0;
}

/**
 * Generic function with type parameters in JSDoc.
 *
 * @template T
 * @param {T} value - Generic value
 * @param {(item: T) => boolean} predicate - Validation function
 * @returns {T | null} Value if valid, null otherwise
 */
function validate(value, predicate) {
    return predicate(value) ? value : null;
}

/**
 * Callback type definitions.
 *
 * @callback TransformCallback
 * @param {any} input - Input value
 * @returns {any} Transformed value
 *
 * @param {Array<any>} items - Items to transform
 * @param {TransformCallback} transformer - Transform function
 * @returns {Array<any>} Transformed items
 */
function mapItems(items, transformer) {
    return items.map(transformer);
}

/**
 * Rest parameters with spread types.
 *
 * @param {string} separator - Join separator
 * @param {...(string | number)} items - Variable number of items
 * @returns {string} Joined string
 */
function join(separator, ...items) {
    return items.join(separator);
}

/**
 * Destructured parameters with types.
 *
 * @param {object} options - Configuration options
 * @param {string} options.url - Target URL
 * @param {('GET' | 'POST' | 'PUT' | 'DELETE')} options.method - HTTP method
 * @param {Record<string, string>} [options.headers] - Optional headers
 * @param {any} [options.body] - Optional request body
 * @returns {Promise<Response>} Fetch response
 */
async function request({ url, method, headers = {}, body }) {
    return fetch(url, { method, headers, body: JSON.stringify(body) });
}

/**
 * Readonly and utility types.
 *
 * @param {Readonly<{id: number, name: string}>} immutableData - Read-only data
 * @param {Partial<{id: number, name: string, age: number}>} updates - Partial updates
 * @returns {Record<string, any>} Merged result
 */
function mergeData(immutableData, updates) {
    return { ...immutableData, ...updates };
}

/**
 * Promise resolution types.
 *
 * @param {Promise<{data: Array<any>, meta: {page: number}}>} response - API response promise
 * @returns {Promise<Array<any>>} Extracted data
 */
async function extractData(response) {
    const result = await response;
    return result.data;
}

export {
    processItems,
    transformUserData,
    stringify,
    validateEntity,
    validate,
    mapItems,
    join,
    request,
    mergeData,
    extractData
};
