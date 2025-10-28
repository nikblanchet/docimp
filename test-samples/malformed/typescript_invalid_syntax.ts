/**
 * Test file with intentional syntax error: invalid type annotation.
 */

export class DataProcessor {
    process(data: string>>): void {  // Invalid type syntax with >>
        console.log(data);
    }
}
