/**
 * Jest setup file.
 *
 * Configures global mocks that need to be available before any test files are loaded.
 */

import { resolve } from 'path';

// Set DOCIMP_ANALYZER_PATH for all tests
// This environment variable tells PythonBridge where to find the analyzer
process.env.DOCIMP_ANALYZER_PATH = resolve(
  __dirname,
  '..',
  '..',
  '..',
  'analyzer'
);

// Mock import.meta for PythonBridge
global.URL = class URL {
  pathname: string;

  constructor(_url: string) {
    // Simple mock that returns a path
    this.pathname = '/Users/test/docimp/cli/src/python-bridge/PythonBridge.ts';
  }
} as any;

// Make import.meta available in test environment
(global as any).importMeta = {
  url: 'file:///Users/test/docimp/cli/src/python-bridge/PythonBridge.ts',
};
