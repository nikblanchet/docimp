/**
 * Test fixture for generic type parameters in TypeScript.
 *
 * This file demonstrates various generic patterns that the parser should handle:
 * - Generic functions with type parameters
 * - Generic classes
 * - Multiple type parameters
 * - Constrained generics
 * - Generic interfaces
 */

/**
 * Simple generic identity function.
 */
function identity<T>(arg: T): T {
    return arg;
}

/**
 * Generic function with multiple type parameters.
 */
function pair<T, U>(first: T, second: U): [T, U] {
    return [first, second];
}

/**
 * Generic function with constraints.
 */
function getLength<T extends { length: number }>(arg: T): number {
    return arg.length;
}

/**
 * Generic class for a container.
 */
class Container<T> {
    private value: T;

    constructor(value: T) {
        this.value = value;
    }

    getValue(): T {
        return this.value;
    }

    setValue(value: T): void {
        this.value = value;
    }
}

/**
 * Generic interface for comparable objects.
 */
interface Comparable<T> {
    compareTo(other: T): number;
}

/**
 * Class implementing generic interface.
 */
class NumericValue implements Comparable<NumericValue> {
    constructor(private value: number) {}

    compareTo(other: NumericValue): number {
        return this.value - other.value;
    }

    getValue(): number {
        return this.value;
    }
}
