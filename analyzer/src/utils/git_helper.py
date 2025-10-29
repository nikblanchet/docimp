"""Git helper utilities for transaction system.

This module provides utilities for interacting with the side-car git repository
used for transaction tracking and rollback capability.
"""

import subprocess
import shutil
from pathlib import Path
from typing import List


class GitHelper:
    """Utilities for managing the side-car git repository.

    The side-car repo is located at .docimp/state/.git with the project root
    as its work-tree. This ensures complete isolation from the user's actual
    git repository.

    All git commands use explicit --git-dir and --work-tree flags:
        git --git-dir=.docimp/state/.git --work-tree=. <command>
    """

    @staticmethod
    def check_git_available() -> bool:
        """Check if git is available in PATH.

        Returns:
            True if git is available, False otherwise.
        """
        return shutil.which('git') is not None

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
        git_dir = git_state_dir / '.git'

        # If already initialized, return success
        if git_dir.exists() and (git_dir / 'HEAD').exists():
            return True

        # Create git state directory
        git_state_dir.mkdir(parents=True, exist_ok=True)

        # Initialize git repo with explicit git-dir and work-tree
        GitHelper.run_git_command(['init'], base_path)

        # Create initial commit on main branch
        # This ensures we have a branch to work from
        try:
            # Configure user for the side-car repo (required for commits)
            GitHelper.run_git_command(
                ['config', 'user.name', 'DocImp Transaction System'],
                base_path
            )
            GitHelper.run_git_command(
                ['config', 'user.email', 'docimp@localhost'],
                base_path
            )

            # Create .docimp/state/.gitignore (ignore everything by default)
            gitignore_path = git_state_dir / '.gitignore'
            gitignore_path.write_text(
                '# Side-car git state is ephemeral\n'
                '# Ignore everything by default\n'
                '*\n'
            )

            # Add and commit the .gitignore file
            GitHelper.run_git_command(['add', str(gitignore_path)], base_path)
            GitHelper.run_git_command(
                ['commit', '-m', 'Initialize docimp side-car repo'],
                base_path
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
        capture_output: bool = True
    ) -> subprocess.CompletedProcess:
        """Run a git command with proper isolation flags.

        All commands are run with --git-dir=.docimp/state/.git and --work-tree=.
        to ensure complete isolation from the user's git repository.

        Args:
            args: Git command arguments (without 'git' prefix).
                  Example: ['status'], ['commit', '-m', 'message']
            base_path: Project root directory (work-tree).
            check: If True, raise CalledProcessError on non-zero exit.
            capture_output: If True, capture stdout/stderr.

        Returns:
            subprocess.CompletedProcess with result.

        Raises:
            subprocess.CalledProcessError: If command fails and check=True.
            FileNotFoundError: If git not available.
        """
        from src.utils.state_manager import StateManager

        git_state_dir = StateManager.get_git_state_dir(base_path)
        git_dir = git_state_dir / '.git'

        # Build command with isolation flags
        cmd = [
            'git',
            f'--git-dir={git_dir}',
            f'--work-tree={base_path}',
            *args
        ]

        return subprocess.run(
            cmd,
            check=check,
            capture_output=capture_output,
            text=True,
            cwd=base_path
        )
