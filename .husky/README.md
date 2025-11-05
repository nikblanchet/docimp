# Husky Setup for Git Worktrees

This project uses Husky for git hooks. Since we work exclusively in git worktrees, Husky requires per-worktree configuration.

## Setup for New Worktrees

When creating a new worktree, run these commands from the worktree root:

```bash
# Enable per-worktree config (one-time)
git config extensions.worktreeConfig true

# Set hooks path for this worktree
git config --worktree core.hooksPath "$(git rev-parse --show-toplevel)/.husky/_"

# Generate Husky dispatcher files
npx husky
```

The `.husky/_` directory is gitignored and generated per-worktree. The actual hook scripts (like `pre-commit`) are committed and shared.

## Why This Works

Modern Husky (v7+) uses `core.hooksPath` to point Git at project-local hooks. With `extensions.worktreeConfig`, each worktree can have its own `hooksPath` setting without conflicts.

## Troubleshooting

If you see "husky.sh: No such file or directory", you forgot to run `npx husky` in this worktree.
