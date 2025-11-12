# Workflow State Management - User Guide

## Introduction

DocImp's workflow state management is like having a smart assistant that remembers what you've done and helps you work more efficiently. It tracks:

- **What commands you've run** and when
- **Which files you've analyzed** and their current state
- **What's changed** since your last analysis
- **What needs updating** based on those changes

This means DocImp can:
- Only re-analyze files that changed (saving time)
- Warn you when data is outdated
- Suggest what to do next
- Help you pick up where you left off

All of this is tracked in a single file: `.docimp/workflow-state.json`.

## Getting Started

### Basic Workflow

The most common DocImp workflow looks like this:

```
analyze → plan → improve
```

```bash
# Step 1: Analyze your codebase
docimp analyze ./src

# Step 2: Generate improvement plan
docimp plan ./src

# Step 3: Improve documentation interactively
docimp improve ./src
```

After each command, DocImp updates `.docimp/workflow-state.json` with:
- Timestamp of when you ran it
- Number of items processed
- SHA-256 checksums of all analyzed files

### Checking Your Progress

At any time, run:

```bash
docimp status
```

This shows:
- Which commands you've run and when
- How many items each command processed
- Whether any data is stale (needs updating)
- What you should do next

Example output:

```
Workflow State (.docimp/workflow-state.json)

analyze:  ✓ Run 2 hours ago (23 items, 5 files)
plan:     ✓ Run 30 minutes ago (12 high-priority items)
improve:  ✗ Not run yet

Suggestions:
  → Run 'docimp improve ./src' to start improving documentation
```

## Common Scenarios

### Large Codebases: Incremental Analysis

**Problem**: Your codebase has 1,000 files, but you only changed 5. Re-analyzing everything takes 5 minutes.

**Solution**: Use `--incremental` to only re-analyze changed files.

```bash
# Initial analysis: 1,000 files, 5 minutes
docimp analyze ./src

# Later: Modified 5 files
# Incremental analysis: 5 files, ~15 seconds (95% time savings)
docimp analyze ./src --incremental
```

**How it works**: DocImp compares file checksums from the last run against current files. Only files with different checksums are re-analyzed. Unchanged files reuse previous results.

**Preview mode**: Not sure how many files changed? Use `--dry-run` to preview:

```bash
docimp analyze ./src --incremental --dry-run
```

```
Incremental Analysis (dry run mode)

Would re-analyze 5 file(s):
  • src/analyzer.ts
  • src/parser.py
  • cli/commands/analyze.ts
  • analyzer/src/scoring.py
  • cli/src/display.ts

Would reuse results from 995 unchanged file(s)

Estimated time savings: ~99%

Run without --dry-run to perform incremental analysis
```

### Interrupted Sessions: Picking Up Where You Left Off

**Scenario**: You ran `docimp analyze` last week, then made some code changes. Now you want to continue working.

**What to do**:

1. **Check status** to see what's stale:

```bash
docimp status
```

```
Workflow State (.docimp/workflow-state.json)

analyze:  ✓ Run 7 days ago (150 items, 50 files)
plan:     ✓ Run 7 days ago (30 high-priority items)

Staleness Warnings:
  • analyze is stale (8 files modified since last run)
  • plan is stale (analyze re-run required)

Suggestions:
  → Run 'docimp analyze --incremental' to update analysis
```

2. **Update incrementally**:

```bash
# Only re-analyze the 8 changed files
docimp analyze ./src --incremental

# Regenerate plan with updated analysis
docimp plan ./src
```

3. **Continue improving**:

```bash
docimp improve ./src
```

### Audit-Driven Workflows: Quality Ratings Affect Priority

**Scenario**: You want documentation quality ratings to influence which items get documented first.

**Workflow**:

```
analyze → audit → re-analyze with ratings → plan → improve
```

```bash
# Step 1: Initial analysis
docimp analyze ./src

# Step 2: Rate existing documentation quality (1-4 scale)
#         1 = Terrible, 2 = OK, 3 = Good, 4 = Excellent
docimp audit ./src

# Step 3: Re-analyze with audit ratings applied
docimp analyze ./src --apply-audit

# Step 4: Generate plan (uses ratings to adjust priority)
docimp plan ./src

# Step 5: Improve (items with poor ratings prioritized higher)
docimp improve ./src
```

**Impact**: Items with terrible ratings (1) get higher priority than items with no docs but lower complexity. This ensures you fix bad docs before adding new docs.

**Combining with incremental**: If you only changed a few files but want to keep audit ratings:

```bash
# Apply ratings + only re-analyze changed files
docimp analyze ./src --apply-audit --incremental
```

### Handling Stale Data

**Scenario**: You modified some files, and now `docimp status` shows warnings.

```bash
docimp status
```

```
Staleness Warnings:
  • analyze is stale (12 files modified since last run)
  • plan is stale (analyze re-run since plan generated)
```

**What this means**:
- **analyze is stale**: 12 files have different checksums than when you last ran `analyze`
- **plan is stale**: You re-ran `analyze` after generating the plan, so the plan may be outdated

