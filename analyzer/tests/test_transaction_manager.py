"""Tests for TransactionManager."""

import sys
from pathlib import Path
import tempfile
import time

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.transaction_manager import TransactionManager


def test_begin_transaction_creates_manifest():
    """Test that begin_transaction creates a valid manifest."""
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = TransactionManager(base_path=Path(tmpdir))
        manifest = manager.begin_transaction('test-session-id')

        assert manifest.session_id == 'test-session-id'
        assert manifest.status == 'in_progress'
        assert manifest.entries == []
        assert manifest.started_at is not None
        assert manifest.completed_at is None
        assert manifest.git_commit_sha is None


def test_record_write_adds_entry():
    """Test that record_write adds entry to manifest."""
    manager = TransactionManager()  # No base_path = JSON mode
    manifest = manager.begin_transaction('test-id')

    manager.record_write(
        manifest=manifest,
        filepath='/tmp/test.py',
        backup_path='/tmp/test.py.bak',
        item_name='foo',
        item_type='function',
        language='python'
    )

    assert len(manifest.entries) == 1
    entry = manifest.entries[0]
    assert entry.filepath == '/tmp/test.py'
    assert entry.backup_path == '/tmp/test.py.bak'
    assert entry.item_name == 'foo'
    assert entry.item_type == 'function'
    assert entry.language == 'python'
    assert entry.success is True
    assert entry.timestamp is not None
    assert entry.entry_id is not None  # New field


