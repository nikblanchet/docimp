/**
 * Example TypeScript module for testing parser.
 */

/**
 * User interface for type safety
 */
interface User {
    id: string;
    name: string;
    email?: string;
}

/**
 * Generic repository interface demonstrating TypeScript features
 */
interface Repository<T> {
    findById(id: string): Promise<T | null>;
    save(item: T): Promise<void>;
}

/**
 * Logger interface for dependency injection
 */
interface Logger {
    log(message: string): void;
    error(message: string, error?: Error): void;
}

/**
 * Service class with dependency injection pattern
 */
export class UserService {
    /**
     * Constructor with injected dependencies
     * @param repo - User repository
     * @param logger - Logger instance
     */
    constructor(
        private repo: Repository<User>,
        private logger: Logger
    ) {}

    /**
     * Get user by ID with error handling
     * @param id - User identifier
     * @returns Promise resolving to User or null
     */
    async getUser(id: string): Promise<User | null> {
        try {
            this.logger.log(`Fetching user ${id}`);
            const user = await this.repo.findById(id);

            if (!user) {
                this.logger.log(`User ${id} not found`);
                return null;
            }

            return user;
        } catch (error) {
            this.logger.error('Error fetching user', error as Error);
            throw error;
        }
    }

    /**
     * Save user with validation
     * @param user - User object to save
     */
    async saveUser(user: User): Promise<void> {
        if (!user.id || !user.name) {
            throw new Error('Invalid user: id and name are required');
        }

        await this.repo.save(user);
        this.logger.log(`User ${user.id} saved`);
    }
}

/**
 * Utility function with type parameters
 */
export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Function without documentation
export function helperFunction(x: number, y: number): number {
    if (x > 0 && y > 0) {
        return x + y;
    } else if (x > 0) {
        return x;
    } else if (y > 0) {
        return y;
    }
    return 0;
}
