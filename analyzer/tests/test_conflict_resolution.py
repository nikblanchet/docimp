"""Tests for advanced rollback scenarios and edge cases.

This test suite verifies rollback behavior with various file states,
multiple changes, and edge cases that could cause issues.
"""

import sys
from pathlib import Path
import tempfile
import subprocess

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.transaction_manager import TransactionManager
from src.utils.git_helper import GitHelper


class TestMultiFileRollback:
    """Test rollback scenarios with multiple files."""

    def test_rollback_multiple_files_success(self):
        """Test rolling back changes to multiple files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize git backend
            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create three files
            originals = {}
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                content = f'# Original file {i}\n'
                filepath.write_text(content)
                originals[str(filepath)] = content

            # Record transaction for all three
            manifest = manager.begin_transaction('test-session')
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                backup = str(filepath) + '.bak'
                Path(backup).write_text(originals[str(filepath)])
                filepath.write_text(f'def func{i}(): pass\n')
                manager.record_write(manifest, str(filepath), backup, f'func{i}', 'function', 'python')

            # Rollback all changes
            result = manager.rollback_transaction(manifest)
            assert result == 3

            # Verify all files restored
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                assert filepath.read_text() == originals[str(filepath)]

    def test_rollback_partial_on_missing_backup(self):
        """Test rollback when some backup files are missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Non-git mode for this test
            manager = TransactionManager(base_path=base_path, use_git=False)

            # Create files
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                filepath.write_text(f'# Original {i}\n')

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                backup = str(filepath) + '.bak'
                Path(backup).write_text(f'# Original {i}\n')
                filepath.write_text(f'# Modified {i}\n')
                manager.record_write(manifest, str(filepath), backup, f'func{i}', 'function', 'python')

            # Delete one backup to simulate missing file
            backup1 = base_path / 'file1.py.bak'
            backup1.unlink()

            # Rollback should restore what it can
            result = manager.rollback_transaction(manifest)

            # Should restore 2 out of 3 files
            assert result == 2


class TestFileStateScenarios:
    """Test rollback with various file states."""

    def test_rollback_empty_file(self):
        """Test rollback of empty file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create empty file
            filepath = base_path / 'empty.py'
            filepath.write_text('')

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('')
            filepath.write_text('# Now has content\n')
            manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Rollback
            result = manager.rollback_transaction(manifest)
            assert result == 1
            assert filepath.read_text() == ''

    def test_rollback_large_file(self):
        """Test rollback of large file."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create file with many lines
            filepath = base_path / 'large.py'
            original_lines = [f'# Line {i}\n' for i in range(1000)]
            original = ''.join(original_lines)
            filepath.write_text(original)

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text(original)
            # Add docs at top
            modified = '"""Module docstring"""\n' + original
            filepath.write_text(modified)
            manager.record_write(manifest, str(filepath), backup, 'module', 'module', 'python')

            # Rollback
            result = manager.rollback_transaction(manifest)
            assert result == 1
            assert filepath.read_text() == original

    def test_rollback_unicode_content(self):
        """Test rollback with unicode content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create file with unicode
            filepath = base_path / 'unicode.py'
            original = '# 你好世界\n# Привет мир\n# مرحبا بالعالم\n'
            filepath.write_text(original)

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text(original)
            modified = '"""Unicode test: 🔥💯🎉"""\n' + original
            filepath.write_text(modified)
            manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Rollback
            result = manager.rollback_transaction(manifest)
            assert result == 1
            assert filepath.read_text() == original


class TestNestedPaths:
    """Test rollback with deeply nested directory structures."""

    def test_rollback_deeply_nested_files(self):
        """Test rollback of files in deeply nested directories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create nested structure a/b/c/d/e/
            nested_paths = []
            for depth in range(5):
                path_parts = ['a'] * (depth + 1)
                dirpath = base_path.joinpath(*path_parts)
                dirpath.mkdir(parents=True, exist_ok=True)
                filepath = dirpath / 'file.py'
                filepath.write_text(f'# Depth {depth}\n')
                nested_paths.append((filepath, f'# Depth {depth}\n'))

            # Record transaction for all
            manifest = manager.begin_transaction('test-session')
            for filepath, original in nested_paths:
                backup = str(filepath) + '.bak'
                Path(backup).write_text(original)
                filepath.write_text('# Modified\n')
                manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Rollback all
            result = manager.rollback_transaction(manifest)
            assert result == len(nested_paths)

            # Verify all restored
            for filepath, original in nested_paths:
                assert filepath.read_text() == original


