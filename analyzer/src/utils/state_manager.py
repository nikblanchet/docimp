"""State directory management for docimp working files.

This module provides utilities for managing the .docimp/ state directory
where all working files (audit results, plans, session reports) are stored.
"""

import os
from pathlib import Path
from typing import Optional


class StateManager:
    """Manages the .docimp/ state directory for working files.

    The state directory structure:
        .docimp/
        ├── session-reports/    # Current session data (ephemeral)
        │   ├── audit.json
        │   ├── plan.json
        │   └── analyze-latest.json
        └── history/            # Long-term data (future feature)

    All methods return absolute paths resolved from the current working directory.
    """

    STATE_DIR_NAME = '.docimp'
    SESSION_REPORTS_DIR = 'session-reports'
    HISTORY_DIR = 'history'

    AUDIT_FILE = 'audit.json'
    PLAN_FILE = 'plan.json'
    ANALYZE_FILE = 'analyze-latest.json'

    @classmethod
    def get_state_dir(cls, base_path: Optional[Path] = None) -> Path:
        """Get the absolute path to the .docimp/ state directory.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Absolute path to .docimp/ directory.
        """
        if base_path is None:
            base_path = Path.cwd()
        return (base_path / cls.STATE_DIR_NAME).resolve()

    @classmethod
    def get_session_reports_dir(cls, base_path: Optional[Path] = None) -> Path:
        """Get the absolute path to the session-reports/ directory.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Absolute path to .docimp/session-reports/ directory.
        """
        return cls.get_state_dir(base_path) / cls.SESSION_REPORTS_DIR

    @classmethod
    def get_history_dir(cls, base_path: Optional[Path] = None) -> Path:
        """Get the absolute path to the history/ directory.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Absolute path to .docimp/history/ directory.
        """
        return cls.get_state_dir(base_path) / cls.HISTORY_DIR

    @classmethod
    def get_audit_file(cls, base_path: Optional[Path] = None) -> Path:
        """Get the absolute path to the audit.json file.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Absolute path to .docimp/session-reports/audit.json.
        """
        return cls.get_session_reports_dir(base_path) / cls.AUDIT_FILE

    @classmethod
    def get_plan_file(cls, base_path: Optional[Path] = None) -> Path:
        """Get the absolute path to the plan.json file.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Absolute path to .docimp/session-reports/plan.json.
        """
        return cls.get_session_reports_dir(base_path) / cls.PLAN_FILE

    @classmethod
    def get_analyze_file(cls, base_path: Optional[Path] = None) -> Path:
        """Get the absolute path to the analyze-latest.json file.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Absolute path to .docimp/session-reports/analyze-latest.json.
        """
        return cls.get_session_reports_dir(base_path) / cls.ANALYZE_FILE

    @classmethod
    def ensure_state_dir(cls, base_path: Optional[Path] = None) -> None:
        """Ensure the state directory structure exists, creating it if necessary.

        Creates:
        - .docimp/
        - .docimp/session-reports/
        - .docimp/history/

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.
        """
        state_dir = cls.get_state_dir(base_path)
        session_reports_dir = cls.get_session_reports_dir(base_path)
        history_dir = cls.get_history_dir(base_path)

        # Create directories with exist_ok=True (idempotent)
        state_dir.mkdir(exist_ok=True)
        session_reports_dir.mkdir(exist_ok=True)
        history_dir.mkdir(exist_ok=True)

    @classmethod
    def clear_session_reports(cls, base_path: Optional[Path] = None) -> int:
        """Clear all files in the session-reports/ directory.

        This removes all session files (audit, plan, analyze) to start fresh.
        The session-reports/ directory itself is preserved.
        The history/ directory is NOT touched.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            Number of files removed.
        """
        session_reports_dir = cls.get_session_reports_dir(base_path)

        # Ensure directory exists first
        if not session_reports_dir.exists():
            cls.ensure_state_dir(base_path)
            return 0

        # Remove all files in session-reports/
        files_removed = 0
        for item in session_reports_dir.iterdir():
            if item.is_file():
                item.unlink()
                files_removed += 1

        return files_removed

    @classmethod
    def state_dir_exists(cls, base_path: Optional[Path] = None) -> bool:
        """Check if the state directory exists.

        Args:
            base_path: Base directory to resolve from. If None, uses current working directory.

        Returns:
            True if .docimp/ directory exists, False otherwise.
        """
        return cls.get_state_dir(base_path).exists()

    @classmethod
    def validate_write_permission(cls, file_path: Path) -> None:
        """Validate that we have write permission for the specified file.

        Checks if:
        1. The file exists and is writable, OR
        2. The file doesn't exist but the parent directory is writable

        Args:
            file_path: Path to the file to validate.

        Raises:
            PermissionError: If we don't have write permission with a helpful error message.
        """
        # If file exists, check if it's writable
        if file_path.exists():
            if not os.access(file_path, os.W_OK):
                raise PermissionError(
                    f"Permission denied: Cannot write to {file_path}. "
                    f"The file is read-only or you don't have write access. "
                    f"Please check file permissions and try again."
                )
        else:
            # File doesn't exist, check if parent directory is writable
            parent_dir = file_path.parent
            if not parent_dir.exists():
                raise PermissionError(
                    f"Permission denied: Parent directory {parent_dir} does not exist. "
                    f"Cannot create file {file_path.name}."
                )
            if not os.access(parent_dir, os.W_OK):
                raise PermissionError(
                    f"Permission denied: Cannot write to directory {parent_dir}. "
                    f"You don't have write access to create {file_path.name}. "
                    f"Please check directory permissions and try again."
                )
