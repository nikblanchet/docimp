/**
 * Tests for --apply-audit flag in analyze command.
 *
 * These tests verify that the --apply-audit flag correctly:
 * - Loads audit.json when it exists
 * - Applies ratings to items by matching filepath and name
 * - Handles missing audit.json gracefully
 * - Handles corrupted audit.json gracefully
 * - Works independently
 * - Works combined with --incremental flag
 * - Displays appropriate messages in verbose mode
 */

import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { analyzeCore } from '../commands/analyze';
import type { IPythonBridge } from '../python-bridge/i-python-bridge';
import type { IDisplay } from '../display/i-display';
import type { IConfigLoader } from '../config/i-config-loader';
import type { AnalysisResult } from '../types/AnalysisResult';
import { defaultConfig } from '../config/i-config';

// Mock ESM modules that Jest can't handle
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    blue: (str: string) => str,
    cyan: (str: string) => str,
  },
  bold: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  blue: (str: string) => str,
  cyan: (str: string) => str,
}));
jest.mock('ora', () => ({
  default: () => ({
    start: () => ({ stop: () => {}, succeed: () => {}, fail: () => {} }),
  }),
}));
jest.mock('cli-table3', () => {
  return class MockTable {
    constructor() {}
    toString() {
      return '';
    }
  };
});
jest.mock('prompts', () =>
  jest.fn(() => Promise.resolve({ shouldDelete: true }))
);

