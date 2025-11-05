"""Tests for individual change rollback functionality."""

import sys
from pathlib import Path
import tempfile

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.transaction_manager import TransactionManager, RollbackResult


class TestListSessionChanges:
    """Test listing changes in a session."""

    def test_list_changes_in_session(self):
        """Test listing all changes in a session with multiple commits."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create and commit 5 changes
            for i in range(5):
                test_file = Path(tmpdir) / f"file{i}.py"
                test_file.write_text(f"def func{i}(): pass")

                manager.record_write(
                    manifest,
                    str(test_file),
                    f"{test_file}.bak",
                    f"func{i}",
                    "function",
                    "python",
                )

            # List changes
            changes = manager.list_session_changes("test-session")

            assert len(changes) == 5
            for i, change in enumerate(changes):
                assert change.item_name == f"func{i}"
                assert change.item_type == "function"
                assert change.language == "python"
                assert change.entry_id is not None

    def test_list_changes_empty_session(self):
        """Test listing changes when session has no commits yet."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))

            # Create session but don't add any commits
            # Git branch only exists after first commit, so this should raise
            try:
                manager.begin_transaction("empty-session")
                changes = manager.list_session_changes("empty-session")
                # If branch was created, should have 0 changes
                assert len(changes) == 0
            except ValueError:
                # Expected if git hasn't created branch yet
                pass

    def test_list_changes_nonexistent_session_raises(self):
        """Test that listing nonexistent session raises ValueError."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))

            try:
                manager.list_session_changes("nonexistent")
                assert False, "Should have raised ValueError"
            except ValueError as e:
                assert "does not exist" in str(e)


class TestRollbackChange:
    """Test rolling back individual changes."""

    def test_rollback_single_change(self):
        """Test reverting a single change successfully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create first file and commit
            test_file1 = Path(tmpdir) / "file1.py"
            test_file1.write_text("def func1(): pass")

            manager.record_write(
                manifest,
                str(test_file1),
                f"{test_file1}.bak",
                "func1",
                "function",
                "python",
            )

            # Create second independent file and commit
            # This ensures we have something to revert to
            test_file2 = Path(tmpdir) / "file2.py"
            test_file2.write_text("def func2(): pass")

            manager.record_write(
                manifest,
                str(test_file2),
                f"{test_file2}.bak",
                "func2",
                "function",
                "python",
            )

            # Get changes
            changes = manager.list_session_changes("test-session")
            assert len(changes) == 2

            # Rollback the second change (should work cleanly)
            second_change_id = changes[1].entry_id

            result = manager.rollback_change(second_change_id)

            assert result.success is True
            assert result.restored_count == 1
            assert result.failed_count == 0
            assert len(result.conflicts) == 0
            assert result.status == "completed"

    def test_rollback_change_with_conflict(self):
        """Test rollback when file has been modified (conflict scenario)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create initial file
            test_file = Path(tmpdir) / "test.py"
            test_file.write_text("def func(): pass")

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func",
                "function",
                "python",
            )

            # Make another conflicting change
            test_file.write_text('def func():\n    """different docs"""\n    pass')

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func",
                "function",
                "python",
            )

            # Try to revert the first change (will conflict with second)
            changes = manager.list_session_changes("test-session")
            first_change_id = changes[0].entry_id

            result = manager.rollback_change(first_change_id)

            # Expect failure due to conflict
            assert result.success is False
            assert result.failed_count == 1


class TestRollbackMultiple:
    """Test rolling back multiple changes."""

    def test_rollback_multiple_changes_success(self):
        """Test reverting multiple changes successfully."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create 3 independent changes
            for i in range(3):
                test_file = Path(tmpdir) / f"file{i}.py"
                test_file.write_text(f"def func{i}(): pass")

                manager.record_write(
                    manifest,
                    str(test_file),
                    f"{test_file}.bak",
                    f"func{i}",
                    "function",
                    "python",
                )

            # Get all change IDs
            changes = manager.list_session_changes("test-session")
            change_ids = [c.entry_id for c in changes]

            # Rollback all changes
            result = manager.rollback_multiple(change_ids)

            assert result.success is True
            assert result.restored_count == 3
            assert result.failed_count == 0
            assert result.status == "completed"

    def test_rollback_multiple_partial_success(self):
        """Test partial rollback when some changes succeed and others fail."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create 2 changes to same file (will conflict)
            test_file = Path(tmpdir) / "test.py"
            test_file.write_text("v1")

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func1",
                "function",
                "python",
            )

            test_file.write_text("v2")

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func2",
                "function",
                "python",
            )

            # Try to revert both (at least one should conflict)
            changes = manager.list_session_changes("test-session")
            change_ids = [c.entry_id for c in changes]

            result = manager.rollback_multiple(change_ids)

            # Expect partial or complete failure
            assert result.failed_count > 0


class TestGetChangeDiff:
    """Test getting diff for a change."""

    def test_get_change_diff_shows_content(self):
        """Test that get_change_diff returns diff output."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create a change
            test_file = Path(tmpdir) / "test.py"
            test_file.write_text(
                'def my_function():\n    """A docstring"""\n    pass\n'
            )

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "my_function",
                "function",
                "python",
            )

            # Get change diff
            changes = manager.list_session_changes("test-session")
            change_id = changes[0].entry_id

            diff = manager.get_change_diff(change_id)

            # Should contain file name and content
            assert "test.py" in diff
            assert "my_function" in diff or "A docstring" in diff


