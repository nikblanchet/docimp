"""
Workflow state manager for bidirectional workflows.

Provides atomic read/write operations for workflow-state.json,
which tracks the execution state of analyze, audit, plan, and improve commands.
"""

import json
from pathlib import Path

from ..models.workflow_state import CommandState, WorkflowState
from ..models.workflow_state_migrations import (
    CURRENT_WORKFLOW_STATE_VERSION,
    apply_migrations,
)
from .state_manager import StateManager


class WorkflowStateManager:
    """
    Manages workflow state persistence for bidirectional workflows.

    Provides atomic read/write operations using temp file + rename pattern.
    """

    @staticmethod
    def _get_workflow_state_file(base_path: Path | None = None) -> Path:
        """Get the path to the workflow state file.

        Args:
            base_path: Base directory for .docimp state files (default: cwd)
        """
        return StateManager.get_state_dir(base_path) / "workflow-state.json"

    @staticmethod
    def save_workflow_state(state: WorkflowState) -> None:
        """
        Save workflow state to disk atomically (temp file + rename pattern).

        Args:
            state: The workflow state to save

        Raises:
            IOError: If file write fails
        """
        file_path = WorkflowStateManager._get_workflow_state_file()
        temp_path = file_path.with_suffix(".json.tmp")

        # Ensure state directory exists
        StateManager.ensure_state_dir()

        # Serialize to JSON
        data = state.to_dict()

        # Write to temp file first
        with temp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        # Atomic rename
        temp_path.replace(file_path)

    @staticmethod
    def load_workflow_state(base_path: Path | None = None) -> WorkflowState:
        """
        Load workflow state from disk with schema validation and migration support.
        Returns empty state if file doesn't exist.

        Args:
            base_path: Base directory for .docimp state files (default: cwd)

        Returns:
            WorkflowState: The loaded or empty workflow state

        Raises:
            ValueError: If JSON is malformed or schema is invalid
        """
        file_path = WorkflowStateManager._get_workflow_state_file(base_path)

        if not file_path.exists():
            return WorkflowState.create_empty()

        try:
            with file_path.open(encoding="utf-8") as f:
                data = json.load(f)

            # Apply migrations if needed (handles legacy files and version upgrades)
            migrated = apply_migrations(data, CURRENT_WORKFLOW_STATE_VERSION)

            return WorkflowState.from_dict(migrated)
        except (json.JSONDecodeError, KeyError) as e:
            raise ValueError(f"Failed to load workflow state: {e}") from e

    @staticmethod
    def update_command_state(
        command: str,
        command_state: CommandState,
        *,
        history_enabled: bool = False,
        history_max_snapshots: int = 50,
        history_max_age_days: int = 30,
    ) -> None:
        """
        Update the state for a specific command.

        Args:
            command: The command name ('analyze', 'audit', 'plan', 'improve')
            command_state: The command state to save
            history_enabled: Enable workflow history tracking (default: False)
            history_max_snapshots: Maximum number of snapshots to keep (default: 50)
            history_max_age_days: Maximum age in days to keep snapshots (default: 30)

        Raises:
            ValueError: If command name is invalid
        """
        valid_commands = {"analyze", "audit", "plan", "improve"}
        if command not in valid_commands:
            raise ValueError(
                f"Invalid command: {command}. Must be one of {valid_commands}"
            )

        state = WorkflowStateManager.load_workflow_state()

        # Update the specific command state
        if command == "analyze":
            state.last_analyze = command_state
        elif command == "audit":
            state.last_audit = command_state
        elif command == "plan":
            state.last_plan = command_state
        elif command == "improve":
            state.last_improve = command_state

        WorkflowStateManager.save_workflow_state(state)

        # Save history snapshot if enabled
        if history_enabled:
            WorkflowStateManager.save_history_snapshot(state)

            # Rotate old snapshots using hybrid strategy
            WorkflowStateManager.rotate_history(
                max_snapshots=history_max_snapshots,
                max_age_days=history_max_age_days,
            )

    @staticmethod
    def get_command_state(command: str) -> CommandState | None:
        """
        Get the state for a specific command.

        Args:
            command: The command name ('analyze', 'audit', 'plan', 'improve')

        Returns:
            CommandState or None if command hasn't been run

        Raises:
            ValueError: If command name is invalid
        """
        valid_commands = {"analyze", "audit", "plan", "improve"}
        if command not in valid_commands:
            raise ValueError(
                f"Invalid command: {command}. Must be one of {valid_commands}"
            )

        state = WorkflowStateManager.load_workflow_state()

        command_map = {
            "analyze": state.last_analyze,
            "audit": state.last_audit,
            "plan": state.last_plan,
            "improve": state.last_improve,
        }

        return command_map.get(command)

    @staticmethod
    def clear_workflow_state() -> None:
        """Delete the workflow state file if it exists."""
        file_path = WorkflowStateManager._get_workflow_state_file()

        if file_path.exists():
            file_path.unlink()

    @staticmethod
    def exists() -> bool:
        """Check if workflow state file exists."""
        return WorkflowStateManager._get_workflow_state_file().exists()

    @staticmethod
    def save_history_snapshot(state: WorkflowState) -> Path:
        """
        Save a timestamped snapshot of workflow state to history directory.
        Uses atomic write pattern (temp + rename) for safety.

        Args:
            state: The workflow state to snapshot

        Returns:
            Path to the created snapshot file

        Raises:
            IOError: If file write fails
        """
        from datetime import UTC, datetime

        # Generate cross-platform safe timestamp (replace : and . with -)
        timestamp = (
            datetime.now(tz=UTC)
            .isoformat()
            .replace(":", "-")
            .replace(".", "-")
        )
        filename = f"workflow-state-{timestamp}.json"
        filepath = StateManager.get_history_dir() / filename
        temp_path = filepath.with_suffix(".json.tmp")

        # Ensure history directory exists
        StateManager.ensure_state_dir()

        # Serialize to JSON
        data = state.to_dict()

        # Write to temp file first
        with temp_path.open("w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

        # Atomic rename
        temp_path.replace(filepath)

        return filepath

    @staticmethod
    def list_history_snapshots() -> list[Path]:
        """
        List all workflow state history snapshots, sorted newest first.

        Returns:
            List of snapshot file paths, sorted by timestamp (newest first)
        """
        history_dir = StateManager.get_history_dir()

        if not history_dir.exists():
            return []

        # Filter for workflow state snapshots only
        snapshots = [
            f
            for f in history_dir.iterdir()
            if f.is_file()
            and f.name.startswith("workflow-state-")
            and f.name.endswith(".json")
        ]

        # Sort by filename (ISO 8601 timestamps are lexicographically sortable)
        # Reverse to get newest first
        return sorted(snapshots, reverse=True)

    @staticmethod
    def rotate_history(max_snapshots: int = 50, max_age_days: int = 30) -> None:
        """
        Rotate workflow history using hybrid strategy:
        - Keep last N snapshots (count limit)
        - Keep snapshots from last M days (time limit)
        - Delete snapshots that violate BOTH limits

        Args:
            max_snapshots: Maximum number of snapshots to keep (default: 50)
            max_age_days: Maximum age in days to keep snapshots (default: 30)
        """
        import time

        snapshots = WorkflowStateManager.list_history_snapshots()

        if not snapshots:
            return  # Nothing to rotate

        # Calculate age threshold (Unix timestamp in seconds)
        now = time.time()
        age_threshold = now - (max_age_days * 24 * 60 * 60)

        to_delete: list[Path] = []

        for i, snapshot in enumerate(snapshots):
            # Get file modification time
            file_age = snapshot.stat().st_mtime

            # Hybrid logic: Delete if BOTH conditions are violated
            violates_count_limit = i >= max_snapshots  # Index-based (0-indexed)
            violates_time_limit = file_age < age_threshold

            if violates_count_limit or violates_time_limit:
                to_delete.append(snapshot)

        # Delete snapshots that violate limits
        for snapshot in to_delete:
            snapshot.unlink()
