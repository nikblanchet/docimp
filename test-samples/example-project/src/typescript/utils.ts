/**
 * Utility functions for common operations.
 */

/**
 * Format date as ISO string
 * @param date - Date to format
 * @returns ISO formatted date string
 */
export function formatDate(date: Date): string {
    return date.toISOString();
}

/**
 * Parse ISO date string
 */
export function parseDate(dateStr: string): Date {
    return new Date(dateStr);
}

export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Capitalize first letter of string
 * @param str - String to capitalize
 * @returns Capitalized string
 */
export function capitalize(str: string): string {
    if (!str) {
        return str;
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function truncate(str: string, maxLength: number): string {
    if (str.length <= maxLength) {
        return str;
    }
    return str.slice(0, maxLength - 3) + '...';
}

/**
 * Check if string is valid JSON
 */
export function isValidJson(str: string): boolean {
    try {
        JSON.parse(str);
        return true;
    } catch {
        return false;
    }
}

export function debounce<T extends (...args: any[]) => void>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return function (...args: Parameters<T>) {
        if (timeout) {
            clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}

/**
 * Retry async operation with exponential backoff
 * @param fn - Async function to retry
 * @param maxRetries - Maximum retry attempts
 * @returns Promise with result or error
 */
export async function retry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3
): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (attempt < maxRetries - 1) {
                const delayMs = Math.pow(2, attempt) * 1000;
                await delay(delayMs);
            }
        }
    }

    throw lastError!;
}
