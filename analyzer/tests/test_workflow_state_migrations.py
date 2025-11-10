"""
Tests for workflow state migration framework.

Covers migration path building, migration application, legacy file handling,
and migration log tracking.
"""

import sys
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from src.models.workflow_state_migrations import (
    CURRENT_WORKFLOW_STATE_VERSION,
    KNOWN_VERSIONS,
    WORKFLOW_STATE_MIGRATIONS,
    apply_migrations,
    build_migration_path,
    is_version_supported,
)


class TestBuildMigrationPath:
    """Tests for build_migration_path function."""

    def test_returns_empty_list_when_versions_equal(self):
        """Test that no migration path is returned when versions are equal."""
        path = build_migration_path("1.0", "1.0")
        assert path == []

    def test_returns_single_step_path(self):
        """Test single-step migration path for adjacent versions."""
        # Mock KNOWN_VERSIONS temporarily
        original_versions = KNOWN_VERSIONS.copy()
        KNOWN_VERSIONS.clear()
        KNOWN_VERSIONS.extend(["1.0", "1.1"])

        # Mock migration registry
        original_migrations = WORKFLOW_STATE_MIGRATIONS.copy()
        WORKFLOW_STATE_MIGRATIONS["1.0->1.1"] = lambda data: data

        try:
            path = build_migration_path("1.0", "1.1")
            assert path == ["1.0->1.1"]
        finally:
            # Restore
            KNOWN_VERSIONS.clear()
            KNOWN_VERSIONS.extend(original_versions)
            WORKFLOW_STATE_MIGRATIONS.clear()
            WORKFLOW_STATE_MIGRATIONS.update(original_migrations)

    def test_returns_multi_step_path(self):
        """Test multi-step migration path for non-adjacent versions."""
        # Mock KNOWN_VERSIONS temporarily
        original_versions = KNOWN_VERSIONS.copy()
        KNOWN_VERSIONS.clear()
        KNOWN_VERSIONS.extend(["1.0", "1.1", "1.2", "1.3"])

        # Mock migration registry
        original_migrations = WORKFLOW_STATE_MIGRATIONS.copy()
        WORKFLOW_STATE_MIGRATIONS["1.0->1.1"] = lambda data: data
        WORKFLOW_STATE_MIGRATIONS["1.1->1.2"] = lambda data: data
        WORKFLOW_STATE_MIGRATIONS["1.2->1.3"] = lambda data: data

        try:
            path = build_migration_path("1.0", "1.3")
            assert path == ["1.0->1.1", "1.1->1.2", "1.2->1.3"]
        finally:
            # Restore
            KNOWN_VERSIONS.clear()
            KNOWN_VERSIONS.extend(original_versions)
            WORKFLOW_STATE_MIGRATIONS.clear()
            WORKFLOW_STATE_MIGRATIONS.update(original_migrations)

    def test_raises_error_for_unknown_source_version(self):
        """Test that ValueError is raised for unknown source version."""
        with pytest.raises(ValueError, match="Unknown source version: 2.0"):
            build_migration_path("2.0", "1.0")

    def test_raises_error_for_unknown_target_version(self):
        """Test that ValueError is raised for unknown target version."""
        with pytest.raises(ValueError, match="Unknown target version: 3.0"):
            build_migration_path("1.0", "3.0")

    def test_raises_error_for_backwards_migration(self):
        """Test that ValueError is raised for backwards migration."""
        # Mock KNOWN_VERSIONS temporarily
        original_versions = KNOWN_VERSIONS.copy()
        KNOWN_VERSIONS.clear()
        KNOWN_VERSIONS.extend(["1.0", "1.1"])

        try:
            error_msg = "Cannot migrate backwards from 1.1 to 1.0"
            with pytest.raises(ValueError, match=error_msg):
                build_migration_path("1.1", "1.0")
        finally:
            # Restore
            KNOWN_VERSIONS.clear()
            KNOWN_VERSIONS.extend(original_versions)


