/**
 * Tests for audit command and calculateAuditSummary function.
 */

// Mock ESM modules before importing anything else
jest.mock('chalk', () => ({
  default: {
    bold: (str: string) => str,
    dim: (str: string) => str,
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    blue: (str: string) => str,
    cyan: (str: string) => str,
    gray: (str: string) => str,
  },
  bold: (str: string) => str,
  dim: (str: string) => str,
  green: (str: string) => str,
  yellow: (str: string) => str,
  red: (str: string) => str,
  blue: (str: string) => str,
  cyan: (str: string) => str,
  gray: (str: string) => str,
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
jest.mock('prompts');

import { calculateAuditSummary, auditCore } from '../commands/audit';
import prompts from 'prompts';
import type { AuditRatings, AuditSummary, CodeItem } from '../types/analysis';
import type { IPythonBridge } from '../python-bridge/i-python-bridge';
import type { IDisplay } from '../display/i-display';
import type { IConfigLoader } from '../config/i-config-loader';
import { defaultConfig } from '../config/i-config';

describe('calculateAuditSummary', () => {
  const auditFile = '.docimp/session-reports/audit.json';

  it('calculates summary with all rating types', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          function1: 1, // terrible
          function2: 2, // ok
          function3: 3, // good
        },
        'file2.ts': {
          function4: 4, // excellent
          function5: null, // skipped
        },
      },
    };

    const summary = calculateAuditSummary(10, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 10,
      auditedItems: 5,
      ratingCounts: {
        terrible: 1,
        ok: 1,
        good: 1,
        excellent: 1,
        skipped: 1,
      },
      auditFile,
    });
  });

  it('calculates summary with only skipped items', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          function1: null,
          function2: null,
          function3: null,
        },
      },
    };

    const summary = calculateAuditSummary(5, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 5,
      auditedItems: 3,
      ratingCounts: {
        terrible: 0,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 3,
      },
      auditFile,
    });
  });

  it('calculates summary for partial audit (early quit)', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          function1: 2,
          function2: 3,
        },
      },
    };

    const summary = calculateAuditSummary(20, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 20,
      auditedItems: 2,
      ratingCounts: {
        terrible: 0,
        ok: 1,
        good: 1,
        excellent: 0,
        skipped: 0,
      },
      auditFile,
    });
  });

  it('calculates summary for empty audit (no ratings)', () => {
    const ratings: AuditRatings = {
      ratings: {},
    };

    const summary = calculateAuditSummary(10, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 10,
      auditedItems: 0,
      ratingCounts: {
        terrible: 0,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 0,
      },
      auditFile,
    });
  });

  it('calculates summary with multiple terrible ratings', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          function1: 1,
          function2: 1,
          function3: 1,
        },
        'file2.ts': {
          function4: 1,
        },
      },
    };

    const summary = calculateAuditSummary(10, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 10,
      auditedItems: 4,
      ratingCounts: {
        terrible: 4,
        ok: 0,
        good: 0,
        excellent: 0,
        skipped: 0,
      },
      auditFile,
    });
  });

  it('calculates summary with mix of ratings and skipped', () => {
    const ratings: AuditRatings = {
      ratings: {
        'file1.ts': {
          function1: 1,
          function2: null,
          function3: 2,
          function4: null,
          function5: 4,
        },
      },
    };

    const summary = calculateAuditSummary(8, ratings, auditFile);

    expect(summary).toEqual<AuditSummary>({
      totalItems: 8,
      auditedItems: 5,
      ratingCounts: {
        terrible: 1,
        ok: 1,
        good: 0,
        excellent: 1,
        skipped: 2,
      },
      auditFile,
    });
  });
});

