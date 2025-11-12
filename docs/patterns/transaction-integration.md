# Transaction System Integration

This document provides detailed workflow examples and architectural decisions for DocImp's transaction system integration.

## Integration Status

### Infrastructure (PR #312)

**Status**: Complete

- GitHelper utility for isolated side-car repository operations
- TransactionManager for session lifecycle management
- CLI commands: `rollback-session`, `rollback-change`, `list-sessions`, `list-changes`
- Comprehensive test coverage: 467 tests passing
- Side-car repository pattern (`.docimp/state/.git`)

### Integration (Issue #315)

**Status**: Complete (as of 2025-10-31)

Transaction lifecycle is now fully integrated into the `docimp improve` workflow:

- `begin_transaction()` called at session start (generates UUID, creates git branch)
- `record_write()` creates git commit for each accepted documentation change
- `commit_transaction()` performs squash merge on session exit
- Session branches preserved after squash for individual change rollback
- Re-squash strategy enables rolling back changes from committed sessions

**Implementation Details**:
- Python CLI commands: `analyzer/src/main.py:695-900` (begin-transaction, record-write, commit-transaction)
- TypeScript bridge: `cli/src/python-bridge/IPythonBridge.ts:222-261` (interface), `cli/src/python-bridge/PythonBridge.ts:284-422` (implementation)
- Session integration: `cli/src/session/InteractiveSession.ts:87-203` (transaction lifecycle)
- Test coverage: 476 Python tests + 447 TypeScript tests = 923 total tests passing
- Post-squash rollback: `analyzer/src/writer/transaction_manager.py:234-355` (re-squash strategy)

### Undo Feature (Issue #314)

**Status**: Complete (as of 2025-10-31)

Interactive [U]ndo option added to improve workflow:

- [U] appears in prompt after first accepted change
- Calls `pythonBridge.rollbackChange('last')` to revert HEAD commit on session branch
- Displays item metadata (name, type, filepath) from git commit
- Current item re-presented after undo for new suggestion
- Unlimited undo depth via git commit history

**Implementation Details**:
- TypeScript UI: `cli/src/session/InteractiveSession.ts:507-548` (handleUndo method)
- Change tracking: `changeCount` field, incremented on accept, decremented on undo
- Conditional display: [U] only shown when `changeCount > 0 && transactionActive`
- Python backend: RollbackResult enhanced with `item_name`, `item_type`, `filepath` fields
- Test coverage: 451 TypeScript tests (4 undo tests passing, 4 skipped pending transaction lifecycle mock improvements)

### Future Work

