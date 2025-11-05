import fs from 'fs';
import path from 'path';
import os from 'os';
import { PathValidator } from '../../utils/PathValidator';

describe('PathValidator', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docimp-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('validatePathExists', () => {
    it('validates existing file path', () => {
      const testFile = path.join(tempDir, 'test.txt');
      fs.writeFileSync(testFile, 'test content');

      const result = PathValidator.validatePathExists(testFile);
      expect(result).toBe(testFile);
    });

    it('validates existing directory path', () => {
      const result = PathValidator.validatePathExists(tempDir);
      expect(result).toBe(tempDir);
    });

    it('resolves relative paths to absolute', () => {
      const relativePath = path.relative(process.cwd(), tempDir);
      const result = PathValidator.validatePathExists(relativePath);
      expect(result).toBe(tempDir);
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('throws error for non-existent path with friendly message', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist');

      expect(() => PathValidator.validatePathExists(nonExistentPath)).toThrow(
        'Path not found: ' + nonExistentPath
      );
      expect(() => PathValidator.validatePathExists(nonExistentPath)).toThrow(
        'Please check that the path exists and try again.'
      );
    });

    it('throws error for empty string path', () => {
      expect(() => PathValidator.validatePathExists('')).toThrow(
        'Path cannot be empty'
      );
      expect(() => PathValidator.validatePathExists('')).toThrow(
        'Please provide a valid path to analyze.'
      );
    });

    it('throws error for whitespace-only path', () => {
      expect(() => PathValidator.validatePathExists('   ')).toThrow(
        'Path cannot be empty'
      );
    });

    it('handles paths with spaces correctly', () => {
      const dirWithSpaces = path.join(tempDir, 'dir with spaces');
      fs.mkdirSync(dirWithSpaces);

      const result = PathValidator.validatePathExists(dirWithSpaces);
      expect(result).toBe(dirWithSpaces);
    });

    it('handles symlinks correctly', () => {
      const targetFile = path.join(tempDir, 'target.txt');
      const symlinkPath = path.join(tempDir, 'symlink.txt');

      fs.writeFileSync(targetFile, 'content');
      fs.symlinkSync(targetFile, symlinkPath);

      const result = PathValidator.validatePathExists(symlinkPath);
      expect(result).toBe(symlinkPath);
    });
  });

  describe('validatePathReadable', () => {
    it('succeeds for readable file', () => {
      const testFile = path.join(tempDir, 'readable.txt');
      fs.writeFileSync(testFile, 'content');

      expect(() => PathValidator.validatePathReadable(testFile)).not.toThrow();
    });

    it('succeeds for readable directory', () => {
      expect(() => PathValidator.validatePathReadable(tempDir)).not.toThrow();
    });

    it('throws error for unreadable path with clear message', () => {
      // Note: This test is platform-specific and may not work on all systems
      // Skip on Windows or when running as root
      if (process.platform === 'win32' || process.getuid?.() === 0) {
        return;
      }

      const unreadableFile = path.join(tempDir, 'unreadable.txt');
      fs.writeFileSync(unreadableFile, 'content');
      fs.chmodSync(unreadableFile, 0o000); // Remove all permissions

      try {
        expect(() =>
          PathValidator.validatePathReadable(unreadableFile)
        ).toThrow('Permission denied');
        expect(() =>
          PathValidator.validatePathReadable(unreadableFile)
        ).toThrow('You do not have permission to read this path');
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(unreadableFile, 0o644);
      }
    });
  });

  describe('warnIfEmpty', () => {
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
    });

    it('warns when directory is empty', () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);

      PathValidator.warnIfEmpty(emptyDir);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Directory is empty')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('There are no files to analyze')
      );
    });

    it('does not warn when directory has files', () => {
      const fileInDir = path.join(tempDir, 'file.txt');
      fs.writeFileSync(fileInDir, 'content');

      PathValidator.warnIfEmpty(tempDir);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('does not warn when directory has subdirectories', () => {
      const subDir = path.join(tempDir, 'subdir');
      fs.mkdirSync(subDir);

      PathValidator.warnIfEmpty(tempDir);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('does not warn for files', () => {
      const testFile = path.join(tempDir, 'file.txt');
      fs.writeFileSync(testFile, 'content');

      PathValidator.warnIfEmpty(testFile);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('warns with absolute path in message', () => {
      const emptyDir = path.join(tempDir, 'empty');
      fs.mkdirSync(emptyDir);

      PathValidator.warnIfEmpty(emptyDir);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining(emptyDir)
      );
    });
  });

  describe('validateConfigPath', () => {
    it('validates existing config file', () => {
      const configFile = path.join(tempDir, 'docimp.config.js');
      fs.writeFileSync(configFile, 'module.exports = {}');

      const result = PathValidator.validateConfigPath(configFile);
      expect(result).toBe(configFile);
    });

    it('resolves relative config paths to absolute', () => {
      const configFile = path.join(tempDir, 'config.js');
      fs.writeFileSync(configFile, 'module.exports = {}');

      const relativePath = path.relative(process.cwd(), configFile);
      const result = PathValidator.validateConfigPath(relativePath);
      expect(result).toBe(configFile);
      expect(path.isAbsolute(result)).toBe(true);
    });

    it('throws error for non-existent config file', () => {
      const nonExistentConfig = path.join(tempDir, 'missing.config.js');

      expect(() => PathValidator.validateConfigPath(nonExistentConfig)).toThrow(
        'Config file not found'
      );
      expect(() => PathValidator.validateConfigPath(nonExistentConfig)).toThrow(
        'Please check that the config file exists and try again'
      );
    });

    it('throws error for empty config path', () => {
      expect(() => PathValidator.validateConfigPath('')).toThrow(
        'Config file path cannot be empty'
      );
      expect(() => PathValidator.validateConfigPath('')).toThrow(
        'Please provide a valid config file path'
      );
    });

    it('throws error for whitespace-only config path', () => {
      expect(() => PathValidator.validateConfigPath('   ')).toThrow(
        'Config file path cannot be empty'
      );
    });

    it('throws error when config path is a directory', () => {
      expect(() => PathValidator.validateConfigPath(tempDir)).toThrow(
        'Config path is not a file'
      );
      expect(() => PathValidator.validateConfigPath(tempDir)).toThrow(
        'Please provide a path to a configuration file, not a directory'
      );
    });

    it('handles config paths with spaces', () => {
      const configWithSpaces = path.join(tempDir, 'config with spaces.js');
      fs.writeFileSync(configWithSpaces, 'module.exports = {}');

      const result = PathValidator.validateConfigPath(configWithSpaces);
      expect(result).toBe(configWithSpaces);
    });

    it('validates different config file extensions', () => {
      const extensions = ['.js', '.cjs', '.mjs', '.json'];

      extensions.forEach((ext) => {
        const configFile = path.join(tempDir, `config${ext}`);
        fs.writeFileSync(configFile, '{}');

        const result = PathValidator.validateConfigPath(configFile);
        expect(result).toBe(configFile);
      });
    });
  });
});
