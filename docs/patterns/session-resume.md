# Session Resume Pattern

DocImp's session resume capability allows users to interrupt and continue audit and improve workflows across multiple CLI executions. This document details the architecture, design decisions, and implementation patterns.

## Architecture Overview

### Component Stack

```
┌──────────────────────────────────────────────────────────────┐
│                    CLI Commands (TypeScript)                  │
│  audit --resume, improve --resume, list-sessions, etc.       │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         v
┌──────────────────────────────────────────────────────────────┐
│               SessionStateManager (TS + Python)               │
│  - save_session_state() - Atomic writes (temp + rename)      │
│  - load_session_state() - JSON parse + Zod validation        │
│  - list_sessions()      - Sorted by started_at               │
│  - get_latest_session() - Most recent session helper         │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         v
┌──────────────────────────────────────────────────────────────┐
│                  FileTracker (TS + Python)                    │
│  - create_snapshot()    - SHA256 checksum + mtime           │
│  - detect_changes()     - Compare checksums and timestamps   │
│  - get_changed_items()  - Filter CodeItem list               │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         v
┌──────────────────────────────────────────────────────────────┐
│           Session State Files (.docimp/session-reports/)      │
│  audit-session-{uuid}.json     - In-progress audit sessions  │
│  improve-session-{uuid}.json   - In-progress improve sessions│
└──────────────────────────────────────────────────────────────┘
```

### Hybrid Persistence Strategy

DocImp uses a hybrid approach combining JSON state files and git transaction branches:

**JSON State Files** (all sessions):
- Audit sessions: Preserve ratings, file snapshots, config
- Improve sessions: Preserve plan items, preferences, progress, file snapshots

**Git Transaction Branches** (improve only):
- Links improve sessions to git branches via `transaction_id`
- Enables rollback of documentation changes
- Preserves full change history

### Key Design Principles

1. **Full State Capture**: Save everything needed to resume seamlessly
2. **Atomic Operations**: Prevent corruption via temp file + rename pattern
3. **Smart Invalidation**: Re-analyze only files that changed
4. **Auto-Detection UX**: Prompt users when sessions exist (hybrid resume approach)
5. **Multiple Sessions**: Support concurrent audit and improve workflows

## Design Decisions

### Decision 1: Multiple Sessions vs Single Session

**Chosen**: Multiple sessions with UUID identifiers

**Rationale**:
- Supports concurrent workflows (audit and improve simultaneously)
- Enables session management commands (list, delete by ID)
- Flexible for future enhancements (named sessions, shared sessions)
- User can experiment with different approaches in parallel

**Trade-offs**:
- More complex implementation (session IDs, management commands)
- Better UX for advanced use cases

**Alternative**: Single session per command (`audit-session-latest.json`)
- Simpler but limits concurrent workflows

### Decision 2: Hybrid Resume UX

**Chosen**: Auto-detection with explicit override flags

**User Experience**:
```bash
# No flags: Auto-detect and prompt
$ docimp audit ./src
→ Found session abc12345 (5/23 rated, started 2h ago). Resume? [Y/n]

# Explicit resume
$ docimp audit ./src --resume
→ Resuming session abc12345...

# Explicit fresh start
$ docimp audit ./src --new
→ Starting new session...
```

**Rationale**:
- Protects against forgetting `--resume` flag (auto-detection)
- Maintains intentional control (explicit flags)
- Discoverable feature (users see prompt even if unaware)

**Alternative Considered**: Explicit `--resume` required (no auto-detection)
- More explicit but users lose progress if they forget flag

### Decision 3: File Invalidation Strategy

**Chosen**: Dual validation (checksum + timestamp)

**Algorithm**:
1. Create snapshot: SHA256 checksum + mtime for each file
2. On resume: Compare both checksum and timestamp
3. Changed file detection: Checksum differs OR (timestamp differs AND checksum differs)
4. Re-analysis: Only changed files

**Rationale**:
- Checksum: Catches actual content changes
- Timestamp: Quick first check, handles git checkout
- Both: Prevents false positives from timestamp-only changes

**Trade-offs**:
- Checksum calculation takes time (mitigated: only analyzed files, not entire codebase)
- Parallelizable if needed (future optimization)

**Alternative**: Timestamp only
- Faster but false positives common (build tools, version control)