- **--last rollback semantics** (Issue #319): Define behavior for repeated --last usage
- **Timeout configuration** (Issue #316): Configurable timeouts for git operations
- **Undo test completion**: Fix 4 skipped transaction lifecycle mock tests

## Architectural Decisions

### Squash Merge Strategy

**Decision**: Use squash merge for session finalization, but preserve session branches.

**Rationale**:
- Clean main branch history: One commit per improve session
- Detailed history preserved: Session branch contains all individual changes
- Post-commit rollback: Preserved branches enable rolling back individual changes after squash
- Audit trail: Full change history available for debugging and review

**Implementation**: On session completion, `commit_transaction()` performs squash merge to main, then keeps the session branch instead of deleting it.

### Git Revert for All Rollbacks

**Decision**: Use `git revert` for all rollback operations, never rewrite history.

**Rationale**:
- Safety: Revert is non-destructive, preserves original commits
- Revertability: Rollbacks themselves can be rolled back if needed
- Collaboration-safe: No force pushes or history rewrites required
- Conflict detection: Git's 3-way merge detects conflicts automatically

**Trade-offs**: Creates additional commits rather than removing commits, but safety outweighs cleanliness.

### --last Behavior

**Decision**: Running `rollback-session --last` twice on the same session fails with a clear error.

**Error message**: "Session {id} already rolled back. Use explicit session ID or select different session."

**Rationale**:
- Prevents accidental double-rollback
- Forces user to be explicit when rolling back multiple sessions
- Manifests include status tracking (in_progress, committed, rolled_back)

### Undo Suggestion Caching

**Decision**: Extract previous docstrings via `git show <commit-sha>`, not by re-requesting from Claude API.

**Rationale**:
- Efficiency: No API calls or token usage for undo
- Accuracy: Git commit contains exact previous state
- Speed: Instant extraction vs API round-trip
- Enhancement: Can show before/after diff when presenting undone change

**Implementation**: Use `git show <commit-sha>:<filepath>` to extract file contents at specific commit.

### Graceful Degradation

**Decision**: If git unavailable or transaction fails, log warning and continue session without transactions.

**Behavior**:
- Session initialization: Warning logged, `transactionActive = false`
- Documentation writes: Proceed normally without git commits
- Session completion: No squash merge, but docstrings still written
- User experience: Improve workflow remains functional

**Rationale**: Transaction tracking is valuable but not essential - documentation changes are the primary goal.

## Workflow Examples

### Normal Improve Session with Transaction Tracking

```bash
$ docimp improve ./src
```

**Behind the scenes**:

```typescript
// 1. Session starts - generate UUID
const sessionId = 'abc-123-def-456';

// 2. Initialize transaction
await pythonBridge.beginTransaction(sessionId);
// Git: checkout -b docimp/session-abc-123-def-456
// Creates: .docimp/state/.git branch
// Status: transactionActive = true

// 3. User accepts first suggestion for calculate_impact_score()
await writeDocstring(item, docstring);
// File written: analyzer/src/scoring/impact_scorer.py
// Backup created: impact_scorer.py.20251030-195622.bak

await pythonBridge.recordWrite(
  sessionId,
  'analyzer/src/scoring/impact_scorer.py',
  'analyzer/src/scoring/impact_scorer.py.20251030-195622.bak',
  'calculate_impact_score',
  'function',
  'python'
);
// Git: add impact_scorer.py
// Git: commit -m "docimp: Add docs to calculate_impact_score
//
// Metadata:
//   item_name: calculate_impact_score
//   item_type: function
//   language: python
//   filepath: analyzer/src/scoring/impact_scorer.py"

// 4. User accepts second and third suggestions...
// (Same process: write file, create backup, git commit)

// 5. User quits session (Q)
await pythonBridge.commitTransaction(sessionId);
// Git: checkout main
// Git: merge --squash docimp/session-abc-123-def-456
// Git: commit -m "docimp session abc-123-def-456 (squash)"
// Delete: All .bak backup files
// Preserve: Session branch docimp/session-abc-123-def-456
// Status: committed
```

**Result**: Three individual changes committed to session branch, one squash commit on main, session branch preserved.

### Interactive Undo During Improve Session (Issue #314)

```bash
$ docimp improve ./src
```

**User interaction**:

```
[1/5] function calculateScore
  Suggested documentation:
  ---
  /** Calculates priority score based on complexity and quality */
  ---

What would you like to do?
> [A] Accept  [E] Edit  [R] Regenerate  [S] Skip  [Q] Quit

# User presses A - accept first change
✓ Documentation written to src/scorer.js

[2/5] function formatOutput
  Suggested documentation:
  ---
  /** Formats analysis results for display */
  ---

What would you like to do?
> [A] Accept  [E] Edit  [R] Regenerate  [S] Skip  [U] Undo  [Q] Quit
#                                                     ^^^^
#                                                  [U] appears!

# User presses A - accept second change
✓ Documentation written to src/formatter.js

[3/5] class DataValidator
  Suggested documentation:
  ---
  /** Validates input data against schema */
  ---

What would you like to do?
> [A] Accept  [E] Edit  [R] Regenerate  [S] Skip  [U] Undo  [Q] Quit

# User presses U - undo last change (formatOutput)
Rolling back last change...
✓ Reverted documentation for formatOutput (function)
  File: src/formatter.js

# User is returned to formatOutput (current item re-presented)
[2/5] function formatOutput
  Suggested documentation:
  ---
  /** Formats analysis results for display */
  ---

What would you like to do?
> [A] Accept  [E] Edit  [R] Regenerate  [S] Skip  [U] Undo  [Q] Quit
#                                                     ^^^^
#                                      [U] still available (can undo calculateScore)
```

**Behind the scenes**:

```typescript
// After first accept: changeCount = 1
this.changeCount++; // Now 1
// [U] becomes visible in next prompt

// User presses [U]:
await this.handleUndo();
  -> await pythonBridge.rollbackChange('last');
     // Git: revert HEAD commit on session branch
     // Returns: { success: true, item_name: 'formatOutput', item_type: 'function', ... }
  -> console.log('Reverted documentation for formatOutput (function)')
  -> this.changeCount--;  // Back to 1

// processItem() loop uses `continue` - stays on same item
// Current docstring is reused (no new API call)
```

**Key behaviors**:
- [U] hidden when `changeCount === 0`
- [U] appears after first accept (`changeCount > 0`)
- Undo calls `rollbackChange('last')` - reverts HEAD commit
- File restored from git history (no backup needed)
- Current item re-presented with same suggestion
- Can undo repeatedly (git history provides unlimited depth)
- `changeCount` decrements on successful undo

### Rollback Individual Change After Session

```bash
# List changes from a session
$ docimp list-changes abc-123-def

Session: abc-123-def
Status: committed
Changes: 3

Entry a1b2c3d: calculate_impact_score (function, Python)
  File: analyzer/src/scoring/impact_scorer.py
  Time: 2025-10-30 19:56:22

Entry e4f5g6h: DocumentationAnalyzer.__init__ (method, Python)
  File: analyzer/src/analysis/documentation_analyzer.py
  Time: 2025-10-30 19:58:15

Entry i7j8k9l: parseTypeScript (function, TypeScript)
  File: cli/src/parsers/ts-js-parser-helper.ts
  Time: 2025-10-30 20:01:43

# Rollback specific change
$ docimp rollback-change a1b2c3d
```

**Behind the scenes (re-squash strategy)**:

```bash
# 1. Detect session is committed (squashed)
session_branch='docimp/session-abc-123-def'
main_commit=$(git rev-parse HEAD)  # Current squash commit

# 2. Verify session branch exists
git branch --list "$session_branch"  # Must exist for rollback

# 3. Checkout session branch
git checkout "$session_branch"

# 4. Revert the specific commit on session branch
git revert --no-commit a1b2c3d
# Conflict check: If conflicts, abort and return error

# 5. Commit the revert
git commit -m "Revert change a1b2c3d"

# 6. Checkout main
git checkout main

# 7. Reset main to before previous squash
parent=$(git rev-parse HEAD^)  # Parent of current squash commit
git reset --hard "$parent"

# 8. Re-squash-merge session branch (now with reverted commit)
git merge --squash "$session_branch"

# 9. Create new squash commit
git commit -m "docimp session abc-123-def (squash, change a1b2c3d reverted)"

# 10. Update manifest
# Mark entry a1b2c3d as reverted: true
# Update reverted_at timestamp
```

**Result**: Session branch has revert commit, main has new squash commit, net effect shows only changes e4f5g6h and i7j8k9l.

### Cancellation Handling (Uncommitted Session)

```bash
$ docimp improve ./src

# User accepts 2 changes
# User presses Q to quit early (before completing all items)
```

**Behind the scenes**:

```typescript
// Session branch exists with 2 commits
// Squash merge NOT performed
// Backup files still exist

console.log('\nSession cancelled. Changes left uncommitted.');
console.log(`Use 'docimp rollback-session abc-123-def' to undo.`);
```

**User options**:
1. Resume session later (future enhancement)
2. Rollback uncommitted session: `docimp rollback-session abc-123-def`
3. Leave changes in place (session branch and backup files remain)

### Error Scenario: Git Unavailable

```bash
$ docimp improve ./src
# Git not installed or not in PATH
```

**Behind the scenes**:

```typescript
try {
  await pythonBridge.beginTransaction(sessionId);
  this.transactionActive = true;
} catch (error) {
  console.warn('Failed to initialize transaction:', error.message);
  console.warn('Continuing without transaction tracking - rollback unavailable');
  this.transactionActive = false;
}

// Session continues normally
// Documentation written to files
// No git commits, no rollback capability
```

**Result**: Improve workflow completes successfully, but no transaction history or rollback features.

### Error Scenario: Transaction Init Fails

```bash
$ docimp improve ./src
# Git available but side-car repo initialization fails
```

**Behind the scenes**:

```typescript
try {
  await pythonBridge.beginTransaction(sessionId);
} catch (error) {
  // Log error details
  console.warn('Transaction initialization failed:', error.message);
  this.transactionActive = false;
}

// Continue with improve workflow
// recordWrite calls are no-ops when transactionActive = false
```

**Result**: Documentation written normally, no transaction tracking, session completes without rollback capability.
