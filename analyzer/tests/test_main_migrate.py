"""Tests for migrate-workflow-state CLI command."""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import cmd_migrate_workflow_state
from src.utils.state_manager import StateManager


class TestMigrateWorkflowStateCommand:
    """Test suite for migrate-workflow-state CLI command."""

    def test_migrate_workflow_state_success_with_force(self, tmp_path, monkeypatch):
        """Test successful migration with --force flag."""
        # Setup: Create legacy workflow state file
        state_dir = tmp_path / ".docimp"
        state_dir.mkdir()
        workflow_file = state_dir / "workflow-state.json"

        legacy_state = {
            "last_analyze": None,
            "last_audit": None,
            "last_plan": None,
            "last_improve": None,
        }
        workflow_file.write_text(json.dumps(legacy_state), encoding="utf-8")

        # Mock StateManager to use test directory
        with patch.object(StateManager, "get_state_dir", return_value=state_dir):
            # Create args namespace
            import argparse

            args = argparse.Namespace(
                dry_run=False,
                check=False,
                version=None,  # Use default (current version)
                force=True,  # Skip confirmation
                verbose=False,
            )

            # Execute command
            exit_code = cmd_migrate_workflow_state(args)

            # Verify success
            assert exit_code == 0

            # Verify file was migrated
            migrated_data = json.loads(workflow_file.read_text(encoding="utf-8"))
            assert migrated_data["schema_version"] == "1.0"
            assert "migration_log" in migrated_data
            assert len(migrated_data["migration_log"]) == 1
            assert migrated_data["migration_log"][0]["from"] == "legacy"
            assert migrated_data["migration_log"][0]["to"] == "1.0"

    def test_migrate_workflow_state_check_mode_migration_needed(
        self, tmp_path, monkeypatch
    ):
        """Test check mode returns exit code 1 when migration is needed."""
        # Setup: Create legacy workflow state file
        state_dir = tmp_path / ".docimp"
        state_dir.mkdir()
        workflow_file = state_dir / "workflow-state.json"

        legacy_state = {
            "last_analyze": None,
            "last_audit": None,
            "last_plan": None,
            "last_improve": None,
        }
        workflow_file.write_text(json.dumps(legacy_state), encoding="utf-8")

        # Mock StateManager to use test directory
        with patch.object(StateManager, "get_state_dir", return_value=state_dir):
            # Create args namespace
            import argparse

            args = argparse.Namespace(
                dry_run=False,
                check=True,  # Check mode
                version=None,
                force=False,
                verbose=False,
            )

            # Execute command
            exit_code = cmd_migrate_workflow_state(args)

            # Verify exit code 1 (migration needed)
            assert exit_code == 1

            # Verify file was NOT modified
            data = json.loads(workflow_file.read_text(encoding="utf-8"))
            assert "schema_version" not in data  # Still legacy

    def test_migrate_workflow_state_check_mode_no_migration_needed(
        self, tmp_path, monkeypatch
    ):
        """Test check mode returns exit code 0 when no migration needed."""
        # Setup: Create current version workflow state file
        state_dir = tmp_path / ".docimp"
        state_dir.mkdir()
        workflow_file = state_dir / "workflow-state.json"

        current_state = {
            "schema_version": "1.0",
            "migration_log": [],
            "last_analyze": None,
            "last_audit": None,
            "last_plan": None,
            "last_improve": None,
        }
        workflow_file.write_text(json.dumps(current_state), encoding="utf-8")

        # Mock StateManager to use test directory
        with patch.object(StateManager, "get_state_dir", return_value=state_dir):
            # Create args namespace
            import argparse

            args = argparse.Namespace(
                dry_run=False,
                check=True,  # Check mode
                version=None,
                force=False,
                verbose=False,
            )

            # Execute command
            exit_code = cmd_migrate_workflow_state(args)

            # Verify exit code 0 (no migration needed)
            assert exit_code == 0
