/**
 * User service for managing user data with dependency injection.
 */

/**
 * User data interface
 */
export interface User {
    id: string;
    name: string;
    email: string;
    role: string;
}

/**
 * Database interface for dependency injection
 */
export interface Database {
    query(sql: string, params: any[]): Promise<any[]>;
    execute(sql: string, params: any[]): Promise<void>;
}

/**
 * Logger interface for dependency injection
 */
export interface Logger {
    info(message: string): void;
    error(message: string, error?: Error): void;
}

/**
 * User service class with dependency injection pattern
 */
export class UserService {
    /**
     * Constructor with injected dependencies
     * @param db - Database connection
     * @param logger - Logger instance
     */
    constructor(
        private db: Database,
        private logger: Logger
    ) {}

    /**
     * Get user by ID
     * @param id - User identifier
     * @returns Promise resolving to User or null
     */
    async getUserById(id: string): Promise<User | null> {
        try {
            this.logger.info(`Fetching user ${id}`);
            const results = await this.db.query(
                'SELECT * FROM users WHERE id = ?',
                [id]
            );

            if (results.length === 0) {
                this.logger.info(`User ${id} not found`);
                return null;
            }

            return results[0] as User;
        } catch (error) {
            this.logger.error('Error fetching user', error as Error);
            throw error;
        }
    }

    async createUser(name: string, email: string, role: string = 'user'): Promise<User> {
        const id = this.generateId();
        const user: User = { id, name, email, role };

        await this.db.execute(
            'INSERT INTO users (id, name, email, role) VALUES (?, ?, ?, ?)',
            [id, name, email, role]
        );

        this.logger.info(`Created user ${id}`);
        return user;
    }

    /**
     * Update user details
     */
    async updateUser(id: string, updates: Partial<User>): Promise<void> {
        const fields = Object.keys(updates)
            .map(key => `${key} = ?`)
            .join(', ');
        const values = Object.values(updates);

        await this.db.execute(
            `UPDATE users SET ${fields} WHERE id = ?`,
            [...values, id]
        );

        this.logger.info(`Updated user ${id}`);
    }

    async deleteUser(id: string): Promise<void> {
        await this.db.execute('DELETE FROM users WHERE id = ?', [id]);
        this.logger.info(`Deleted user ${id}`);
    }

    private generateId(): string {
        return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

/**
 * Get users by role
 */
export async function getUsersByRole(
    db: Database,
    role: string
): Promise<User[]> {
    const results = await db.query('SELECT * FROM users WHERE role = ?', [role]);
    return results as User[];
}

export function validateUser(user: Partial<User>): boolean {
    if (!user.name || user.name.length < 2) {
        return false;
    }
    if (!user.email || !user.email.includes('@')) {
        return false;
    }
    return true;
}
