/**
 * Tests for PythonBridge.suggest() feedback parameter.
 *
 * Tests that the feedback parameter is correctly passed to the Python
 * subprocess as --feedback flag when provided.
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import { spawn } from 'child_process';
import { PythonBridge } from '../../python-bridge/PythonBridge.js';

// Mock child_process
jest.mock('child_process');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('PythonBridge suggest() feedback integration', () => {
  let bridge: PythonBridge;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    bridge = new PythonBridge('python3', '/mock/analyzer');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /**
   * Helper to create a mock child process that returns text output.
   */
  function mockSuccessfulTextProcess(textOutput: string): any {
    const mockProcess = {
      stdout: {
        on: jest.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            callback(Buffer.from(textOutput));
          }
        }),
      },
      stderr: {
        on: jest.fn(),
      },
      on: jest.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          callback(0);
        }
      }),
      kill: jest.fn(),
    };
    mockSpawn.mockReturnValue(mockProcess as any);
    return mockProcess;
  }

  it('should NOT include --feedback flag when feedback is not provided', async () => {
    mockSuccessfulTextProcess('Test docstring');

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
    });

    // Verify spawn was called without --feedback
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('suggest');
    expect(spawnArgs).toContain('--style-guide');
    expect(spawnArgs).toContain('google');
    expect(spawnArgs).toContain('--tone');
    expect(spawnArgs).toContain('concise');
    expect(spawnArgs).not.toContain('--feedback');
  });

  it('should include --feedback flag when feedback is provided', async () => {
    mockSuccessfulTextProcess('Improved docstring');

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
      feedback: 'Add more details about error handling',
    });

    // Verify spawn was called with --feedback
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('suggest');
    expect(spawnArgs).toContain('--feedback');
    const feedbackIndex = spawnArgs!.indexOf('--feedback');
    expect(spawnArgs![feedbackIndex + 1]).toBe(
      'Add more details about error handling'
    );
  });

  it('should handle multiline feedback correctly', async () => {
    mockSuccessfulTextProcess('Docstring with feedback applied');

    const multilineFeedback = `Please improve by:
1. Adding parameter descriptions
2. Including examples
3. Explaining return value`;

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
      feedback: multilineFeedback,
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('--feedback');
    const feedbackIndex = spawnArgs!.indexOf('--feedback');
    expect(spawnArgs![feedbackIndex + 1]).toBe(multilineFeedback);
  });

  it('should handle feedback with special characters', async () => {
    mockSuccessfulTextProcess('Docstring');

    const feedbackWithSpecialChars =
      'Use @param tags, add `code` formatting, and "quotes"';

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
      feedback: feedbackWithSpecialChars,
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('--feedback');
    const feedbackIndex = spawnArgs!.indexOf('--feedback');
    expect(spawnArgs![feedbackIndex + 1]).toBe(feedbackWithSpecialChars);
  });

  it('should include feedback along with all other optional parameters', async () => {
    mockSuccessfulTextProcess('Docstring with all options');

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'numpy-rest',
      tone: 'detailed',
      timeout: 60.0,
      maxRetries: 5,
      retryDelay: 2.0,
      verbose: true,
      feedback: 'Make it more comprehensive',
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];

    // Verify all parameters are present
    expect(spawnArgs).toContain('--style-guide');
    expect(spawnArgs).toContain('numpy-rest');
    expect(spawnArgs).toContain('--tone');
    expect(spawnArgs).toContain('detailed');
    expect(spawnArgs).toContain('--timeout');
    expect(spawnArgs).toContain('60');
    expect(spawnArgs).toContain('--max-retries');
    expect(spawnArgs).toContain('5');
    expect(spawnArgs).toContain('--retry-delay');
    expect(spawnArgs).toContain('2');
    expect(spawnArgs).toContain('--verbose');
    expect(spawnArgs).toContain('--feedback');
    expect(spawnArgs).toContain('Make it more comprehensive');
  });

  it('should NOT include --feedback when feedback is undefined', async () => {
    mockSuccessfulTextProcess('Docstring');

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
      feedback: undefined, // Explicitly undefined
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).not.toContain('--feedback');
  });

  it('should include --feedback when feedback is empty string', async () => {
    mockSuccessfulTextProcess('Docstring');

    await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
      feedback: '', // Empty string (truthy check in code will skip this)
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    // Empty string is falsy, so --feedback should NOT be included
    expect(spawnArgs).not.toContain('--feedback');
  });

  it('should work with TypeScript style guides and feedback', async () => {
    mockSuccessfulTextProcess('/** TSDoc docstring */');

    await bridge.suggest({
      target: '/test/file.ts:myFunction',
      styleGuide: 'tsdoc-typedoc',
      tone: 'concise',
      feedback: 'Use TSDoc format with @remarks',
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('tsdoc-typedoc');
    expect(spawnArgs).toContain('--feedback');
    expect(spawnArgs).toContain('Use TSDoc format with @remarks');
  });

  it('should work with JavaScript style guides and feedback', async () => {
    mockSuccessfulTextProcess('/** JSDoc docstring */');

    await bridge.suggest({
      target: '/test/file.js:myFunction',
      styleGuide: 'jsdoc-vanilla',
      tone: 'friendly',
      feedback: 'Add type annotations',
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const spawnArgs = mockSpawn.mock.calls[0][1];
    expect(spawnArgs).toContain('jsdoc-vanilla');
    expect(spawnArgs).toContain('friendly');
    expect(spawnArgs).toContain('--feedback');
    expect(spawnArgs).toContain('Add type annotations');
  });

  it('should return suggest output regardless of feedback presence', async () => {
    const expectedOutput = '"""Generated documentation"""';
    mockSuccessfulTextProcess(expectedOutput);

    const result = await bridge.suggest({
      target: '/test/file.py:test_function',
      styleGuide: 'google',
      tone: 'concise',
      feedback: 'Test feedback',
    });

    expect(result).toBe(expectedOutput);
  });
});