describe('auditCore - path validation', () => {
  const mockPythonBridge: jest.Mocked<IPythonBridge> = {
    analyze: jest.fn(),
    audit: jest.fn(),
    plan: jest.fn(),
    suggest: jest.fn(),
    apply: jest.fn(),
  };

  const mockDisplay: jest.Mocked<IDisplay> = {
    showMessage: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
    showConfig: jest.fn(),
    showAnalysisResult: jest.fn(),
    showAuditSummary: jest.fn(),
    startSpinner: jest.fn(() => jest.fn()),
  };

  const mockConfigLoader: IConfigLoader = {
    load: jest.fn().mockResolvedValue({
      ...defaultConfig,
      audit: { showCode: { mode: 'truncated', maxLines: 20 } },
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws friendly error for non-existent path', async () => {
    const nonExistentPath = '/nonexistent/path/to/code';

    await expect(
      auditCore(
        nonExistentPath,
        { verbose: false },
        mockPythonBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('Path not found');

    await expect(
      auditCore(
        nonExistentPath,
        { verbose: false },
        mockPythonBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('Please check that the path exists and try again');

    // Verify Python bridge was NOT called
    expect(mockPythonBridge.audit).not.toHaveBeenCalled();
  });

  it('throws error for empty string path', async () => {
    await expect(
      auditCore(
        '',
        { verbose: false },
        mockPythonBridge,
        mockDisplay,
        mockConfigLoader
      )
    ).rejects.toThrow('Path cannot be empty');

    // Verify Python bridge was NOT called
    expect(mockPythonBridge.audit).not.toHaveBeenCalled();
  });

  it('passes absolute path to Python bridge', async () => {
    // Use a real temp directory
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'docimp-audit-test-')
    );

    try {
      mockPythonBridge.audit.mockResolvedValue({ items: [] });

      await auditCore(
        tempDir,
        { verbose: false },
        mockPythonBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify Python bridge was called with absolute path
      expect(mockPythonBridge.audit).toHaveBeenCalledWith(
        expect.objectContaining({
          path: tempDir,
        })
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('warns when auditing empty directory', async () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const emptyDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'docimp-audit-test-')
    );

    try {
      mockPythonBridge.audit.mockResolvedValue({ items: [] });

      await auditCore(
        emptyDir,
        { verbose: false },
        mockPythonBridge,
        mockDisplay,
        mockConfigLoader
      );

      // Verify warning was issued
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Directory is empty')
      );

      // Verify Python bridge was still called (warning, not error)
      expect(mockPythonBridge.audit).toHaveBeenCalled();
    } finally {
      consoleWarnSpy.mockRestore();
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});

describe('auditCore - config loading', () => {
  // Mock Python bridge
  const mockPythonBridge: jest.Mocked<IPythonBridge> = {
    analyze: jest.fn(),
    audit: jest.fn(),
    applyAudit: jest.fn(),
    plan: jest.fn(),
    improve: jest.fn(),
  };

  // Mock display
  const mockDisplay: jest.Mocked<IDisplay> = {
    showAnalysisResult: jest.fn(),
    showConfig: jest.fn(),
    showMessage: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
    showSuccess: jest.fn(),
    showCodeItems: jest.fn(),
    startSpinner: jest.fn(() => jest.fn()), // Return a stop function
    showProgress: jest.fn(),
    showAuditSummary: jest.fn(),
    showBoxedDocstring: jest.fn(),
    showCodeBlock: jest.fn(),
    showSignature: jest.fn(),
  };

  const mockConfigLoader: IConfigLoader = {
    load: jest.fn().mockResolvedValue(defaultConfig),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock audit to return empty items (we're not testing the full flow yet)
    mockPythonBridge.audit.mockResolvedValue({
      items: [],
      coverage_percent: 0,
      total_items: 0,
      documented_items: 0,
      by_language: {},
    });
  });

  it('uses default config when no config provided', async () => {
    // Default should be: mode='truncated', maxLines=20
    await auditCore('.', {}, mockPythonBridge, mockDisplay, mockConfigLoader);

    // Verify audit was called (config loading didn't throw)
    expect(mockPythonBridge.audit).toHaveBeenCalled();
  });

  it('uses custom config in complete mode', async () => {
    const customConfigLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'complete',
            maxLines: 50,
          },
        },
      }),
    };

    await auditCore('.', {}, mockPythonBridge, mockDisplay, customConfigLoader);

    // Verify audit was called with custom config
    expect(mockPythonBridge.audit).toHaveBeenCalled();
  });

  it('uses custom config in signature mode', async () => {
    const customConfigLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'signature',
            maxLines: 10,
          },
        },
      }),
    };

    await auditCore('.', {}, mockPythonBridge, mockDisplay, customConfigLoader);

    // Verify audit was called with custom config
    expect(mockPythonBridge.audit).toHaveBeenCalled();
  });
});