class TestApplyMigrations:
    """Tests for apply_migrations function."""

    def test_returns_data_unchanged_when_at_target_version(self):
        """Test that data is returned unchanged when already at target version."""
        data = {
            "schema_version": "1.0",
            "last_analyze": None,
            "last_audit": None,
            "last_plan": None,
            "last_improve": None,
        }

        result = apply_migrations(data, "1.0")

        assert result == data

    def test_migrates_legacy_file_and_adds_migration_log(self):
        """Test that legacy files are migrated and migration_log is added."""
        data = {
            "last_analyze": None,
            "last_audit": None,
            "last_plan": None,
            "last_improve": None,
        }

        result = apply_migrations(data)

        assert result["schema_version"] == "1.0"
        assert "migration_log" in result
        assert len(result["migration_log"]) == 1
        assert result["migration_log"][0]["from"] == "legacy"
        assert result["migration_log"][0]["to"] == "1.0"
        assert "timestamp" in result["migration_log"][0]

    def test_applies_single_migration_and_updates_log(self):
        """Test that single migration is applied and migration_log is updated."""
        # Mock KNOWN_VERSIONS temporarily
        original_versions = KNOWN_VERSIONS.copy()
        KNOWN_VERSIONS.clear()
        KNOWN_VERSIONS.extend(["1.0", "1.1"])

        # Mock migration function
        original_migrations = WORKFLOW_STATE_MIGRATIONS.copy()

        def mock_migration(data):
            return {
                **data,
                "schema_version": "1.1",
                "new_field": "added",
            }

        WORKFLOW_STATE_MIGRATIONS["1.0->1.1"] = mock_migration

        data = {
            "schema_version": "1.0",
            "migration_log": [],
        }

        try:
            result = apply_migrations(data, "1.1")

            assert result["schema_version"] == "1.1"
            assert result["new_field"] == "added"
            assert len(result["migration_log"]) == 1
            assert result["migration_log"][0]["from"] == "1.0"
            assert result["migration_log"][0]["to"] == "1.1"
        finally:
            # Restore
            KNOWN_VERSIONS.clear()
            KNOWN_VERSIONS.extend(original_versions)
            WORKFLOW_STATE_MIGRATIONS.clear()
            WORKFLOW_STATE_MIGRATIONS.update(original_migrations)

    def test_initializes_migration_log_if_not_present(self):
        """Test that migration_log is initialized if not present."""
        # Mock KNOWN_VERSIONS temporarily
        original_versions = KNOWN_VERSIONS.copy()
        KNOWN_VERSIONS.clear()
        KNOWN_VERSIONS.extend(["1.0", "1.1"])

        # Mock migration function
        original_migrations = WORKFLOW_STATE_MIGRATIONS.copy()

        def mock_migration(data):
            return {
                **data,
                "schema_version": "1.1",
            }

        WORKFLOW_STATE_MIGRATIONS["1.0->1.1"] = mock_migration

        data = {
            "schema_version": "1.0",
            # No migration_log field
        }

        try:
            result = apply_migrations(data, "1.1")

            assert "migration_log" in result
            assert isinstance(result["migration_log"], list)
        finally:
            # Restore
            KNOWN_VERSIONS.clear()
            KNOWN_VERSIONS.extend(original_versions)
            WORKFLOW_STATE_MIGRATIONS.clear()
            WORKFLOW_STATE_MIGRATIONS.update(original_migrations)

    def test_raises_error_when_migration_fails(self):
        """Test that ValueError is raised when migration function fails."""
        # Mock KNOWN_VERSIONS temporarily
        original_versions = KNOWN_VERSIONS.copy()
        KNOWN_VERSIONS.clear()
        KNOWN_VERSIONS.extend(["1.0", "1.1"])

        # Mock migration function that raises
        original_migrations = WORKFLOW_STATE_MIGRATIONS.copy()

        def failing_migration(data):
            raise RuntimeError("Migration failed")

        WORKFLOW_STATE_MIGRATIONS["1.0->1.1"] = failing_migration

        data = {
            "schema_version": "1.0",
            "migration_log": [],
        }

        try:
            with pytest.raises(ValueError, match="Migration failed at step 1.0->1.1"):
                apply_migrations(data, "1.1")
        finally:
            # Restore
            KNOWN_VERSIONS.clear()
            KNOWN_VERSIONS.extend(original_versions)
            WORKFLOW_STATE_MIGRATIONS.clear()
            WORKFLOW_STATE_MIGRATIONS.update(original_migrations)


class TestIsVersionSupported:
    """Tests for is_version_supported function."""

    def test_returns_true_for_known_versions(self):
        """Test that True is returned for known versions."""
        assert is_version_supported("1.0") is True

    def test_returns_true_for_legacy_version(self):
        """Test that True is returned for legacy version."""
        assert is_version_supported("legacy") is True

    def test_returns_false_for_unknown_versions(self):
        """Test that False is returned for unknown versions."""
        assert is_version_supported("2.0") is False
        assert is_version_supported("0.9") is False


class TestConstants:
    """Tests for module constants."""

    def test_current_version_is_1_0(self):
        """Test that CURRENT_WORKFLOW_STATE_VERSION is set to 1.0."""
        assert CURRENT_WORKFLOW_STATE_VERSION == "1.0"
