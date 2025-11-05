/**
 * Tests for CodeExtractor utility.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CodeExtractor } from '../../utils/code-extractor';

describe('CodeExtractor', () => {
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    // Create temporary directory for test files
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-extractor-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('extractCodeBlock', () => {
    it('should extract a simple code block with line numbers', () => {
      testFile = path.join(testDir, 'simple.ts');
      fs.writeFileSync(
        testFile,
        `function add(a: number, b: number): number {
  return a + b;
}`
      );

      const result = CodeExtractor.extractCodeBlock(testFile, 1, 3);

      expect(result.code).toContain(
        '   1 | function add(a: number, b: number): number {'
      );
      expect(result.code).toContain('   2 |   return a + b;');
      expect(result.code).toContain('   3 | }');
      expect(result.truncated).toBe(false);
      expect(result.totalLines).toBe(3);
      expect(result.displayedLines).toBe(3);
    });

    it('should extract without line numbers when disabled', () => {
      testFile = path.join(testDir, 'simple.ts');
      fs.writeFileSync(
        testFile,
        `function add(a: number, b: number): number {
  return a + b;
}`
      );

      const result = CodeExtractor.extractCodeBlock(testFile, 1, 3, 0, false);

      expect(result.code).not.toContain('|');
      expect(result.code).toContain(
        'function add(a: number, b: number): number {'
      );
      expect(result.code).toContain('  return a + b;');
      expect(result.code).toContain('}');
    });

    it('should truncate long code blocks', () => {
      testFile = path.join(testDir, 'long.ts');
      const lines = [];
      for (let i = 1; i <= 50; i++) {
        lines.push(`  line${i}();`);
      }
      fs.writeFileSync(
        testFile,
        `function longFunction() {\n${lines.join('\n')}\n}`
      );

      const result = CodeExtractor.extractCodeBlock(testFile, 1, 52, 10);

      expect(result.truncated).toBe(true);
      expect(result.totalLines).toBe(52);
      expect(result.displayedLines).toBe(10);
      expect(result.code.split('\n').length).toBe(10);
    });

    it('should not truncate when maxLines is 0', () => {
      testFile = path.join(testDir, 'medium.ts');
      fs.writeFileSync(
        testFile,
        `function test() {
  const x = 1;
  const y = 2;
  const z = 3;
  return x + y + z;
}`
      );

      const result = CodeExtractor.extractCodeBlock(testFile, 1, 6, 0);

      expect(result.truncated).toBe(false);
      expect(result.totalLines).toBe(6);
      expect(result.displayedLines).toBe(6);
    });

    it('should not truncate when code is shorter than maxLines', () => {
      testFile = path.join(testDir, 'short.ts');
      fs.writeFileSync(
        testFile,
        `function short() {
  return 42;
}`
      );

      const result = CodeExtractor.extractCodeBlock(testFile, 1, 3, 20);

      expect(result.truncated).toBe(false);
      expect(result.totalLines).toBe(3);
      expect(result.displayedLines).toBe(3);
    });

    it('should handle single line extraction', () => {
      testFile = path.join(testDir, 'oneliner.ts');
      fs.writeFileSync(
        testFile,
        `const add = (a, b) => a + b;
const sub = (a, b) => a - b;
const mul = (a, b) => a * b;`
      );

      const result = CodeExtractor.extractCodeBlock(testFile, 2, 2);

      expect(result.code).toBe('   2 | const sub = (a, b) => a - b;');
      expect(result.totalLines).toBe(1);
    });

    it('should handle line number padding correctly', () => {
      testFile = path.join(testDir, 'padding.ts');
      const lines = [];
      for (let i = 1; i <= 100; i++) {
        lines.push(`line${i}`);
      }
      fs.writeFileSync(testFile, lines.join('\n'));

      const result = CodeExtractor.extractCodeBlock(testFile, 95, 100);

      expect(result.code).toContain('  95 | line95');
      expect(result.code).toContain('  96 | line96');
      expect(result.code).toContain(' 100 | line100');
    });
  });

  describe('extractSignature', () => {
    it('should extract Python function signature', () => {
      testFile = path.join(testDir, 'python.py');
      fs.writeFileSync(
        testFile,
        `def calculate_score(complexity: int, quality: float) -> float:
    """Calculate impact score."""
    base_score = complexity * 5
    quality_penalty = (4 - quality) * 20
    return min(100, base_score + quality_penalty)`
      );

      const result = CodeExtractor.extractSignature(testFile, 1, 5, 'python');

      expect(result.signature).toContain(
        '   1 | def calculate_score(complexity: int, quality: float) -> float:'
      );
      expect(result.signature).not.toContain('base_score');
      expect(result.totalLines).toBe(5);
    });

    it('should extract JavaScript function signature with opening brace', () => {
      testFile = path.join(testDir, 'javascript.js');
      fs.writeFileSync(
        testFile,
        `function calculateScore(complexity, quality) {
  const baseScore = complexity * 5;
  const qualityPenalty = (4 - quality) * 20;
  return Math.min(100, baseScore + qualityPenalty);
}`
      );

      const result = CodeExtractor.extractSignature(
        testFile,
        1,
        5,
        'javascript'
      );

      expect(result.signature).toContain(
        '   1 | function calculateScore(complexity, quality) {'
      );
      expect(result.signature).not.toContain('baseScore');
      expect(result.totalLines).toBe(5);
    });

    it('should extract TypeScript multi-line signature', () => {
      testFile = path.join(testDir, 'typescript.ts');
      fs.writeFileSync(
        testFile,
        `function processData(
  input: string,
  options: ProcessOptions
): Promise<Result> {
  return process(input, options);
}`
      );

      const result = CodeExtractor.extractSignature(
        testFile,
        1,
        6,
        'typescript',
        5
      );

      expect(result.signature).toContain('function processData(');
      expect(result.signature).toContain('input: string,');
      expect(result.signature).toContain('): Promise<Result> {');
      expect(result.signature).not.toContain('return process');
    });

    it('should respect maxLines parameter for signatures', () => {
      testFile = path.join(testDir, 'long-sig.ts');
      fs.writeFileSync(
        testFile,
        `function withManyParams(
  param1: string,
  param2: number,
  param3: boolean,
  param4: Date,
  param5: object
) {
  return true;
}`
      );

      const result = CodeExtractor.extractSignature(
        testFile,
        1,
        9,
        'typescript',
        3
      );

      const lines = result.signature.split('\n');
      expect(lines.length).toBe(3);
      expect(result.totalLines).toBe(9);
    });

    it('should extract Python class signature', () => {
      testFile = path.join(testDir, 'class.py');
      fs.writeFileSync(
        testFile,
        `class DataProcessor:
    """Process data efficiently."""

    def __init__(self):
        self.data = []

    def process(self):
        return len(self.data)`
      );

      const result = CodeExtractor.extractSignature(testFile, 1, 8, 'python');

      expect(result.signature).toContain('   1 | class DataProcessor:');
      expect(result.signature).not.toContain('def __init__');
      expect(result.totalLines).toBe(8);
    });
  });
});