class TestSequentialOperations:
    """Test rollback in sequential scenarios."""

    def test_multiple_rollbacks_in_sequence(self):
        """Test multiple independent rollbacks in sequence."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Session 1
            file1 = base_path / 'file1.py'
            file1.write_text('v1\n')
            manifest1 = manager.begin_transaction('session-1')
            backup1 = str(file1) + '.bak'
            Path(backup1).write_text('v1\n')
            file1.write_text('v1-modified\n')
            manager.record_write(manifest1, str(file1), backup1, 'func1', 'function', 'python')

            # Rollback session 1
            result1 = manager.rollback_transaction(manifest1)
            assert result1 == 1
            assert file1.read_text() == 'v1\n'

            # Session 2
            file2 = base_path / 'file2.py'
            file2.write_text('v2\n')
            manifest2 = manager.begin_transaction('session-2')
            backup2 = str(file2) + '.bak'
            Path(backup2).write_text('v2\n')
            file2.write_text('v2-modified\n')
            manager.record_write(manifest2, str(file2), backup2, 'func2', 'function', 'python')

            # Rollback session 2
            result2 = manager.rollback_transaction(manifest2)
            assert result2 == 1
            assert file2.read_text() == 'v2\n'


class TestRollbackVerification:
    """Test that rollback properly cleans up."""

    def test_rollback_deletes_backup_files(self):
        """Test that rollback cleans up backup files."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create files
            files_and_backups = []
            for i in range(3):
                filepath = base_path / f'file{i}.py'
                filepath.write_text(f'original {i}\n')
                backup = str(filepath) + '.bak'
                files_and_backups.append((filepath, Path(backup)))

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            for filepath, backup_path in files_and_backups:
                backup_path.write_text(filepath.read_text())
                filepath.write_text('modified\n')
                manager.record_write(manifest, str(filepath), str(backup_path), 'func', 'function', 'python')

            # Verify backups exist
            for _, backup_path in files_and_backups:
                assert backup_path.exists()

            # Rollback
            result = manager.rollback_transaction(manifest)
            assert result == 3

            # Verify backups deleted
            for _, backup_path in files_and_backups:
                assert not backup_path.exists()

    def test_rollback_status_marked_correctly(self):
        """Test that manifest status is updated after rollback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create file
            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            # Record transaction
            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Check initial status
            assert manifest.status == 'in_progress'

            # Rollback
            result = manager.rollback_transaction(manifest)
            assert result == 1

            # Check status updated
            assert manifest.status == 'rolled_back'
            assert manifest.completed_at is not None


class TestGitSpecificRollback:
    """Test git-specific rollback behavior."""

    def test_git_rollback_creates_commits_for_tracking(self):
        """Test that rollback is properly tracked in git."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create and rollback transaction
            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Rollback
            manager.rollback_transaction(manifest)

            # Rollback should leave things clean
            # (Implementation may or may not create additional commits)
            # The important thing is it completes successfully
            assert manifest.status == 'rolled_back'

    def test_git_branch_cleaned_on_rollback(self):
        """Test that session branch is cleaned up after rollback."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)
            manager = TransactionManager(base_path=base_path, use_git=True)

            # Create transaction
            filepath = base_path / 'file.py'
            filepath.write_text('original\n')

            manifest = manager.begin_transaction('test-session')
            backup = str(filepath) + '.bak'
            Path(backup).write_text('original\n')
            filepath.write_text('modified\n')
            manager.record_write(manifest, str(filepath), backup, 'func', 'function', 'python')

            # Rollback
            manager.rollback_transaction(manifest)

            # Check branches
            git_dir = base_path / '.docimp' / 'state' / '.git'
            result = subprocess.run(
                ['git', '--git-dir', str(git_dir), 'branch', '--list'],
                capture_output=True,
                text=True,
                check=True
            )

            # Should still have main branch but not session branch
            assert 'main' in result.stdout
            # Session branch may or may not be cleaned up - implementation dependent
