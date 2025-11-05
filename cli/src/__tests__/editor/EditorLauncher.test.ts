/**
 * Tests for EditorLauncher.
 *
 * Tests external editor integration for manual editing of documentation.
 */

import { EditorLauncher } from '../../editor/editor-launcher.js';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import tmp from 'tmp';
import { EventEmitter } from 'events';

// Mock child_process, fs, and tmp modules
jest.mock('child_process');
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    ...actualFs,
    promises: {
      writeFile: jest.fn(),
      readFile: jest.fn(),
    },
    close: jest.fn((fd, callback) => callback(null)), // Mock callback-based close
    constants: actualFs.constants, // tmp library needs these
  };
});
jest.mock('tmp');

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
const mockTmpFile = tmp.file as jest.MockedFunction<typeof tmp.file>;

describe('EditorLauncher', () => {
  let launcher: EditorLauncher;
  let originalEnv: NodeJS.ProcessEnv;
  let mockRemoveCallback: jest.Mock;

  beforeEach(() => {
    launcher = new EditorLauncher();
    originalEnv = { ...process.env };

    // Mock tmp.file to return temp file info with removeCallback
    mockRemoveCallback = jest.fn();
    mockTmpFile.mockImplementation((options, callback) => {
      callback(null, '/tmp/docimp-edit-123456.txt', 3, mockRemoveCallback);
    });

    // Mock fs operations to succeed by default
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue('edited content');
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
      mockReadFile.mockResolvedValue('edited content');

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
      mockReadFile.mockResolvedValue('edited content');

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
      mockReadFile.mockResolvedValue('edited content');

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
      mockReadFile.mockResolvedValue('edited content');

      // Mock tmpFile to return .js extension
      mockTmpFile.mockImplementation((options, callback) => {
        callback(null, '/tmp/docimp-edit-123456.js', 3, mockRemoveCallback);
      });

      const promise = launcher.editText('initial text', '.js');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockWriteFile).toHaveBeenCalledWith(
        '/tmp/docimp-edit-123456.js',
        'initial text',
        'utf8'
      );
    });

    it('should use default .txt extension when not specified', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFile.mockResolvedValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      // Verify tmpFile was called with correct options (postfix: '.txt')
      expect(mockTmpFile).toHaveBeenCalledWith(
        expect.objectContaining({ postfix: '.txt' }),
        expect.any(Function)
      );
    });

    it('should return edited text when content changed', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFile.mockResolvedValue('edited content');

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
      mockReadFile.mockResolvedValue('initial text');

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
      mockReadFile.mockResolvedValue('  initial text  \n');

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
      mockReadFile.mockResolvedValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockRemoveCallback).toHaveBeenCalledTimes(1);
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

      await expect(promise).rejects.toThrow(
        'Failed to launch editor: spawn failed'
      );
    });

    it('should clean up temp file on editor error', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('error', new Error('spawn failed')));

      await expect(promise).rejects.toThrow(
        'Failed to launch editor: spawn failed'
      );

      expect(mockRemoveCallback).toHaveBeenCalled();
    });
  });

  describe('temp file cleanup', () => {
    it('should call removeCallback on successful edit', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFile.mockResolvedValue('edited content');

      const promise = launcher.editText('initial text');
      setImmediate(() => mockProcess.emit('exit', 0));
      await promise;

      expect(mockRemoveCallback).toHaveBeenCalledTimes(1);
    });

    it('should log warning when cleanup fails but continue successfully', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFile.mockResolvedValue('edited content');

      // Mock cleanup failure
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockRemoveCallback.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      const promise = launcher.editText('initial text');
      setImmediate(() => mockProcess.emit('exit', 0));
      const result = await promise;

      expect(result).toBe('edited content');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should call removeCallback on editor error', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);

      const promise = launcher.editText('initial text');
      setImmediate(() => mockProcess.emit('error', new Error('spawn failed')));

      await expect(promise).rejects.toThrow();
      expect(mockRemoveCallback).toHaveBeenCalledTimes(1);
    });

    it('should log warning when error-path cleanup fails', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockRemoveCallback.mockImplementation(() => {
        throw new Error('ENOENT: file not found');
      });

      const promise = launcher.editText('initial text');
      setImmediate(() => mockProcess.emit('error', new Error('spawn failed')));

      await expect(promise).rejects.toThrow('Failed to launch editor');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to cleanup temp file'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('file extension handling', () => {
    it('should use .py extension for Python syntax highlighting', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFile.mockResolvedValue('edited content');

      // Mock tmpFile to return .py extension
      mockTmpFile.mockImplementation((options, callback) => {
        callback(null, '/tmp/docimp-edit-123456.py', 3, mockRemoveCallback);
      });

      const promise = launcher.editText('def foo():', '.py');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockTmpFile).toHaveBeenCalledWith(
        expect.objectContaining({ postfix: '.py' }),
        expect.any(Function)
      );
    });

    it('should use .js extension for JavaScript syntax highlighting', async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = undefined;
      mockProcess.stdout = undefined;
      mockProcess.stderr = undefined;
      mockSpawn.mockReturnValue(mockProcess);
      mockReadFile.mockResolvedValue('edited content');

      // Mock tmpFile to return .js extension
      mockTmpFile.mockImplementation((options, callback) => {
        callback(null, '/tmp/docimp-edit-123456.js', 3, mockRemoveCallback);
      });

      const promise = launcher.editText('function foo() {}', '.js');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      expect(mockTmpFile).toHaveBeenCalledWith(
        expect.objectContaining({ postfix: '.js' }),
        expect.any(Function)
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
      mockReadFile.mockResolvedValue('edited content');

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
      mockReadFile.mockResolvedValue('edited content');

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
      mockReadFile.mockResolvedValue('edited content');

      const promise = launcher.editText('initial text');

      setImmediate(() => mockProcess.emit('exit', 0));

      await promise;

      // Verify command is split correctly
      expect(mockSpawn).toHaveBeenCalledWith(
        'emacs',
        expect.arrayContaining([
          '-nw',
          '--no-splash',
          expect.stringMatching(/\.txt$/),
        ]),
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
      setImmediate(() =>
        mockProcess.emit('error', new Error('spawn vim; ENOENT'))
      );

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
      mockReadFile.mockResolvedValue('edited content');

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
