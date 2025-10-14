/**
 * TypeScript/JavaScript Parser CLI Entry Point
 *
 * Command-line interface for parsing TypeScript/JavaScript files.
 * This file is invoked as a Node.js subprocess by the Python analyzer.
 */

import * as fs from 'fs';
import { parseFile } from './ts-js-parser-helper.js';

/**
 * Main entry point for CLI usage
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Usage: node ts-js-parser-cli.js <filepath>');
        process.exit(1);
    }

    const filepath = args[0];

    if (!fs.existsSync(filepath)) {
        console.error(JSON.stringify({ error: `File not found: ${filepath}` }));
        process.exit(1);
    }

    try {
        const items = parseFile(filepath);
        console.log(JSON.stringify(items, null, 2));
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({ error: errorMessage }));
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