describe('auditCore - boxed docstring display', () => {
  // Mock Python bridge
  const mockPythonBridge: jest.Mocked<IPythonBridge> = {
    analyze: jest.fn(),
    audit: jest.fn(),
    applyAudit: jest.fn(),
    plan: jest.fn(),
    improve: jest.fn(),
  };

  // Mock display
  const mockDisplay: jest.Mocked<IDisplay> = {
    showAnalysisResult: jest.fn(),
    showConfig: jest.fn(),
    showMessage: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
    showSuccess: jest.fn(),
    showCodeItems: jest.fn(),
    startSpinner: jest.fn(() => jest.fn()),
    showProgress: jest.fn(),
    showAuditSummary: jest.fn(),
    showBoxedDocstring: jest.fn(),
    showCodeBlock: jest.fn(),
    showSignature: jest.fn(),
  };

  const mockConfigLoader: IConfigLoader = {
    load: jest.fn().mockResolvedValue(defaultConfig),
  };

  const mockPrompts = prompts as jest.MockedFunction<typeof prompts>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock prompts to return 'Q' (quit immediately)
    mockPrompts.mockResolvedValue({ rating: 'Q' });
  });

  it('displays boxed docstring for items with documentation', async () => {
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '../../..');
    const itemWithDocs: CodeItem = {
      name: 'testFunction',
      type: 'function',
      filepath: `${projectRoot}/examples/test_simple.ts`,
      line_number: 1,
      end_line: 5,
      language: 'typescript',
      complexity: 5,
      impact_score: 25,
      has_docs: true,
      parameters: [],
      return_type: 'void',
      docstring: '/**\n * Test docstring\n */',
      export_type: 'named',
      module_system: 'esm',
      audit_rating: null,
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [itemWithDocs],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, mockConfigLoader);

    // Verify boxed docstring was shown
    expect(mockDisplay.showBoxedDocstring).toHaveBeenCalledWith(
      '/**\n * Test docstring\n */'
    );
  });

  it('does not show dashed lines (uses boxed display instead)', async () => {
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '../../..');
    const itemWithDocs: CodeItem = {
      name: 'testFunction',
      type: 'function',
      filepath: `${projectRoot}/examples/test_simple.ts`,
      line_number: 1,
      end_line: 5,
      language: 'typescript',
      complexity: 5,
      impact_score: 25,
      has_docs: true,
      parameters: [],
      return_type: 'void',
      docstring: 'Simple docstring',
      export_type: 'named',
      module_system: 'esm',
      audit_rating: null,
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [itemWithDocs],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, mockConfigLoader);

    // Verify no dashed lines were shown (old format)
    const messages = mockDisplay.showMessage.mock.calls.map((call) => call[0]);
    const hasDashedLines = messages.some(
      (msg) => typeof msg === 'string' && msg.includes('-'.repeat(60))
    );
    expect(hasDashedLines).toBe(false);
  });

  it('shows boxed docstring before prompting for rating', async () => {
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '../../..');
    const itemWithDocs: CodeItem = {
      name: 'testFunction',
      type: 'function',
      filepath: `${projectRoot}/examples/test_simple.ts`,
      line_number: 1,
      end_line: 5,
      language: 'typescript',
      complexity: 5,
      impact_score: 25,
      has_docs: true,
      parameters: [],
      return_type: 'void',
      docstring: 'Test',
      export_type: 'named',
      module_system: 'esm',
      audit_rating: null,
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [itemWithDocs],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, mockConfigLoader);

    // Verify boxed docstring was called before prompts
    expect(mockDisplay.showBoxedDocstring).toHaveBeenCalled();
    expect(mockPrompts).toHaveBeenCalled();
  });
});

