"""Tests for post-squash individual change rollback.

Tests the ability to rollback individual changes after a session has been
committed (squashed to main). This uses the re-squash strategy:
1. Checkout preserved session branch
2. Revert specific commit on session branch
3. Re-squash merge onto main
4. Update manifest tracking
"""

import tempfile
from pathlib import Path

from src.writer.transaction_manager import TransactionManager


class TestPostSquashRollback:
    """Test rolling back individual changes after session commit."""

    def test_rollback_change_from_committed_session(self):
        """Test reverting a change after session has been squashed to main."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            # Create and commit first change
            file1 = Path(tmpdir) / 'file1.py'
            file1.write_text('def func1(): pass')
            manager.record_write(
                manifest, str(file1), f'{file1}.bak',
                'func1', 'function', 'python'
            )

            # Create and commit second change
            file2 = Path(tmpdir) / 'file2.py'
            file2.write_text('def func2(): pass')
            manager.record_write(
                manifest, str(file2), f'{file2}.bak',
                'func2', 'function', 'python'
            )

            # Create and commit third change
            file3 = Path(tmpdir) / 'file3.py'
            file3.write_text('def func3(): pass')
            manager.record_write(
                manifest, str(file3), f'{file3}.bak',
                'func3', 'function', 'python'
            )

            # Get entry IDs
            changes = manager.list_session_changes('test-session')
            assert len(changes) == 3
            second_change_id = changes[1].entry_id

            # Commit the session (squash merge to main)
            manager.commit_transaction(manifest)

            # Verify session branch still exists
            from src.utils.git_helper import GitHelper
            branch_result = GitHelper.run_git_command(
                ['branch', '--list', 'docimp/session-test-session'],
                Path(tmpdir),
                check=False
            )
            assert branch_result.returncode == 0
            assert 'docimp/session-test-session' in branch_result.stdout

            # Now rollback the second change (post-squash)
            result = manager.rollback_change(second_change_id)

            # Verify rollback succeeded
            assert result.success is True
            assert result.restored_count == 1
            assert result.failed_count == 0
            assert len(result.conflicts) == 0
            assert result.status == 'completed'

            # Verify main branch has new squash commit with reverted change message
            log_result = GitHelper.run_git_command(
                ['log', '--oneline', '-1', 'main'],  # Just check most recent commit
                Path(tmpdir)
            )
            # Should see new squash commit mentioning the reverted change
            assert 'squash' in log_result.stdout.lower() and 'revert' in log_result.stdout.lower()

            # Verify session branch still exists (preserved)
            branch_result = GitHelper.run_git_command(
                ['branch', '--list', 'docimp/session-test-session'],
                Path(tmpdir)
            )
            assert 'docimp/session-test-session' in branch_result.stdout

    def test_rollback_multiple_changes_from_committed_session(self):
        """Test reverting multiple changes from a committed session."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            # Create three changes
            files = []
            for i in range(3):
                file = Path(tmpdir) / f'file{i}.py'
                file.write_text(f'def func{i}(): pass')
                manager.record_write(
                    manifest, str(file), f'{file}.bak',
                    f'func{i}', 'function', 'python'
                )
                files.append(file)

            # Get entry IDs
            changes = manager.list_session_changes('test-session')
            assert len(changes) == 3

            # Commit the session
            manager.commit_transaction(manifest)

            # Rollback first and third changes
            result1 = manager.rollback_change(changes[0].entry_id)
            assert result1.success is True

            result2 = manager.rollback_change(changes[2].entry_id)
            assert result2.success is True

    def test_rollback_with_missing_session_branch(self):
        """Test error handling when session branch was deleted."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            # Create a change
            file = Path(tmpdir) / 'test.py'
            file.write_text('def func(): pass')
            manager.record_write(
                manifest, str(file), f'{file}.bak',
                'func', 'function', 'python'
            )

            changes = manager.list_session_changes('test-session')
            change_id = changes[0].entry_id

            # Commit session
            manager.commit_transaction(manifest)

            # Manually delete session branch (simulating cleanup)
            from src.utils.git_helper import GitHelper
            GitHelper.run_git_command(
                ['branch', '-D', 'docimp/session-test-session'],
                Path(tmpdir),
                check=False
            )

            # Update manifest status to committed (simulate production scenario)
            manifest.status = 'committed'

            # Try to rollback - should fail when entry not found
            # (Since branch is deleted, _find_entry_by_id won't find it)
            try:
                manager.rollback_change(change_id)
                assert False, "Should have raised ValueError"
            except ValueError as e:
                # Could be "Entry not found" or "Session branch not found"
                assert "not found" in str(e).lower()

    def test_rollback_with_conflict_in_committed_session(self):
        """Test conflict handling during post-squash rollback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            # Create first change
            file = Path(tmpdir) / 'test.py'
            file.write_text('def func(): pass')
            manager.record_write(
                manifest, str(file), f'{file}.bak',
                'func', 'function', 'python'
            )

            # Create second change to same file
            file.write_text('def func(): return 42')
            manager.record_write(
                manifest, str(file), f'{file}.bak',
                'func', 'function', 'python'
            )

            changes = manager.list_session_changes('test-session')
            first_change_id = changes[0].entry_id

            # Commit session
            manager.commit_transaction(manifest)

            # Modify file again to create conflict scenario
            file.write_text('def func(): return "conflict"')

            # Import git helper for manual modification
            from src.utils.git_helper import GitHelper

            # Add and commit the conflicting change directly to main
            GitHelper.run_git_command(['add', str(file)], Path(tmpdir))
            GitHelper.run_git_command(
                ['commit', '-m', 'Conflicting change'],
                Path(tmpdir)
            )

            # Try to rollback first change - should detect conflict
            result = manager.rollback_change(first_change_id)

            # Should fail due to conflict
            assert result.success is False
            assert result.failed_count == 1
            assert result.status == 'failed'

    def test_session_branch_preserved_after_resquash(self):
        """Test that session branch remains after re-squash merge."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            # Create changes
            for i in range(2):
                file = Path(tmpdir) / f'file{i}.py'
                file.write_text(f'def func{i}(): pass')
                manager.record_write(
                    manifest, str(file), f'{file}.bak',
                    f'func{i}', 'function', 'python'
                )

            changes = manager.list_session_changes('test-session')

            # Commit session
            manager.commit_transaction(manifest)

            # Rollback one change
            manager.rollback_change(changes[0].entry_id)

            # Verify session branch still exists
            from src.utils.git_helper import GitHelper
            branch_result = GitHelper.run_git_command(
                ['branch', '--list', 'docimp/session-test-session'],
                Path(tmpdir)
            )
            assert 'docimp/session-test-session' in branch_result.stdout

            # Verify session branch has revert commit
            log_result = GitHelper.run_git_command(
                ['log', '--oneline', '--all', '--grep=Revert'],
                Path(tmpdir)
            )
            # Should have at least one revert commit somewhere
            assert len(log_result.stdout.strip()) > 0, "No revert commits found"


class TestFindEntryById:
    """Test the _find_entry_by_id helper method."""

    def test_find_entry_in_git_branches(self):
        """Test finding entry by searching git branches when no manifest files exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            # Create a change
            file = Path(tmpdir) / 'test.py'
            file.write_text('def func(): pass')
            manager.record_write(
                manifest, str(file), f'{file}.bak',
                'func', 'function', 'python'
            )

            changes = manager.list_session_changes('test-session')
            entry_id = changes[0].entry_id

            # Call _find_entry_by_id (transactions dir doesn't exist)
            transactions_dir = Path(tmpdir) / '.docimp' / 'transactions'
            found_manifest, found_entry = manager._find_entry_by_id(entry_id, transactions_dir)

            assert found_manifest.session_id == 'test-session'
            assert found_entry.entry_id == entry_id
            assert found_entry.item_name == 'func'

    def test_find_entry_by_partial_sha(self):
        """Test finding entry using partial git SHA."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))
            manifest = manager.begin_transaction('test-session')

            file = Path(tmpdir) / 'test.py'
            file.write_text('def func(): pass')
            manager.record_write(
                manifest, str(file), f'{file}.bak',
                'func', 'function', 'python'
            )

            changes = manager.list_session_changes('test-session')
            full_sha = changes[0].entry_id

            # Use first 4 characters of SHA
            partial_sha = full_sha[:4]

            transactions_dir = Path(tmpdir) / '.docimp' / 'transactions'
            found_manifest, found_entry = manager._find_entry_by_id(partial_sha, transactions_dir)

            assert found_entry.entry_id == full_sha

    def test_find_entry_not_found_raises(self):
        """Test that ValueError is raised when entry not found."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manager = TransactionManager(base_path=Path(tmpdir))

            transactions_dir = Path(tmpdir) / '.docimp' / 'transactions'

            try:
                manager._find_entry_by_id('nonexistent-sha', transactions_dir)
                assert False, "Should have raised ValueError"
            except ValueError as e:
                assert "not found" in str(e)
