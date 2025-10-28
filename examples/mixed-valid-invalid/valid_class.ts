/**
 * Valid TypeScript file with proper documentation.
 */

export class DataProcessor {
    private data: string[];

    /**
     * Create a new data processor.
     *
     * @param initialData - Initial data array
     */
    constructor(initialData: string[]) {
        this.data = initialData;
    }

    /**
     * Process all data items.
     *
     * @returns Processed item count
     */
    process(): number {
        return this.data.length;
    }
}

/**
 * Format a message string.
 *
 * @param text - Text to format
 * @returns Formatted text
 */
export function formatMessage(text: string): string {
    return text.toUpperCase();
}
