/**
 * Test file with intentional syntax error: unclosed array bracket.
 */

export function getItems() {
    return [
        'apple',
        'banana',
        'cherry'
    // Missing closing bracket
}

export const config = {
    items: getItems()
};
