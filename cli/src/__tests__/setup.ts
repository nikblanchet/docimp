/**
 * Jest setup file.
 *
 * Configures global mocks that need to be available before any test files are loaded.
 */

// Mock import.meta for PythonBridge
global.URL = class URL {
  pathname: string;

  constructor(url: string) {
    // Simple mock that returns a path
    this.pathname = '/Users/test/docimp/cli/src/python-bridge/PythonBridge.ts';
  }
} as any;

// Make import.meta available in test environment
(global as any).importMeta = {
  url: 'file:///Users/test/docimp/cli/src/python-bridge/PythonBridge.ts',
};
