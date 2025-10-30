"""Tests for metadata schema versioning in transactions."""

import sys
from pathlib import Path
import tempfile
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from src.writer.transaction_manager import TransactionManager


def test_parse_version_1_metadata():
    """Test parsing commit message with Metadata-Version: 1."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    commit_message = """docimp: Add docs to test_function

Metadata-Version: 1
Metadata:
  item_name: test_function
  item_type: function
  language: python
  filepath: /test/file.py
  backup_path: /test/file.py.bak
  timestamp: 2024-01-01T10:00:00"""

    # Mock git command to return short hash
    with patch('src.utils.git_helper.GitHelper.run_git_command') as mock_git:
        mock_result = Mock()
        mock_result.stdout = 'abc123'
        mock_git.return_value = mock_result

        entry = manager._parse_commit_to_entry('abc123', commit_message)

    assert entry is not None
    assert entry.item_name == 'test_function'
    assert entry.item_type == 'function'
    assert entry.language == 'python'
    assert entry.filepath == '/test/file.py'
    assert entry.entry_id == 'abc123'


def test_parse_version_0_metadata_backward_compat():
    """Test parsing commit message without version (backward compatibility)."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    # Old format without Metadata-Version line
    commit_message = """docimp: Add docs to old_function

Metadata:
  item_name: old_function
  item_type: function
  language: python
  filepath: /test/old.py
  backup_path: /test/old.py.bak
  timestamp: 2024-01-01T10:00:00"""

    with patch('src.utils.git_helper.GitHelper.run_git_command') as mock_git:
        mock_result = Mock()
        mock_result.stdout = 'def456'
        mock_git.return_value = mock_result

        entry = manager._parse_commit_to_entry('def456', commit_message)

    assert entry is not None
    assert entry.item_name == 'old_function'
    assert entry.item_type == 'function'


def test_parse_malformed_version_number():
    """Test handling of malformed Metadata-Version value."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    commit_message = """docimp: Add docs to test_function

Metadata-Version: invalid
Metadata:
  item_name: test_function
  item_type: function
  language: python
  filepath: /test/file.py
  backup_path: /test/file.py.bak
  timestamp: 2024-01-01T10:00:00"""

    with patch('src.utils.git_helper.GitHelper.run_git_command') as mock_git:
        mock_result = Mock()
        mock_result.stdout = 'ghi789'
        mock_git.return_value = mock_result

        # Should still parse (defaults to version 0 on error)
        entry = manager._parse_commit_to_entry('ghi789', commit_message)

    assert entry is not None
    assert entry.item_name == 'test_function'


def test_parse_missing_required_fields_version_1():
    """Test that version 1 requires all fields."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    # Missing 'language' field
    commit_message = """docimp: Add docs to test_function

Metadata-Version: 1
Metadata:
  item_name: test_function
  item_type: function
  filepath: /test/file.py
  backup_path: /test/file.py.bak
  timestamp: 2024-01-01T10:00:00"""

    entry = manager._parse_commit_to_entry('jkl012', commit_message)

    # Should return None due to missing required field in version 1
    assert entry is None


def test_parse_missing_required_fields_version_0_allowed():
    """Test that version 0 (no version) is lenient with missing fields."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    # Missing 'language' field, but no version specified
    commit_message = """docimp: Add docs to old_function

Metadata:
  item_name: old_function
  item_type: function
  filepath: /test/old.py
  backup_path: /test/old.py.bak
  timestamp: 2024-01-01T10:00:00"""

    with patch('src.utils.git_helper.GitHelper.run_git_command') as mock_git:
        mock_result = Mock()
        mock_result.stdout = 'mno345'
        mock_git.return_value = mock_result

        entry = manager._parse_commit_to_entry('mno345', commit_message)

    # Should still parse (backward compatibility)
    assert entry is not None
    assert entry.item_name == 'old_function'
    assert entry.language == ''  # Empty string for missing field


def test_parse_no_metadata_section():
    """Test handling of commit without Metadata section."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    commit_message = """docimp: Add docs to test_function

Some description but no metadata."""

    entry = manager._parse_commit_to_entry('pqr678', commit_message)

    # Should return None (no metadata found)
    assert entry is None


def test_parse_non_docimp_commit():
    """Test that non-docimp commits are skipped."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    commit_message = """Initial commit

Added some files"""

    entry = manager._parse_commit_to_entry('stu901', commit_message)

    # Should return None (not a docimp commit)
    assert entry is None


def test_version_1_all_required_fields_present():
    """Test that version 1 succeeds with all required fields."""
    manager = TransactionManager(base_path=Path(tempfile.mkdtemp()), use_git=False)

    commit_message = """docimp: Add docs to complete_function

Metadata-Version: 1
Metadata:
  item_name: complete_function
  item_type: function
  language: typescript
  filepath: /test/complete.ts
  backup_path: /test/complete.ts.bak
  timestamp: 2024-01-01T10:00:00
  extra_field: some_value"""

    with patch('src.utils.git_helper.GitHelper.run_git_command') as mock_git:
        mock_result = Mock()
        mock_result.stdout = 'vwx234'
        mock_git.return_value = mock_result

        entry = manager._parse_commit_to_entry('vwx234', commit_message)

    # Should parse successfully with all required fields
    assert entry is not None
    assert entry.item_name == 'complete_function'
    assert entry.language == 'typescript'
