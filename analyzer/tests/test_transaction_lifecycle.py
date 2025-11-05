"""Tests for complete transaction lifecycle workflows.

This test suite verifies full transaction workflows from start to finish,
including multi-session scenarios, large sessions, and edge cases.

Tests both git-based and non-git modes to ensure both work correctly.
"""

import sys
import tempfile
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.git_helper import GitHelper
from src.writer.transaction_manager import TransactionManager


class TestFullLifecycle:
    """Test complete transaction workflows."""

    def test_full_lifecycle_begin_record_commit(self):
        """Test begin → record × 3 → commit workflow."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Begin transaction
            manifest = manager.begin_transaction("lifecycle-test")
            assert manifest.session_id == "lifecycle-test"
            assert manifest.status == "in_progress"

            # Record 3 writes
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                filepath.write_text(f"def func{i}(): pass")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")  # Create backup

                manager.record_write(
                    manifest, str(filepath), backup, f"func{i}", "function", "python"
                )

            # Verify entries recorded
            assert len(manifest.entries) == 3

            # Commit transaction
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"
            assert manifest.completed_at is not None

            # Verify backups deleted
            for i in range(3):
                backup = base_path / f"file{i}.py.bak"
                assert not backup.exists()

    def test_full_lifecycle_begin_record_rollback(self):
        """Test begin → record × 3 → rollback workflow."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Create original files
            originals = {}
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                original_content = f"# Original content {i}\n"
                filepath.write_text(original_content)
                originals[str(filepath)] = original_content

            # Begin transaction
            manifest = manager.begin_transaction("rollback-test")

            # Record changes (create backups and modify files)
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                backup = str(filepath) + ".bak"

                # Create backup
                Path(backup).write_text(originals[str(filepath)])

                # Modify file
                filepath.write_text(f"def new_func{i}(): pass")

                manager.record_write(
                    manifest,
                    str(filepath),
                    backup,
                    f"new_func{i}",
                    "function",
                    "python",
                )

            # Rollback transaction
            restored_count = manager.rollback_transaction(manifest)

            assert restored_count == 3

            # Verify files restored
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                assert filepath.read_text() == originals[str(filepath)]

    def test_session_with_no_changes(self):
        """Test transaction with zero recorded changes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Begin transaction
            manifest = manager.begin_transaction("empty-session")
            assert len(manifest.entries) == 0

            # Commit immediately (no writes)
            manager.commit_transaction(manifest)

            # Should complete successfully
            assert manifest.status == "committed"


class TestMultipleSequentialSessions:
    """Test multiple complete sessions in sequence."""

    def test_three_sequential_sessions(self):
        """Test three complete sessions run sequentially."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            sessions = []

            # Session 1: 2 changes
            manifest1 = manager.begin_transaction("session-1")
            for i in range(2):
                filepath = base_path / f"session1_file{i}.py"
                filepath.write_text("content")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest1, str(filepath), backup, "func", "function", "python"
                )
            manager.commit_transaction(manifest1)
            sessions.append(manifest1)

            # Session 2: 3 changes
            manifest2 = manager.begin_transaction("session-2")
            for i in range(3):
                filepath = base_path / f"session2_file{i}.py"
                filepath.write_text("content")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest2, str(filepath), backup, "func", "function", "python"
                )
            manager.commit_transaction(manifest2)
            sessions.append(manifest2)

            # Session 3: 1 change
            manifest3 = manager.begin_transaction("session-3")
            filepath = base_path / "session3_file0.py"
            filepath.write_text("content")
            backup = str(filepath) + ".bak"
            Path(backup).write_text("")
            manager.record_write(
                manifest3, str(filepath), backup, "func", "function", "python"
            )
            manager.commit_transaction(manifest3)
            sessions.append(manifest3)

            # Verify all sessions completed
            for session in sessions:
                assert session.status == "committed"
                assert session.completed_at is not None

    def test_rollback_then_new_session(self):
        """Test starting new session after rollback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Session 1: Create and rollback
            file1 = base_path / "file1.py"
            file1.write_text("original")

            manifest1 = manager.begin_transaction("session-1")
            backup1 = str(file1) + ".bak"
            Path(backup1).write_text("original")
            file1.write_text("modified")
            manager.record_write(
                manifest1, str(file1), backup1, "func1", "function", "python"
            )

            # Rollback session 1
            manager.rollback_transaction(manifest1)

            # Session 2: New session should work fine
            file2 = base_path / "file2.py"
            file2.write_text("new content")
            manifest2 = manager.begin_transaction("session-2")
            backup2 = str(file2) + ".bak"
            Path(backup2).write_text("")
            manager.record_write(
                manifest2, str(file2), backup2, "func2", "function", "python"
            )
            manager.commit_transaction(manifest2)

            # Verify session 2 committed successfully
            assert manifest2.status == "committed"
            assert len(manifest2.entries) == 1


class TestLargeSessions:
    """Test sessions with many changes."""

    def test_large_session_50_changes(self):
        """Test session with 50 changes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            manifest = manager.begin_transaction("large-session")

            # Record 50 writes
            for i in range(50):
                filepath = base_path / f"file{i}.py"
                filepath.write_text(f"def func{i}(): pass")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest, str(filepath), backup, f"func{i}", "function", "python"
                )

            # Verify all tracked
            assert len(manifest.entries) == 50

            # Commit should handle large session
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"


