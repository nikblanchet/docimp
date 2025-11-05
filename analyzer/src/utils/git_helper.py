"""Git helper utilities for transaction system.

This module provides utilities for interacting with the side-car git repository
used for transaction tracking and rollback capability.
"""

import subprocess
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class GitTimeoutConfig:
    """Configuration for git operation timeouts.

    Uses progressive scaling: operations are automatically categorized as
    fast/default/slow, and timeouts are calculated by scaling base_timeout_ms.

    Attributes:
        base_timeout_ms: Base timeout for default operations (30 seconds).
        fast_scale: Scale factor for fast operations (0.167 produces 5s).
        slow_scale: Scale factor for slow operations (4.0 produces 120s).
        max_timeout_ms: Absolute maximum timeout cap (5 minutes).
    """

    base_timeout_ms: int = 30000  # 30 seconds
    fast_scale: float = 0.167  # 30s * 0.167 = 5s for fast ops
    slow_scale: float = 4.0  # 30s * 4.0 = 120s for slow ops
    max_timeout_ms: int = 300000  # 5 minutes absolute maximum


class GitHelper:
    """Utilities for managing the side-car git repository.

    The side-car repo is located at .docimp/state/.git with the project root
    as its work-tree. This ensures complete isolation from the user's actual
    git repository.

    All git commands use explicit --git-dir and --work-tree flags:
        git --git-dir=.docimp/state/.git --work-tree=. <command>
    """

    @staticmethod
    def _categorize_operation(args: List[str]) -> str:
        """Categorize git operation as fast/default/slow based on command.

        Args:
            args: Git command arguments (e.g., ['status'], ['merge', '--squash']).

        Returns:
            'fast', 'default', or 'slow' category.
        """
        if not args:
            return "default"

        cmd = args[0].lower()

        # Fast operations (< 5s expected)
        # These are query operations that don't modify state
        if cmd in ("status", "rev-parse", "branch", "show", "diff"):
            return "fast"

        # Slow operations (may take minutes on large repos or slow filesystems)
        # These involve significant work or modification
        if cmd in ("merge", "revert", "reset", "init", "clone", "rebase"):
            return "slow"

        # Check for specific slow sub-commands
        if cmd == "reset" and "--hard" in args:
            return "slow"
        if cmd == "merge" and "--squash" in args:
            return "slow"

        # Log operations can be slow with complex history
        if cmd == "log" and any(arg.startswith("--format") for arg in args):
            # Simple format queries are fast, but we're conservative
            return "default"

        # Default operations (10-30s expected)
        # add, commit, checkout, etc.
        return "default"

    @staticmethod
    def _calculate_timeout(args: List[str], config: GitTimeoutConfig) -> float:
        """Calculate timeout in seconds based on operation type and config.

        Uses progressive scaling: categorize operation, apply scale factor,
        cap at max timeout.

        Args:
            args: Git command arguments.
            config: Timeout configuration.

        Returns:
            Timeout value in seconds (for subprocess.run).
        """
        category = GitHelper._categorize_operation(args)

        if category == "fast":
            timeout_ms = config.base_timeout_ms * config.fast_scale
        elif category == "slow":
            timeout_ms = config.base_timeout_ms * config.slow_scale
        else:  # default
            timeout_ms = config.base_timeout_ms

        # Apply maximum timeout cap
        timeout_ms = min(timeout_ms, config.max_timeout_ms)

        # Convert to seconds (subprocess.run expects seconds)
        return timeout_ms / 1000.0

    @staticmethod
    def check_git_available() -> bool:
        """Check if git is available in PATH.

        Returns:
            True if git is available, False otherwise.
        """
        return shutil.which("git") is not None

    @staticmethod
    def init_sidecar_repo(base_path: Path) -> bool:
        """Initialize the side-car git repository.

        Creates .docimp/state/.git directory and initializes it as a git repo
        with the project root as work-tree. Creates an initial commit on main
        branch.

        If the repo already exists, this is a no-op (idempotent).

        Args:
            base_path: Project root directory (work-tree).

        Returns:
            True if initialization succeeded, False if git unavailable.

        Raises:
            subprocess.CalledProcessError: If git command fails.
        """
        if not GitHelper.check_git_available():
            return False

        # Import StateManager to get git state dir
        from src.utils.state_manager import StateManager

        git_state_dir = StateManager.get_git_state_dir(base_path)
        git_dir = git_state_dir / ".git"

        # If already initialized, return success
        if git_dir.exists() and (git_dir / "HEAD").exists():
            return True

        # Create git state directory
        git_state_dir.mkdir(parents=True, exist_ok=True)

        # Initialize git repo with explicit git-dir and work-tree
        # Use --initial-branch=main to ensure consistent branch name across git versions
        GitHelper.run_git_command(["init", "--initial-branch=main"], base_path)

        # Create initial commit on main branch
        # This ensures we have a branch to work from
        try:
            # Configure user for the side-car repo (required for commits)
            GitHelper.run_git_command(
                ["config", "user.name", "DocImp Transaction System"], base_path
            )
            GitHelper.run_git_command(
                ["config", "user.email", "docimp@localhost"], base_path
            )

            # Create .docimp/state/.gitignore (ignore everything by default)
            gitignore_path = git_state_dir / ".gitignore"
            gitignore_path.write_text(
                "# Side-car git state is ephemeral\n# Ignore everything by default\n*\n"
            )

            # Add and commit the .gitignore file
            # Use -f to force add the .gitignore file even though it ignores itself
            GitHelper.run_git_command(["add", "-f", str(gitignore_path)], base_path)
            GitHelper.run_git_command(
                ["commit", "-m", "Initialize docimp side-car repo"], base_path
            )
        except subprocess.CalledProcessError:
            # If initial commit fails, repo is still usable
            # (empty repos work for our purposes)
            pass

        return True

    @staticmethod
    def run_git_command(
        args: List[str],
        base_path: Path,
        check: bool = True,
        capture_output: bool = True,
        timeout_config: Optional[GitTimeoutConfig] = None,
    ) -> subprocess.CompletedProcess:
        """Run a git command with proper isolation flags and timeout.

        All commands are run with --git-dir=.docimp/state/.git and --work-tree=.
        to ensure complete isolation from the user's git repository.

        Timeouts are automatically calculated based on operation type
        (fast/default/slow) using progressive scaling. Fast operations
        (status, rev-parse) get ~5s, default operations (add, commit) get ~30s,
        slow operations (merge, revert) get ~120s.

        Args:
            args: Git command arguments (without 'git' prefix).
                  Example: ['status'], ['commit', '-m', 'message']
            base_path: Project root directory (work-tree).
            check: If True, raise CalledProcessError on non-zero exit.
            capture_output: If True, capture stdout/stderr.
            timeout_config: Optional timeout configuration. If None, uses defaults
                          (base=30s, fast_scale=0.167, slow_scale=4.0, max=300s).

        Returns:
            subprocess.CompletedProcess with result.

        Raises:
            subprocess.CalledProcessError: If command fails and check=True.
            FileNotFoundError: If git not available.
            TimeoutError: If git operation exceeds calculated timeout.
        """
        from src.utils.state_manager import StateManager

        # Use default config if not provided
        if timeout_config is None:
            timeout_config = GitTimeoutConfig()

        # Calculate timeout based on operation type
        timeout_seconds = GitHelper._calculate_timeout(args, timeout_config)

        git_state_dir = StateManager.get_git_state_dir(base_path)
        git_dir = git_state_dir / ".git"

        # Build command with isolation flags
        cmd = ["git", f"--git-dir={git_dir}", f"--work-tree={base_path}", *args]

        try:
            return subprocess.run(
                cmd,
                check=check,
                capture_output=capture_output,
                text=True,
                cwd=base_path,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as e:
            # Create detailed error message with operation name and config hint
            operation = (
                " ".join(args[:2]) if len(args) >= 2 else args[0] if args else "unknown"
            )
            category = GitHelper._categorize_operation(args)

            # Determine which config field to suggest increasing
            if category == "fast":
                config_hint = (
                    f"transaction.git.fastScale (currently {timeout_config.fast_scale})"
                )
            elif category == "slow":
                config_hint = (
                    f"transaction.git.slowScale (currently {timeout_config.slow_scale})"
                )
            else:
                config_hint = (
                    f"transaction.git.baseTimeout "
                    f"(currently {timeout_config.base_timeout_ms}ms)"
                )

            error_msg = (
                f"Git operation 'git {operation}' timed out after "
                f"{timeout_seconds:.1f} seconds. "
                f"This is a '{category}' operation. "
                f"Consider increasing {config_hint} in docimp.config.js, "
                f"or check for filesystem issues (network mounts, disk errors)."
            )

            raise TimeoutError(error_msg) from e
