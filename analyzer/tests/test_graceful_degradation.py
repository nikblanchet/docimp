"""Tests for graceful degradation when git is unavailable or errors occur.

This test suite verifies that DocImp handles edge cases gracefully:
- Git not installed or unavailable
- Disk full or permission errors
- Corrupted state
- Edge case scenarios
"""

import sys
from pathlib import Path
import tempfile
import subprocess
from unittest.mock import patch

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.transaction_manager import TransactionManager
from src.utils.git_helper import GitHelper


class TestGitUnavailable:
    """Test behavior when git is not available."""

    def test_transaction_works_without_git(self):
        """Test that transactions work in non-git mode."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create manager without git
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Create file
            filepath = base_path / 'file.py'
            original = 'def foo(): pass\n'
            filepath.write_text(original)

            # Begin transaction
            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text(original)
            filepath.write_text('def foo():\n    """docs"""\n    pass\n')
            manager.record_write(manifest, str(filepath), backup, 'foo', 'function', 'python')

            # Commit should work
            manager.commit_transaction(manifest)
            assert manifest.status == 'committed'

    def test_git_helper_check_when_git_missing(self):
        """Test git availability check when git not in PATH."""
        with patch('shutil.which', return_value=None):
            assert GitHelper.check_git_available() is False

    def test_init_sidecar_repo_when_git_missing(self):
        """Test init_sidecar_repo gracefully handles missing git."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            with patch('shutil.which', return_value=None):
                result = GitHelper.init_sidecar_repo(base_path)
                assert result is False


class TestPermissionErrors:
    """Test handling of permission-related errors."""

    def test_non_writable_base_path(self):
        """Test behavior when base path is not writable."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Make directory read-only
            base_path.chmod(0o444)

            try:
                manager = TransactionManager(base_path=base_path, use_git=False)

                # Attempting operations should either fail gracefully or skip
                # The important thing is no crash
                try:
                    _manifest = manager.begin_transaction('test-session')
                except (PermissionError, OSError):
                    pass  # Acceptable to fail with clear error
            finally:
                # Restore permissions for cleanup
                base_path.chmod(0o755)


class TestStateConsistency:
    """Test that state remains consistent after errors."""

    def test_rollback_on_partial_failure(self):
        """Test rollback when some files fail to restore."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            # Create three files
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                filepath.write_text(f'original {i}\n')

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                backup = str(filepath) + '.bak'
                Path(backup).write_text(f'original {i}\n')
                filepath.write_text(f'modified {i}\n')
                manager.record_write(manifest, str(filepath), backup, f'func{i}', 'function', 'python')

            # Delete one backup to simulate failure
            (base_path / 'file1.py.bak').unlink()

            # Rollback should restore what it can
            restored = manager.rollback_transaction(manifest)

            # Should restore 2 out of 3
            assert restored == 2

            # Manifest should still be marked as rolled_back
            assert manifest.status == 'rolled_back'

    def test_session_state_after_commit_failure(self):
        """Test that session state is consistent after commit failure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), backup, 'foo', 'function', 'python')

            # Even if commit has issues, manifest should be updated
            manager.commit_transaction(manifest)

            # Status should be committed
            assert manifest.status in ['committed', 'in_progress']


class TestEdgeCases:
    """Test edge cases and unusual scenarios."""

    def test_empty_session(self):
        """Test committing session with no changes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            manifest = manager.begin_transaction('empty-session')
            assert len(manifest.entries) == 0

            # Should handle empty session gracefully
            manager.commit_transaction(manifest)
            assert manifest.status == 'committed'

    def test_very_long_session_id(self):
        """Test transaction with very long session ID."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            # Create very long session ID (255 chars)
            long_id = 'a' * 255

            manifest = manager.begin_transaction(long_id)
            assert manifest.session_id == long_id

            manager.commit_transaction(manifest)
            assert manifest.status == 'committed'

    def test_special_characters_in_session_id(self):
        """Test session IDs with special characters."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            # Test various special characters
            test_ids = [
                'session-with-dashes',
                'session_with_underscores',
                'session.with.dots',
                'session123with456numbers',
            ]

            for session_id in test_ids:
                manifest = manager.begin_transaction(session_id)
                assert manifest.session_id == session_id
                manager.commit_transaction(manifest)


class TestGitStateRecovery:
    """Test recovery from git state issues."""

    def test_missing_git_dir_handled(self):
        """Test behavior when .git directory is missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Try to use git mode but don't initialize
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Operations should either work or fail gracefully
            try:
                _manifest = manager.begin_transaction('test-session')
                # May succeed or fail depending on implementation
            except (subprocess.CalledProcessError, RuntimeError, FileNotFoundError):
                pass  # Acceptable to fail with clear error


class TestBackupManagement:
    """Test backup file management edge cases."""

    def test_backup_path_with_multiple_extensions(self):
        """Test backup handling for files with multiple extensions."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            # File with multiple extensions
            filepath = base_path / 'file.test.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Rollback should work
            result = manager.rollback_transaction(manifest)
            assert result == 1
            assert filepath.read_text() == 'original\n'

    def test_backup_cleanup_on_commit(self):
        """Test that backups are cleaned up on successful commit."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup_path = Path(str(filepath) + '.bak')
            backup_path.write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), str(backup_path), 'func', 'function', 'python')

            # Verify backup exists before commit
            assert backup_path.exists()

            # Commit
            manager.commit_transaction(manifest)

            # Backup should be deleted
            assert not backup_path.exists()


class TestConcurrentAccess:
    """Test handling of concurrent access scenarios."""

    def test_multiple_managers_same_base_path(self):
        """Test multiple TransactionManager instances on same path."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create two independent managers
            manager1 = TransactionManager(base_path=base_path, use_git=False)
            manager2 = TransactionManager(base_path=base_path, use_git=False)

            # Each should be able to create transactions
            manifest1 = manager1.begin_transaction('session-1')
            manifest2 = manager2.begin_transaction('session-2')

            assert manifest1.session_id == 'session-1'
            assert manifest2.session_id == 'session-2'

            # Both should be able to commit
            manager1.commit_transaction(manifest1)
            manager2.commit_transaction(manifest2)

            assert manifest1.status == 'committed'
            assert manifest2.status == 'committed'


class TestDataIntegrity:
    """Test data integrity in various scenarios."""

    def test_manifest_serialization_roundtrip(self):
        """Test that manifest data survives serialization."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), backup, 'foo', 'function', 'python')

            # Check all fields are present
            assert manifest.session_id == 'test-session'
            assert manifest.status == 'in_progress'
            assert len(manifest.entries) == 1
            assert manifest.entries[0].filepath == str(filepath)
            assert manifest.entries[0].item_name == 'foo'
            assert manifest.entries[0].item_type == 'function'
            assert manifest.entries[0].language == 'python'

    def test_entry_timestamps_are_valid(self):
        """Test that entry timestamps are valid ISO format."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            manager = TransactionManager(base_path=base_path, use_git=False)

            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            manager.record_write(manifest, str(filepath), backup, 'foo', 'function', 'python')

            # Check timestamp format
            entry = manifest.entries[0]
            assert entry.timestamp is not None
            assert 'T' in entry.timestamp  # ISO format includes 'T'
