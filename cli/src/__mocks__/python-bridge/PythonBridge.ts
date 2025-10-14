/**
 * Mock PythonBridge for testing.
 *
 * This mock avoids the import.meta.url issue in Jest tests.
 */

export class PythonBridge {
  constructor(_pythonPath: string = 'python', _analyzerPath?: string) {
    // Mock constructor - parameters are intentionally unused
  }

  async analyze(): Promise<any> {
    return { items: [], coverage_percent: 0, total_items: 0, documented_items: 0, by_language: {} };
  }

  async audit(): Promise<any> {
    return { items: [] };
  }

  async applyAudit(): Promise<void> {
    return;
  }

  async plan(): Promise<any> {
    return { items: [] };
  }

  async suggest(): Promise<string> {
    return '/** Mock docs */';
  }

  async apply(): Promise<void> {
    return;
  }
}
