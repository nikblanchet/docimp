"""Tests for FileTracker utility."""

import hashlib
from pathlib import Path

import pytest

from src.utils.file_tracker import FileSnapshot, FileTracker


@pytest.fixture
def temp_files(tmp_path):
    """Create temporary test files."""
    # Create test files with different content
    file1 = tmp_path / "file1.py"
    file1.write_text("def func1():\n    pass\n", encoding="utf-8")

    file2 = tmp_path / "file2.py"
    file2.write_text("def func2():\n    return 42\n", encoding="utf-8")

    file3 = tmp_path / "file3.py"
    file3.write_text("class MyClass:\n    pass\n", encoding="utf-8")

    return {
        "file1": file1,
        "file2": file2,
        "file3": file3,
    }


def test_create_snapshot(temp_files):
    """Test creating file snapshots with checksums and timestamps."""
    filepaths = [str(temp_files["file1"]), str(temp_files["file2"])]

    snapshots = FileTracker.create_snapshot(filepaths)

    assert len(snapshots) == 2
    assert str(temp_files["file1"]) in snapshots
    assert str(temp_files["file2"]) in snapshots

    # Verify snapshot fields
    snapshot1 = snapshots[str(temp_files["file1"])]
    assert isinstance(snapshot1, FileSnapshot)
    assert snapshot1.filepath == str(temp_files["file1"])
    assert snapshot1.timestamp > 0
    assert len(snapshot1.checksum) == 64  # SHA256 hex digest
    assert snapshot1.size > 0


def test_create_snapshot_missing_files(tmp_path):
    """Test creating snapshot with missing files (should skip silently)."""
    file1 = tmp_path / "exists.py"
    file1.write_text("content", encoding="utf-8")

    file2 = tmp_path / "missing.py"  # Doesn't exist

    filepaths = [str(file1), str(file2)]
    snapshots = FileTracker.create_snapshot(filepaths)

    # Only existing file should be in snapshot
    assert len(snapshots) == 1
    assert str(file1) in snapshots
    assert str(file2) not in snapshots


def test_detect_changes_file_modified_content(temp_files):
    """Test detecting file changes when content is modified (checksum differs)."""
    filepaths = [str(temp_files["file1"]), str(temp_files["file2"])]
    snapshot = FileTracker.create_snapshot(filepaths)

    # Modify file1 content
    temp_files["file1"].write_text("def func1_modified():\n    return 1\n", encoding="utf-8")

    changed = FileTracker.detect_changes(snapshot)

    assert len(changed) == 1
    assert str(temp_files["file1"]) in changed
    assert str(temp_files["file2"]) not in changed


def test_detect_changes_file_unchanged(temp_files):
    """Test detecting changes when files are unchanged."""
    filepaths = [str(temp_files["file1"]), str(temp_files["file2"])]
    snapshot = FileTracker.create_snapshot(filepaths)

    # No modifications
    changed = FileTracker.detect_changes(snapshot)

    assert len(changed) == 0


def test_detect_changes_file_deleted(temp_files):
    """Test detecting file deletion."""
    filepaths = [str(temp_files["file1"]), str(temp_files["file2"])]
    snapshot = FileTracker.create_snapshot(filepaths)

    # Delete file1
    temp_files["file1"].unlink()

    changed = FileTracker.detect_changes(snapshot)

    assert len(changed) == 1
    assert str(temp_files["file1"]) in changed


def test_detect_changes_timestamp_only(temp_files):
    """Test that timestamp-only changes (same checksum) are NOT detected."""
    filepaths = [str(temp_files["file1"])]
    snapshot = FileTracker.create_snapshot(filepaths)

    # Touch file (update timestamp without changing content)
    import time
    time.sleep(0.01)  # Ensure timestamp changes
    temp_files["file1"].touch()

    # Verify timestamp changed but checksum same
    new_snapshot = FileTracker.create_snapshot(filepaths)
    old_snapshot = snapshot[str(temp_files["file1"])]
    new = new_snapshot[str(temp_files["file1"])]

    assert new.timestamp != old_snapshot.timestamp  # Timestamp changed
    assert new.checksum == old_snapshot.checksum     # Checksum same

    # Should NOT be detected as changed
    changed = FileTracker.detect_changes(snapshot)
    assert len(changed) == 0


def test_get_changed_items(temp_files):
    """Test filtering items by changed files."""
    # Mock CodeItem objects
    class MockCodeItem:
        def __init__(self, filepath, name):
            self.filepath = filepath
            self.name = name

    items = [
        MockCodeItem(str(temp_files["file1"]), "func1"),
        MockCodeItem(str(temp_files["file2"]), "func2"),
        MockCodeItem(str(temp_files["file3"]), "func3"),
    ]

    changed_files = [str(temp_files["file1"]), str(temp_files["file3"])]

    changed_items = FileTracker.get_changed_items(changed_files, items)

    assert len(changed_items) == 2
    assert changed_items[0].name == "func1"
    assert changed_items[1].name == "func3"


def test_get_changed_items_empty(temp_files):
    """Test filtering items with no changed files."""
    class MockCodeItem:
        def __init__(self, filepath, name):
            self.filepath = filepath
            self.name = name

    items = [
        MockCodeItem(str(temp_files["file1"]), "func1"),
        MockCodeItem(str(temp_files["file2"]), "func2"),
    ]

    changed_files = []  # No changes

    changed_items = FileTracker.get_changed_items(changed_files, items)

    assert len(changed_items) == 0


def test_file_snapshot_to_dict():
    """Test FileSnapshot to_dict serialization."""
    snapshot = FileSnapshot(
        filepath="/path/to/file.py",
        timestamp=1699999999.123,
        checksum="abc123" * 10 + "abcd",  # 64 chars
        size=1024,
    )

    data = snapshot.to_dict()

    assert data == {
        "filepath": "/path/to/file.py",
        "timestamp": 1699999999.123,
        "checksum": "abc123" * 10 + "abcd",
        "size": 1024,
    }


def test_file_snapshot_from_dict():
    """Test FileSnapshot from_dict deserialization."""
    data = {
        "filepath": "/path/to/file.py",
        "timestamp": 1699999999.123,
        "checksum": "abc123" * 10 + "abcd",
        "size": 1024,
    }

    snapshot = FileSnapshot.from_dict(data)

    assert snapshot.filepath == "/path/to/file.py"
    assert snapshot.timestamp == 1699999999.123
    assert snapshot.checksum == "abc123" * 10 + "abcd"
    assert snapshot.size == 1024
