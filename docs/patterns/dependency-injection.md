# Dependency Injection Pattern

DocImp uses pure dependency injection throughout the codebase for testability and modularity.

## Core Principle: Required Parameters with Entry-Point Instantiation

**Rule**: All dependencies are passed as **required parameters** to functions/constructors. The only place that uses `new` is the entry point (main.py for Python, index.ts for TypeScript).

## Python Layer

**Components accept dependencies via required parameters:**

```python
# create_analyzer() accepts parsers and scorer as parameters
def create_analyzer(
    parsers: dict,
    scorer: ImpactScorer
) -> DocumentationAnalyzer:
    return DocumentationAnalyzer(
        parsers=parsers,
        scorer=scorer
    )

# Command functions accept dependencies
def cmd_analyze(
    args: argparse.Namespace,
    parsers: dict,
    scorer: ImpactScorer
) -> int:
    analyzer = create_analyzer(parsers, scorer)
    # ... command logic
```

**Entry point (main.py) is the only place with instantiations:**

```python
def main(argv: Optional[list] = None) -> int:
    # Instantiate dependencies ONCE at entry point
    parsers = {
        'python': PythonParser(),
        'typescript': TypeScriptParser(),
        'javascript': TypeScriptParser()
    }
    scorer = ImpactScorer()

    # Dispatch commands with injected dependencies
    if args.command == 'analyze':
        return cmd_analyze(args, parsers, scorer)
    elif args.command == 'audit':
        return cmd_audit(args, parsers, scorer)
```

**For optional dependencies, use `Optional` with explicit None check:**

```python
def generate_plan(
    result: AnalysisResult,
    audit_file: Optional[Path] = None,
    quality_threshold: int = 2,
    scorer: Optional[ImpactScorer] = None  # Optional for backwards compatibility
) -> PlanResult:
    if scorer is None:
        scorer = ImpactScorer()  # Create default only if not provided
    # ... use scorer
```

## TypeScript Layer

**Command core functions accept dependencies as required parameters:**

```typescript
export async function analyzeCore(
  path: string,
  options: AnalyzeOptions,
  bridge: IPythonBridge,      // Required parameter
  display: IDisplay,           // Required parameter
  configLoader: IConfigLoader  // Required parameter
): Promise<void> {
  const config = await configLoader.load(options.config);
  const result = await bridge.analyze({ path, config });
  display.showAnalysisResult(result);
}
```

**Entry point (index.ts) is the only place with instantiations:**

```typescript
// In index.ts command action handlers
program
  .command('analyze')
  .action(async (path, options) => {
    // Instantiate dependencies at entry point
    const display = new TerminalDisplay();
    const configLoader = new ConfigLoader();
    const config = await configLoader.load(options.config);
    const bridge = new PythonBridge(undefined, undefined, config);

    // Call command with injected dependencies
    await analyzeCommand(path, options, bridge, display, configLoader);
  });
```

**Interactive sessions accept all dependencies via constructor:**

```typescript
export interface SessionOptions {
  config: IConfig;
  pythonBridge: IPythonBridge;
  pluginManager: IPluginManager;
  editorLauncher: IEditorLauncher;
  styleGuides: Partial<Record<SupportedLanguage, string>>;
  tone: string;
  basePath: string;
}

export class InteractiveSession {
  constructor(options: SessionOptions) {
    this.pythonBridge = options.pythonBridge;
    this.editorLauncher = options.editorLauncher;
    // ... all dependencies injected, none created
  }
}
```

## Benefits of Pure DI

- **Testability**: Tests inject mocks, production injects real implementations
- **No hidden dependencies**: All dependencies are explicit in function signatures
- **Single instantiation point**: Easy to trace where objects are created
- **Compile-time safety**: TypeScript/mypy catch missing dependencies

## Acceptable Exceptions to Strict DI

While DocImp follows pure dependency injection, there are documented exceptions for specific performance and backward-compatibility reasons:

### 1. Module-Level Performance Caches (Plugin Layer)

The validate-types.js plugin maintains module-level caches for TypeScript language services:
- `languageServiceCache` - Caches TypeScript programs to prevent memory leaks
- `cacheAccessOrder` - LRU tracking for cache eviction
- `documentRegistry` - Shared TypeScript SourceFile registry

**Rationale**: These caches must persist across multiple validation calls to be effective. Recreating them per-factory would defeat their purpose. The factory pattern captures dependencies (ts, parseJSDoc) in closure scope for all helper functions, while caches remain at module level.

**See**: plugins/README.md for detailed cache architecture and thread-safety considerations.

### 2. Optional Dependencies with Defaults (Backward Compatibility)

Functions like `generate_plan()` do NOT use dependency injection for simple internal utilities:

```python
def generate_plan(
    result: AnalysisResult,
    audit_file: Optional[Path] = None,
    quality_threshold: int = 2
) -> PlanResult:
    """Generate a prioritized documentation improvement plan."""
    # Creates ImpactScorer internally when needed
    if audit_results:
        scorer = ImpactScorer()  # Simple utility, no DI needed
        # ... use scorer for calculations
```

**Rationale**: Not every dependency needs injection. Simple utility classes like `ImpactScorer` that have no external dependencies or state can be instantiated internally. DI is reserved for dependencies that need mocking in tests (parsers, API clients, file system) or configuration (timeouts, paths). Over-applying DI adds unnecessary complexity.

### 3. Environment Variable Fallback Pattern (Hybrid DI)

The `TypeScriptParser` demonstrates a hybrid approach that combines dependency injection with environment variable and auto-detection fallbacks:

```python
class TypeScriptParser(BaseParser):
    def __init__(self, helper_path: Optional[Path] = None):
        """Initialize with three-tier resolution strategy:
        1. Explicit helper_path parameter (highest priority, for DI)
        2. DOCIMP_TS_HELPER_PATH environment variable (for CI/CD)
        3. Auto-detection fallback (for development environment)
        """
        if helper_path:
            # Priority 1: Explicit parameter (dependency injection)
            self.helper_path = helper_path
        else:
            # Priority 2: Environment variable
            env_path = os.environ.get('DOCIMP_TS_HELPER_PATH')
            if env_path:
                self.helper_path = Path(env_path)
            else:
                # Priority 3: Auto-detection fallback
                self.helper_path = self._find_helper()

        if not self.helper_path.exists():
            raise FileNotFoundError(f"Helper not found at {self.helper_path}")

    def _find_helper(self) -> Path:
        """Auto-detect helper path with fallback strategies."""
        # Development environment detection
        dev_path = Path(__file__).parent.parent.parent.parent / 'cli' / 'dist' / '...'
        if dev_path.exists():
            return dev_path
        # Future: pip-installed package location
        return dev_path
```

**Usage in tests:**
```python
# Dependency injection for testing
mock_helper = Path("/path/to/mock-helper.js")
parser = TypeScriptParser(helper_path=mock_helper)
```

**Usage in production:**
```python
# Auto-detection (development)
parser = TypeScriptParser()

# Environment variable (CI/CD)
# export DOCIMP_TS_HELPER_PATH=/custom/path/helper.js
parser = TypeScriptParser()
```

**Rationale**: This pattern balances flexibility (works in development, CI/CD, and future pip installations), testability (tests inject mock paths), and backward compatibility (existing code continues to work). The fragile path traversal is isolated in `_find_helper()`, making it easy to extend with additional strategies (e.g., pip package detection).

**See**: Issue #63 for the motivation behind this pattern.