### Decision 4: Transaction Integration (Improve Only)

**Chosen**: Link improve sessions to git transaction branches

**Implementation**:
- Session state includes `transaction_id` field
- On resume: Verify git branch `docimp/session-{transaction-id}` exists
- In-progress transactions: Resume on existing branch
- Committed transactions: Create new transaction (continuation)
- Rolled-back sessions: Error, cannot resume

**Rationale**:
- Preserves rollback capability across resume
- Maintains transaction history integrity
- Prevents resuming invalid states

**Alternative**: Decouple sessions from transactions
- Simpler but loses rollback capability on resume

### Decision 5: Session State Schema Versioning

**Chosen**: Defer versioning to future (MVP uses implicit v1)

**Current Approach**:
- No `schema_version` field in MVP
- Breaking changes require `delete-audit-session --all`
- Document limitation in README

**Future Enhancement**:
- Add `schema_version: string` field
- Implement migration logic in `load_session_state()`
- Graceful upgrade path for users

**Rationale**: YAGNI for MVP, add when schema evolution actually happens

## Data Models

### AuditSessionState

**Fields**:
- `session_id`: UUID for session identification
- `started_at`: ISO 8601 timestamp of session creation
- `current_index`: Position in items array (0-based)
- `total_items`: Total count of items to audit
- `partial_ratings`: Nested map `filepath -> item_name -> rating (1-4 or None)`
- `file_snapshot`: Map `filepath -> FileSnapshot`
- `config`: Audit display config (`showCodeMode`, `maxLines`)
- `completed_at`: ISO 8601 timestamp or null if in-progress

**Serialization**:
- Python: `@dataclass` with `to_dict()` / `from_dict()` methods
- TypeScript: Zod schema for runtime validation

**File Location**: `.docimp/session-reports/audit-session-{uuid}.json`

### ImproveSessionState

**Fields**:
- `session_id`: UUID for session identification
- `transaction_id`: Links to git branch `docimp/session-{transaction-id}`
- `started_at`: ISO 8601 timestamp
- `current_index`: Position in plan_items array
- `plan_items`: Serialized PlanItem objects (from plan.json)
- `user_preferences`: Style guides and tone (`{ styleGuides, tone }`)
- `progress`: Counters (`{ accepted, skipped, errors }`)
- `file_snapshot`: Map `filepath -> FileSnapshot`
- `config`: Full IConfig object used in session
- `completed_at`: ISO 8601 timestamp or null if in-progress

**Transaction Linking**:
- `transaction_id` must match existing git branch
- Verified on resume via `git branch --list docimp/session-{transaction-id}`
- Status checked: in-progress (resume), committed (new transaction), rolled-back (error)

**File Location**: `.docimp/session-reports/improve-session-{uuid}.json`

### FileSnapshot

**Fields**:
- `filepath`: Absolute or relative path to source file
- `timestamp`: Unix timestamp from `os.path.getmtime()` (Python) or `fs.stat().mtimeMs` (TypeScript)
- `checksum`: SHA256 hash of file contents (hex string)
- `size`: File size in bytes

**Usage**: Embedded in session state for modification detection

## File Invalidation Implementation

### Snapshot Creation

**Timing**: Immediately after loading CodeItems in audit/improve commands

**Process**:
```typescript
// TypeScript
const filepaths = items.map(item => item.filepath);
const snapshot = await FileTracker.createSnapshot(filepaths);

// Store in session state
sessionState.file_snapshot = snapshot;
```

**Python equivalent**: Uses `hashlib.sha256()` for checksums

### Change Detection

**Timing**: On session resume, before starting interactive loop

**Algorithm**:
```typescript
// Load session state
const state = await SessionStateManager.loadSessionState(sessionId, 'audit');

// Detect changes
const changedFiles = await FileTracker.detectChanges(state.file_snapshot);

// Handle changes
if (changedFiles.length > 0) {
  console.warn(`${changedFiles.length} files modified, re-analyzing...`);

  // Re-run analysis on changed files only
  const newItems = await pythonBridge.analyze({
    path: basePath,
    files: changedFiles
  });

  // Merge with existing session state
  // (logic varies by command: audit merges ratings, improve updates plan_items)
}
```

### Edge Cases

