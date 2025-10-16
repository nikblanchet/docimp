/**
 * Tests for EditorLauncher.
 *
 * Tests external editor integration for manual editing of documentation.
 */

import { EditorLauncher } from '../../editor/EditorLauncher.js';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';

// Mock child_process, fs, and os modules
jest.mock('child_process');
jest.mock('fs');
jest.mock('os');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;
const mockReadFileSync = readFileSync as jest.MockedFunction<typeof readFileSync>;
const mockUnlinkSync = unlinkSync as jest.MockedFunction<typeof unlinkSync>;
const mockTmpdir = tmpdir as jest.MockedFunction<typeof tmpdir>;

describe('EditorLauncher', () => {
  let launcher: EditorLauncher;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    launcher = new EditorLauncher();
    originalEnv = { ...process.env };
    mockTmpdir.mockReturnValue('/tmp');
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('editor command selection', () => {
    it('should use VISUAL environment variable if set', async () => {
      process.env.VISUAL = 'vim';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      // Simulate editor exit
      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'vim',
        expect.arrayContaining([expect.stringMatching(/\.txt$/)]),
        expect.objectContaining({ stdio: 'inherit' })
      );
      expect(mockSpawn.mock.calls[0][2]).not.toHaveProperty('shell');
    });

    it('should use EDITOR environment variable if VISUAL not set', async () => {
      delete process.env.VISUAL;
      process.env.EDITOR = 'emacs';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'emacs',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should fall back to nano if no env vars set', async () => {
      delete process.env.VISUAL;
      delete process.env.EDITOR;
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'nano',
        expect.any(Array),
        expect.any(Object)
      );
    });
  });

  describe('editText', () => {
    it('should write initial text to temp file', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text', '.js');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/docimp-edit-.*\.js$/),
        'initial text',
        'utf-8'
      );
    });

    it('should use default .txt extension when not specified', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.txt$/),
        'initial text',
        'utf-8'
      );
    });

    it('should return edited text when content changed', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      const result = await promise;

      expect(result).toBe('edited content');
    });

    it('should return null when content unchanged', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('initial text');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      const result = await promise;

      expect(result).toBeNull();
    });

    it('should return null when content only differs in whitespace', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('  initial text  \n');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      const result = await promise;

      expect(result).toBeNull();
    });

    it('should clean up temp file after successful edit', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockUnlinkSync).toHaveBeenCalledWith(
        expect.stringMatching(/docimp-edit-.*\.txt$/)
      );
    });

    it('should reject when editor exits with non-zero code', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 1));

      await expect(promise).rejects.toThrow('Editor exited with code 1');
    });

    it('should reject when editor spawn fails', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('error', new Error('spawn failed')));

      await expect(promise).rejects.toThrow('Failed to launch editor: spawn failed');
    });

    it('should clean up temp file on error', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockUnlinkSync.mockImplementation(() => {
        // Mock successful cleanup
      });

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('error', new Error('spawn failed')));

      await expect(promise).rejects.toThrow();

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('cleanup failed');
      });

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('error', new Error('spawn failed')));

      // Should still reject with spawn error, not cleanup error
      await expect(promise).rejects.toThrow('Failed to launch editor: spawn failed');
    });
  });

  describe('file extension handling', () => {
    beforeEach(() => {
      // Reset mock to not throw for these tests
      mockUnlinkSync.mockImplementation(() => {
        // Successful cleanup
      });
    });

    it('should use .py extension for Python syntax highlighting', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('def foo():', '.py');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.py$/),
        'def foo():',
        'utf-8'
      );
    });

    it('should use .js extension for JavaScript syntax highlighting', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('function foo() {}', '.js');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringMatching(/\.js$/),
        'function foo() {}',
        'utf-8'
      );
    });
  });

  describe('Security: command injection prevention', () => {
    it('should not use shell:true to prevent command injection', async () => {
      process.env.EDITOR = 'vim';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      // Verify shell option is NOT set
      const spawnOptions = mockSpawn.mock.calls[0][2];
      expect(spawnOptions).not.toHaveProperty('shell');
    });

    it('should handle editor commands with arguments', async () => {
      process.env.EDITOR = 'code --wait';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      // Verify command is split correctly: cmd='code', args=['--wait', filepath]
      expect(mockSpawn).toHaveBeenCalledWith(
        'code',
        expect.arrayContaining(['--wait', expect.stringMatching(/\.txt$/)]),
        expect.objectContaining({ stdio: 'inherit' })
      );
    });

    it('should handle editor commands with multiple arguments', async () => {
      process.env.EDITOR = 'emacs -nw --no-splash';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      // Verify command is split correctly
      expect(mockSpawn).toHaveBeenCalledWith(
        'emacs',
        expect.arrayContaining(['-nw', '--no-splash', expect.stringMatching(/\.txt$/)]),
        expect.objectContaining({ stdio: 'inherit' })
      );
    });

    it('should not execute shell metacharacters', async () => {
      // Malicious editor command with shell metacharacters
      process.env.EDITOR = 'vim; echo "injected"';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = launcher.editText('initial text');

      // Without shell:true, spawn will try to execute 'vim;' as a literal command
      // which will fail (which is the correct security behavior)
      setImmediate(() => mockProcess.emit('error', new Error('spawn vim; ENOENT')));

      await expect(promise).rejects.toThrow('Failed to launch editor');

      // Verify that spawn was called with the full string as the command
      // (not executed through shell)
      expect(mockSpawn).toHaveBeenCalledWith(
        'vim;',
        expect.any(Array),
        expect.not.objectContaining({ shell: true })
      );
    });

    it('should handle whitespace in editor command', async () => {
      process.env.EDITOR = '  vim  --noplugin  ';
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFileSync.mockReturnValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      // Verify whitespace is trimmed and split correctly
      expect(mockSpawn).toHaveBeenCalledWith(
        'vim',
        expect.arrayContaining(['--noplugin', expect.stringMatching(/\.txt$/)]),
        expect.objectContaining({ stdio: 'inherit' })
      );
    });
  });
});
