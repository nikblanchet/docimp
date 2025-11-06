"""Session state manager for audit and improve sessions.

Provides atomic save/load operations for session state with file-based persistence.
"""

import json
from typing import Any

from src.utils.state_manager import StateManager


class SessionStateManager:
    """Manages session state persistence with atomic write operations."""

    @staticmethod
    def save_session_state(state: dict[str, Any], session_type: str) -> str:
        """Save session state to JSON file with atomic write.

        Uses temp file + rename pattern to prevent corruption on crash or interrupt.

        Args:
            state: Session state dictionary (must include 'session_id' field)
            session_type: Type of session ('audit' or 'improve')

        Returns:
            str: Session ID

        Raises:
            ValueError: If session_type is invalid or state missing session_id
            OSError: If file write fails
        """
        if session_type not in {"audit", "improve"}:
            raise ValueError(
                f"Invalid session_type '{session_type}'. Must be 'audit' or 'improve'"
            )

        session_id = state.get("session_id")
        if not session_id:
            raise ValueError("Session state must include 'session_id' field")

        # Ensure session reports directory exists
        StateManager.ensure_state_dir()

        # Determine target file path
        session_reports_dir = StateManager.get_session_reports_dir()
        filename = f"{session_type}-session-{session_id}.json"
        target_path = session_reports_dir / filename

        # Atomic write: write to temp file, then rename
        tmp_path = session_reports_dir / f"{filename}.tmp"
        try:
            # Write to temp file
            with tmp_path.open("w", encoding="utf-8") as f:
                json.dump(state, f, indent=2, ensure_ascii=False)

            # Atomic rename
            tmp_path.rename(target_path)

            return session_id

        except (OSError, json.JSONEncodeError) as error:
            # Clean up temp file if it exists
            if tmp_path.exists():
                tmp_path.unlink(missing_ok=True)
            raise error

    @staticmethod
    def load_session_state(session_id: str, session_type: str) -> dict[str, Any]:
        """Load session state from JSON file with migration support.

        Args:
            session_id: Session ID (UUID string)
            session_type: Type of session ('audit' or 'improve')

        Returns:
            dict: Session state (with schema_version added if missing)

        Raises:
            ValueError: If session_type is invalid
            FileNotFoundError: If session file doesn't exist
            json.JSONDecodeError: If file contains invalid JSON
        """
        if session_type not in {"audit", "improve"}:
            raise ValueError(
                f"Invalid session_type '{session_type}'. Must be 'audit' or 'improve'"
            )

        session_reports_dir = StateManager.get_session_reports_dir()
        filename = f"{session_type}-session-{session_id}.json"
        file_path = session_reports_dir / filename

        if not file_path.exists():
            command_name = session_type
            raise FileNotFoundError(
                f"Session file not found: {filename}.\n"
                f"Use 'docimp list-{command_name}-sessions' to see available sessions "
                f"or start a new session with --new."
            )

        with file_path.open(encoding="utf-8") as f:
            data = json.load(f)

        # Migration logic: Handle older session files without schema_version
        version = data.get("schema_version", "1.0")
        if version == "1.0" and "schema_version" not in data:
            # Current version - ensure schema_version field exists
            data["schema_version"] = "1.0"
        elif version == "2.0":
            # Future migrations would go here:
            #     data = _migrate_v2_to_v3(data)
            pass

        return data

    @staticmethod
    def list_sessions(session_type: str) -> list[dict[str, Any]]:
        """List all sessions of given type, sorted by started_at descending.

        Args:
            session_type: Type of session ('audit' or 'improve')

        Returns:
            list[dict]: List of session state dicts, newest first

        Raises:
            ValueError: If session_type is invalid
        """
        if session_type not in {"audit", "improve"}:
            raise ValueError(
                f"Invalid session_type '{session_type}'. Must be 'audit' or 'improve'"
            )

        session_reports_dir = StateManager.get_session_reports_dir()

        # Ensure directory exists
        if not session_reports_dir.exists():
            return []

        # Find all session files matching pattern
        pattern = f"{session_type}-session-*.json"
        session_files = list(session_reports_dir.glob(pattern))

        # Load and parse all sessions
        sessions: list[dict[str, Any]] = []
        for file_path in session_files:
            try:
                with file_path.open(encoding="utf-8") as f:
                    session = json.load(f)
                    sessions.append(session)
            except (json.JSONDecodeError, OSError):
                # Skip corrupted or unreadable files
                continue

        # Sort by started_at descending (newest first)
        sessions.sort(key=lambda s: s.get("started_at", ""), reverse=True)

        return sessions

    @staticmethod
    def delete_session_state(session_id: str, session_type: str) -> None:
        """Delete session state file.

        Args:
            session_id: Session ID (UUID string)
            session_type: Type of session ('audit' or 'improve')

        Raises:
            ValueError: If session_type is invalid

        Note:
            Does not raise error if file doesn't exist (idempotent operation)
        """
        if session_type not in {"audit", "improve"}:
            raise ValueError(
                f"Invalid session_type '{session_type}'. Must be 'audit' or 'improve'"
            )

        session_reports_dir = StateManager.get_session_reports_dir()
        filename = f"{session_type}-session-{session_id}.json"
        file_path = session_reports_dir / filename

        # Idempotent: no error if file doesn't exist
        if file_path.exists():
            file_path.unlink()

    @staticmethod
    def get_latest_session(session_type: str) -> dict[str, Any] | None:
        """Get the most recent session (by started_at timestamp).

        Args:
            session_type: Type of session ('audit' or 'improve')

        Returns:
            dict or None: Latest session state, or None if no sessions exist

        Raises:
            ValueError: If session_type is invalid
        """
        sessions = SessionStateManager.list_sessions(session_type)
        return sessions[0] if sessions else None
