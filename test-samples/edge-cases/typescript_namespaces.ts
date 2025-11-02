/**
 * Test fixture for TypeScript namespace declarations.
 *
 * This file demonstrates namespace patterns that the parser should handle:
 * - Basic namespaces with exported functions
 * - Nested namespaces
 * - Namespace with classes
 * - Module keyword (legacy namespace syntax)
 */

/**
 * Utility namespace with helper functions.
 */
namespace Utils {
    /**
     * Format a string to uppercase.
     */
    export function toUpperCase(str: string): string {
        return str.toUpperCase();
    }

    /**
     * Format a string to lowercase.
     */
    export function toLowerCase(str: string): string {
        return str.toLowerCase();
    }

    /**
     * Capitalize first letter of a string.
     */
    export function capitalize(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

/**
 * Math namespace with calculations.
 */
namespace Math {
    /**
     * Calculate the sum of numbers.
     */
    export function sum(numbers: number[]): number {
        return numbers.reduce((a, b) => a + b, 0);
    }

    /**
     * Calculate the average of numbers.
     */
    export function average(numbers: number[]): number {
        return sum(numbers) / numbers.length;
    }

    /**
     * Nested namespace for advanced math operations.
     */
    export namespace Advanced {
        /**
         * Calculate factorial.
         */
        export function factorial(n: number): number {
            if (n <= 1) return 1;
            return n * factorial(n - 1);
        }

        /**
         * Calculate power.
         */
        export function power(base: number, exponent: number): number {
            return base ** exponent;
        }
    }
}

/**
 * Namespace with class definition.
 */
namespace Models {
    /**
     * User model class.
     */
    export class User {
        constructor(
            public id: number,
            public name: string
        ) {}

        /**
         * Get user display string.
         */
        toString(): string {
            return `User(${this.id}, ${this.name})`;
        }
    }

    /**
     * Product model class.
     */
    export class Product {
        constructor(
            public id: number,
            public name: string,
            public price: number
        ) {}

        /**
         * Get product display string.
         */
        toString(): string {
            return `Product(${this.id}, ${this.name}, $${this.price})`;
        }
    }
}

/**
 * Legacy module keyword (equivalent to namespace).
 */
module Legacy {
    /**
     * Legacy helper function.
     */
    export function helper(): string {
        return 'Legacy module syntax';
    }
}
