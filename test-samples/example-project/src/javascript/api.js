/**
 * API client for making HTTP requests.
 * @module api
 */

/**
 * @typedef {Object} RequestOptions
 * @property {string} method - HTTP method
 * @property {Object} [headers] - Request headers
 * @property {any} [body] - Request body
 */

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether request succeeded
 * @property {any} data - Response data
 * @property {string} [error] - Error message if failed
 */

/**
 * Make HTTP GET request
 * @param {string} url - URL to fetch
 * @param {Object} [headers] - Optional headers
 * @returns {Promise<ApiResponse>} Response object
 */
export async function get(url, headers = {}) {
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, data: null, error: error.message };
    }
}

/**
 * Make HTTP POST request
 */
export async function post(url, body, headers = {}) {
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return { success: true, data };
    } catch (error) {
        return { success: false, data: null, error: error.message };
    }
}

export async function put(url, body, headers = {}) {
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * Make HTTP DELETE request
 * @param {string} url - URL to delete
 * @returns {Promise<boolean>} True if successful
 */
export async function del(url) {
    const response = await fetch(url, { method: 'DELETE' });
    return response.ok;
}

/**
 * API client class with base URL configuration
 */
export class ApiClient {
    /**
     * Create API client
     * @param {string} baseUrl - Base URL for all requests
     * @param {Object} [defaultHeaders] - Default headers
     */
    constructor(baseUrl, defaultHeaders = {}) {
        this.baseUrl = baseUrl;
        this.defaultHeaders = defaultHeaders;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = { ...this.defaultHeaders, ...options.headers };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            throw new Error(`Request failed: ${response.statusText}`);
        }

        return await response.json();
    }

    /**
     * GET request to endpoint
     * @param {string} endpoint - API endpoint
     * @returns {Promise<any>} Response data
     */
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    }

    /**
     * POST request to endpoint
     */
    async post(endpoint, data) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
}