def test_record_multiple_writes():
    """Test recording multiple file modifications in one transaction."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    # Record three writes
    for i in range(3):
        manager.record_write(
            manifest, f'/tmp/file{i}.py', f'/tmp/file{i}.py.bak',
            f'func{i}', 'function', 'python'
        )

    assert len(manifest.entries) == 3
    assert manifest.entries[0].item_name == 'func0'
    assert manifest.entries[1].item_name == 'func1'
    assert manifest.entries[2].item_name == 'func2'


def test_save_and_load_manifest_roundtrip():
    """Test manifest serialization and deserialization."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')
    manager.record_write(
        manifest, '/tmp/test.py', '/tmp/test.py.bak',
        'foo', 'function', 'python'
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        path = Path(tmpdir) / 'test-manifest.json'
        manager.save_manifest(manifest, path)

        # Verify file was created
        assert path.exists()

        # Load and verify
        loaded = manager.load_manifest(path)
        assert loaded.session_id == 'test-id'
        assert loaded.status == 'in_progress'
        assert len(loaded.entries) == 1
        assert loaded.entries[0].item_name == 'foo'
        assert loaded.entries[0].filepath == '/tmp/test.py'


def test_save_creates_parent_directories():
    """Test that save_manifest creates parent directories if needed."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    with tempfile.TemporaryDirectory() as tmpdir:
        # Path with non-existent subdirectories
        path = Path(tmpdir) / 'subdir1' / 'subdir2' / 'manifest.json'
        manager.save_manifest(manifest, path)

        assert path.exists()
        assert path.parent.exists()


def test_commit_deletes_backups():
    """Test that commit marks manifest and deletes backup files."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create backup files
        backup1 = Path(tmpdir) / 'test1.py.bak'
        backup2 = Path(tmpdir) / 'test2.py.bak'
        backup1.write_text('backup content 1')
        backup2.write_text('backup content 2')

        manager.record_write(
            manifest, f'{tmpdir}/test1.py', str(backup1),
            'foo', 'function', 'python'
        )
        manager.record_write(
            manifest, f'{tmpdir}/test2.py', str(backup2),
            'bar', 'class', 'python'
        )

        assert backup1.exists()
        assert backup2.exists()

        manager.commit_transaction(manifest)

        # Verify manifest updated
        assert manifest.status == 'committed'
        assert manifest.completed_at is not None

        # Verify backups deleted
        assert not backup1.exists()
        assert not backup2.exists()


def test_commit_handles_missing_backups():
    """Test that commit doesn't fail if backup files are already gone."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    # Record write with non-existent backup
    manager.record_write(
        manifest, '/tmp/test.py', '/tmp/nonexistent.bak',
        'foo', 'function', 'python'
    )

    # Should not raise error
    manager.commit_transaction(manifest)
    assert manifest.status == 'committed'


def test_rollback_restores_files():
    """Test that rollback restores files from backups."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create original and backup
        target_file = Path(tmpdir) / 'test.py'
        backup_file = Path(tmpdir) / 'test.py.bak'

        target_file.write_text('modified content')
        backup_file.write_text('original content')

        manager.record_write(
            manifest, str(target_file), str(backup_file),
            'foo', 'function', 'python'
        )

        restored = manager.rollback_transaction(manifest)

        assert restored == 1
        assert manifest.status == 'rolled_back'
        assert manifest.completed_at is not None
        assert target_file.read_text() == 'original content'
        assert not backup_file.exists()


def test_rollback_multiple_files():
    """Test rollback with multiple file modifications."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create three files with backups
        files_data = [
            ('file1.py', 'modified1', 'original1'),
            ('file2.py', 'modified2', 'original2'),
            ('file3.py', 'modified3', 'original3'),
        ]

        for filename, modified, original in files_data:
            target = Path(tmpdir) / filename
            backup = Path(tmpdir) / f'{filename}.bak'
            target.write_text(modified)
            backup.write_text(original)

            manager.record_write(
                manifest, str(target), str(backup),
                f'func_{filename}', 'function', 'python'
            )

        restored = manager.rollback_transaction(manifest)

        assert restored == 3
        assert manifest.status == 'rolled_back'

        # Verify all files restored
        for filename, _, original in files_data:
            target = Path(tmpdir) / filename
            backup = Path(tmpdir) / f'{filename}.bak'
            assert target.read_text() == original
            assert not backup.exists()


def test_rollback_on_committed_raises_error():
    """Test that rollback fails on already-committed transaction."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')
    manifest.status = 'committed'

    try:
        manager.rollback_transaction(manifest)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "Cannot rollback committed" in str(e)
        assert "test-id" in str(e)


def test_rollback_already_rolled_back_raises_error():
    """Test that rollback fails on already-rolled-back transaction."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')
    manifest.status = 'rolled_back'

    try:
        manager.rollback_transaction(manifest)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "already rolled back" in str(e)
        assert "test-id" in str(e)


def test_rollback_skips_missing_backups():
    """Test that rollback continues if some backups are missing."""
    manager = TransactionManager()
    manifest = manager.begin_transaction('test-id')

    with tempfile.TemporaryDirectory() as tmpdir:
        # First file: has backup
        target1 = Path(tmpdir) / 'test1.py'
        backup1 = Path(tmpdir) / 'test1.py.bak'
        target1.write_text('modified1')
        backup1.write_text('original1')
        manager.record_write(
            manifest, str(target1), str(backup1),
            'foo', 'function', 'python'
        )

        # Second file: missing backup
        target2 = Path(tmpdir) / 'test2.py'
        backup2 = Path(tmpdir) / 'test2.py.bak'
        target2.write_text('modified2')
        # Don't create backup2
        manager.record_write(
            manifest, str(target2), str(backup2),
            'bar', 'function', 'python'
        )

        restored = manager.rollback_transaction(manifest)

        # Only one file should be restored
        assert restored == 1
        assert target1.read_text() == 'original1'
        assert target2.read_text() == 'modified2'  # Unchanged


def test_list_uncommitted_filters_correctly():
    """Test that list_uncommitted_transactions only returns in_progress."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        transactions_dir = Path(tmpdir) / 'transactions'
        transactions_dir.mkdir()

        # Create manifests with different statuses
        manifest1 = manager.begin_transaction('session-1')
        manifest1.status = 'in_progress'
        manager.save_manifest(manifest1, transactions_dir / 'transaction-session-1.json')

        manifest2 = manager.begin_transaction('session-2')
        manifest2.status = 'committed'
        manager.save_manifest(manifest2, transactions_dir / 'transaction-session-2.json')

        manifest3 = manager.begin_transaction('session-3')
        manifest3.status = 'rolled_back'
        manager.save_manifest(manifest3, transactions_dir / 'transaction-session-3.json')

        manifest4 = manager.begin_transaction('session-4')
        manifest4.status = 'in_progress'
        manager.save_manifest(manifest4, transactions_dir / 'transaction-session-4.json')

        uncommitted = manager.list_uncommitted_transactions(transactions_dir)

        assert len(uncommitted) == 2
        session_ids = {m.session_id for m in uncommitted}
        assert session_ids == {'session-1', 'session-4'}


def test_list_uncommitted_empty_directory():
    """Test list_uncommitted_transactions when directory doesn't exist."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        nonexistent_dir = Path(tmpdir) / 'nonexistent'
        uncommitted = manager.list_uncommitted_transactions(nonexistent_dir)
        assert uncommitted == []


def test_list_uncommitted_sorted_by_time():
    """Test that uncommitted transactions are sorted newest first."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        transactions_dir = Path(tmpdir) / 'transactions'
        transactions_dir.mkdir()

        # Create manifests with delays to ensure different timestamps
        for i in range(3):
            manifest = manager.begin_transaction(f'session-{i}')
            manager.save_manifest(
                manifest,
                transactions_dir / f'transaction-session-{i}.json'
            )
            time.sleep(0.01)

        uncommitted = manager.list_uncommitted_transactions(transactions_dir)

        # Should be newest first
        assert len(uncommitted) == 3
        assert uncommitted[0].session_id == 'session-2'
        assert uncommitted[1].session_id == 'session-1'
        assert uncommitted[2].session_id == 'session-0'


def test_cleanup_keeps_recent_and_uncommitted():
    """Test cleanup_old_transactions preserves recent and uncommitted."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        transactions_dir = Path(tmpdir) / 'transactions'
        transactions_dir.mkdir()

        # Create 5 committed transactions
        for i in range(5):
            manifest = manager.begin_transaction(f'committed-{i}')
            manifest.status = 'committed'
            manager.save_manifest(
                manifest,
                transactions_dir / f'transaction-committed-{i}.json'
            )
            time.sleep(0.01)

        # Create 2 uncommitted transactions
        for i in range(2):
            manifest = manager.begin_transaction(f'uncommitted-{i}')
            manager.save_manifest(
                manifest,
                transactions_dir / f'transaction-uncommitted-{i}.json'
            )
            time.sleep(0.01)

        # Keep only 3 committed (should delete 2 oldest)
        deleted = manager.cleanup_old_transactions(transactions_dir, keep_count=3)

        assert deleted == 2

        # Verify 5 files remain (3 committed + 2 uncommitted)
        remaining = list(transactions_dir.glob('transaction-*.json'))
        assert len(remaining) == 5

        # Verify uncommitted preserved
        uncommitted = manager.list_uncommitted_transactions(transactions_dir)
        assert len(uncommitted) == 2


def test_cleanup_preserves_all_uncommitted():
    """Test that cleanup never deletes uncommitted transactions."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        transactions_dir = Path(tmpdir) / 'transactions'
        transactions_dir.mkdir()

        # Create 10 uncommitted, 0 committed
        for i in range(10):
            manifest = manager.begin_transaction(f'uncommitted-{i}')
            manager.save_manifest(
                manifest,
                transactions_dir / f'transaction-uncommitted-{i}.json'
            )

        # Try to keep only 2 (but all are uncommitted)
        deleted = manager.cleanup_old_transactions(transactions_dir, keep_count=2)

        # Should delete nothing
        assert deleted == 0

        # All 10 should remain
        remaining = list(transactions_dir.glob('transaction-*.json'))
        assert len(remaining) == 10


def test_cleanup_handles_empty_directory():
    """Test cleanup when transactions directory doesn't exist."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        nonexistent_dir = Path(tmpdir) / 'nonexistent'
        deleted = manager.cleanup_old_transactions(nonexistent_dir, keep_count=10)
        assert deleted == 0


def test_cleanup_with_zero_keep_count():
    """Test cleanup with keep_count=0 deletes all completed transactions."""
    manager = TransactionManager()

    with tempfile.TemporaryDirectory() as tmpdir:
        transactions_dir = Path(tmpdir) / 'transactions'
        transactions_dir.mkdir()

        # Create 3 committed, 1 uncommitted
        for i in range(3):
            manifest = manager.begin_transaction(f'committed-{i}')
            manifest.status = 'committed'
            manager.save_manifest(
                manifest,
                transactions_dir / f'transaction-committed-{i}.json'
            )

        manifest = manager.begin_transaction('uncommitted')
        manager.save_manifest(
            manifest,
            transactions_dir / 'transaction-uncommitted.json'
        )

        # Keep 0 committed
        deleted = manager.cleanup_old_transactions(transactions_dir, keep_count=0)

        assert deleted == 3

        # Only uncommitted should remain
        remaining = list(transactions_dir.glob('transaction-*.json'))
        assert len(remaining) == 1