describe('auditCore - code display modes', () => {
  // Mock Python bridge
  const mockPythonBridge: jest.Mocked<IPythonBridge> = {
    analyze: jest.fn(),
    audit: jest.fn(),
    applyAudit: jest.fn(),
    plan: jest.fn(),
    improve: jest.fn(),
  };

  // Mock display
  const mockDisplay: jest.Mocked<IDisplay> = {
    showAnalysisResult: jest.fn(),
    showConfig: jest.fn(),
    showMessage: jest.fn(),
    showError: jest.fn(),
    showWarning: jest.fn(),
    showSuccess: jest.fn(),
    showCodeItems: jest.fn(),
    startSpinner: jest.fn(() => jest.fn()),
    showProgress: jest.fn(),
    showAuditSummary: jest.fn(),
    showBoxedDocstring: jest.fn(),
    showCodeBlock: jest.fn(),
    showSignature: jest.fn(),
  };

  const mockPrompts = prompts as jest.MockedFunction<typeof prompts>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrompts.mockResolvedValue({ rating: 'Q' });
  });

  const createMockItem = (): CodeItem => {
    // Use path.resolve to get absolute path from project root
    // __dirname is cli/src/__tests__, so go up 3 levels to reach project root
    const path = require('path');
    const projectRoot = path.resolve(__dirname, '../../..');
    return {
      name: 'testFunction',
      type: 'function',
      filepath: `${projectRoot}/examples/test_simple.ts`,
      line_number: 1,
      end_line: 5,
      language: 'typescript',
      complexity: 5,
      impact_score: 25,
      has_docs: true,
      parameters: [],
      return_type: 'void',
      docstring: '/** Test */',
      export_type: 'named',
      module_system: 'esm',
      audit_rating: null,
    };
  };

  it('complete mode shows full code without [C] option', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'complete',
            maxLines: 20,
          },
        },
      }),
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [createMockItem()],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    // Verify showCodeBlock was called
    expect(mockDisplay.showCodeBlock).toHaveBeenCalled();
    // Verify prompt does NOT include [C] option
    const promptCall = mockPrompts.mock.calls[0][0];
    expect(promptCall.message).toContain('[S] Skip');
    expect(promptCall.message).not.toContain('[C]');
  });

  it('truncated mode shows truncated code with [C] option when code is long', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'truncated',
            maxLines: 2,
          },
        },
      }),
    };

    const longItem = createMockItem();
    longItem.end_line = 30; // Make it longer than maxLines

    mockPythonBridge.audit.mockResolvedValue({
      items: [longItem],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    // Verify showCodeBlock was called
    expect(mockDisplay.showCodeBlock).toHaveBeenCalled();
    // Verify [C] option is present
    const promptCall = mockPrompts.mock.calls[0][0];
    expect(promptCall.message).toContain('[C] Full code');
  });

  it('signature mode shows signature with [C] option', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'signature',
            maxLines: 20,
          },
        },
      }),
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [createMockItem()],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    // Verify showSignature was called
    expect(mockDisplay.showSignature).toHaveBeenCalled();
    // Verify [C] option is present
    const promptCall = mockPrompts.mock.calls[0][0];
    expect(promptCall.message).toContain('[C] Show code');
  });

  it('on-demand mode shows no code but has [C] option', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'on-demand',
            maxLines: 20,
          },
        },
      }),
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [createMockItem()],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    // Verify NO code display methods were called
    expect(mockDisplay.showCodeBlock).not.toHaveBeenCalled();
    expect(mockDisplay.showSignature).not.toHaveBeenCalled();
    // Verify [C] option is present
    const promptCall = mockPrompts.mock.calls[0][0];
    expect(promptCall.message).toContain('[C] Show code');
  });

  it('[C] option displays full code and re-prompts', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'signature',
            maxLines: 20,
          },
        },
      }),
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [createMockItem()],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    // First response: 'C', then '4' on re-prompt
    mockPrompts
      .mockResolvedValueOnce({ rating: 'C' })
      .mockResolvedValueOnce({ rating: '4' });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    // Verify showSignature was called once (initial display)
    expect(mockDisplay.showSignature).toHaveBeenCalledTimes(1);
    // Verify showCodeBlock was called once (after pressing [C])
    expect(mockDisplay.showCodeBlock).toHaveBeenCalledTimes(1);
    // Verify prompts was called twice (initial prompt + re-prompt)
    expect(mockPrompts).toHaveBeenCalledTimes(2);
  });

  it('prompt validation accepts C when [C] option is available', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'signature',
            maxLines: 20,
          },
        },
      }),
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [createMockItem()],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    const promptCall = mockPrompts.mock.calls[0][0];
    // Verify validation function accepts 'C'
    expect(promptCall.validate('C')).toBe(true);
    expect(promptCall.validate('c')).toBe(true);
  });

  it('prompt validation rejects C when [C] option is not available', async () => {
    const configLoader: IConfigLoader = {
      load: jest.fn().mockResolvedValue({
        ...defaultConfig,
        audit: {
          showCode: {
            mode: 'complete',
            maxLines: 20,
          },
        },
      }),
    };

    mockPythonBridge.audit.mockResolvedValue({
      items: [createMockItem()],
      coverage_percent: 100,
      total_items: 1,
      documented_items: 1,
      by_language: {},
    });

    await auditCore('.', {}, mockPythonBridge, mockDisplay, configLoader);

    const promptCall = mockPrompts.mock.calls[0][0];
    // Verify validation function rejects 'C'
    expect(promptCall.validate('C')).not.toBe(true);
  });
});
