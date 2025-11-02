/**
 * Test fixture for TypeScript decorators.
 *
 * This file demonstrates decorator patterns that the parser should handle:
 * - Class decorators
 * - Method decorators
 * - Property decorators
 * - Parameter decorators
 *
 * Note: Decorator metadata tracking is not currently implemented.
 * This fixture verifies that decorators don't prevent parsing.
 */

/**
 * Class decorator factory.
 */
function Component(options?: any) {
    return function (target: any) {
        // Decorator logic
    };
}

/**
 * Property decorator factory.
 */
function Input() {
    return function (target: any, propertyKey: string) {
        // Decorator logic
    };
}

/**
 * Method decorator factory.
 */
function Log() {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        // Decorator logic
    };
}

/**
 * Decorated component class.
 */
@Component({ selector: 'app-user' })
class UserComponent {
    @Input()
    userId: number;

    @Input()
    userName: string;

    /**
     * Get user display name.
     */
    @Log()
    getDisplayName(): string {
        return `User ${this.userId}: ${this.userName}`;
    }

    /**
     * Update user information.
     */
    @Log()
    updateUser(id: number, name: string): void {
        this.userId = id;
        this.userName = name;
    }
}

/**
 * Multiple decorators on a single element.
 */
@Component({ selector: 'app-admin' })
class AdminComponent extends UserComponent {
    @Input()
    permissions: string[];

    /**
     * Check if admin has permission.
     */
    @Log()
    hasPermission(permission: string): boolean {
        return this.permissions.includes(permission);
    }
}