**How to fix**:

```bash
# Update analysis (use --incremental for speed)
docimp analyze ./src --incremental

# Regenerate plan with fresh analysis
docimp plan ./src
```

**When to ignore staleness**:
- You modified test files but your analysis targets `./src` (tests not included)
- You're just exploring with `docimp status` and don't need up-to-date data right now

**When to address staleness**:
- Before running `docimp improve` (ensures you're improving the right items)
- Before sharing results with your team
- In CI/CD pipelines (stale data indicates workflow issues)

## Understanding Status Output

### Output Structure

```
Workflow State (.docimp/workflow-state.json)

[Command Status Section]
analyze:  ✓ Run 2 hours ago (23 items, 5 files)
audit:    ✓ Run 1 hour ago (18 items rated)
plan:     ✓ Run 30 minutes ago (12 high-priority items)
improve:  ✗ Not run yet

[Staleness Warnings Section]
Staleness Warnings:
  • analyze is stale (2 files modified since last run)
  • plan is stale (analyze re-run since plan generated)

[Suggestions Section]
Suggestions:
  → Run 'docimp analyze --incremental' to update analysis
  → Run 'docimp plan' to regenerate plan with latest analysis
```

### Field Descriptions

#### Command Status

**Format**: `<command>: <status> <details>`

- **✓ Run**: Command has been executed successfully
- **✗ Not run yet**: Command hasn't been executed in this workflow
- **Relative time**: Human-readable timestamp (2 hours ago, 5 minutes ago, yesterday)
- **Item count**: Number of items processed (functions/classes analyzed, items rated, etc.)
- **File count**: Number of files tracked in checksums (analyze only)

**Examples**:

```
analyze:  ✓ Run 2 hours ago (23 items, 5 files)
          └─┬─┘ └──────┬──────┘ └────┬────┘ └──┬──┘
          status    time ago    items count  files tracked

audit:    ✓ Run 1 hour ago (18 items rated)
          └─┬─┘ └─────┬─────┘ └──────┬──────┘
          status  time ago    items rated

improve:  ✗ Not run yet
          └───────┬───────┘
              never executed
```

#### Staleness Warnings

**Format**: `• <command> is stale (<reason>)`

Indicates which commands have outdated data that should be refreshed.

**Common warnings**:

- `analyze is stale (N files modified since last run)`: N files have different checksums
- `plan is stale (analyze re-run since plan generated)`: Plan based on old analysis results
- `audit is stale (analyze re-run since audit session)`: Audit ratings may not match current code

**Why this matters**: Using stale data can lead to:
- Documenting code that no longer exists
- Missing newly added functions
- Applying audit ratings to wrong items
- Wasting time on outdated improvement plans

#### Suggestions

**Format**: `→ Run '<command>' to <action>`

Actionable next steps based on your workflow state.

**Common suggestions**:

- `Run 'docimp analyze ./src' to start analysis` - No analysis yet
- `Run 'docimp analyze --incremental' to update analysis` - Files changed
- `Run 'docimp plan' to regenerate plan` - Analysis updated, plan stale
- `Run 'docimp improve' to start improving documentation` - Plan ready, time to improve

### JSON Output Mode

For programmatic parsing (CI/CD, scripts):

```bash
docimp status --json
```

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
  "last_plan": {
    "timestamp": "2025-11-12T16:00:00Z",
    "item_count": 12
  },
  "staleness_warnings": [
    {
      "command": "analyze",
      "reason": "2 files modified since last run"
    },
    {
      "command": "plan",
      "reason": "analyze re-run since plan generated"
    }
  ],
  "suggestions": [
    "Run 'docimp analyze --incremental' to update analysis",
    "Run 'docimp plan' to regenerate plan with latest analysis"
  ]
}
```

Use in CI/CD:

```bash
#!/bin/bash

# Check for staleness
STATUS_JSON=$(docimp status --json)

# Exit with error if staleness warnings exist
if echo "$STATUS_JSON" | jq -e '.staleness_warnings | length > 0' > /dev/null; then
  echo "Error: Workflow state is stale"
  echo "$STATUS_JSON" | jq '.staleness_warnings'
  exit 1
fi
```

## Troubleshooting

### Workflow State File Missing

**Symptom**: `docimp status` shows "Workflow state not found"

**Cause**: You haven't run `docimp analyze` yet, or the `.docimp/workflow-state.json` file was deleted.

**Solution**:

```bash
# Run analyze to create workflow state
docimp analyze ./src
```

### Corrupted Workflow State

**Symptom**: Errors like "Failed to parse workflow state" or "Invalid schema version"

**Cause**: The `.docimp/workflow-state.json` file is corrupted (incomplete write, manual editing, etc.)

**Solution**:

```bash
# Delete corrupted file (safe - will be recreated)
rm .docimp/workflow-state.json