**Case 1: File Deleted Since Session**
- Detection: `fs.stat()` throws ENOENT
- Handling: Show error, remove from session state, continue with remaining items

**Case 2: File Timestamp Changed But Content Same**
- Detection: Timestamp differs but checksum matches
- Handling: No re-analysis, update snapshot with new timestamp

**Case 3: All Files Changed**
- Detection: All checksums differ
- Handling: Warn user, re-analyze entire codebase, merge results

**Case 4: Checksum Collision** (astronomically rare with SHA256)
- Detection: Timestamps differ, checksums match
- Handling: Trust checksum, no re-analysis

## Transaction Integration (Improve Only)

### Session-to-Transaction Mapping

**One-to-one relationship**: Each improve session has exactly one `transaction_id`

**Transaction States**:
1. **in-progress**: Session branch exists, not squash-merged to main
2. **committed**: Session branch exists, squash-merged to main
3. **rolled-back**: Session has been rolled back (cannot resume)

### Resume Logic by Transaction State

**In-Progress**:
```typescript
// Resume on existing transaction branch
// No begin_transaction() call
// Continue committing to same branch
await pythonBridge.recordWrite(transactionId, filepath, ...);
```

**Committed**:
```typescript
// Create new transaction (continuation)
const newTransactionId = uuidv4();
await pythonBridge.beginTransaction(newTransactionId);

// Update session state
sessionState.transaction_id = newTransactionId;
sessionState.metadata.continued_from = originalTransactionId;
```

**Rolled-Back**:
```typescript
// Error and abort
throw new Error(
  `Cannot resume session ${sessionId}: transaction ${transactionId} has been rolled back. ` +
  `Use 'docimp improve --new' to start fresh.`
);
```

### Transaction Verification

**Git Branch Check**:
```bash
git --git-dir=.docimp/state/.git --work-tree=. branch --list "docimp/session-${transaction-id}"
```

**Status Determination**:
```bash
# Check if squash-merged (committed)
git --git-dir=.docimp/state/.git --work-tree=. log main --grep="docimp session ${transaction-id}"

# Check manifest for rolled_back status
# Parse TransactionManifest JSON
```

## Testing Strategy

### Unit Tests

**SessionStateManager** (23 tests total: 13 Python + 10 TypeScript):
- Atomic write (temp file + rename)
- Load with validation (Zod schema)
- Load non-existent file (error)
- Load corrupted JSON (error)
- List sessions sorted by started_at
- Delete session file
- Get latest session

**FileTracker** (18 tests total: 10 Python + 8 TypeScript):
- Create snapshot (checksums calculated)
- Detect changed file (checksum differs)
- Detect unchanged file (checksum matches)
- Detect deleted file (file not found)
- Detect new file (not in snapshot)
- Get changed items (filter CodeItem list)

### Integration Tests

**Audit Resume** (25 tests in `audit-resume.test.ts`):
- Auto-detection: prompt user when session exists
- User accepts/rejects auto-resume prompt
- Resume with no file changes
- Resume with modified files (re-analysis)
- Resume with deleted files (error)
- --new flag bypasses auto-detection
- --clear-session deletes and exits
- Session file created with correct structure
- Partial ratings preserved

**Improve Resume** (22 tests in `improve-resume.test.ts`):
- Auto-detection and prompt
- Resume in-progress transaction
- Resume committed transaction (create new)
- Error on rolled-back transaction
- File invalidation and re-analysis
- User preferences restored
- Progress metrics restored
- Undo after resume

**Cross-Workflow** (8 tests in `cross-workflow-resume.test.ts`):
- Audit → resume → complete → use in plan
- Improve → resume → undo → resume again
- File invalidation across commands
- Multiple concurrent sessions
- Session cleanup
- Corrupted file recovery
- Performance (1000+ items)

**Session Management** (18 tests total: 8 audit + 10 improve):
- List empty sessions
- List multiple sessions (sorted)
- Delete specific session
- Delete all sessions
- Confirmation prompts
- Table formatting
- Transaction status display (improve only)

### Manual Testing

**Scripts**:
- `test-samples/test-audit-resume.sh`: Full audit resume workflow
- `test-samples/test-resume-improve.sh`: Improve resume with file modification

**Validation Points**:
- Auto-detection prompt appears
- File change warnings shown correctly
- Final outputs correct (audit.json, transaction history)
- Colorful output renders properly

