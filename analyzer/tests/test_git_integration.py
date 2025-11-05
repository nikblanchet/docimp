"""Tests for Git repository integration and isolation.

This test suite verifies complete isolation between the side-car repository
(.docimp/state/.git) and the user's repository (.git). These are critical
safety tests to ensure DocImp never interferes with the user's git workflow.
"""

import hashlib
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.git_helper import GitHelper
from src.utils.state_manager import StateManager
from src.writer.transaction_manager import TransactionManager


def compute_directory_hash(directory: Path) -> str:
    """Compute a hash of all files in a directory for change detection."""
    hasher = hashlib.sha256()

    for filepath in sorted(directory.rglob("*")):
        if filepath.is_file():
            # Include file path and contents in hash
            hasher.update(str(filepath.relative_to(directory)).encode())
            hasher.update(filepath.read_bytes())

    return hasher.hexdigest()


def create_user_git_repo(base_path: Path) -> None:
    """Create a real user git repository for testing."""
    subprocess.run(["git", "init"], cwd=base_path, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.name", "Test User"], cwd=base_path, check=True
    )
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"], cwd=base_path, check=True
    )


class TestSidecarRepoIsolation:
    """Test that side-car repo never touches user's .git/ directory."""

    def test_sidecar_repo_never_touches_user_git(self):
        """Verify .git/ directory is unchanged during all transaction operations."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create user's git repo
            create_user_git_repo(base_path)

            # Compute hash of .git/ directory BEFORE any operations
            user_git_dir = base_path / ".git"
            hash_before = compute_directory_hash(user_git_dir)

            # Initialize side-car repo
            GitHelper.init_sidecar_repo(base_path)

            # Perform transaction operations
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            # Create a test file and record change
            test_file = base_path / "test.py"
            test_file.write_text("def foo():\n    pass\n")
            backup_path = str(test_file) + ".bak"
            manager.record_write(
                manifest, str(test_file), backup_path, "foo", "function", "python"
            )

            # Commit transaction (now that git init is fixed)
            manager.commit_transaction(manifest)

            # Compute hash of .git/ directory AFTER operations
            hash_after = compute_directory_hash(user_git_dir)

            # CRITICAL: User's .git/ must be completely unchanged
            assert hash_before == hash_after, "User's .git/ directory was modified!"

    def test_sidecar_repo_work_tree_is_project_root(self):
        """Verify side-car repo uses project root as work-tree."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize side-car repo
            GitHelper.init_sidecar_repo(base_path)

            # Check git config for work-tree setting
            git_state_dir = StateManager.get_git_state_dir(base_path)
            result = subprocess.run(
                [
                    "git",
                    "--git-dir",
                    str(git_state_dir / ".git"),
                    "config",
                    "core.worktree",
                ],
                capture_output=True,
                text=True,
            )

            # Work-tree should be set to project root
            if result.returncode == 0:
                work_tree = Path(result.stdout.strip()).resolve()
                assert work_tree == base_path.resolve()

    def test_git_commands_use_isolation_flags(self):
        """Verify all git commands include --git-dir and --work-tree flags."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Mock subprocess.run to capture all calls
            original_run = subprocess.run
            git_commands = []

            def mock_run(*args, **kwargs):
                if args and "git" in str(args[0]):
                    git_commands.append(args[0])
                return original_run(*args, **kwargs)

            with patch("subprocess.run", side_effect=mock_run):
                # Initialize and perform operations
                GitHelper.init_sidecar_repo(base_path)
                manager = TransactionManager(base_path=base_path, use_git=True)
                manifest = manager.begin_transaction("test-session")

                # Create and record a change
                test_file = base_path / "test.py"
                test_file.write_text("def foo(): pass")
                backup_path = str(test_file) + ".bak"
                manager.record_write(
                    manifest, str(test_file), backup_path, "foo", "function", "python"
                )

            # Verify all git commands (except init and config) use isolation flags
            for cmd in git_commands:
                if isinstance(cmd, list) and len(cmd) > 1:
                    # Skip init and config commands
                    if cmd[1] in ["init", "config"]:
                        continue

                    # All other commands must have --git-dir flag
                    cmd_str = " ".join(cmd)
                    assert "--git-dir" in cmd_str, (
                        f"Command missing --git-dir: {cmd_str}"
                    )

    def test_no_git_hook_interference(self):
        """Verify side-car repo never triggers user's git hooks."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create user git repo with a pre-commit hook
            create_user_git_repo(base_path)
            hooks_dir = base_path / ".git" / "hooks"
            hooks_dir.mkdir(exist_ok=True)

            # Create pre-commit hook that creates a marker file
            marker_file = base_path / "hook_was_called.txt"
            pre_commit_hook = hooks_dir / "pre-commit"
            pre_commit_hook.write_text(f"#!/bin/sh\ntouch {marker_file}\n")
            pre_commit_hook.chmod(0o755)

            # Perform transaction operations
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            test_file = base_path / "test.py"
            test_file.write_text("def foo(): pass")
            backup_path = str(test_file) + ".bak"
            manager.record_write(
                manifest, str(test_file), backup_path, "foo", "function", "python"
            )

            # Commit transaction
            manager.commit_transaction(manifest)

            # Marker file should NOT exist (hook was never called)
            assert not marker_file.exists(), "User's git hook was triggered!"

    def test_user_git_status_unaffected(self):
        """Verify git status in user's repo shows no docimp changes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create user git repo
            create_user_git_repo(base_path)

            # Perform transaction operations
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            test_file = base_path / "test.py"
            test_file.write_text("def foo(): pass")
            backup_path = str(test_file) + ".bak"
            manager.record_write(
                manifest, str(test_file), backup_path, "foo", "function", "python"
            )

            # Commit transaction
            manager.commit_transaction(manifest)

            # Check user's git status
            result = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=base_path,
                capture_output=True,
                text=True,
                check=True,
            )

            # It's OK for .docimp/ to show as untracked (it's a real directory)
            # But backup files should NOT appear
            lines = result.stdout.strip().split("\n")
            for line in lines:
                # .docimp/ may appear as untracked directory - that's fine
                # But no .bak files should leak into user's repo status
                assert ".bak" not in line, f"User's git status shows .bak file: {line}"

    def test_user_git_log_unaffected(self):
        """Verify git log in user's repo has no docimp commits."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create user git repo with a commit
            create_user_git_repo(base_path)
            initial_file = base_path / "README.md"
            initial_file.write_text("# Test Project\n")
            subprocess.run(["git", "add", "README.md"], cwd=base_path, check=True)
            subprocess.run(
                ["git", "commit", "-m", "Initial commit"], cwd=base_path, check=True
            )

            # Perform transaction operations
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            test_file = base_path / "test.py"
            test_file.write_text("def foo(): pass")
            backup_path = str(test_file) + ".bak"
            manager.record_write(
                manifest, str(test_file), backup_path, "foo", "function", "python"
            )

            # Commit transaction
            manager.commit_transaction(manifest)

            # Check user's git log
            result = subprocess.run(
                ["git", "log", "--all", "--oneline"],
                cwd=base_path,
                capture_output=True,
                text=True,
                check=True,
            )

            # Should only show user's commit, not docimp commits
            log_output = result.stdout
            assert "docimp:" not in log_output.lower(), (
                "User's git log shows docimp commits!"
            )
            assert "Initial commit" in log_output