# Re-run analysis
docimp analyze ./src
```

### Incremental Analysis Not Detecting Changes

**Symptom**: You modified files but `--incremental` says "Would reuse results from all files"

**Possible causes**:

1. **Wrong directory**: You modified files outside the analyzed directory

```bash
# Verify you're analyzing the right directory
docimp analyze ./src  # Analyzes ./src only, not ./tests
```

2. **Checksum collision** (extremely rare): Different file content with same checksum

```bash
# Force full re-analysis
rm .docimp/workflow-state.json
docimp analyze ./src
```

3. **File changes not saved**: Changes only in editor, not written to disk

```bash
# Save all files, then run incremental analysis
docimp analyze ./src --incremental
```

### Persistent Staleness Warnings

**Symptom**: `docimp status` always shows staleness warnings even after updating

**Cause**: Running commands out of order or analyzing different directories

**Solution**:

```bash
# Follow the full workflow in order
docimp analyze ./src              # Updates analysis
docimp plan ./src                 # Updates plan (removes plan staleness)
docimp status                     # Should show no warnings
```

### Can I Delete workflow-state.json?

**Short answer**: Yes, it's safe to delete. DocImp will recreate it on the next `analyze` run.

**What you lose**:
- Incremental analysis capability (next run will be full analysis)
- Command execution history (status will show all commands as "Not run yet")
- Staleness detection (no baseline to compare against)

**When to delete**:
- Corrupted file causing errors
- Want to reset workflow state completely
- Testing/debugging workflow state features

**When NOT to delete**:
- Just to "clean up" (workflow state is meant to persist)
- Because you see staleness warnings (fix the staleness instead)

## Workflow Diagrams

### Basic Workflow (analyze → plan → improve)

```
┌─────────────┐
│  Start Here │
└──────┬──────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp analyze ./src                   │
│  Creates: .docimp/workflow-state.json   │
│  Tracks: 100 files, 250 items           │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp plan ./src                      │
│  Updates: workflow-state.json           │
│  Creates: plan.json with 30 items       │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp improve ./src                   │
│  Updates: workflow-state.json           │
│  Writes: Documentation to source files  │
└─────────────────────────────────────────┘
```

### Incremental Workflow (file changes detected)

```
┌─────────────────────────────────────────┐
│  docimp analyze ./src                   │
│  Tracks: 100 files                      │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  [User modifies 5 files]                │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp status                          │
│  Warning: analyze is stale (5 files)    │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp analyze --incremental --dry-run │
│  Preview: Would re-analyze 5 files      │
│  Estimated savings: 95%                 │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp analyze --incremental           │
│  Re-analyzes: 5 files (3 seconds)       │
│  Reuses: 95 files (cached)              │
│  Updates: workflow-state.json           │
└─────────────────────────────────────────┘
```

### Audit-Driven Workflow

```
┌─────────────────────────────────────────┐
│  docimp analyze ./src                   │
│  Tracks: 100 files, 250 items           │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp audit ./src                     │
│  Interactive: Rate 50 items (1-4)       │
│  Creates: audit.json                    │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp analyze ./src --apply-audit     │
│  Applies: Ratings to CodeItem objects   │
│  Updates: impact_score calculations     │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp plan ./src                      │
│  Priority: Terrible(1) > No docs > Good │
│  Creates: plan.json with 30 items       │
└──────┬──────────────────────────────────┘
       ↓
┌─────────────────────────────────────────┐
│  docimp improve ./src                   │
│  Improves: High-priority items first    │
└─────────────────────────────────────────┘
```

## Advanced Tips

### Combining Flags for Maximum Efficiency

```bash
# Re-analyze changed files + apply audit ratings + skip prompts
docimp analyze ./src --incremental --apply-audit --force-clean
```

### Using Status in Shell Prompts

Add workflow state to your shell prompt:

```bash
# Add to .bashrc or .zshrc
function docimp_status() {
  if [ -f .docimp/workflow-state.json ]; then
    local status=$(docimp status --json 2>/dev/null)
    if [ $? -eq 0 ]; then
      local warnings=$(echo "$status" | jq -r '.staleness_warnings | length')
      if [ "$warnings" -gt 0 ]; then
        echo " [docimp:stale]"
      else
        echo " [docimp:ok]"
      fi
    fi
  fi
}

# In PS1:
PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w$(docimp_status)\$ '
```

### Pre-commit Hook for Staleness Detection

Prevent committing when workflow state is stale:

```bash
# .git/hooks/pre-commit
#!/bin/bash

if [ -f .docimp/workflow-state.json ]; then
  STATUS_JSON=$(docimp status --json 2>/dev/null)
  if echo "$STATUS_JSON" | jq -e '.staleness_warnings | length > 0' > /dev/null; then
    echo "Error: Workflow state is stale. Run 'docimp analyze --incremental' first."
    exit 1
  fi
fi
```

## Related Documentation

- **Technical Architecture**: [docs/patterns/workflow-state-management.md](../patterns/workflow-state-management.md)
- **Session Resume**: [docs/patterns/session-resume.md](../patterns/session-resume.md)
- **Transaction System**: [docs/patterns/transaction-integration.md](../patterns/transaction-integration.md)
- **CLAUDE.md**: Workflow State Tracking section (technical reference)
- **README.md**: Workflow State Management section (command reference)
