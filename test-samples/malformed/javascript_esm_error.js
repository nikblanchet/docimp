/**
 * Test file with intentional syntax error: ESM with malformed export.
 */

export function addNumbers(a, b) {
    return a + b;
}

export default class Calculator
    constructor() {  // Missing opening brace for class
        this.value = 0;
    }
}