### Regression Tests

**Ensure Unaffected**:
- Non-resume workflows (no `--resume` flag)
- Transaction system (rollback, undo, list)
- Existing commands (analyze, plan)

**Coverage**: 70+ tests across entire codebase

## Edge Cases and Error Handling

### Corrupted Session File

**Scenario**: JSON parse error or schema validation failure

**Handling**:
```typescript
try {
  const state = await SessionStateManager.loadSessionState(sessionId, 'audit');
} catch (error) {
  console.error(`Failed to load session ${sessionId}: ${error.message}`);
  console.error('Session file may be corrupted. Starting fresh session.');
  // Continue with new session
}
```

**Result**: Graceful degradation, user not blocked

### Missing Transaction Branch

**Scenario**: Improve session references transaction branch that doesn't exist

**Handling**:
```typescript
const branchExists = await GitHelper.branchExists(transactionId);
if (!branchExists) {
  throw new Error(
    `Transaction branch not found: ${transactionId}\n` +
    `Session ${sessionId} cannot be resumed. The transaction may have been manually deleted.\n` +
    `Use 'docimp list-sessions' to see available sessions or start a new session with --new.`
  );
}
```

**Result**: Clear error with recovery suggestions

### Concurrent Session Modifications

**Scenario**: Two CLI instances modify same session file simultaneously

**Handling**: Last write wins (atomic writes prevent corruption)

**Limitation**: Not designed for multi-user concurrent access

**Documentation**: README.md warns about this limitation

### Schema Evolution

**Scenario**: Future version changes session state schema

**Current Handling** (MVP): No migration, breaking changes documented

**Future Enhancement**:
```typescript
// Add schema_version field
const state = JSON.parse(fileContents);
if (state.schema_version === '1.0') {
  // Migrate to 2.0
  state = migrateV1ToV2(state);
}
```

### Performance: Large Codebases

**Scenario**: 1000+ files to snapshot

**Optimizations**:
- Only snapshot analyzed files (not entire codebase)
- Stream processing for checksums (not load entire file into memory)
- Parallel checksum calculation (future if needed)

**Target**: < 500ms for typical codebases (100-500 files)

## Future Enhancements

### Session Encryption

**Motivation**: Session files may contain sensitive info (file paths, config)

**Approach**:
- Optional encryption with user-provided key
- Store encrypted in `.docimp/session-reports/`
- Decrypt on load

**Complexity**: Key management, backward compatibility

### Multi-User Sessions

**Motivation**: Collaborative audits across team

**Approach**:
- Session sharing via git remote
- Conflict resolution for concurrent edits
- Session ownership and permissions

**Complexity**: Distributed state, merge conflicts

### Session Versioning and Migration

**Motivation**: Schema changes shouldn't break old sessions

**Approach**:
- Add `schema_version` field to session state
- Implement migration functions per version
- Graceful upgrade path

**Implementation**:
```python
def load_session_state(session_id: str, session_type: str) -> SessionState:
    data = json.loads(file.read())
    version = data.get('schema_version', '1.0')

    if version == '1.0':
        data = migrate_v1_to_v2(data)

    return SessionState.from_dict(data)
```

### Auto-Save Timer

**Motivation**: Checkpoint every N seconds, not just on user action

**Approach**:
- Background timer in InteractiveSession
- Debounced save (only if state changed)
- Non-blocking writes

**Complexity**: Concurrency, race conditions

**Status**: Deferred (incremental save after each action sufficient for MVP)

### Session Export/Import

**Motivation**: Backup sessions, share across machines

**Approach**:
- `docimp export-session <id> --output session.json.gz`
- `docimp import-session session.json.gz`
- Validate on import, generate new UUIDs

**Use Cases**: Disaster recovery, collaborative workflows

## API Reference

### SessionStateManager

**TypeScript** (`cli/src/utils/session-state-manager.ts`):
```typescript
class SessionStateManager {
  static async saveSessionState(
    state: AuditSessionState | ImproveSessionState,
    sessionType: 'audit' | 'improve'
  ): Promise<string>;

  static async loadSessionState(
    sessionId: string,
    sessionType: 'audit' | 'improve'
  ): Promise<AuditSessionState | ImproveSessionState>;

  static async listSessions(
    sessionType: 'audit' | 'improve'
  ): Promise<Array<AuditSessionState | ImproveSessionState>>;

  static async deleteSessionState(
    sessionId: string,
    sessionType: 'audit' | 'improve'
  ): Promise<void>;

  static async getLatestSession(
    sessionType: 'audit' | 'improve'
  ): Promise<AuditSessionState | ImproveSessionState | null>;
}
```

