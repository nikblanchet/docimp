/**
 * Example JavaScript module with ESM and JSDoc types for testing parser.
 */

/**
 * @typedef {Object} User
 * @property {string} id - User identifier
 * @property {string} name - User name
 * @property {string} [email] - Optional email address
 */

/**
 * @typedef {Object} Database
 * @property {Function} insert - Insert function
 * @property {Function} query - Query function
 */

/**
 * Fetch user by ID from API
 * @param {string} userId - User identifier
 * @returns {Promise<User>} User object
 */
export async function fetchUser(userId) {
    // Simulate API call with complexity
    if (!userId) {
        throw new Error('User ID is required');
    }

    try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch user:', error);
        throw error;
    }
}

/**
 * Get first item from array
 * @template T
 * @param {T[]} items - Array of items
 * @returns {T|undefined} First item or undefined
 */
export const first = (items) => items[0];

/**
 * Filter users by email domain
 * @param {User[]} users - Array of users
 * @param {string} domain - Email domain to filter by
 * @returns {User[]} Filtered users
 */
export const filterByDomain = (users, domain) => {
    return users.filter(user => {
        if (user.email && user.email.includes('@')) {
            const userDomain = user.email.split('@')[1];
            return userDomain === domain;
        }
        return false;
    });
};

/**
 * User repository class with dependency injection
 */
export class UserRepository {
    /**
     * Constructor with database dependency
     * @param {Database} db - Database connection
     */
    constructor(db) {
        this.db = db;
    }

    /**
     * Save user to database
     * @param {User} user - User object to save
     * @returns {Promise<void>}
     */
    async save(user) {
        if (!user.id || !user.name) {
            throw new Error('Invalid user');
        }

        await this.db.insert('users', user);
    }

    /**
     * Find user by ID
     * @param {string} id - User identifier
     * @returns {Promise<User|null>} User or null if not found
     */
    async findById(id) {
        const results = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);

        if (results.length === 0) {
            return null;
        }

        return results[0];
    }

    /**
     * Get total count of users
     * @returns {Promise<number>} User count
     */
    async getCount() {
        const result = await this.db.query('SELECT COUNT(*) as count FROM users');
        return result[0].count;
    }
}

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} True if valid
 */
export function validateEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

// Function without documentation (should be detected)
export function undocumentedHelper(a, b) {
    if (a > 0 && b > 0) {
        return a + b;
    } else if (a > 0) {
        return a;
    }
    return b;
}
