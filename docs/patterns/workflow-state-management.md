# Workflow State Management

DocImp's workflow state tracking enables bidirectional workflows, dependency validation, stale detection, and incremental re-analysis. This document details the architecture, design decisions, and implementation patterns for the workflow state system introduced in Issue #216 Phase 3.

## Architecture Overview

### Component Stack

```
┌──────────────────────────────────────────────────────────────┐
│                    CLI Commands (TypeScript)                  │
│  analyze, audit, plan, improve with validation               │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         v
┌──────────────────────────────────────────────────────────────┐
│               WorkflowValidator (TypeScript)                  │
│  - validateAuditPrerequisites()   - Prerequisites checking   │
│  - validatePlanPrerequisites()    - Stale detection          │
│  - checkStaleAnalysis()           - Helpful error messages   │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         v
┌──────────────────────────────────────────────────────────────┐
│           WorkflowStateManager (TS + Python)                  │
│  - loadWorkflowState()    - Atomic reads with Zod validation │
│  - saveWorkflowState()    - Atomic writes (temp + rename)    │
│  - updateCommandState()   - Update single command state      │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         v
┌──────────────────────────────────────────────────────────────┐
│           WorkflowState File (.docimp/workflow-state.json)    │
│  - schema_version: "1.0"                                     │
│  - last_analyze, last_audit, last_plan, last_improve         │
│  - Each: { timestamp, item_count, file_checksums }           │
└──────────────────────────────────────────────────────────────┘
```

### Data Model

**WorkflowState** (TypeScript + Python):
```typescript
interface WorkflowState {
  schema_version: string;           // "1.0" for current version
  migration_log: MigrationLogEntry[];  // History of applied migrations
  last_analyze: CommandState | null;
  last_audit: CommandState | null;
  last_plan: CommandState | null;
  last_improve: CommandState | null;
}

interface MigrationLogEntry {
  from: string;                      // Source version (e.g., "legacy", "1.0")
  to: string;                        // Target version (e.g., "1.0", "1.1")
  timestamp: string;                 // ISO 8601 timestamp of migration
}

interface CommandState {
  timestamp: string;                 // ISO 8601 timestamp
  item_count: number;                // Number of items processed
  file_checksums: Record<string, string>;  // filepath → SHA256 checksum
}
```

### Integration with Session Resume

Workflow state and session resume are **complementary features** that work together:

**Workflow State** (workflow-state.json):
- Tracks command execution history across sessions
- Validates command dependencies (audit requires analyze, etc.)
- Detects stale data (analyze re-run since audit)
- Enables incremental re-analysis

**Session Resume** (audit-session-{uuid}.json, improve-session-{uuid}.json):
- Preserves in-progress work within a single command execution
- Allows pausing and resuming interactive workflows
- Handles file invalidation when files change during pause

**How They Complement Each Other**:
1. **Session resume** uses file_checksums from **workflow state** to detect changes during pause
2. **Workflow state** is updated when session completes (not during in-progress)
3. **Stale detection** warns users before starting new session if prior command data changed
4. **Incremental analysis** uses workflow state checksums; session resume uses session-specific checksums

**Example Workflow**:
```
1. docimp analyze ./src
   → Saves workflow-state.json: last_analyze = { timestamp, item_count, checksums }

2. docimp audit ./src
   → Validates: last_analyze exists ✓
   → User rates 5/23 items, presses Q to quit
   → Saves audit-session-abc123.json with progress

3. User modifies 2 files

4. docimp audit ./src --resume
   → Loads audit-session-abc123.json
   → Detects 2 changed files (checksums differ from session snapshot)
   → Re-analyzes those 2 files
   → Continues audit from item #6
   → On completion, saves workflow-state.json: last_audit = { ... }

5. docimp analyze ./src (re-run)
   → Saves new workflow-state.json: last_analyze timestamp updated

6. docimp plan ./src
   → Validates: last_analyze exists ✓
   → Detects: last_audit timestamp < last_analyze timestamp (stale!)
   → Warns: "Audit data may be stale. Consider re-running 'docimp audit'."
   → User can proceed or re-audit
```