**Python** (`analyzer/src/utils/session_state_manager.py`):
```python
class SessionStateManager:
    @staticmethod
    def save_session_state(
        state: Union[AuditSessionState, ImproveSessionState],
        session_type: str
    ) -> str: ...

    @staticmethod
    def load_session_state(
        session_id: str,
        session_type: str
    ) -> Union[AuditSessionState, ImproveSessionState]: ...

    @staticmethod
    def list_sessions(
        session_type: str
    ) -> List[Union[AuditSessionState, ImproveSessionState]]: ...

    @staticmethod
    def delete_session_state(
        session_id: str,
        session_type: str
    ) -> None: ...

    @staticmethod
    def get_latest_session(
        session_type: str
    ) -> Optional[Union[AuditSessionState, ImproveSessionState]]: ...
```

### FileTracker

**TypeScript** (`cli/src/utils/file-tracker.ts`):
```typescript
class FileTracker {
  static async createSnapshot(
    filepaths: string[]
  ): Promise<Record<string, FileSnapshot>>;

  static async detectChanges(
    snapshot: Record<string, FileSnapshot>
  ): Promise<string[]>;

  static getChangedItems(
    changedFiles: string[],
    items: CodeItem[]
  ): CodeItem[];
}
```

**Python** (`analyzer/src/utils/file_tracker.py`):
```python
class FileTracker:
    @staticmethod
    def create_snapshot(filepaths: List[str]) -> Dict[str, FileSnapshot]: ...

    @staticmethod
    def detect_changes(snapshot: Dict[str, FileSnapshot]) -> List[str]: ...

    @staticmethod
    def get_changed_items(
        changed_files: List[str],
        items: List[CodeItem]
    ) -> List[CodeItem]: ...
```

## Security Considerations

### Session File Storage

**Location**: `.docimp/session-reports/` (gitignored)

**Contents**: May include:
- File paths (potentially sensitive project structure)
- API configuration (timeouts, retry settings)
- User preferences (style guides, tone)

**Mitigation**:
- Never commit `.docimp/` to version control
- Document security implications in README
- Consider encryption for future (optional user key)

### Transaction Side-Car Repository

**Isolation**: `.docimp/state/.git` never touches user's `.git/`

**Security Guarantees**:
- No interference with user's repository
- No commit history leakage
- No remote push (local only)

### File System Operations

**Atomic Writes**: Temp file + rename prevents corruption

**Race Conditions**: Last write wins (acceptable for single-user MVP)

**Permissions**: Session files inherit user's umask

## Performance Benchmarks

### Session Save/Load

**Target**: < 100ms for typical session (< 100 items)

**Measured** (on development machine):
- Save: 5-15ms
- Load: 10-25ms
- Well under target

### File Invalidation

**Target**: < 500ms for typical codebase (< 1000 files)

**Measured**:
- 100 files: 50-100ms
- 500 files: 200-350ms
- 1000 files: 400-600ms (near target)

**Optimization Opportunities**:
- Parallel checksum calculation
- Stream processing for large files
- Cache checksums in snapshot

### Integration Test Performance

**Cross-workflow suite**: 8 tests in ~2-3 seconds

**Session management**: 18 tests in ~1-2 seconds

**Total regression suite**: 70+ tests in ~30 seconds

## Related Documentation

- **Transaction Integration**: `docs/patterns/transaction-integration.md`
- **Dependency Injection**: `docs/patterns/dependency-injection.md`
- **Testing Strategy**: `docs/patterns/testing-strategy.md`
- **Error Handling**: `docs/patterns/error-handling.md`
- **CLAUDE.md**: Session state architecture section
- **README.md**: Resume workflow user documentation

## Implementation Tracking

**Issue**: #216 (Phase 1+2)
**Related**: #28 (audit resume workflow documentation)
**Sessions**: 1-8 (32 hours total)
**Status**: Complete
**PR**: #365 (draft)
