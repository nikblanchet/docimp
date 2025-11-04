/**
 * Integration tests for git timeout configuration.
 *
 * Verifies that timeout config values flow correctly from IConfig through
 * PythonBridge to Python subprocess arguments for transaction commands.
 *
 * These tests use mocked child_process to verify argument flow without
 * spawning actual Python subprocesses (focused on TypeScript layer integration).
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { PythonBridge } from '../../python-bridge/PythonBridge.js';
import { spawn } from 'child_process';
import type { IConfig } from '../../config/IConfig.js';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

describe('Git Timeout Config Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Helper to mock a successful transaction command response.
   */
  function mockTransactionSuccess(): void {
    const mockProcess = {
      stdout: {
        on: jest.fn((event: string, callback: (data: Buffer) => void) => {
          if (event === 'data') {
            callback(Buffer.from(JSON.stringify({ success: true })));
          }
        }),
      },
      stderr: { on: jest.fn() },
      on: jest.fn((event: string, callback: (code: number) => void) => {
        if (event === 'close') {
          callback(0);
        }
      }),
    };
    mockSpawn.mockReturnValue(mockProcess as any);
  }

  describe('Config flow from IConfig to Python args', () => {
    it('should pass custom git timeout config to beginTransaction', async () => {
      const customConfig: IConfig = {
        styleGuides: {},
        tone: 'concise',
        transaction: {
          git: {
            baseTimeout: 90000,
            fastScale: 0.25,
            slowScale: 8.0,
            maxTimeout: 720000,
          },
        },
      };

      const bridge = new PythonBridge('python3', '/mock/analyzer', customConfig);
      mockTransactionSuccess();

      await bridge.beginTransaction('session-abc-123');

      // Verify all 8 git timeout arguments are passed correctly
      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args).toContain('--git-timeout-base');
      expect(args[args.indexOf('--git-timeout-base') + 1]).toBe('90000');

      expect(args).toContain('--git-timeout-fast-scale');
      expect(args[args.indexOf('--git-timeout-fast-scale') + 1]).toBe('0.25');

      expect(args).toContain('--git-timeout-slow-scale');
      expect(args[args.indexOf('--git-timeout-slow-scale') + 1]).toBe('8');

      expect(args).toContain('--git-timeout-max');
      expect(args[args.indexOf('--git-timeout-max') + 1]).toBe('720000');
    });

    it('should pass custom git timeout config to recordWrite', async () => {
      const customConfig: IConfig = {
        styleGuides: {},
        tone: 'concise',
        transaction: {
          git: {
            baseTimeout: 120000,
            fastScale: 0.1,
            slowScale: 12.0,
            maxTimeout: 900000,
          },
        },
      };

      const bridge = new PythonBridge('python3', '/mock/analyzer', customConfig);
      mockTransactionSuccess();

      await bridge.recordWrite(
        'session-xyz',
        '/path/file.py',
        '/path/backup.bak',
        'func',
        'function',
        'python'
      );

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args[args.indexOf('--git-timeout-base') + 1]).toBe('120000');
      expect(args[args.indexOf('--git-timeout-fast-scale') + 1]).toBe('0.1');
      expect(args[args.indexOf('--git-timeout-slow-scale') + 1]).toBe('12');
      expect(args[args.indexOf('--git-timeout-max') + 1]).toBe('900000');
    });

    it('should pass custom git timeout config to commitTransaction', async () => {
      const customConfig: IConfig = {
        styleGuides: {},
        tone: 'concise',
        transaction: {
          git: {
            baseTimeout: 75000,
            fastScale: 0.333,
            slowScale: 6.5,
            maxTimeout: 600000,
          },
        },
      };

      const bridge = new PythonBridge('python3', '/mock/analyzer', customConfig);
      mockTransactionSuccess();

      await bridge.commitTransaction('session-final');

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      expect(args[args.indexOf('--git-timeout-base') + 1]).toBe('75000');
      expect(args[args.indexOf('--git-timeout-fast-scale') + 1]).toBe('0.333');
      expect(args[args.indexOf('--git-timeout-slow-scale') + 1]).toBe('6.5');
      expect(args[args.indexOf('--git-timeout-max') + 1]).toBe('600000');
    });

    it('should use default git timeouts when config not provided', async () => {
      const bridge = new PythonBridge('python3', '/mock/analyzer');
      mockTransactionSuccess();

      await bridge.beginTransaction('session-default');

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Verify default values from defaultConfig
      expect(args[args.indexOf('--git-timeout-base') + 1]).toBe('30000');
      expect(args[args.indexOf('--git-timeout-fast-scale') + 1]).toBe('0.167');
      expect(args[args.indexOf('--git-timeout-slow-scale') + 1]).toBe('4');
      expect(args[args.indexOf('--git-timeout-max') + 1]).toBe('300000');
    });
  });

  describe('Partial config handling', () => {
    it('should merge partial git timeout config with defaults', async () => {
      const partialConfig: IConfig = {
        styleGuides: {},
        tone: 'concise',
        transaction: {
          git: {
            baseTimeout: 50000, // Override base only
            // Other fields should use defaults
          },
        },
      };

      const bridge = new PythonBridge('python3', '/mock/analyzer', partialConfig);
      mockTransactionSuccess();

      await bridge.beginTransaction('session-partial');

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Custom value
      expect(args[args.indexOf('--git-timeout-base') + 1]).toBe('50000');
      // Defaults
      expect(args[args.indexOf('--git-timeout-fast-scale') + 1]).toBe('0.167');
      expect(args[args.indexOf('--git-timeout-slow-scale') + 1]).toBe('4');
      expect(args[args.indexOf('--git-timeout-max') + 1]).toBe('300000');
    });
  });

  describe('Argument ordering verification', () => {
    it('should include git timeout args after --format json', async () => {
      const config: IConfig = {
        styleGuides: {},
        tone: 'concise',
        transaction: {
          git: {
            baseTimeout: 45000,
            fastScale: 0.2,
            slowScale: 5.0,
            maxTimeout: 400000,
          },
        },
      };

      const bridge = new PythonBridge('python3', '/mock/analyzer', config);
      mockTransactionSuccess();

      await bridge.beginTransaction('session-123');

      const spawnCall = mockSpawn.mock.calls[0];
      const args = spawnCall[1] as string[];

      // Find indices
      const baseIndex = args.indexOf('--git-timeout-base');
      const formatIndex = args.indexOf('--format');

      // Git timeout args should come after --format
      expect(baseIndex).toBeGreaterThan(-1);
      expect(formatIndex).toBeGreaterThan(-1);
      expect(baseIndex).toBeGreaterThan(formatIndex);
    });
  });
});
