# DocImp

**Impact-Driven Documentation Coverage Tool**

DocImp analyzes your Python, TypeScript, and JavaScript codebases to identify
undocumented code, prioritizes it by impact score, and uses Claude AI to generate
high-quality documentation with validation gates.

[![CI Status](https://github.com/nikblanchet/docimp/workflows/CI/badge.svg)](https://github.com/nikblanchet/docimp/actions)
[![Python 3.13](https://img.shields.io/badge/python-3.13-blue.svg)](https://www.python.org/downloads/)
[![Node.js 24](https://img.shields.io/badge/node-24-green.svg)](https://nodejs.org/)
[![License: AGPL-3.0 or Commercial](https://img.shields.io/badge/License-AGPL%20v3%20%7C%20Commercial-blue.svg)](./LICENSE)

---

## Table of Contents

- [Why DocImp?](#why-docimp)
- [Features](#features)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
  - [Analyze](#analyze)
  - [Audit](#audit)
  - [Plan](#plan)
  - [Improve](#improve)
- [Architecture](#architecture)
- [Impact Scoring](#impact-scoring)
- [Configuration](#configuration)
- [Plugin System](#plugin-system)
- [JavaScript/JSDoc Support](#javascriptjsdoc-support)
- [Built with Claude Code](#built-with-claude-code)
- [Contributing](#contributing)
- [License](#license)

---

## Why DocImp?

Documentation is critical but often neglected. The challenge isn't just writing
docs—it's **knowing what to document first**.

DocImp solves this by:

1. **Prioritizing by Impact**: Complex, public APIs get documented before simple private
   helpers
2. **Supporting Multiple Languages**: Python, TypeScript, and JavaScript as first-class
   citizens
3. **Validating AI Output**: Plugins catch errors before accepting generated
   documentation
4. **Making it Interactive**: Iterative workflow with context management
5. **Local Analysis**: Analyze and audit locally to save time and API costs—only send
   selected items to Claude

**Problem**: Your codebase has 500 undocumented functions. Where do you start?

**Solution**: DocImp analyzes cyclomatic complexity and calculates impact scores
(0-100). Focus on what matters.

---

## Features

### Core Capabilities

- **Polyglot Analysis**: Parse Python (AST), TypeScript, JavaScript (with JSDoc
  validation)
- **Smart Prioritization**: Impact scoring based on cyclomatic complexity
- **AI-Powered Suggestions**: Claude generates context-aware documentation
- **Validation Gates**: JavaScript plugins validate JSDoc types, style, and correctness
- **Interactive Workflow**: Step-by-step improvement with progress tracking
- **Multiple Module Systems**: ESM, CommonJS, mixed codebases supported
- **Real JSDoc Type-Checking**: Uses TypeScript compiler for validation, not just
  parsing
- **Graceful Error Handling**: Continues analyzing valid files when encountering syntax
  errors

### Language Support

| Language    | Parser                | Documentation Style   | Validation                |
| ----------- | --------------------- | --------------------- | ------------------------- |
| Python      | AST (built-in)        | NumPy, Google, Sphinx | Ruff integration          |
| TypeScript  | TS Compiler           | JSDoc                 | Full type-checking        |
| JavaScript  | TS Compiler (checkJs) | JSDoc                 | Parameter/type validation |
| Other files | Skipped               | N/A                   | N/A                       |

### JavaScript Excellence

DocImp treats JavaScript as a **first-class language**, not just "TypeScript that parses
.js files":

- **Real JSDoc Validation**: Uses TypeScript compiler with `checkJs: true` to validate
  JSDoc against actual function signatures
- **Module System Detection**: Automatically detects ESM (`export`/`import`) vs CommonJS
  (`module.exports`)
- **Export Pattern Recognition**: Tracks named exports, default exports, re-exports
- **Smart Writing**: Correctly inserts JSDoc above functions, arrow functions, classes,
  and object methods

---

## Quick Start

**Prerequisites**: Install [uv](https://github.com/astral-sh/uv) first:
```bash
# macOS (Homebrew)
brew install uv

# Or use the official installer (Linux/macOS)
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```bash
# Clone and install from source
git clone https://github.com/nikblanchet/docimp.git
cd docimp

# Install Python dependencies with uv
uv venv
uv pip sync requirements-dev.lock
uv pip install -e .

# Install TypeScript CLI
cd cli
npm install
npm run build
npm link

# Analyze your codebase
docimp analyze ./src

# Output:
# ┌──────────────────────────────────────────┐
# │  Documentation Coverage Analysis         │
# ├──────────────────────────────────────────┤
# │  Overall:        45.2% (23/51 documented)│
# │                                          │
# │  By Language:                            │
# │  • Python:       60.0% (12/20)           │
# │  • TypeScript:   50.0% (8/16)            │
# │  • JavaScript:   20.0% (3/15) ⚠️         │
# └──────────────────────────────────────────┘

# Generate improvement plan
docimp plan ./src

# Output:
# High Priority (≥70 impact score):
# 1. PaymentService.processPayment (score: 92)
# 2. AuthRepository.validateToken (score: 87)
# 3. UserService.createUser (score: 81)
#
# 15 high-priority items found

# Interactive improvement
export ANTHROPIC_API_KEY=sk-ant-...
docimp improve ./src

# Interactive workflow:
# 1. Provide your documentation style preferences (or use defaults)
# 2. Select item to document
# 3. Claude generates suggestion
# 4. Plugins validate (catches errors!)
# 5. Accept/Edit/Regenerate
# 6. Write back to file
# 7. Track progress
```

---

## Installation

### Prerequisites

- **Python**: 3.13 (untested on other versions)
- **Node.js**: 24 or later (required by package engines field)
- **Git**: 2.28 or later (Git CLI is required for rollback/undo functionality)
- **Claude API Key**: From [console.anthropic.com](https://console.anthropic.com)

**Note on Git**: DocImp uses the Git CLI to track documentation changes for rollback
capability. The transaction system requires Git 2.28+ (released July 2020) for improved
working tree handling with `--git-dir` and `--work-tree` flags. Check your version with
`git --version`. If Git is not installed or is older than 2.28, DocImp will run without
rollback features (graceful degradation). See the
[Git installation guide](https://git-scm.com/downloads) for installation instructions.
Future versions will include Dulwich (Apache 2.0 license) as a pure-Python fallback.

### Install from Source

**Prerequisites**: Install [uv](https://github.com/astral-sh/uv):
```bash
# macOS (Homebrew)
brew install uv

# Linux/macOS (official installer)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows (PowerShell)
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

```bash
# Clone repository
git clone https://github.com/nikblanchet/docimp.git
cd docimp

# Install Python dependencies with uv
uv venv
uv pip sync requirements-dev.lock
uv pip install -e .

# Install TypeScript CLI
cd cli
npm install
npm run build
npm link

# Verify installation
docimp --version

# Verify Git is available (for rollback features)
git --version

# Set API key
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## Usage

### Analyze

Analyze documentation coverage across your codebase.

```bash
# Analyze directory (uses docimp.config.js if present)
docimp analyze ./src
```

**Output includes**:

- Overall coverage percentage
- Coverage by language (Python/TypeScript/JavaScript/Skipped)
- List of undocumented items sorted by impact
- Complexity metrics

### Audit

Rate existing documentation quality with code context displayed.

```bash
docimp audit ./src
```

Interactive workflow:

- Reviews items that HAVE documentation
- **Displays code alongside documentation** in configurable modes:
  - **Complete**: Show full code with line numbers
  - **Truncated** (default): Show first 20 lines, [C] to view full code
  - **Signature**: Show function/class signature only, [C] to view full code
  - **On-demand**: Hide code, [C] to view when needed
- Shows boxed "CURRENT DOCSTRING" to clearly identify what's being rated
- Prompts: [1-4] for quality rating, [C] for full code (if applicable), [S] to skip, [Q]
  to quit
  - 1 = Terrible, 2 = OK, 3 = Good, 4 = Excellent
  - C = Show full code (only in truncated/signature/on-demand modes)
  - S = Skip (saves null for later review)
  - Q = Quit (stops audit)
- Calculates weighted coverage score
- Saves results to `.docimp/session-reports/audit.json`

**Example output:**

```
Auditing: 5/23
function calculateImpactScore (typescript)
Location: src/scoring/scorer.ts:45
Complexity: 8

┌──────────────────────────────────────────────────────────┐
│ CURRENT DOCSTRING                                        │
├──────────────────────────────────────────────────────────┤
│ /**                                                      │
│  * Calculate impact score based on complexity.           │
│  * @param complexity - Cyclomatic complexity             │
│  * @returns Impact score (0-100)                         │
│  */                                                      │
└──────────────────────────────────────────────────────────┘
  45 | function calculateImpactScore(complexity: number): number {
  46 |   const baseScore = complexity * 5;
  47 |   return Math.min(100, baseScore);
  48 | }

[1] Terrible  [2] Poor  [3] Good  [4] Excellent
[C] Full code  [S] Skip  [Q] Quit
```

### Plan

Generate prioritized improvement plan.

```bash
docimp plan ./src
```

**Plan includes**:

- Items sorted by impact score
- Categorized by priority (High/Medium/Low)
- Coverage improvement projection

### Improve

Interactive documentation improvement workflow.

```bash
# Set API key
export ANTHROPIC_API_KEY=sk-ant-...

# Start interactive session
docimp improve ./src
```

**Interactive workflow**:

1. **Collect preferences**: Prompts for documentation style guide and tone
2. **Load plan**: Uses previously generated plan (from `docimp plan`)
3. **For each item** (in priority order):
   - Show code context
   - Request Claude suggestion
   - Run plugin validation
   - Show suggestion with any validation errors
   - **User decides**: [A] Accept (accepts as-is) [E] Edit (opens suggestion in editor)
     [R] Regenerate (prompts user for feedback then regenerates) [S] Skip [Q] Quit
4. **Write**: Insert accepted documentation into source file
5. **Continue**: Move to next item until done or user quits

**Plugin validation catches**:

- JSDoc parameter names don't match function signature
- JSDoc types are incorrect or missing
- Style guide violations (preferred tags, punctuation)
- Missing examples for public APIs

### Rollback & Undo

DocImp uses the Git CLI to track all documentation changes with full rollback
capability. Each improve session creates a Git branch in a side-car repository
(`.docimp/state/.git`) that never interferes with your project's Git repository.

**During an improve session**, press `[U]` to undo the last accepted change.

**After a session**, use rollback commands to revert changes:

```bash
# List all sessions (shows session ID, timestamp, change count)
docimp list-sessions

# List changes within a specific session
docimp list-changes <session-id>
docimp list-changes last       # List changes in most recent session

# Rollback entire session (all changes)
docimp rollback-session <session-id>
docimp rollback-session last  # Rollback most recent session

# Rollback specific individual change
docimp rollback-change <entry-id>
docimp rollback-change last   # Rollback most recent change
```

**Using "last" keyword**:

- `last` as session ID: Finds the most recent session (sorted by start time)
- `last` as entry ID: Finds the most recent change across all sessions (sorted by
  timestamp)
- Useful for quick undo without needing to look up IDs
- Works with `--no-confirm` for scripting: `docimp rollback-session last --no-confirm`

**How it works**:

- Each improve session = Git branch (`docimp/session-<uuid>`)
- Each accepted change = Git commit with metadata
- Rollback = Git revert with conflict detection
- Side-car repo in `.docimp/state/.git` (never touches your repo)

**Conflict handling**: If files have been modified since the change was made, DocImp
uses Git's 3-way merge to attempt resolution. If conflicts occur, you'll see detailed
guidance with resolution options:

Common conflict scenarios:

- **Modified file**: You edited the file after DocImp added documentation
  - Resolution: Review changes, decide which version to keep, retry rollback
- **Deleted file**: The file was deleted after documentation was added
  - Resolution: Restore file or accept partial rollback
- **Multiple changes**: Several DocImp changes modified the same lines
  - Resolution: Rollback changes in reverse order, or use git directly

When conflicts occur, DocImp displays:

- Which files have conflicts
- Why conflicts happened (file modified since change)
- Three resolution options: manual resolution, accept partial rollback, or use git
  directly

**No Git installed?** DocImp gracefully degrades - improve workflow runs normally, but
rollback commands are unavailable.

---

## Workflows

DocImp supports two monodirectional workflows in MVP:

### Workflow A: analyze → plan → improve

**Complexity-only** impact scoring (no audit)

```bash
docimp analyze ./src
docimp plan ./src
docimp improve ./src
```

Best for: Quick start, small codebases, first-time users

### Workflow B: analyze → audit → plan → improve

**Quality-weighted** impact scoring (with audit)

```bash
docimp analyze ./src
docimp audit ./src      # Rate existing documentation quality
docimp plan ./src       # Generates plan with quality-adjusted priorities
docimp improve ./src
```

Best for: Large codebases, teams prioritizing documentation quality

### Rollback

DocImp tracks all documentation changes in a git-based transaction system, enabling you
to rollback changes if needed.

#### List Sessions

View all documentation improvement sessions:

```bash
# List all sessions
docimp list-sessions
```

**Output includes**:

- Session ID (UUID)
- Start time
- Number of changes
- Status (in_progress, committed, rolled_back)

#### List Changes

View changes in a specific session:

```bash
# List changes in a session
docimp list-changes <session-id>

# Or use "last" for the most recent session
docimp list-changes last
```

**Output includes**:

- Entry ID (git commit SHA)
- File path
- Item name (function/class/method)
- Timestamp

#### Rollback Session

Revert all changes from a session:

```bash
# Rollback a specific session
docimp rollback-session <session-id>

# Or use "last" for the most recent session
docimp rollback-session last
```

This reverts all documentation changes made during that session using git's 3-way merge
for conflict detection.

#### Rollback Change

Revert a specific change:

```bash
# Rollback a specific change
docimp rollback-change <entry-id>

# Or use "last" for the most recent change
docimp rollback-change last
```

**Conflict Handling**:

- If files have been modified since the change, git's merge algorithm detects conflicts
- Conflicts are reported with file paths
- Partial rollback status is tracked

### State Directory (.docimp/)

DocImp stores session data in `.docimp/` (similar to `.git/`):

```
.docimp/
├── session-reports/
│   ├── audit.json          # Latest audit ratings
│   ├── plan.json           # Latest improvement plan
│   └── analyze-latest.json # Latest analysis
├── state/                  # Git-based transaction tracking
│   └── .git/               # Side-car Git repo (never touches your repo)
└── history/                # Future: audit history
```

**Auto-clean behavior**: `docimp analyze` clears old session reports by default

- Prevents stale audit/plan data
- Use `--keep-old-reports` flag to preserve existing reports

**Transaction tracking**: The `.docimp/state/` directory contains a side-car Git
repository used for rollback functionality. This repository operates independently from
your project's Git repository and tracks all documentation changes made by DocImp.

**Note**: `.docimp/` is gitignored automatically. Restore clean state with
`rm -rf .docimp/`

---

## Architecture

DocImp uses a **three-layer polyglot architecture** with clean dependency injection
patterns.

```
┌─────────────────────────────────────────────────────────────────┐
│                     TypeScript CLI Layer                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Commander.js • Config Loader (JS) • Plugin Manager       │  │
│  │  Python Bridge • Terminal Display • Interactive Session   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│                   Subprocess Communication                       │
│                              ↕                                  │
│                    Python Analysis Engine                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  AST Parsers • Impact Scorer • Coverage Calculator        │  │
│  │  Claude Client • Docstring Writer                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│                      File System & APIs                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  .py .ts .js .cjs .mjs files • Claude API                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              ↕                                  │
│                  JavaScript Config & Plugins                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  docimp.config.js • validate-types.js • jsdoc-style.js    │  │
│  │  TypeScript Compiler (for JSDoc validation)               │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User runs** `docimp analyze ./code`
2. **TypeScript CLI** loads config from `docimp.config.js` (JavaScript file)
3. **Python Bridge** spawns Python subprocess with arguments
4. **Python Analyzer** discovers files and selects parser:
   - `.py` → `PythonParser` (AST)
   - `.ts/.js/.cjs/.mjs` → `TypeScriptParser` (TS Compiler with `checkJs: true`)
5. **Parser extracts** `CodeItem` objects (name, type, complexity, docs, exports, module
   system)
6. **Impact Scorer** calculates priority (0-100) based on cyclomatic complexity
7. **Python returns** `AnalysisResult` as JSON to stdout
8. **TypeScript CLI** parses JSON and displays formatted results

### Interactive Improve Flow

1. User selects item to document
2. Python builds context prompt (code + surrounding context + style guide)
3. Claude generates documentation suggestion
4. **TypeScript runs validation plugins** (e.g., JSDoc type-checking with TS compiler)
5. Plugin returns `accept`/`reject` + optional `autoFix`
6. User accepts/edits/regenerates
7. Python writer inserts docstring/JSDoc into source file

### Dependency Injection

All major components use constructor injection for testability:

**Python**:

```python
# DocumentationAnalyzer accepts injected parsers and scorer
analyzer = DocumentationAnalyzer(
    parsers={'python': PythonParser(), 'javascript': TypeScriptParser()},
    scorer=ImpactScorer()
)
```

**TypeScript**:

```typescript
// Commands accept injected bridge and display
const analyzeCommand = new AnalyzeCommand(
  pythonBridge: IPythonBridge,
  display: IDisplay
);
```

---

## Impact Scoring

DocImp calculates a **0-100 impact score** to prioritize documentation needs.

### Formula

**Without Audit:**

```
impact_score = min(100, cyclomatic_complexity * 5)
```

**With Audit (after running `docimp audit`):**

```
impact_score = (complexity_weight × complexity_score) +
               (quality_weight × quality_penalty)

where:
  complexity_score = min(100, cyclomatic_complexity * 5)
  quality_penalty = rating_to_penalty(user_audit_rating)
```

### Audit Rating to Penalty

| User Rating   | Penalty | Priority  |
| ------------- | ------- | --------- |
| No docs       | 100     | Highest   |
| Terrible (1)  | 80      | Very High |
| OK (2)        | 40      | Medium    |
| Good (3)      | 20      | Low       |
| Excellent (4) | 0       | Lowest    |

### Default Weights

Configurable in `docimp.config.js`:

```javascript
module.exports = {
  impactWeights: {
    complexity: 0.6, // 60% from code complexity
    quality: 0.4, // 40% from audit rating
  },
};
```

### Examples

**Without Audit:**

Simple function (complexity 1):

```python
def add(x, y):
    return x + y
```

**Impact Score: 5**

Complex function (complexity 15):

```python
def process_payment(user_id, amount, options):
    # 15 lines with multiple branches
    if options.get('immediate'):
        if amount > 1000:
            # verification logic
        else:
            # direct processing
    else:
        # queue for later
```

**Impact Score: 75**

**With Audit:**

Complex function (complexity 15) with terrible docs (rating 1):

- Complexity score: 75
- Quality penalty: 80
- **Impact Score: 75×0.6 + 80×0.4 = 77**

Simple function (complexity 3) with no docs:

- Complexity score: 15
- Quality penalty: 100
- **Impact Score: 15×0.6 + 100×0.4 = 49**

### Future Enhancements

Planned improvements for more sophisticated scoring:

- **Public/Private API Detection**: Boost score for exported functions, lower for
  internal helpers
- **Pattern Detection**: Identify dependency injection, async patterns, decorators
- **Custom Pattern Matchers**: User-defined heuristics (e.g., functions ending in
  `Repository`)
- **Test File Penalty**: Lower priority for test files

---

## Configuration

DocImp uses a **JavaScript configuration file** (not JSON) to allow custom logic.

### Example: `docimp.config.js`

```javascript
module.exports = {
  // Per-language style guides
  styleGuides: {
    // Python: 'google', 'numpy-rest', 'numpy-markdown', 'sphinx'
    python: 'google',

    // JavaScript: 'jsdoc-vanilla', 'jsdoc-google', 'jsdoc-closure'
    javascript: 'jsdoc-vanilla',

    // TypeScript: 'tsdoc-typedoc', 'tsdoc-aedoc', 'jsdoc-ts'
    typescript: 'tsdoc-typedoc',
  },

  // Tone: 'concise', 'detailed', 'friendly'
  tone: 'concise',

  // JSDoc-specific options
  jsdocStyle: {
    preferredTags: { return: 'returns', arg: 'param' },
    requireDescriptions: true,
    requireExamples: 'public', // 'all', 'public', 'none'
    enforceTypes: true,
  },

  // Audit code display configuration
  audit: {
    showCode: {
      // Display mode for code during audit:
      // - 'complete': Show full code, no truncation
      // - 'truncated': Show code up to maxLines (default)
      // - 'signature': Show just function/class signature
      // - 'on-demand': Don't show code, use [C] to view
      mode: 'truncated',

      // Maximum lines to show in 'truncated' and 'signature' modes
      // (not counting the docstring itself)
      maxLines: 20,
    },
  },

  // Impact scoring weights (used when audit data available)
  impactWeights: {
    complexity: 0.6, // 60% from cyclomatic complexity
    quality: 0.4, // 40% from audit quality rating
  },

  // Validation plugins (JavaScript files)
  plugins: ['./plugins/validate-types.js', './plugins/jsdoc-style.js'],

  // File exclusions (glob patterns)
  exclude: [
    '**/test_*.py',
    '**/*.test.ts',
    '**/node_modules/**',
    '**/venv/**',
    '**/__pycache__/**',
  ],
};
```

### Config supports both CommonJS and ESM

**CommonJS**:

```javascript
module.exports = {
  /* config */
};
```

**ESM**:

```javascript
export default {
  /* config */
};
```

### Environment Variables

DocImp supports several environment variables for configuration and customization:

| Variable               | Purpose                                 | Required            | Example                     |
| ---------------------- | --------------------------------------- | ------------------- | --------------------------- |
| `ANTHROPIC_API_KEY`    | Claude AI API key for `improve` command | Yes (for `improve`) | `sk-ant-...`                |
| `DOCIMP_ANALYZER_PATH` | Override analyzer directory location    | No                  | `/custom/path/to/analyzer`  |
| `DOCIMP_PYTHON_PATH`   | Override Python executable detection    | No                  | `/usr/local/bin/python3.13` |

**DOCIMP_ANALYZER_PATH** is useful for:

- Custom installations where the analyzer is in a non-standard location
- Development setups with modified project structure
- Troubleshooting path resolution issues

**Path Resolution Order**:

When `DOCIMP_ANALYZER_PATH` is NOT set, DocImp uses fallback strategies based on
`process.cwd()`:

1. `<cwd>/../analyzer` - Running from `cli/` directory (development, tests)
2. `<cwd>/analyzer` - Running from repository root
3. `<cwd>/../../analyzer` - Global npm install scenario

If all strategies fail, set `DOCIMP_ANALYZER_PATH` explicitly.

**Example**:

```bash
# Set analyzer path for custom installation
export DOCIMP_ANALYZER_PATH=/opt/docimp/analyzer
docimp analyze ./src
```

---

## Plugin System

DocImp's plugin system provides **extensible validation hooks** to catch errors before
accepting AI-generated documentation.

### Plugin Interface

```typescript
interface IPlugin {
  name: string;
  version: string;
  hooks: {
    beforeAccept?: (
      docstring: string,
      item: CodeItem,
      config: IConfig
    ) => Promise<PluginResult>;
    afterWrite?: (filepath: string, item: CodeItem) => Promise<PluginResult>;
  };
}

interface PluginResult {
  accept: boolean; // true = allow, false = block
  reason?: string; // Error message if blocked
  autoFix?: string; // Suggested correction
}
```

### Built-in Plugins

#### 1. `validate-types.js` - Real JSDoc Type-Checking

Uses **TypeScript compiler programmatically** to validate JSDoc:

```javascript
// Bad: Parameter name mismatch
/**
 * @param {number} wrongName - The value
 */
function add(correctName) {
  return correctName + 1;
}

// Plugin catches: "Parameter 'wrongName' doesn't match signature 'correctName'"
```

**How it works**:

- Creates in-memory TypeScript program with `checkJs: true`
- Validates parameter names match
- Validates types are correct
- Returns specific error messages with line numbers
- Can suggest auto-fixes

#### 2. `jsdoc-style.js` - Style Enforcement

Enforces JSDoc style rules from config:

```javascript
// Bad: Missing description ending punctuation
/**
 * Add two numbers
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */

// Plugin suggests: "Description should end with punctuation"
```

#### 3. Linter Integration (Future Enhancement)

The plugin system supports integration with external linters like `ruff` or `eslint`.
This demonstrates the extensibility of the framework - you can add custom validation by
implementing the plugin interface.

Example future plugin:

```javascript
// plugins/lint-docstrings.js (not included in MVP)
module.exports = {
  name: 'lint-docstrings',
  version: '1.0.0',
  hooks: {
    async afterWrite(filepath, item) {
      // Run ruff on Python files, eslint on JS files, etc.
    },
  },
};
```

### Security Model

Plugins are **user-controlled JavaScript code with NO sandboxing**.

**Trade-offs**:

- ✅ Full access to Node.js APIs and TypeScript compiler
- ✅ Real validation (not just pattern matching)
- ❌ No security boundary - plugins run with full file system access
- ❌ User must trust plugin source code

**Default behavior**: Only load plugins from:

- `./plugins/` directory
- Paths specified in `docimp.config.js`

See `plugins/README.md` for full plugin development guide and security details.

### Writing Custom Plugins

```javascript
// my-plugin.js
module.exports = {
  name: 'my-validator',
  version: '1.0.0',
  hooks: {
    async beforeAccept(docstring, item, config) {
      // Validate docstring
      if (!docstring.includes('@example') && item.is_public) {
        return {
          accept: false,
          reason: 'Public APIs must include @example',
          autoFix: docstring + '\n * @example\n * // TODO: Add example',
        };
      }

      return { accept: true };
    },
  },
};
```

Add to `docimp.config.js`:

```javascript
module.exports = {
  plugins: ['./my-plugin.js'],
};
```

---

## JavaScript/JSDoc Support

DocImp treats JavaScript as a **first-class citizen** with real type-checking.

### TypeScript Configuration

Critical settings in `cli/tsconfig.json`:

```json
{
  "compilerOptions": {
    "allowJs": true, // Parse JavaScript files
    "checkJs": true, // Type-check JSDoc in .js files
    "module": "NodeNext", // Deterministic ESM/CJS interop
    "moduleResolution": "NodeNext"
  }
}
```

`checkJs: true` enables **real JSDoc validation**, not just cosmetic parsing.

### Module System Detection

DocImp detects and handles:

**ESM (ES Modules)**:

```javascript
export function add(a, b) {
  return a + b;
}
export default class Calculator {}
```

**CommonJS**:

```javascript
module.exports = { add };
exports.subtract = (a, b) => a - b;
```

**Mixed** (detected per-file):

```javascript
// File: utils.mjs (ESM)
export const helper = () => {};

// File: legacy.cjs (CommonJS)
module.exports.helper = () => {};
```

### JSDoc Validation

The `validate-types.js` plugin uses TypeScript compiler to validate:

**Parameter names**:

```javascript
/**
 * @param {number} wrongName   // ERROR: doesn't match
 */
function add(correctName) {}
```

**Parameter types**:

```javascript
/**
 * @param {string} value   // ERROR: passing number
 */
function double(value) {
  return value * 2; // TS compiler detects type mismatch
}
```

**Return types**:

```javascript
/**
 * @returns {string}   // ERROR: actually returns number
 */
function getId() {
  return 123;
}
```

### JavaScript Write Patterns

The `DocstringWriter` correctly handles:

```javascript
// Function declaration
function foo() {}

// Export function
export function foo() {}

// Default export
export default function foo() {}

// Arrow function
const foo = () => {};

// Async arrow function
const fetchData = async () => {};

// Class method
class Service {
  async getData() {}
  static helper() {}
  get value() {}
}

// Object literal method
module.exports = {
  foo() {},
  bar: function () {},
};

// CommonJS patterns
module.exports.baz = () => {};
exports.qux = function () {};
```

All patterns preserve indentation and avoid duplicate comments.

---

## Built with Claude Code

DocImp was built entirely using **[Claude Code](https://claude.com/code)**,
demonstrating production-grade development with AI assistance.

### Development Process

- **16 Claude Code instances** across 3-4 days
- **Session atomicity**: Each instance completed a specific deliverable
- **Contract-based**: Clear inputs, outputs, and rollback plans
- **Progressive context**: Built complexity incrementally
- **Test-first**: Validation at each step

Development artifacts including methodology playbook, instance-by-instance development
logs, case studies, and terminal recordings are planned for future releases.

---

## Key Data Models

### CodeItem

Core representation of a parsed code entity:

```python
@dataclass
class CodeItem:
    """Represents a function, class, or method extracted from source code."""
    name: str                    # Function/class name
    type: str                    # 'function', 'class', 'method'
    filepath: str
    line_number: int
    end_line: int                # Last line of code block (inclusive)
    language: str                # 'python', 'typescript', 'javascript', 'skipped'
    complexity: int              # Cyclomatic complexity
    impact_score: float          # 0-100 priority score
    has_docs: bool               # Binary: has documentation or not
    parameters: List[str]
    return_type: Optional[str]
    docstring: Optional[str]
    export_type: str             # 'named', 'default', 'commonjs', 'internal'
    module_system: str           # 'esm', 'commonjs', 'unknown'
    audit_rating: Optional[int]  # 1-4 rating from audit, or None if skipped/not audited
```

### AnalysisResult

```python
@dataclass
class AnalysisResult:
    """Results from analyzing a codebase."""
    items: List[CodeItem]
    coverage_percent: float
    total_items: int
    documented_items: int
    by_language: Dict[str, LanguageMetrics]
```

---

## Contributing

Contributions welcome! See `CONTRIBUTING.md` for guidelines.

### Development Setup

```bash
# Clone repository
git clone https://github.com/nikblanchet/docimp.git
cd docimp

# Python setup with uv
uv venv
uv pip sync requirements-dev.lock
uv pip install -e .
cd analyzer
uv run pytest -v

# TypeScript setup
cd ../cli
npm install
uv run npm test
npm run build

# Run linters
uv run ruff check .  # Python
npm run lint  # TypeScript/JavaScript

# Run formatters
uv run ruff format .  # Python (auto-fix)
npm run format  # TypeScript/JavaScript (auto-fix)

# Check formatting without auto-fix
ruff format --check .  # Python
npm run format:check  # TypeScript/JavaScript
```

### Pre-commit Hooks

This project uses husky and lint-staged to automatically format and lint code before
commits:

```bash
# Hooks are automatically installed when you run npm install in cli/
# They run on staged files only

# To bypass hooks (use sparingly):
git commit --no-verify
```

The pre-commit hook will:

- Format Python files with `ruff format`
- Lint Python files with `ruff check --fix`
- Format TypeScript/JavaScript files with Prettier
- Lint TypeScript/JavaScript files with ESLint

### Running Tests

```bash
# Python tests
cd analyzer
pytest -v --cov=src

# TypeScript tests
cd cli
uv run npm test

# Integration tests
uv run npm run test:integration
```

### Known Test Coverage Limitations

The following testing gaps represent conscious trade-off decisions made during
development to prioritize shipping a functional MVP:

#### Improve Command - Manual Testing Only

**Status**: No automated tests. Manual testing procedure documented in
`test-samples/test-workflows-improve.sh`.

**Why**: Requires `ANTHROPIC_API_KEY`, interactive user input (A/E/R/S/Q choices), and
incurs API costs. Mocking the Claude client is significant engineering effort.

**Risk**: Medium - Primary feature lacks regression testing, but functionality is
straightforward.

**Mitigation**: Manual testing runbook available for pre-release validation.

#### Error Condition Testing - Limited Coverage

**Status**: Minimal testing of error conditions (corrupted state files, malformed JSON,
filesystem errors).

**Why**: Users can recover by deleting `.docimp/` directory. Corrupted state files are
rare. Focus prioritized on happy path functionality.

**Risk**: Low - Edge case failures don't impact primary workflows.

**Mitigation**: StateManager uses standard JSON parsing with basic error handling.

#### Scaling and Performance - Small Test Samples

**Status**: Test samples intentionally kept small (~62 items). Large codebase
performance not formally validated.

**Why**: Small samples enable complete manual audits. Cyclomatic complexity algorithms
scale linearly. No algorithmic bottlenecks. Real-world validation occurs when running
DocImp on itself during development.

**Risk**: Very low - Architecture has no scaling concerns.

#### Cross-Platform Testing - Ubuntu Only

**Status**: CI runs on `ubuntu-latest` only. Windows and macOS not tested in CI.

**Why**: Project targets Unix-like environments primarily. Multi-platform CI adds
cost/complexity. Core Python/TypeScript/Node stack is inherently cross-platform.

**Risk**: Low - Standard tooling is well-tested across platforms.

**Future**: Additional platforms will be added to CI matrix if issues are discovered.

---

**Note**: These limitations are tracked in GitHub issues and will be addressed in future
releases. See Issues #174 (improve testing) and #175 (error conditions) for planned
enhancements.

---

## License

DocImp is dual-licensed under **AGPL-3.0** (for open-source use) or a **Commercial
License** (for proprietary use without source code disclosure). See [LICENSE](./LICENSE)
for full details.

---

## Acknowledgments

### AI Assistance

- Program design assisted by [Claude](https://claude.ai) (macOS app) and
  [ChatGPT](https://openai.com/chatgpt) (macOS app)
- All coding done exclusively with [Claude Code](https://claude.com/code), running in a
  terminal within [VS Code](https://code.visualstudio.com/) on macOS

### Development Tools

- **Editor**: [VS Code](https://code.visualstudio.com/) with
  [Sublime Text](https://www.sublimetext.com/) for regex work
- **Font**: [Fira Code Nerd Font](https://github.com/Trzcin/Fira-Code-Nerd) with
  ligatures enabled
- **Environment Management**: [uv](https://github.com/astral-sh/uv) (primary) with
  [direnv](https://direnv.net/) for automatic environment activation
- **Git Workflow**: [GitHub CLI](https://cli.github.com/) (installed via
  [Homebrew](https://brew.sh/)) for pull requests and merges
- **Version Control**: [Git](https://git-scm.com/)

### Core Technologies

- [TypeScript Compiler](https://www.typescriptlang.org/) for JSDoc validation
- [Python AST](https://docs.python.org/3/library/ast.html) for code analysis
- [Anthropic Claude API](https://www.anthropic.com/api) for documentation generation

### Open-Source Libraries

- **TypeScript/JavaScript**: [Commander.js](https://github.com/tj/commander.js),
  [chalk](https://github.com/chalk/chalk),
  [cli-table3](https://github.com/cli-table/cli-table3),
  [Prettier](https://prettier.io/), [ESLint](https://eslint.org/),
  [husky](https://typicode.github.io/husky/),
  [lint-staged](https://github.com/lint-staged/lint-staged)
- **Python**: [pytest](https://pytest.org/), [ruff](https://github.com/astral-sh/ruff)
  (linting & formatting), [mypy](https://mypy-lang.org/)

---

## Project Status

**Current Version**: 1.0.0-alpha

**MVP Scope**:

- Complexity-based impact scoring
- Python/TypeScript/JavaScript support
- 2 validation plugins (type-checking, style)
- Interactive workflow (sequential)
- Basic commands: analyze, audit, plan, improve

**Future Enhancements**:

### Commands & Workflow

- **Save/Resume Sessions**: Pause and continue improve sessions later
- **Progress Tracking**: Show session progress and estimated time remaining
- **Manual Item Selection**: Let users pick specific items to document
- **Plan Filtering**: Human-readable plan output with `--priority`, `--language`,
  `--limit` flags
- **Batch Mode**: Non-interactive improve for CI/CD pipelines
- **Show Existing Docs First**: Display current docstring before calling Claude (enables
  quick skipping)
- **Usage Context**: Include call-site examples when regenerating suggestions
- **Team Mode**: Divide plan among multiple users, prevent conflicts

### Impact Scoring

- **Pattern Detection**: Identify dependency injection, async patterns, decorators
- **Public/Private API Detection**: Boost score for exported functions, lower for
  internal helpers
- **Custom Pattern Matchers**: User-defined heuristics (e.g., functions ending in
  `Repository`)
- **Test File Penalty**: Lower priority for test files
- **Configuration Weights**: Fine-tune complexity vs visibility vs patterns

### Language Support

- **Additional Style Guides**: Sphinx, Google (Python), more JSDoc variants
- **More Languages**: Go, Rust, Ruby, etc.
- **Cross-language Context**: Better handling of polyglot projects

### Plugins & Validation

- **Linter Integration**: Run ruff/eslint after writing docs
- **Auto-fix Capabilities**: Automatically apply simple corrections
- **Plugin Marketplace**: Share community plugins
- **Custom Validation Rules**: User-defined quality checks

### Developer Experience

- **IDE Integrations**: VS Code extension, JetBrains plugin
- **Git Integration**: Commit docs automatically, create PRs
- **CI/CD Pipelines**: GitHub Actions, GitLab CI integration
- **Multi-file Context**: Include related files in Claude prompts

**Planned Releases**:

- **v1.0.0**: Core functionality (current MVP scope)
- **v1.1.0**: Save/resume sessions, progress tracking
- **v1.2.0**: Pattern detection, advanced scoring algorithms
- **v2.0.0**: Additional languages, IDE integrations

---

## Troubleshooting

### Parse Errors in Analyzed Code

If DocImp encounters syntax errors in your codebase:

**Default behavior (non-strict mode)**:

- DocImp logs warnings for files with syntax errors
- Analysis continues with remaining valid files
- Parse failures are tracked and displayed in the analysis summary
- You can fix the syntax errors and re-run the analysis

**Example output**:

```
⚠ Parse Failures: 2 files could not be parsed

src/broken.py: invalid syntax (line 42)
src/incomplete.ts: Unexpected token '}'
```

**Strict mode (fail-fast)**:

```bash
docimp analyze ./src --strict
```

In strict mode, DocImp fails immediately on the first syntax error. Useful for CI/CD
pipelines where you want to enforce clean syntax before analyzing documentation.

**Common causes**:

- Work-in-progress files with incomplete code
- Broken commits pushed during development
- Copy-paste errors or merge conflicts
- Experimental code that doesn't compile

**Resolution**:

1. Review the error message for file path and line number
2. Fix the syntax error in the source file
3. Re-run `docimp analyze`

---

## Support

- **Issues**: [GitHub Issues](https://github.com/USERNAME/docimp/issues)
- **Discussions**: [GitHub Discussions](https://github.com/USERNAME/docimp/discussions)
- **Documentation**: See README.md and inline documentation for complete usage guide

---

**Star this repo if DocImp helps your project!** ⭐
