"""
Workflow state manager for bidirectional workflows.

Provides atomic read/write operations for workflow-state.json,
which tracks the execution state of analyze, audit, plan, and improve commands.
"""

import json
from pathlib import Path

from ..models.workflow_state import CommandState, WorkflowState
from .state_manager import StateManager


class WorkflowStateManager:
    """
    Manages workflow state persistence for bidirectional workflows.

    Provides atomic read/write operations using temp file + rename pattern.
    """

    @staticmethod
    def _get_workflow_state_file() -> Path:
        """Get the path to the workflow state file."""
        return StateManager.get_state_dir() / "workflow-state.json"

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
    def load_workflow_state() -> WorkflowState:
        """
        Load workflow state from disk with schema validation and migration support.
        Returns empty state if file doesn't exist.

        Returns:
            WorkflowState: The loaded or empty workflow state

        Raises:
            ValueError: If JSON is malformed or schema is invalid
        """
        file_path = WorkflowStateManager._get_workflow_state_file()

        if not file_path.exists():
            return WorkflowState.create_empty()

        try:
            with file_path.open(encoding="utf-8") as f:
                data = json.load(f)

            # Check schema version and migrate if needed
            if data.get("schema_version") != "1.0":
                if data.get("schema_version") is None:
                    # Legacy file without schema_version - migrate to v1.0
                    data["schema_version"] = "1.0"
                else:
                    # Unsupported version - provide helpful error
                    schema_version = data.get("schema_version")
                    msg = (
                        f"Unsupported schema version: {schema_version}.\n"
                        f"Current version is 1.0.\n"
                        f"To fix this, delete {file_path} and re-run 'docimp analyze' "
                        f"to regenerate workflow state."
                    )
                    raise ValueError(msg)

            return WorkflowState.from_dict(data)
        except (json.JSONDecodeError, KeyError) as e:
            raise ValueError(f"Failed to load workflow state: {e}") from e

    @staticmethod
    def update_command_state(command: str, command_state: CommandState) -> None:
        """
        Update the state for a specific command.

        Args:
            command: The command name ('analyze', 'audit', 'plan', 'improve')
            command_state: The command state to save

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
