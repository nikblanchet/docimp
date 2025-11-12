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