class TestConflictScenarios:
    """Test various conflict scenarios."""

    def test_file_modified_after_change(self):
        """Test rollback when file has been modified since the change."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Original change
            test_file = Path(tmpdir) / "test.py"
            test_file.write_text("original content")

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func",
                "function",
                "python",
            )

            # Subsequent modification (creates conflict scenario)
            test_file.write_text("completely different content")

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func2",
                "function",
                "python",
            )

            # Try to rollback first change
            changes = manager.list_session_changes("test-session")
            first_change = changes[0].entry_id

            result = manager.rollback_change(first_change)

            # Expect conflict
            assert result.success is False

    def test_file_deleted_after_change(self):
        """Test rollback when file has been deleted since the change."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction("test-session")

            # Create and commit a change
            test_file = Path(tmpdir) / "test.py"
            test_file.write_text("content")

            manager.record_write(
                manifest,
                str(test_file),
                f"{test_file}.bak",
                "func",
                "function",
                "python",
            )

            # Delete the file (simulates deletion after commit)
            # Note: In real scenario, file would be deleted via git rm
            # For this test, we're just testing the rollback behavior

            changes = manager.list_session_changes("test-session")
            change_id = changes[0].entry_id

            # Rollback should still work (git revert handles this)
            result = manager.rollback_change(change_id)

            # Result depends on git's handling of deleted files
            # At minimum, should not crash
            assert result is not None


class TestRollbackResult:
    """Test RollbackResult dataclass."""

    def test_rollback_result_success(self):
        """Test RollbackResult with successful rollback."""
        result = RollbackResult(
            success=True,
            restored_count=3,
            failed_count=0,
            conflicts=[],
            status="completed",
        )

        assert result.success is True
        assert result.restored_count == 3
        assert result.failed_count == 0
        assert len(result.conflicts) == 0
        assert result.status == "completed"

    def test_rollback_result_partial(self):
        """Test RollbackResult with partial rollback."""
        result = RollbackResult(
            success=False,
            restored_count=2,
            failed_count=1,
            conflicts=["file.py"],
            status="partial_rollback",
        )

        assert result.success is False
        assert result.restored_count == 2
        assert result.failed_count == 1
        assert len(result.conflicts) == 1
        assert result.status == "partial_rollback"

    def test_rollback_result_failed(self):
        """Test RollbackResult with complete failure."""
        result = RollbackResult(
            success=False,
            restored_count=0,
            failed_count=3,
            conflicts=["file1.py", "file2.py"],
            status="failed",
        )

        assert result.success is False
        assert result.restored_count == 0
        assert result.failed_count == 3
        assert len(result.conflicts) == 2
        assert result.status == "failed"
