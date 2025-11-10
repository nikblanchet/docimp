/**
 * Tests for migrate-workflow-state command.
 *
 * Covers dry-run mode, check mode, version selection, force mode,
 * and error scenarios.
 */

import { promises as fs } from 'node:fs';
import prompts from 'prompts';
import { EXIT_CODE } from '../../constants/exit-codes.js';
import {
  migrateWorkflowStateCommand,
  migrateWorkflowStateCore,
} from '../../commands/migrate-workflow-state.js';
import { StateManager } from '../../utils/state-manager.js';

// Mock modules
jest.mock('prompts');

describe('migrate-workflow-state command', () => {
  const testStateDir = '/tmp/test-state/.docimp';
  const testWorkflowFile = `${testStateDir}/workflow-state.json`;

  let mockFs: {
    access: jest.MockedFunction<typeof fs.access>;
    readFile: jest.MockedFunction<typeof fs.readFile>;
    writeFile: jest.MockedFunction<typeof fs.writeFile>;
    rename: jest.MockedFunction<typeof fs.rename>;
  };

  beforeEach(() => {
    // Mock filesystem operations
    mockFs = {
      access: jest.fn() as jest.MockedFunction<typeof fs.access>,
      readFile: jest.fn() as jest.MockedFunction<typeof fs.readFile>,
      writeFile: jest.fn() as jest.MockedFunction<typeof fs.writeFile>,
      rename: jest.fn() as jest.MockedFunction<typeof fs.rename>,
    };

    jest.spyOn(fs, 'access').mockImplementation(mockFs.access);
    jest.spyOn(fs, 'readFile').mockImplementation(mockFs.readFile);
    jest.spyOn(fs, 'writeFile').mockImplementation(mockFs.writeFile);
    jest.spyOn(fs, 'rename').mockImplementation(mockFs.rename);

    // Mock StateManager
    jest.spyOn(StateManager, 'getStateDir').mockReturnValue(testStateDir);

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset prompts mock
    (prompts as unknown as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('migrateWorkflowStateCore', () => {
    it('should throw error when workflow state file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await expect(migrateWorkflowStateCore({ dryRun: false })).rejects.toThrow(
        'Workflow state file does not exist'
      );
    });

    it('should show success message in check mode when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      await migrateWorkflowStateCore({ check: true });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No workflow state file found')
      );
    });

    it('should show preview and not modify file in dry-run mode', async () => {
      const data = {
        // Legacy file without schema_version to trigger migration
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      await migrateWorkflowStateCore({ dryRun: true });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Dry run mode')
      );
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(mockFs.rename).not.toHaveBeenCalled();
    });

    it('should show no migration needed when already at target version', async () => {
      const data = {
        schema_version: '1.0',
        migration_log: [],
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      await migrateWorkflowStateCore({});

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('already at target version')
      );
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should migrate file successfully with force mode', async () => {
      const data = {
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));
      mockFs.writeFile.mockResolvedValue(undefined);
      mockFs.rename.mockResolvedValue(undefined);

      await migrateWorkflowStateCore({ force: true });

      expect(mockFs.writeFile).toHaveBeenCalled();
      expect(mockFs.rename).toHaveBeenCalledWith(
        `${testWorkflowFile}.tmp`,
        testWorkflowFile
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Migration completed successfully')
      );
    });

    it('should exit with success in check mode when no migration needed', async () => {
      const data = {
        schema_version: '1.0',
        migration_log: [],
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      await migrateWorkflowStateCore({ check: true });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No migration needed')
      );
    });

    it('should exit with error in check mode when migration needed', async () => {
      const data = {
        // Legacy file without schema_version
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      await expect(migrateWorkflowStateCore({ check: true })).rejects.toThrow(
        'Migration needed'
      );
    });
  });

  describe('migrateWorkflowStateCommand', () => {
    it('should return ERROR exit code when file does not exist', async () => {
      mockFs.access.mockRejectedValue(new Error('File not found'));

      const exitCode = await migrateWorkflowStateCommand({});

      expect(exitCode).toBe(EXIT_CODE.ERROR);
    });

    it('should return SUCCESS exit code in dry-run mode', async () => {
      const data = {
        schema_version: '1.0',
        migration_log: [],
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const exitCode = await migrateWorkflowStateCommand({ dryRun: true });

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('should return SUCCESS exit code when no migration needed', async () => {
      const data = {
        schema_version: '1.0',
        migration_log: [],
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const exitCode = await migrateWorkflowStateCommand({});

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('should return SUCCESS exit code in check mode when no migration needed', async () => {
      const data = {
        schema_version: '1.0',
        migration_log: [],
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const exitCode = await migrateWorkflowStateCommand({ check: true });

      expect(exitCode).toBe(EXIT_CODE.SUCCESS);
    });

    it('should return ERROR exit code in check mode when migration needed', async () => {
      const data = {
        // Legacy file
        last_analyze: null,
        last_audit: null,
        last_plan: null,
        last_improve: null,
      };

      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(data));

      const exitCode = await migrateWorkflowStateCommand({ check: true });

      expect(exitCode).toBe(EXIT_CODE.ERROR);
    });
  });
});