class TestNestedDirectories:
    """Test changes to files in deeply nested directories."""

    def test_nested_directory_changes(self):
        """Test changes at various nesting levels."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            manifest = manager.begin_transaction("nested-test")

            # Create dir structure a/b/c/d/e/f/
            nested_paths = [
                base_path / "file.py",
                base_path / "a" / "file.py",
                base_path / "a" / "b" / "file.py",
                base_path / "a" / "b" / "c" / "file.py",
                base_path / "a" / "b" / "c" / "d" / "file.py",
                base_path / "a" / "b" / "c" / "d" / "e" / "file.py",
                base_path / "a" / "b" / "c" / "d" / "e" / "f" / "file.py",
            ]

            for filepath in nested_paths:
                filepath.parent.mkdir(parents=True, exist_ok=True)
                filepath.write_text("content")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest, str(filepath), backup, "func", "function", "python"
                )

            # Verify all paths handled
            assert len(manifest.entries) == len(nested_paths)

            # Commit (test that nested paths work with commit)
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"

            # Create another session to test rollback at nested levels
            manifest2 = manager.begin_transaction("nested-rollback-test")
            for filepath in nested_paths:
                backup = str(filepath) + ".bak"
                Path(backup).write_text("rollback")
                manager.record_write(
                    manifest2, str(filepath), backup, "func", "function", "python"
                )

            # Test rollback at all nesting levels
            restored = manager.rollback_transaction(manifest2)
            assert restored == len(nested_paths)


class TestSessionState:
    """Test transaction state management."""

    def test_session_state_fields(self):
        """Test all session state fields are correctly maintained."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Begin
            manifest = manager.begin_transaction("state-test")

            assert manifest.session_id == "state-test"
            assert manifest.status == "in_progress"
            assert manifest.started_at is not None
            assert manifest.completed_at is None
            assert manifest.entries == []
            assert manifest.git_commit_sha is None

            # Record change
            filepath = base_path / "file.py"
            filepath.write_text("content")
            backup = str(filepath) + ".bak"
            Path(backup).write_text("")
            manager.record_write(
                manifest, str(filepath), backup, "func", "function", "python"
            )

            assert len(manifest.entries) == 1
            entry = manifest.entries[0]
            assert entry.filepath == str(filepath)
            assert entry.backup_path == backup
            assert entry.item_name == "func"
            assert entry.item_type == "function"
            assert entry.language == "python"
            assert entry.success is True

            # Commit
            manager.commit_transaction(manifest)

            assert manifest.status == "committed"
            assert manifest.completed_at is not None

    def test_entry_timestamps_consistent(self):
        """Test all entry timestamps are recorded correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            manifest = manager.begin_transaction("timestamp-test")

            # Record 3 changes
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                filepath.write_text("content")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest, str(filepath), backup, f"func{i}", "function", "python"
                )

            # All entries should have timestamps
            for entry in manifest.entries:
                assert entry.timestamp is not None
                # Timestamp should be ISO format
                assert "T" in entry.timestamp


class TestErrorRecovery:
    """Test error handling and recovery."""

    def test_partial_session_handling(self):
        """Test handling of partial sessions with some failures."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            manifest = manager.begin_transaction("partial-test")

            # Successful writes
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                filepath.write_text("content")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest, str(filepath), backup, f"func{i}", "function", "python"
                )

            # Should be able to commit partial session
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"
            assert len(manifest.entries) == 3