## Design Decisions

### Decision 1: SHA256 Checksums for File Tracking

**Chosen**: SHA256 checksums with timestamp fallback

**Rationale**:
- **SHA256 strength**: Cryptographically strong, virtually no collision risk
- **Content-based**: Detects actual changes, not just metadata changes
- **Timestamp optimization**: Quick first check (mtime) before expensive checksum calculation
- **Git compatibility**: Aligns with git's content-addressable storage model

**Algorithm**:
```typescript
// Change detection logic
if (timestamp !== storedTimestamp) {
  // Timestamp changed, now check checksum
  const currentChecksum = await calculateSHA256(filepath);
  if (currentChecksum !== storedChecksum) {
    return true; // File actually changed
  }
  // False alarm: timestamp changed but content unchanged (e.g., git checkout)
}
return false; // File unchanged
```

**Trade-offs**:
- ✓ Accurate change detection (no false positives)
- ✓ Works across git operations (checkout, merge, stash)
- ✗ Checksum calculation takes time (~10-50ms per file on SSD)
- Mitigation: Only checksum files already analyzed (not entire codebase)

**Alternative Considered**: Timestamp-only
- Faster but frequent false positives (build tools, version control)

### Decision 2: Schema Versioning Strategy

**Chosen**: Include `schema_version` field in WorkflowState from v1.0

**Rationale**:
- **Forward compatibility**: Enables safe schema evolution without breaking old files
- **Graceful migration**: Can implement migration logic when schema changes
- **User transparency**: Clear error messages when schema incompatible

**Current Implementation (v1.0)**:
```typescript
const WorkflowStateSchema = z.object({
  schema_version: z.literal('1.0'),  // Only accept v1.0
  last_analyze: CommandStateSchema.nullable(),
  // ...
});
```

**Future Migration Path** (when v1.1 introduced):
```typescript
function loadWorkflowState(): WorkflowState {
  const content = readFileSync(workflowFile, 'utf8');
  const parsed = JSON.parse(content);

  // Migrate old schemas
  if (parsed.schema_version === '1.0') {
    parsed = migrateV1ToV2(parsed);
  }

  return WorkflowStateSchema.parse(parsed);
}
```

**Trade-offs**:
- ✓ Future-proof design
- ✓ No breaking changes on schema evolution
- ✗ Slightly more complex initial implementation
- ✗ Migration code adds maintenance burden

**Alternative Considered**: No schema versioning (YAGNI)
- Simpler initially but requires manual file deletion on breaking changes
- User friction and data loss

### Decision 3: Stale Detection Thresholds

**Chosen**: Timestamp-based stale detection without time threshold

**Logic**:
```
audit is stale IF:
  last_analyze exists AND
  last_audit exists AND
  last_analyze.timestamp > last_audit.timestamp

plan is stale IF:
  last_analyze exists AND
  last_plan exists AND
  last_analyze.timestamp > last_plan.timestamp
```

**Rationale**:
- **Simple and predictable**: No magic time thresholds to configure
- **Command-based**: If you re-run analyze, downstream commands become stale
- **User control**: Warnings suggest re-running commands but don't block

**Example**:
```bash
$ docimp analyze ./src  # 10:00 AM
$ docimp audit ./src    # 10:15 AM - audit ratings saved
$ docimp analyze ./src  # 10:30 AM - re-run analysis
$ docimp plan ./src     # 10:35 AM

Warning: Audit data may be stale (analysis re-run since audit).
Consider re-running 'docimp audit' to refresh ratings.

[Plan continues anyway - user decision]
```

**Trade-offs**:
- ✓ No false positives (only warns when commands actually re-run)
- ✓ User remains in control
- ✗ Doesn't detect file changes without re-running analyze

**Alternative Considered**: File checksum-based staleness
- Warn if checksums differ between analyze and audit
- More accurate but slower (requires scanning all files)
- Deferred to incremental analysis feature