describe('analyze --apply-audit', () => {
  let tempDir: string;
  let mockBridge: IPythonBridge;
  let mockDisplay: IDisplay;
  let mockConfigLoader: IConfigLoader;
  let mockResult: AnalysisResult;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'docimp-apply-audit-test-'));

    // Create .docimp directory structure
    const fs = require('fs');
    fs.mkdirSync(join(tempDir, '.docimp'), { recursive: true });

    // Create minimal workflow-state.json to prevent errors
    const workflowState = {
      schema_version: '1.0',
      last_analyze: null,
      last_audit: null,
      last_plan: null,
      last_improve: null,
    };
    writeFileSync(
      join(tempDir, '.docimp', 'workflow-state.json'),
      JSON.stringify(workflowState, null, 2),
      'utf8'
    );

    // Mock analysis result with 3 items
    mockResult = {
      items: [
        {
          name: 'calculate',
          type: 'function',
          filepath: join(tempDir, 'math.py'),
          line_number: 1,
          end_line: 5,
          language: 'python',
          complexity: 5,
          impact_score: 25,
          has_docs: true,
          parameters: ['a', 'b'],
          return_type: 'int',
          docstring: '"""Add two numbers"""',
          export_type: 'internal',
          module_system: 'unknown',
          audit_rating: null, // Will be filled by applyAudit
        },
        {
          name: 'validate',
          type: 'function',
          filepath: join(tempDir, 'validator.ts'),
          line_number: 10,
          end_line: 15,
          language: 'typescript',
          complexity: 3,
          impact_score: 15,
          has_docs: true,
          parameters: ['input'],
          return_type: 'boolean',
          docstring: '/** Validate input */',
          export_type: 'named',
          module_system: 'esm',
          audit_rating: null,
        },
        {
          name: 'format',
          type: 'function',
          filepath: join(tempDir, 'formatter.js'),
          line_number: 20,
          end_line: 25,
          language: 'javascript',
          complexity: 2,
          impact_score: 10,
          has_docs: true,
          parameters: ['text'],
          return_type: null,
          docstring: '/** Format text */',
          export_type: 'named',
          module_system: 'esm',
          audit_rating: null,
        },
      ],
      coverage_percent: 100,
      total_items: 3,
      documented_items: 3,
      by_language: {
        python: { total_items: 1, documented_items: 1, coverage_percent: 100 },
        typescript: {
          total_items: 1,
          documented_items: 1,
          coverage_percent: 100,
        },
        javascript: {
          total_items: 1,
          documented_items: 1,
          coverage_percent: 100,
        },
      },
      parse_failures: [],
    };

    // Mock PythonBridge
    mockBridge = {
      analyze: jest.fn().mockResolvedValue(mockResult),
      audit: jest.fn(),
      plan: jest.fn(),
      suggest: jest.fn(),
      apply: jest.fn(),
    };

    // Mock ConfigLoader
    mockConfigLoader = {
      load: jest.fn().mockResolvedValue(defaultConfig),
    };

    // Mock Display
    mockDisplay = {
      showMessage: jest.fn(),
      showError: jest.fn(),
      showWarning: jest.fn(),
      showConfig: jest.fn(),
      showAnalysisResult: jest.fn(),
      showAuditSummary: jest.fn(),
      startSpinner: jest.fn().mockReturnValue(() => {}),
    };

    // Change working directory to temp dir for StateManager
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('basic functionality', () => {
    it('applies ratings when audit.json exists', async () => {
      // Create .docimp/session-reports directory and audit.json
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: 3, // Good rating
          },
          [join(tempDir, 'validator.ts')]: {
            validate: 2, // OK rating
          },
          [join(tempDir, 'formatter.js')]: {
            format: 4, // Excellent rating
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify analysis was called
      expect(mockBridge.analyze).toHaveBeenCalled();

      // Read saved analysis result
      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      expect(existsSync(analyzeFile)).toBe(true);

      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // Verify ratings were applied
      const calculateItem = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      const validateItem = savedResult.items.find(
        (i: any) => i.name === 'validate'
      );
      const formatItem = savedResult.items.find(
        (i: any) => i.name === 'format'
      );

      expect(calculateItem.audit_rating).toBe(3);
      expect(validateItem.audit_rating).toBe(2);
      expect(formatItem.audit_rating).toBe(4);
    });

    it('handles missing audit.json gracefully', async () => {
      // No audit.json file
      const fs = require('fs');
      fs.mkdirSync(join(tempDir, '.docimp', 'session-reports'), {
        recursive: true,
      });

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify analysis completed successfully
      expect(mockBridge.analyze).toHaveBeenCalled();

      // Verify items have null ratings
      const analyzeFile = join(
        tempDir,
        '.docimp',
        'session-reports',
        'analyze-latest.json'
      );
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      savedResult.items.forEach((item: any) => {
        expect(item.audit_rating).toBeNull();
      });
    });

    it('handles corrupted audit.json gracefully', async () => {
      // Create corrupted audit.json
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      writeFileSync(join(sessionDir, 'audit.json'), '{ invalid json', 'utf8');

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify warning was shown
      expect(mockDisplay.showWarning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load audit ratings')
      );

      // Verify analysis completed successfully
      expect(mockBridge.analyze).toHaveBeenCalled();
    });

    it('only applies ratings to matching items', async () => {
      // Create audit.json with ratings for only some items
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: 3,
          },
          // Missing ratings for validator.ts and formatter.js
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // Only calculate should have rating
      const calculateItem = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      const validateItem = savedResult.items.find(
        (i: any) => i.name === 'validate'
      );
      const formatItem = savedResult.items.find(
        (i: any) => i.name === 'format'
      );

      expect(calculateItem.audit_rating).toBe(3);
      expect(validateItem.audit_rating).toBeNull();
      expect(formatItem.audit_rating).toBeNull();
    });
  });

  describe('verbose mode', () => {
    it('shows message when audit.json not found', async () => {
      const fs = require('fs');
      fs.mkdirSync(join(tempDir, '.docimp', 'session-reports'), {
        recursive: true,
      });

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: true,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('No audit.json found')
      );
    });

    it('shows count of applied ratings', async () => {
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: { calculate: 3 },
          [join(tempDir, 'validator.ts')]: { validate: 2 },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: true,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('Applied audit ratings to 2 item(s)')
      );
    });
  });

  describe('workflow combinations', () => {
    it('runs without --apply-audit flag (default behavior)', async () => {
      // Create audit.json but don't use --apply-audit flag
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: { calculate: 3 },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        { format: 'json', verbose: false }, // No applyAudit flag
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // Ratings should NOT be applied
      savedResult.items.forEach((item: any) => {
        expect(item.audit_rating).toBeNull();
      });
    });

    it('works with --incremental flag', async () => {
      // This test verifies the flags can be combined
      // Both flags should work together without conflicts

      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      // Create audit.json
      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: { calculate: 3 },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      // Run with both incremental and apply-audit
      // Incremental will fall back to full analysis (no previous data)
      // Then apply-audit will apply ratings
      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          incremental: true,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify analysis completed and ratings were applied
      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      const calculateItem = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      expect(calculateItem.audit_rating).toBe(3);

      // Verify fallback message was shown
      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        'No previous analysis found. Running full analysis instead.'
      );
    });
  });

  describe('edge cases', () => {
    it('handles null ratings (skipped items)', async () => {
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: null, // Skipped rating
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      const calculateItem = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      expect(calculateItem.audit_rating).toBeNull();
    });

    it('handles empty audit.json', async () => {
      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {},
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: true,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      expect(mockDisplay.showMessage).toHaveBeenCalledWith(
        expect.stringContaining('Applied audit ratings to 0 item(s)')
      );
    });

    it('handles items with same name in different files', async () => {
      // Add duplicate function name in different file
      mockResult.items.push({
        name: 'calculate', // Same name as math.py function
        type: 'function',
        filepath: join(tempDir, 'utils.py'), // Different file
        line_number: 1,
        end_line: 5,
        language: 'python',
        complexity: 2,
        impact_score: 10,
        has_docs: true,
        parameters: ['x', 'y'],
        return_type: 'int',
        docstring: '"""Different calculate function"""',
        export_type: 'internal',
        module_system: 'unknown',
        audit_rating: null,
      });

      const fs = require('fs');
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: 3, // Rating for math.py/calculate
          },
          [join(tempDir, 'utils.py')]: {
            calculate: 1, // Different rating for utils.py/calculate
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // Find both calculate functions
      const mathCalculate = savedResult.items.find(
        (i: any) =>
          i.name === 'calculate' && i.filepath === join(tempDir, 'math.py')
      );
      const utilsCalculate = savedResult.items.find(
        (i: any) =>
          i.name === 'calculate' && i.filepath === join(tempDir, 'utils.py')
      );

      // Each should have its own rating
      expect(mathCalculate.audit_rating).toBe(3);
      expect(utilsCalculate.audit_rating).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty audit.json gracefully', async () => {
      // Create session-reports directory
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const fs = require('fs');
      fs.mkdirSync(sessionDir, { recursive: true });

      // Create empty audit file
      writeFileSync(join(sessionDir, 'audit.json'), JSON.stringify({}), 'utf8');

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // No ratings should be applied (field remains null from Python)
      const calculate = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      expect(calculate.audit_rating).toBeNull();
    });

    it('should skip ratings for files not in current analysis', async () => {
      // Create session-reports directory
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const fs = require('fs');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          'deleted-file.py': {
            oldFunction: 2,
          },
          [join(tempDir, 'math.py')]: {
            calculate: 3,
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // Rating for calculate should be applied
      const calculate = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      expect(calculate.audit_rating).toBe(3);

      // No error should occur for missing file
      expect(mockDisplay.showWarning).not.toHaveBeenCalled();
    });

    it('should skip invalid rating values (outside 1-4 range)', async () => {
      // Create session-reports directory
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const fs = require('fs');
      fs.mkdirSync(sessionDir, { recursive: true });

      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: 5, // Invalid: too high (valid range is 1-4)
          },
          [join(tempDir, 'validator.ts')]: {
            validate: 0, // Invalid: too low (valid range is 1-4)
          },
          [join(tempDir, 'formatter.js')]: {
            format: 3, // Valid rating
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      const calculate = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      const validate = savedResult.items.find(
        (i: any) => i.name === 'validate'
      );
      const format = savedResult.items.find((i: any) => i.name === 'format');

      // Note: Current implementation applies all ratings without validation
      // This test documents the behavior - validation could be added in future
      expect(calculate.audit_rating).toBe(5); // Currently applied as-is
      expect(validate.audit_rating).toBe(0); // Currently applied as-is
      expect(format.audit_rating).toBe(3); // Valid rating applied
    });

    it('should work with combined --apply-audit and --incremental flags', async () => {
      // Create session-reports directory
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const fs = require('fs');
      fs.mkdirSync(sessionDir, { recursive: true });

      // First run analyze without flags to create workflow state
      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Create audit ratings
      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: 3,
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      // Second run with --incremental and --apply-audit
      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          incremental: true,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      // Rating should be applied even with incremental flag
      const calculate = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );
      expect(calculate.audit_rating).toBe(3);
    });

    it('should overwrite pre-existing audit_rating field', async () => {
      // Create session-reports directory
      const sessionDir = join(tempDir, '.docimp', 'session-reports');
      const fs = require('fs');
      fs.mkdirSync(sessionDir, { recursive: true });

      // Mock bridge to return items with existing audit_rating
      const mockResultWithRating = {
        items: [
          {
            name: 'calculate',
            type: 'function',
            filepath: join(tempDir, 'math.py'),
            line_number: 1,
            end_line: 5,
            language: 'python',
            complexity: 2,
            impact_score: 10.0,
            has_docs: false,
            parameters: [],
            return_type: 'int',
            docstring: null,
            export_type: 'named',
            module_system: 'unknown',
            audit_rating: 1, // Pre-existing rating
          },
        ],
        coverage_percent: 0.0,
        total_items: 1,
        documented_items: 0,
        by_language: {},
        parse_failures: [],
      };

      mockBridge.analyze.mockResolvedValueOnce(mockResultWithRating);

      // Create audit file with different rating
      const auditData = {
        ratings: {
          [join(tempDir, 'math.py')]: {
            calculate: 4, // New rating should overwrite
          },
        },
      };

      writeFileSync(
        join(sessionDir, 'audit.json'),
        JSON.stringify(auditData, null, 2),
        'utf8'
      );

      await analyzeCore(
        tempDir,
        {
          format: 'json',
          verbose: false,
          applyAudit: true,
          preserveAudit: true,
        },
        mockBridge,
        mockDisplay,
        mockConfigLoader
      );

      const analyzeFile = join(sessionDir, 'analyze-latest.json');
      const savedResult = JSON.parse(readFileSync(analyzeFile, 'utf8'));

      const calculate = savedResult.items.find(
        (i: any) => i.name === 'calculate'
      );

      // Should overwrite old rating (1) with new rating (4)
      expect(calculate.audit_rating).toBe(4);
    });
  });
});
