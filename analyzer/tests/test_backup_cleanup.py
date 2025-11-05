"""Tests for backup cleanup functionality."""

import sys
from pathlib import Path
import tempfile
import time

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.transaction_manager import TransactionManager, TransactionEntry


def test_find_orphaned_backups_no_backups():
    """Test finding orphaned backups when none exist."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        orphaned = manager.find_orphaned_backups()

        assert orphaned == []


def test_find_orphaned_backups_with_orphan():
    """Test finding orphaned backup files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create an orphaned backup file
        orphan_file = base_path / "test_file.py.bak"
        orphan_file.write_text("backup content")

        orphaned = manager.find_orphaned_backups()

        assert len(orphaned) == 1
        assert orphaned[0] == orphan_file


def test_find_orphaned_backups_tracked_excluded():
    """Test that tracked backups are not marked as orphaned."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create a backup file
        bak_file = base_path / "tracked.py.bak"
        bak_file.write_text("backup content")

        # Create a transaction that references this backup
        manifest = manager.begin_transaction("test-session")
        manifest.entries.append(
            TransactionEntry(
                entry_id="abc123",
                filepath=str(base_path / "tracked.py"),
                backup_path=str(bak_file),
                timestamp="2024-01-01T10:00:00",
                item_name="test_func",
                item_type="function",
                language="python",
                success=True,
            )
        )

        # Save the manifest
        from src.utils.state_manager import StateManager

        StateManager.ensure_state_dir(base_path)
        transactions_dir = (
            StateManager.get_state_dir(base_path) / "session-reports" / "transactions"
        )
        transactions_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = transactions_dir / f"transaction-{manifest.session_id}.json"
        manager.save_manifest(manifest, manifest_path)

        # Check for orphans
        orphaned = manager.find_orphaned_backups()

        # Tracked backup should NOT be in orphaned list
        assert bak_file not in orphaned


def test_find_orphaned_backups_age_filter():
    """Test filtering orphaned backups by age."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create an old backup file
        old_bak = base_path / "old.py.bak"
        old_bak.write_text("old backup")

        # Make it old (modify mtime to 8 days ago)
        old_time = time.time() - (8 * 24 * 3600)  # 8 days ago
        old_bak.touch()
        import os

        os.utime(old_bak, (old_time, old_time))

        # Create a recent backup file
        recent_bak = base_path / "recent.py.bak"
        recent_bak.write_text("recent backup")

        # Find backups older than 7 days
        orphaned = manager.find_orphaned_backups(max_age_days=7)

        # Only old backup should be found
        assert len(orphaned) == 1
        assert orphaned[0] == old_bak


def test_find_orphaned_backups_skips_docimp_dir():
    """Test that backups in .docimp directory are skipped."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create backup in .docimp directory
        docimp_dir = base_path / ".docimp" / "state"
        docimp_dir.mkdir(parents=True)
        docimp_bak = docimp_dir / "state.bak"
        docimp_bak.write_text("docimp backup")

        # Create backup in project root
        project_bak = base_path / "project.py.bak"
        project_bak.write_text("project backup")

        orphaned = manager.find_orphaned_backups()

        # Only project backup should be found
        assert len(orphaned) == 1
        assert orphaned[0] == project_bak


def test_cleanup_orphaned_backups_deletes_files():
    """Test cleanup actually deletes orphaned backups."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create orphaned backups
        bak1 = base_path / "file1.py.bak"
        bak2 = base_path / "file2.py.bak"
        bak1.write_text("backup 1")
        bak2.write_text("backup 2")

        # Make them old (8 days)
        old_time = time.time() - (8 * 24 * 3600)
        import os

        for bak in [bak1, bak2]:
            os.utime(bak, (old_time, old_time))

        # Cleanup
        deleted_count = manager.cleanup_orphaned_backups(max_age_days=7, dry_run=False)

        assert deleted_count == 2
        assert not bak1.exists()
        assert not bak2.exists()


def test_cleanup_orphaned_backups_dry_run():
    """Test cleanup in dry-run mode doesn't delete files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create orphaned backup
        bak = base_path / "file.py.bak"
        bak.write_text("backup content")

        # Make it old
        old_time = time.time() - (8 * 24 * 3600)
        import os

        os.utime(bak, (old_time, old_time))

        # Dry run
        deleted_count = manager.cleanup_orphaned_backups(max_age_days=7, dry_run=True)

        assert deleted_count == 1
        assert bak.exists()  # File still exists in dry-run


def test_cleanup_orphaned_backups_respects_age():
    """Test cleanup respects max_age_days parameter."""
    with tempfile.TemporaryDirectory() as tmpdir:
        base_path = Path(tmpdir)
        manager = TransactionManager(base_path=base_path, use_git=False)

        # Create old and recent backups
        old_bak = base_path / "old.py.bak"
        recent_bak = base_path / "recent.py.bak"
        old_bak.write_text("old")
        recent_bak.write_text("recent")

        # Make one old
        old_time = time.time() - (8 * 24 * 3600)
        import os

        os.utime(old_bak, (old_time, old_time))

        # Cleanup (7 day threshold)
        deleted_count = manager.cleanup_orphaned_backups(max_age_days=7, dry_run=False)

        assert deleted_count == 1
        assert not old_bak.exists()
        assert recent_bak.exists()  # Recent file preserved