### Decision 4: Atomic Write Pattern

**Chosen**: Temp file + rename for atomic writes

**Implementation**:
```typescript
async function saveWorkflowState(state: WorkflowState): Promise<void> {
  const workflowFile = StateManager.getWorkflowFile();
  const tempFile = `${workflowFile}.tmp`;

  // Write to temp file
  await fs.writeFile(tempFile, JSON.stringify(state, null, 2), 'utf8');

  // Atomic rename (POSIX guarantee)
  await fs.rename(tempFile, workflowFile);
}
```

**Rationale**:
- **Atomic operations**: Prevents corruption on process kill or crash
- **POSIX guarantee**: `rename()` is atomic on all POSIX filesystems
- **No partial writes**: Either old file exists or new file exists, never partial

**Trade-offs**:
- ✓ Corruption-proof
- ✓ Works on all platforms (Linux, macOS, Windows)
- ✗ Slightly more disk I/O (temp file creation)
- Mitigation: Negligible for small JSON files (<1KB)

**Alternative Considered**: Direct overwrite
- Faster but risks corruption on crash

### Decision 5: Separate Workflow State from Session State

**Chosen**: Two separate JSON files (workflow-state.json vs session-{uuid}.json)

**Rationale**:
- **Different lifecycles**: Workflow state persists across sessions, session state is ephemeral
- **Different update patterns**: Workflow state updated on command completion, session state updated continuously
- **Independent features**: Can implement session resume without workflow state, vice versa
- **Clear separation of concerns**: Easier to understand and maintain

**Trade-offs**:
- ✓ Clear boundaries between features
- ✓ Independent evolution
- ✗ Two file management systems instead of one
- Mitigation: Shared utilities (StateManager, FileTracker)

**Alternative Considered**: Single unified state file
- Simpler file management but tightly couples features

## Integration Points

### Analyze Command Integration

**Location**: `cli/src/commands/analyze.ts`

**Changes**:
1. After analysis completes, create command state with checksums
2. Update workflow state with `last_analyze`
3. Support `--incremental` flag for incremental re-analysis
4. Support `--apply-audit` flag to load audit ratings

**Code**:
```typescript
// In analyzeCore() after analysis completes
const filepaths = result.items.map(item => item.filepath);
const snapshot = await FileTracker.createSnapshot(filepaths);

const fileChecksums: Record<string, string> = {};
for (const [filepath, fileSnapshot] of Object.entries(snapshot)) {
  fileChecksums[filepath] = fileSnapshot.checksum;
}

const commandState = createCommandState(result.total_items, fileChecksums);
await WorkflowStateManager.updateCommandState('analyze', commandState);
```

### Audit Command Integration

**Location**: `cli/src/commands/audit.ts`

**Changes**:
1. Validate analyze prerequisite before starting
2. Warn if analyze is stale (re-run since last audit)
3. After audit completes, update workflow state with `last_audit`

**Code**:
```typescript
// In auditCore() before starting interactive audit
const validation = await WorkflowValidator.validateAuditPrerequisites();
if (!validation.valid) {
  display.showError(validation.error);
  display.showMessage(validation.suggestion);
  return EXIT_CODE.ERROR;
}

const staleCheck = await WorkflowValidator.checkStaleAnalysis();
if (!staleCheck.valid) {
  display.showWarning(staleCheck.error);
}

// After audit completes...
const commandState = createCommandState(totalItems, fileChecksums);
await WorkflowStateManager.updateCommandState('audit', commandState);
```

### Plan Command Integration

Similar to audit, validates analyze prerequisite and checks for stale analyze/audit data.

### Improve Command Integration

Validates plan prerequisite and checks for stale plan data.

## Security Considerations

### Workflow State File

**Location**: `.docimp/workflow-state.json` (gitignored)

**Contents**:
- File paths (potentially sensitive project structure)
- Checksums (SHA256, not reversible to original content)
- Timestamps (innocuous)