class TestBranchNaming:
    """Test session branch naming conventions."""

    def test_session_branch_naming(self):
        """Test session IDs are used correctly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Various session ID formats
            test_ids = [
                "simple-id",
                "session-123",
                "feature-branch-20240101",
                "user_session_abc",
            ]

            for session_id in test_ids:
                manifest = manager.begin_transaction(session_id)
                assert manifest.session_id == session_id

                # Commit without errors
                manager.commit_transaction(manifest)
                assert manifest.status == "committed"


class TestGitBasedLifecycle:
    """Test complete transaction workflows using git backend.

    These tests verify that git integration works correctly for core workflows.
    """

    def test_git_full_lifecycle_begin_record_commit(self):
        """Test begin → record × 3 → commit workflow with git backend."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize git backend
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Begin transaction
            manifest = manager.begin_transaction("git-lifecycle-test")
            assert manifest.session_id == "git-lifecycle-test"
            assert manifest.status == "in_progress"

            # Record 3 writes
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                filepath.write_text(f"def func{i}(): pass")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")

                manager.record_write(
                    manifest, str(filepath), backup, f"func{i}", "function", "python"
                )

            # Verify entries recorded
            assert len(manifest.entries) == 3

            # Commit transaction
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"
            assert manifest.completed_at is not None
            assert manifest.git_commit_sha is not None  # Git-specific

            # Verify backups deleted
            for i in range(3):
                backup = base_path / f"file{i}.py.bak"
                assert not backup.exists()

    def test_git_full_lifecycle_rollback(self):
        """Test begin → record × 3 → rollback workflow with git backend."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize git backend
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create original files
            originals = {}
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                original_content = f"# Original content {i}\n"
                filepath.write_text(original_content)
                originals[str(filepath)] = original_content

            # Begin transaction
            manifest = manager.begin_transaction("git-rollback-test")

            # Record changes
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                backup = str(filepath) + ".bak"
                Path(backup).write_text(originals[str(filepath)])
                filepath.write_text(f"def new_func{i}(): pass")

                manager.record_write(
                    manifest,
                    str(filepath),
                    backup,
                    f"new_func{i}",
                    "function",
                    "python",
                )

            # Rollback transaction (git-based)
            restored_count = manager.rollback_transaction(manifest)
            assert restored_count == 3

            # Verify files restored
            for i in range(3):
                filepath = base_path / f"file{i}.py"
                assert filepath.read_text() == originals[str(filepath)]

    def test_git_multiple_sequential_sessions(self):
        """Test multiple sessions work correctly with git backend."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize git backend
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Session 1
            manifest1 = manager.begin_transaction("git-session-1")
            filepath1 = base_path / "file1.py"
            filepath1.write_text("content1")
            backup1 = str(filepath1) + ".bak"
            Path(backup1).write_text("")
            manager.record_write(
                manifest1, str(filepath1), backup1, "func1", "function", "python"
            )
            manager.commit_transaction(manifest1)
            assert manifest1.status == "committed"
            assert manifest1.git_commit_sha is not None

            # Session 2
            manifest2 = manager.begin_transaction("git-session-2")
            filepath2 = base_path / "file2.py"
            filepath2.write_text("content2")
            backup2 = str(filepath2) + ".bak"
            Path(backup2).write_text("")
            manager.record_write(
                manifest2, str(filepath2), backup2, "func2", "function", "python"
            )
            manager.commit_transaction(manifest2)
            assert manifest2.status == "committed"
            assert manifest2.git_commit_sha is not None

            # Both should have different commit SHAs
            assert manifest1.git_commit_sha != manifest2.git_commit_sha

    def test_git_large_session(self):
        """Test large session (30 changes) with git backend."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize git backend
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            manifest = manager.begin_transaction("git-large-session")

            # Record 30 writes
            for i in range(30):
                filepath = base_path / f"file{i}.py"
                filepath.write_text(f"def func{i}(): pass")
                backup = str(filepath) + ".bak"
                Path(backup).write_text("")
                manager.record_write(
                    manifest, str(filepath), backup, f"func{i}", "function", "python"
                )

            # Verify all tracked
            assert len(manifest.entries) == 30

            # Commit should handle large session
            manager.commit_transaction(manifest)
            assert manifest.status == "committed"
            assert manifest.git_commit_sha is not None