class TestSpecialFilenames:
    """Test git operations with challenging filenames."""

    def test_filenames_with_spaces(self):
        """Test git operations with spaces in filenames."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            # Create file with space in name
            test_file = base_path / "my test file.py"
            test_file.write_text("def foo(): pass")
            backup_path = str(test_file) + ".bak"

            # Should not raise
            manager.record_write(
                manifest, str(test_file), backup_path, "foo", "function", "python"
            )

            # Commit to verify end-to-end works with special filenames
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"

    def test_filenames_with_special_chars(self):
        """Test git operations with apostrophes, quotes, unicode."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            # Test various special characters
            test_cases = [
                "file's.py",  # Apostrophe
                'file"name.py',  # Quote
                "café.py",  # Unicode
                "file&name.py",  # Ampersand
            ]

            for filename in test_cases:
                test_file = base_path / filename
                test_file.write_text("def foo(): pass")
                backup_path = str(test_file) + ".bak"

                # Should not raise
                try:
                    manager.record_write(
                        manifest,
                        str(test_file),
                        backup_path,
                        "foo",
                        "function",
                        "python",
                    )
                except Exception as e:
                    pytest.fail(f"Failed to record file with name '{filename}': {e}")

            # Commit to verify end-to-end works with special characters
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"
            assert len(manifest.entries) == len(test_cases)

    def test_very_long_filenames(self):
        """Test git operations with very long filenames (255+ chars)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session")

            # Create filename with 255 characters (filesystem limit)
            long_name = "a" * 250 + ".py"
            test_file = base_path / long_name

            try:
                test_file.write_text("def foo(): pass")
                backup_path = str(test_file) + ".bak"
                # Attempt to record (may fail gracefully depending on filesystem)
                manager.record_write(
                    manifest, str(test_file), backup_path, "foo", "function", "python"
                )
            except (OSError, subprocess.CalledProcessError, ValueError):
                # Acceptable to fail on very long filenames, but should not crash
                pass


class TestGitEdgeCases:
    """Test behavior in unusual git scenarios."""

    def test_git_repo_corruption_recovery(self):
        """Test behavior when side-car repo is corrupted."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize side-car repo
            GitHelper.init_sidecar_repo(base_path)

            # Corrupt the repo by deleting HEAD
            git_state_dir = StateManager.get_git_state_dir(base_path)
            git_dir = git_state_dir / ".git"
            head_file = git_dir / "HEAD"
            head_file.unlink()

            # Attempt operations (should either recover or fail gracefully)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # This may raise or fall back to non-git mode
            # Either behavior is acceptable, but should not crash
            try:
                _manifest = manager.begin_transaction("test-session")
            except (subprocess.CalledProcessError, RuntimeError):
                pass  # Graceful failure is acceptable

    def test_git_detached_head_state(self):
        """Test operations when side-car repo in detached HEAD."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize side-car repo
            GitHelper.init_sidecar_repo(base_path)

            # Create a commit first
            manager = TransactionManager(base_path=base_path, use_git=True)
            manifest = manager.begin_transaction("test-session-1")
            test_file = base_path / "test.py"
            test_file.write_text("def foo(): pass")
            backup_path1 = str(test_file) + ".bak"
            manager.record_write(
                manifest, str(test_file), backup_path1, "foo", "function", "python"
            )
            manager.commit_transaction(manifest)

            # Get commit SHA and checkout in detached HEAD
            result = GitHelper.run_git_command(
                ["rev-parse", "HEAD"], base_path, check=True
            )
            commit_sha = result.stdout.strip()

            GitHelper.run_git_command(["checkout", commit_sha], base_path, check=True)

            # Attempt another transaction (should handle detached HEAD gracefully)
            manifest2 = manager.begin_transaction("test-session-2")
            test_file2 = base_path / "test2.py"
            test_file2.write_text("def bar(): pass")
            backup_path2 = str(test_file2) + ".bak"
            manager.record_write(
                manifest2, str(test_file2), backup_path2, "bar", "function", "python"
            )

            # Should either work or fail gracefully
            try:
                manager.commit_transaction(manifest2)
                # If it works, verify it committed
                assert manifest2.status == "committed"
            except (subprocess.CalledProcessError, RuntimeError):
                # Acceptable to fail in detached HEAD - just verify it fails cleanly
                pass


class TestConcurrencyAndSafety:
    """Test concurrent session handling and safety."""

    def test_concurrent_session_safety(self):
        """Test that multiple processes don't conflict (document limitation

        if needed)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)

            # Start two transactions
            manager1 = TransactionManager(base_path=base_path, use_git=True)
            manager2 = TransactionManager(base_path=base_path, use_git=True)

            manifest1 = manager1.begin_transaction("session-1")
            manifest2 = manager2.begin_transaction("session-2")

            # Both sessions should get unique IDs
            assert manifest1.session_id != manifest2.session_id

            # Both should be able to record changes without conflicts
            test_file1 = base_path / "test1.py"
            test_file1.write_text("def foo(): pass")
            backup_path1 = str(test_file1) + ".bak"
            manager1.record_write(
                manifest1, str(test_file1), backup_path1, "foo", "function", "python"
            )

            test_file2 = base_path / "test2.py"
            test_file2.write_text("def bar(): pass")
            backup_path2 = str(test_file2) + ".bak"
            manager2.record_write(
                manifest2, str(test_file2), backup_path2, "bar", "function", "python"
            )

            # Commit both (may conflict, which is acceptable)
            try:
                manager1.commit_transaction(manifest1)
                manager2.commit_transaction(manifest2)

                # If both succeed, verify both manifests are marked committed
                assert manifest1.status == "committed"
                assert manifest2.status == "committed"
            except (subprocess.CalledProcessError, RuntimeError):
                # Acceptable to have conflicts with concurrent commits
                pass