**Mitigation**:
- Never commit `.docimp/` to version control
- Document in README and CONTRIBUTING
- Consider encryption for future (optional user key)

### Checksum Security

**SHA256**: Cryptographically secure hash function
- No known collision attacks (as of 2025)
- Cannot reverse checksum to original content
- Safe for integrity checking

**Not Used For**: Authentication, authorization, or security boundaries

## Related Documentation

- **Session Resume**: `docs/patterns/session-resume.md` - Complementary feature
- **Transaction Integration**: `docs/patterns/transaction-integration.md` - Uses workflow state
- **Testing Strategy**: `docs/patterns/testing-strategy.md` - Test organization
- **Error Handling**: `docs/patterns/error-handling.md` - Validation error patterns
- **CLAUDE.md**: Workflow state architecture section
- **README.md**: User-facing workflow documentation

---

## Implementation History

This section documents the phased implementation of workflow state management features (Phases 3.6-3.10). For the complete implementation plan and tracking, see `.planning/workflow-state-master-plan.md`.

### Phase 3.6: Enhanced --apply-audit Edge Cases

**Status**: Complete (PR #372)

**Goal**: Ensure `--apply-audit` flag handles all edge cases robustly.

**Implementation**:

Comprehensive error handling for audit rating application:

1. **Empty audit.json**: Skip rating application gracefully, log warning
2. **Missing files**: Skip ratings for files not in current analysis
3. **Invalid ratings**: Reject values outside 1-4 range, log warning
4. **Combined flags**: `--apply-audit --incremental` works correctly
5. **Overwrite behavior**: New ratings overwrite pre-existing `audit_rating` values

**Code location**: `cli/src/commands/analyze.ts:handleApplyAudit()`

**Test coverage**: 5 comprehensive tests in `analyze-apply-audit.test.ts`:

```typescript
// Test file: cli/src/__tests__/commands/analyze-apply-audit.test.ts
test("handles empty audit.json gracefully", ...)
test("skips ratings for missing files", ...)
test("rejects invalid rating values", ...)
test("combines with --incremental flag", ...)
test("overwrites pre-existing audit_rating", ...)
```

**Outcome**: `--apply-audit` is production-ready with robust error handling for all edge cases.

### Phase 3.7: Schema Migration Utilities

**Status**: Complete (Issue #375, PR #379)

**Goal**: Support workflow state schema evolution with automatic migration and manual CLI command.

**Command**: `docimp migrate-workflow-state [--dry-run] [--check] [--version X.Y] [--force]`

**Implementation**:

Migration registry pattern mapping version transitions to migration functions:

```typescript
// TypeScript: cli/src/types/workflow-state-migrations.ts
export const WORKFLOW_STATE_MIGRATIONS: Record<string, MigrationFn> = {
  "1.0->1.1": migrate_1_0_to_1_1,
  "1.1->1.2": migrate_1_1_to_1_2,
};

function buildMigrationPath(from: string, to: string): string[] {
  // Constructs sequential migration chain: ["1.0->1.1", "1.1->1.2"]
}

function applyMigrations(state: WorkflowState, path: string[]): WorkflowState {
  // Executes migration chain, updates migration_log
}
```

Python equivalent in `analyzer/src/models/workflow_state_migrations.py`.

**Auto-migration**: WorkflowStateManager transparently upgrades on load:

```typescript
// TypeScript: cli/src/utils/workflow-state-manager.ts:load()
if (state.schema_version !== CURRENT_VERSION) {
  state = applyMigrations(state, buildMigrationPath(...));
}
```

**CLI command**: Manual migration with options:

```bash
# Check if migration needed (CI/CD mode, exit code 0 or 1)
docimp migrate-workflow-state --check

# Preview migration without changes
docimp migrate-workflow-state --dry-run

# Migrate to specific version
docimp migrate-workflow-state --version 1.1

# Skip confirmation prompt
docimp migrate-workflow-state --force
```

**Migration log**: Tracks applied migrations in `workflow-state.json`:

```json
{
  "schema_version": "1.1",
  "migration_log": [
    {
      "from_version": "1.0",
      "to_version": "1.1",
      "applied_at": "2025-11-10T15:30:00Z",
      "description": "Add file_checksums to command states"
    }
  ]
}
```

**Test coverage**: 42 tests (15 TypeScript + 15 Python + 12 command tests)

**Outcome**: Schema migration infrastructure production-ready with transparent auto-migration and manual CLI control.

### Phase 3.8: --dry-run Flag for Incremental Analysis

**Status**: Complete (Issue #376, PR #382)

**Goal**: Preview which files would be re-analyzed in incremental mode without running analysis.

**Flag**: `docimp analyze --incremental --dry-run`

**Implementation**:

Early return in `handleIncrementalAnalysis()` after detecting changed files:

```typescript
// TypeScript: cli/src/commands/analyze.ts
async function handleIncrementalAnalysis(
  options: AnalyzeOptions,
  display: IDisplay
): Promise<{ changedFiles: string[]; totalFiles: number } | null> {
  // ... checksum comparison logic ...

  if (options.dryRun) {
    display.showIncrementalDryRun(changedFiles, unchangedFiles);
    return null; // Early return - no analysis performed
  }

  // ... continue with incremental analysis ...
}
```

**Output format** (via `TerminalDisplay.showIncrementalDryRun()`):

```
Incremental Analysis (dry run mode)

Would re-analyze 3 file(s):
  • src/analyzer.ts
  • src/parser.py
  • cli/commands/analyze.ts

Would reuse results from 97 unchanged file(s)

Estimated time savings: ~97%

Run without --dry-run to perform incremental analysis
```

**Validation**: Warning shown if `--dry-run` used without `--incremental`:

```typescript
if (options.dryRun && !options.incremental) {
  display.warning("--dry-run requires --incremental flag");
}
```

**Test coverage**: 8 comprehensive tests in `analyze-incremental-dry-run.test.ts`:

```typescript
test("shows dry-run preview with changed files", ...)
test("calculates time savings percentage", ...)
test("warns when --dry-run used without --incremental", ...)
test("prevents analysis execution in dry-run mode", ...)
test("prevents workflow state updates in dry-run mode", ...)
```

**Outcome**: Dry-run preview production-ready, provides visibility into incremental analysis without execution.

### Phase 3.9: File-Level Checksum Staleness Detection

**Status**: Complete (PR #387)

**Goal**: More precise staleness detection based on per-file checksums, not just command timestamps.

**Problem**: Original timestamp-based staleness detection was coarse-grained (entire command stale if re-run). File-level checksums enable detecting which specific files changed.

**Implementation**:

New `compareFileChecksums()` function in WorkflowValidator:

```typescript
// TypeScript: cli/src/utils/workflow-validator.ts
function compareFileChecksums(
  current: Record<string, string>,
  previous: Record<string, string>
): {
  modified: string[];
  added: string[];
  removed: string[];
} {
  const modified: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  // Compare checksums for common files
  for (const [filepath, checksum] of Object.entries(current)) {
    if (!(filepath in previous)) {
      added.push(filepath);
    } else if (previous[filepath] !== checksum) {
      modified.push(filepath);
    }
  }

  // Find removed files
  for (const filepath of Object.keys(previous)) {
    if (!(filepath in current)) {
      removed.push(filepath);
    }
  }

  return { modified, added, removed };
}
```

**Enhanced staleness logic**:

```typescript
// Before (timestamp-based):
audit stale IF last_analyze.timestamp > last_audit.timestamp

// After (checksum-based):
audit stale IF ANY file in audit.file_checksums has different checksum in last_analyze.file_checksums
```

**Updated staleness warnings** (shows file counts):

```
Staleness Warnings:
  • analyze is stale (2 files modified since last run)
  • plan is stale (analyze re-run since plan generated)
```

**Test coverage**: 43 tests in `workflow-validator.test.ts`:

```typescript
describe("compareFileChecksums", () => {
  test("detects modified files", ...)
  test("detects added files", ...)
  test("detects removed files", ...)
  test("handles unchanged files", ...)
  test("handles empty checksums", ...)
});
```

**Benefits**:

1. **File-granular detection**: Know exactly which files changed
2. **More accurate**: Detects changes even without re-running analyze
3. **Better UX**: Specific file counts in warnings ("2 files modified")
4. **Conservative on removal**: File removal triggers staleness (safe default)

**Outcome**: File-level checksum staleness detection production-ready and integrated into workflow validation.

### Phase 3.10: docimp status Command

**Status**: Complete (Issue #374, PR merged to main)

**Goal**: Visualize workflow state at a glance with human-readable output.

**Command**: `docimp status [--json]`

**Implementation**:

Three-layer architecture:

1. **Python handler** (`analyzer/src/main.py:cmd_status`, lines 699-883):
   - Loads workflow-state.json
   - Runs validation checks (staleness, dependencies)
   - Returns structured JSON to stdout

2. **TypeScript bridge** (`cli/src/utils/python-bridge/python-bridge.ts`):
   - Spawns Python subprocess
   - Parses JSON response
   - Returns `WorkflowStatusResult` to command layer

3. **Command layer** (`cli/src/commands/status.ts`):
   - Handles `--json` flag for raw output
   - Delegates to `TerminalDisplay.showWorkflowStatus()` for formatted output

**Display logic** (`cli/src/display/terminal-display.ts:showWorkflowStatus()`, lines 785-866):

```typescript
showWorkflowStatus(result: WorkflowStatusResult): void {
  // Command status with relative timestamps
  this.showCommandStatus("analyze", result.last_analyze);
  this.showCommandStatus("audit", result.last_audit);
  this.showCommandStatus("plan", result.last_plan);
  this.showCommandStatus("improve", result.last_improve);

  // Staleness warnings (file-level checksum-based)
  if (result.staleness_warnings.length > 0) {
    this.showStalenessWarnings(result.staleness_warnings);
  }

  // Actionable suggestions
  if (result.suggestions.length > 0) {
    this.showSuggestions(result.suggestions);
  }
}
```

**Output example**:

```
Workflow State (.docimp/workflow-state.json)

analyze:  ✓ Run 2 hours ago (23 items, 5 files)
audit:    ✓ Run 1 hour ago (18 items rated)
plan:     ✓ Run 30 minutes ago (12 high-priority items)
improve:  ✗ Not run yet

Staleness Warnings:
  • analyze is stale (2 files modified since last run)
  • plan is stale (analyze re-run since plan generated)

Suggestions:
  → Run 'docimp analyze --incremental' to update analysis
  → Run 'docimp plan' to regenerate plan with latest analysis
```

**JSON output** (`--json` flag):

```json
{
  "schema_version": "1.0",
  "last_analyze": {
    "timestamp": "2025-11-12T14:30:00Z",
    "item_count": 23,
    "file_count": 5
  },
  "last_audit": {
    "timestamp": "2025-11-12T15:30:00Z",
    "item_count": 18
  },
  "staleness_warnings": [
    {
      "command": "analyze",
      "reason": "2 files modified since last run"
    }
  ],
  "suggestions": [
    "Run 'docimp analyze --incremental' to update analysis"
  ]
}
```

**Test coverage**: 13 comprehensive tests in `status.test.ts`:

```typescript
test("shows empty workflow state", ...)
test("shows partial workflow state", ...)
test("shows full workflow state", ...)
test("shows staleness warnings", ...)
test("shows file modification warnings", ...)
test("outputs JSON with --json flag", ...)
test("handles missing workflow-state.json", ...)
test("handles corrupted JSON", ...)
```

**Integration**: Uses Phase 3.9 file-level checksum staleness detection for accurate warnings.

**Outcome**: Status command production-ready with colorful terminal output, JSON mode, and comprehensive test coverage.
