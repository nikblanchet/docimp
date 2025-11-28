"""Transaction tracking for rollback capability.

This module provides transaction management for the DocImp improve workflow,
enabling users to rollback documentation changes if needed. Transactions track
all file modifications during an improve session using a side-car git repository
for full rollback capability.

Key components:
- TransactionEntry: Records a single file modification (parsed from git commits)
- TransactionManifest: Tracks all modifications in a session (built from git branch)
- TransactionManager: Manages transaction lifecycle using git backend
"""

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from src.utils.git_helper import GitTimeoutConfig
import json
import shutil
from datetime import UTC, datetime

# Standard short SHA length for git commit display (7 hex chars = 28 bits)
GIT_SHORT_SHA_LENGTH = 7


@dataclass
class TransactionEntry:
    """Record of a single file modification during an improve session.

    Attributes:
        entry_id: Git commit SHA (short hash) or generated ID for JSON fallback
        filepath: Absolute path to the modified file
        backup_path: Path to the backup file (.bak)
        timestamp: ISO format timestamp of when the write occurred
        item_name: Name of the function/class/method that was documented
        item_type: Type of code item ('function', 'class', 'method')
        language: Programming language ('python', 'javascript', 'typescript')
        success: Whether the write operation succeeded
    """

    entry_id: str
    filepath: str
    backup_path: str
    timestamp: str
    item_name: str
    item_type: str
    language: str
    success: bool


@dataclass
class TransactionManifest:
    """Manifest tracking all writes in an improve session.

    The manifest is built from a git branch in the side-car repository at
    .docimp/state/.git. Each improve session corresponds to a git branch
    docimp/session-{session_id}, and each file modification is a git commit.

    When git is unavailable, falls back to JSON storage in
    .docimp/session-reports/transactions/ for graceful degradation.

    Attributes:
        session_id: Unique identifier for this session (UUID) - maps to git branch name
        started_at: ISO timestamp when the session began
        completed_at: ISO timestamp when session ended, None if in progress
        entries: List of file modifications (parsed from git commits)
        status: Current state
            ('in_progress', 'committed', 'rolled_back', 'partial_rollback')
        git_commit_sha: Git commit SHA of the squash commit (None if in_progress)
    """

    session_id: str
    started_at: str
    completed_at: str | None = None
    entries: list[TransactionEntry] = field(default_factory=list)
    status: str = "in_progress"
    git_commit_sha: str | None = None


@dataclass
class RollbackResult:
    """Result of a rollback operation (individual change or multiple changes).

    Attributes:
        success: Whether the rollback operation completed successfully
        restored_count: Number of changes successfully reverted
        failed_count: Number of changes that failed to revert
        conflicts: List of file paths that have merge conflicts
        status: Overall status ('completed', 'partial_rollback', 'failed')
        item_name: Name of the function/class/method that was rolled back
            (None for multiple changes)
        item_type: Type of code item
            ('function', 'class', 'method', None for multiple changes)
        filepath: Path to the file that was modified (None for multiple changes)
    """

    success: bool
    restored_count: int
    failed_count: int
    conflicts: list[str] = field(default_factory=list)
    status: str = "completed"
    item_name: str | None = None
    item_type: str | None = None
    filepath: str | None = None


class TransactionManager:
    """Manages transaction lifecycle using git backend for rollback capability.

    The TransactionManager uses a side-car git repository at .docimp/state/.git
    to track all documentation changes with full git semantics:

    - Sessions = git branches (docimp/session-{uuid})
    - Changes = git commits (one per accepted docstring)
    - Rollback = git revert (individual changes or entire sessions)

    Gracefully degrades to JSON storage when git is unavailable.

    Lifecycle:
    1. Begin: Create git branch for session
    2. Record: Git commit each file modification
    3. Commit: Merge session branch, delete backups
    4. Rollback: Git revert commits to restore files

    Example:
        >>> manager = TransactionManager()
        >>> manifest = manager.begin_transaction('session-uuid-123')
        >>> manager.record_write(
        ...     manifest, '/path/to/file.py', '/path/to/file.py.bak',
        ...     'foo', 'function', 'python'
        ... )
        >>> manager.commit_transaction(manifest)
    """

    def __init__(
        self,
        base_path: Path | None = None,
        use_git: bool = True,
        timeout_config: Optional["GitTimeoutConfig"] = None,
    ):
        """Initialize TransactionManager with optional git support and timeout config.

        Args:
            base_path: Project root directory. If None, disables git
                (for backward compat).
            use_git: Whether to use git backend. Defaults to True.
            timeout_config: Git operation timeout configuration. If None, uses defaults
                          (base=30s, fast_scale=0.167, slow_scale=4.0, max=300s).
        """
        from src.utils.git_helper import GitHelper, GitTimeoutConfig
        from src.utils.state_manager import StateManager

        self.base_path = base_path if base_path else Path.cwd()

        # Store timeout config (use defaults if not provided)
        self.timeout_config = (
            timeout_config if timeout_config is not None else GitTimeoutConfig()
        )

        # Only use git if explicitly requested AND base_path is set AND git is available
        self.git_available = (
            use_git and base_path is not None and GitHelper.check_git_available()
        )

        # Initialize git state if available
        if self.git_available:
            StateManager.ensure_git_state(self.base_path)

    def begin_transaction(self, session_id: str) -> TransactionManifest:
        """Create a new transaction manifest for an improve session.

        Creates a git branch docimp/session-{session_id} in the side-car repository.
        Falls back to JSON-only if git unavailable.

        Parameters:
            session_id: Unique identifier for the session (typically a UUID)

        Returns:
            New TransactionManifest with status 'in_progress'
        """
        if self.git_available:
            from src.utils.git_helper import GitHelper

            # Create git branch for this session
            branch_name = f"docimp/session-{session_id}"
            GitHelper.run_git_command(
                ["checkout", "-b", branch_name],
                self.base_path,
                timeout_config=self.timeout_config,
            )

        return TransactionManifest(
            session_id=session_id, started_at=datetime.now(UTC).isoformat()
        )

    def record_write(
        self,
        manifest: TransactionManifest,
        filepath: str,
        backup_path: str,
        item_name: str,
        item_type: str,
        language: str,
    ) -> None:
        """Add a file modification entry to the transaction manifest.

        Creates a git commit for the file modification. The commit message includes
        metadata about the change for later parsing.

        Parameters:
            manifest: Transaction manifest to update
            filepath: Absolute path to the modified file
            backup_path: Path to the backup file (typically filepath + '.bak')
            item_name: Name of the documented function/class/method
            item_type: Type of code item ('function', 'class', 'method')
            language: Programming language ('python', 'javascript', 'typescript')
        """
        timestamp = datetime.now(UTC).isoformat()
        entry_id = None

        if self.git_available:
            from src.utils.git_helper import GitHelper

            # Convert absolute filepath to relative path for git operations
            try:
                file_path_obj = Path(filepath)
                if file_path_obj.is_absolute():
                    rel_filepath = file_path_obj.relative_to(self.base_path)
                else:
                    rel_filepath = Path(filepath)
            except ValueError:
                # File is outside work-tree, can't use git for this file
                entry_id = f"entry-{len(manifest.entries)}"
            else:
                # Git add the modified file (using relative path)
                GitHelper.run_git_command(
                    ["add", str(rel_filepath)],
                    self.base_path,
                    timeout_config=self.timeout_config,
                )

                # Create commit with metadata in message (version 1 schema)
                commit_msg = f"""docimp: Add docs to {item_name}

Metadata-Version: 1
Metadata:
  item_name: {item_name}
  item_type: {item_type}
  language: {language}
  filepath: {filepath}
  backup_path: {backup_path}
  timestamp: {timestamp}"""

                GitHelper.run_git_command(
                    ["commit", "-m", commit_msg],
                    self.base_path,
                    timeout_config=self.timeout_config,
                )

                # Get the commit SHA (short hash)
                result = GitHelper.run_git_command(
                    ["rev-parse", "--short", "HEAD"],
                    self.base_path,
                    timeout_config=self.timeout_config,
                )
                entry_id = result.stdout.strip()
        else:
            # Fallback: generate simple ID
            entry_id = f"entry-{len(manifest.entries)}"

        entry = TransactionEntry(
            entry_id=entry_id,
            filepath=filepath,
            backup_path=backup_path,
            timestamp=timestamp,
            item_name=item_name,
            item_type=item_type,
            language=language,
            success=True,
        )
        manifest.entries.append(entry)

    def commit_transaction(self, manifest: TransactionManifest) -> None:
        """Mark transaction as committed and delete all backup files.

        Merges the session git branch into main with --squash, creating a single
        squash commit for the entire session. Deletes backup files.

        Parameters:
            manifest: Transaction manifest to commit
        """
        manifest.status = "committed"
        manifest.completed_at = datetime.now(UTC).isoformat()

        if self.git_available:
            from src.utils.git_helper import GitHelper

            branch_name = f"docimp/session-{manifest.session_id}"

            # Checkout main branch
            GitHelper.run_git_command(
                ["checkout", "main"], self.base_path, timeout_config=self.timeout_config
            )

            # Merge session branch with squash
            GitHelper.run_git_command(
                ["merge", "--squash", branch_name],
                self.base_path,
                check=False,  # May fail if no changes
                timeout_config=self.timeout_config,
            )

            # Create squash commit
            squash_msg = f"docimp session {manifest.session_id} (squash)"
            result = GitHelper.run_git_command(
                ["commit", "-m", squash_msg],
                self.base_path,
                check=False,  # May fail if nothing to commit
                timeout_config=self.timeout_config,
            )

            # Get squash commit SHA if successful
            if result.returncode == 0:
                sha_result = GitHelper.run_git_command(
                    ["rev-parse", "--short", "HEAD"],
                    self.base_path,
                    timeout_config=self.timeout_config,
                )
                manifest.git_commit_sha = sha_result.stdout.strip()

        # Delete all backup files
        for entry in manifest.entries:
            backup = Path(entry.backup_path)
            if backup.exists():
                backup.unlink()

    def rollback_transaction(self, manifest: TransactionManifest) -> int:
        """Restore all files from backups and mark transaction as rolled back.

        This undoes all documentation changes made during the improve session
        by restoring files from their backup copies. Backup files are deleted
        after restoration.

        Parameters:
            manifest: Transaction manifest to rollback

        Returns:
            Number of files successfully restored

        Raises:
            ValueError: If transaction is already committed or rolled back
        """
        if manifest.status == "committed":
            raise ValueError(
                f"Cannot rollback committed transaction {manifest.session_id}"
            )
        if manifest.status == "rolled_back":
            raise ValueError(f"Transaction {manifest.session_id} already rolled back")

        restored_count = 0
        for entry in manifest.entries:
            backup = Path(entry.backup_path)
            target = Path(entry.filepath)

            if backup.exists():
                shutil.copy2(backup, target)
                backup.unlink()
                restored_count += 1

        manifest.status = "rolled_back"
        manifest.completed_at = datetime.now(UTC).isoformat()
        return restored_count

    def save_manifest(self, manifest: TransactionManifest, path: Path) -> None:
        """Serialize transaction manifest to JSON file.

        The manifest is saved as a JSON file in .docimp/session-reports/transactions/
        with the filename transaction-{session_id}.json.

        Parameters:
            manifest: Transaction manifest to serialize
            path: Path where manifest should be saved (including filename)
        """
        path.parent.mkdir(parents=True, exist_ok=True)

        # Convert manifest to dict, handling TransactionEntry objects
        manifest_dict = asdict(manifest)

        with path.open("w") as f:
            json.dump(manifest_dict, f, indent=2)

    def load_manifest(self, path: Path) -> TransactionManifest:
        """Deserialize transaction manifest from JSON file.

        Parameters:
            path: Path to the manifest JSON file

        Returns:
            Reconstructed TransactionManifest object

        Raises:
            FileNotFoundError: If manifest file doesn't exist
            json.JSONDecodeError: If manifest file is invalid JSON
        """
        with path.open() as f:
            data = json.load(f)

        # Reconstruct TransactionEntry objects from dicts
        if "entries" in data and data["entries"]:
            data["entries"] = [TransactionEntry(**e) for e in data["entries"]]

        return TransactionManifest(**data)

    def list_uncommitted_transactions(
        self, transactions_dir: Path
    ) -> list[TransactionManifest]:
        """List all uncommitted transaction manifests.

        Returns only transactions with status 'in_progress', sorted by
        modification time (newest first). Committed and rolled back transactions
        are filtered out.

        Parameters:
            transactions_dir: Path to .docimp/session-reports/transactions/

        Returns:
            List of uncommitted TransactionManifest objects
        """
        if not transactions_dir.exists():
            return []

        uncommitted = []
        for manifest_file in sorted(
            transactions_dir.glob("transaction-*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        ):
            manifest = self.load_manifest(manifest_file)
            if manifest.status == "in_progress":
                uncommitted.append(manifest)

        return uncommitted

    def cleanup_old_transactions(self, transactions_dir: Path, keep_count: int) -> int:
        """Delete old committed/rolled_back manifests beyond retention limit.

        This maintains a clean transactions directory by deleting old manifest files
        while preserving:
        - All uncommitted (in_progress) transactions (always kept for rollback)
        - The most recent N committed/rolled_back transactions (based on keep_count)

        Parameters:
            transactions_dir: Path to .docimp/session-reports/transactions/
            keep_count: Number of recent committed/rolled_back manifests to keep

        Returns:
            Number of manifest files deleted
        """
        if not transactions_dir.exists():
            return 0

        # Get all manifests sorted by modification time (newest first)
        all_manifests = sorted(
            transactions_dir.glob("transaction-*.json"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )

        # Separate uncommitted (always keep) from committed/rolled_back
        uncommitted_files = []
        completed_files = []

        for manifest_file in all_manifests:
            manifest = self.load_manifest(manifest_file)
            if manifest.status == "in_progress":
                uncommitted_files.append(manifest_file)
            else:
                completed_files.append(manifest_file)

        # Keep most recent N from completed transactions
        files_to_delete = completed_files[keep_count:]

        deleted_count = 0
        for manifest_file in files_to_delete:
            manifest_file.unlink()
            deleted_count += 1

        return deleted_count

    def list_session_changes(self, session_id: str) -> list[TransactionEntry]:
        """List all commits in a session branch.

        Parses the git log for the session branch and extracts TransactionEntry
        objects from each commit's metadata.

        Parameters:
            session_id: Session ID to list changes for

        Returns:
            List of TransactionEntry objects, one per commit

        Raises:
            ValueError: If git unavailable or session branch doesn't exist
        """
        if not self.git_available:
            raise ValueError("Git backend not available - cannot list session changes")

        from src.utils.git_helper import GitHelper

        branch_name = f"docimp/session-{session_id}"

        # Check if branch exists
        result = GitHelper.run_git_command(
            ["rev-parse", "--verify", branch_name],
            self.base_path,
            check=False,
            timeout_config=self.timeout_config,
        )
        if result.returncode != 0:
            raise ValueError(f"Session branch {branch_name} does not exist")

        # Get commit SHAs in the session branch
        result = GitHelper.run_git_command(
            ["log", branch_name, "--format=%H", "--reverse"],
            self.base_path,
            timeout_config=self.timeout_config,
        )

        commit_shas = result.stdout.strip().split("\n") if result.stdout.strip() else []
        entries = []

        for commit_sha in commit_shas:
            # Get commit message with metadata
            msg_result = GitHelper.run_git_command(
                ["log", "-1", "--format=%B", commit_sha],
                self.base_path,
                timeout_config=self.timeout_config,
            )

            # Parse metadata from commit message
            entry = self._parse_commit_to_entry(commit_sha, msg_result.stdout)
            if entry:
                entries.append(entry)

        return entries

    def _parse_commit_to_entry(
        self, commit_sha: str, commit_message: str
    ) -> TransactionEntry | None:
        """Parse a git commit message to extract TransactionEntry.

        Supports schema versioning with backward compatibility:
        - Version 1: Has "Metadata-Version: 1" line (current)
        - Version 0: No version line (backward compat for old commits)

        Parameters:
            commit_sha: Git commit SHA
            commit_message: Full commit message with metadata

        Returns:
            TransactionEntry object or None if not a docimp commit or malformed metadata
        """
        import logging

        logger = logging.getLogger(__name__)

        lines = commit_message.strip().split("\n")

        # Skip non-docimp commits (like initial commit)
        if not lines or not lines[0].startswith("docimp:"):
            return None

        # Parse metadata version (default to 0 for backward compatibility)
        metadata_version = 0
        for line in lines:
            if line.startswith("Metadata-Version:"):
                try:
                    metadata_version = int(line.split(":", 1)[1].strip())
                except (ValueError, IndexError):
                    logger.warning(
                        f"Malformed Metadata-Version in commit "
                        f"{commit_sha[:GIT_SHORT_SHA_LENGTH]}, defaulting to 0"
                    )

        # Extract metadata section
        metadata = {}
        in_metadata = False

        for line in lines:
            if line.strip() == "Metadata:":
                in_metadata = True
                continue

            if in_metadata and ":" in line:
                key, value = line.split(":", 1)
                metadata[key.strip()] = value.strip()

        # Build TransactionEntry from metadata
        if not metadata:
            logger.warning(f"No metadata found in commit {commit_sha[:GIT_SHORT_SHA_LENGTH]}, skipping")
            return None

        # Validate required fields (for version 1+)
        required_fields = ["item_name", "item_type", "language", "filepath"]
        missing_fields = [field for field in required_fields if field not in metadata]

        if metadata_version >= 1 and missing_fields:
            logger.warning(
                f"Commit {commit_sha[:GIT_SHORT_SHA_LENGTH]} missing required fields: {missing_fields}. "
                f"Skipping entry."
            )
            return None

        # Get short hash
        from src.utils.git_helper import GitHelper

        short_result = GitHelper.run_git_command(
            ["rev-parse", "--short", commit_sha],
            self.base_path,
            timeout_config=self.timeout_config,
        )
        entry_id = short_result.stdout.strip()

        return TransactionEntry(
            entry_id=entry_id,
            filepath=metadata.get("filepath", ""),
            backup_path=metadata.get("backup_path", ""),
            timestamp=metadata.get("timestamp", ""),
            item_name=metadata.get("item_name", ""),
            item_type=metadata.get("item_type", ""),
            language=metadata.get("language", ""),
            success=True,
        )

    def _find_entry_by_id(
        self, entry_id: str, transactions_dir: Path
    ) -> tuple[TransactionManifest, TransactionEntry]:
        """Find a transaction entry across all sessions by its entry ID.

        Searches through all transaction manifests (committed and in-progress)
        to find the session and entry matching the given entry_id.

        Falls back to searching git branches directly if manifest files don't exist
        (common in tests or when manifests haven't been persisted yet).

        Parameters:
            entry_id: Git commit SHA (short or full) or entry ID to find
            transactions_dir: Path to .docimp/session-reports/transactions/

        Returns:
            Tuple of (TransactionManifest, TransactionEntry) for the matching entry

        Raises:
            ValueError: If entry_id not found in any session
        """
        from src.utils.git_helper import GitHelper

        # First try: Search manifest JSON files (production path)
        if transactions_dir.exists():
            for manifest_file in transactions_dir.glob("transaction-*.json"):
                manifest = self.load_manifest(manifest_file)

                # Check entries in this manifest
                for entry in manifest.entries:
                    # Match on full or partial entry_id (git allows short SHAs)
                    if entry.entry_id == entry_id or entry.entry_id.startswith(
                        entry_id
                    ):
                        return manifest, entry

        # Second try: Search git branches directly (test/fallback path)
        if self.git_available:
            # Get all session branches
            branches_result = GitHelper.run_git_command(
                ["branch", "--list", "docimp/session-*"],
                self.base_path,
                check=False,
                timeout_config=self.timeout_config,
            )

            if branches_result.returncode == 0:
                branch_lines = branches_result.stdout.strip().split("\n")
                for branch_line in branch_lines:
                    # Remove leading * and whitespace
                    branch_name = branch_line.strip().lstrip("* ")
                    if not branch_name:
                        continue

                    # Extract session_id from branch name
                    if branch_name.startswith("docimp/session-"):
                        session_id = branch_name.replace("docimp/session-", "")

                        try:
                            # Get all entries from this session
                            entries = self.list_session_changes(session_id)

                            # Search for matching entry
                            for entry in entries:
                                if (
                                    entry.entry_id == entry_id
                                    or entry.entry_id.startswith(entry_id)
                                ):
                                    # Determine status: check if there's a
                                    # squash commit on main
                                    # A committed session has a squash commit
                                    # on main
                                    check_main = GitHelper.run_git_command(
                                        [
                                            "log",
                                            "--oneline",
                                            "--grep",
                                            f"docimp session {session_id} (squash)",
                                            "main",
                                        ],
                                        self.base_path,
                                        check=False,
                                        timeout_config=self.timeout_config,
                                    )

                                    status = (
                                        "committed"
                                        if check_main.returncode == 0
                                        and check_main.stdout.strip()
                                        else "in_progress"
                                    )

                                    # Build a minimal manifest
                                    manifest = TransactionManifest(
                                        session_id=session_id,
                                        started_at=datetime.now(UTC).isoformat(),
                                        entries=entries,
                                        status=status,
                                    )
                                    return manifest, entry
                        except ValueError:
                            # Branch might not have valid commits yet
                            continue

        raise ValueError(f"Entry {entry_id} not found in any session")

    def rollback_change(self, entry_id: str) -> RollbackResult:
        """Rollback a single change by reverting its git commit.

        For changes from committed (squashed) sessions, uses re-squash strategy.
        For changes from in-progress sessions, reverts directly on current branch.

        Parameters:
            entry_id: Git commit SHA (short or full) to revert

        Returns:
            RollbackResult with success status and conflict information

        Raises:
            ValueError: If git unavailable or entry not found
        """
        if not self.git_available:
            raise ValueError("Git backend not available - cannot rollback changes")

        from src.utils.state_manager import StateManager

        # Find which session this entry belongs to
        transactions_dir = StateManager.get_state_dir() / "transactions"
        try:
            manifest, entry = self._find_entry_by_id(entry_id, transactions_dir)
        except ValueError as e:
            raise ValueError(f"Cannot rollback: {str(e)}")

        # Route to appropriate rollback strategy
        if manifest.status == "committed":
            return self._rollback_from_committed_session(manifest, entry, entry_id)
        else:
            return self._rollback_from_in_progress_session(manifest, entry, entry_id)

    def _rollback_from_committed_session(
        self, manifest: "TransactionManifest", entry: "TransactionEntry", entry_id: str
    ) -> RollbackResult:
        """Handle re-squash strategy for committed sessions.

        This performs a complex re-squash workflow:
        1. Checkout session branch
        2. Revert specific commit on branch
        3. Reset main to before previous squash
        4. Re-squash session branch (now with revert)
        5. Update manifest

        Parameters:
            manifest: Session manifest containing the entry
            entry: Transaction entry to rollback
            entry_id: Git commit SHA to revert

        Returns:
            RollbackResult with success status and conflict information

        Raises:
            ValueError: If session branch not found or rollback fails
        """
        from src.utils.git_helper import GitHelper

        session_branch = f"docimp/session-{manifest.session_id}"

        # Verify session branch exists
        branch_check = GitHelper.run_git_command(
            ["rev-parse", "--verify", session_branch],
            self.base_path,
            check=False,
            timeout_config=self.timeout_config,
        )

        if branch_check.returncode != 0:
            raise ValueError(
                f"Session branch {session_branch} not found. "
                "Cannot rollback individual change from squashed session."
            )

        # Save current branch to restore later
        current_branch_result = GitHelper.run_git_command(
            ["rev-parse", "--abbrev-ref", "HEAD"],
            self.base_path,
            timeout_config=self.timeout_config,
        )
        original_branch = current_branch_result.stdout.strip()

        try:
            # Checkout session branch
            GitHelper.run_git_command(
                ["checkout", session_branch],
                self.base_path,
                timeout_config=self.timeout_config,
            )

            # Verify we're on the session branch
            current_check = GitHelper.run_git_command(
                ["rev-parse", "--abbrev-ref", "HEAD"],
                self.base_path,
                timeout_config=self.timeout_config,
            )
            if session_branch not in current_check.stdout:
                raise ValueError(f"Failed to checkout session branch {session_branch}")

            # Revert the specific commit
            revert_result = GitHelper.run_git_command(
                ["revert", "--no-commit", entry_id],
                self.base_path,
                check=False,
                timeout_config=self.timeout_config,
            )

            # Check for conflicts
            if revert_result.returncode != 0:
                conflicts = self._detect_conflicts()
                if conflicts:
                    # Abort the revert
                    GitHelper.run_git_command(
                        ["revert", "--abort"],
                        self.base_path,
                        check=False,
                        timeout_config=self.timeout_config,
                    )
                    # Restore original branch
                    GitHelper.run_git_command(
                        ["checkout", original_branch],
                        self.base_path,
                        check=False,
                        timeout_config=self.timeout_config,
                    )
                    return RollbackResult(
                        success=False,
                        restored_count=0,
                        failed_count=1,
                        conflicts=conflicts,
                        status="failed",
                        item_name=entry.item_name,
                        item_type=entry.item_type,
                        filepath=entry.filepath,
                    )

            # Commit the revert on session branch
            commit_revert_result = GitHelper.run_git_command(
                ["commit", "-m", f"Revert change {entry_id}"],
                self.base_path,
                check=False,
                timeout_config=self.timeout_config,
            )

            # If commit failed, check why
            if commit_revert_result.returncode != 0:
                # Check if there are conflicts (unmerged files)
                conflicts = self._detect_conflicts()

                if conflicts:
                    # Conflicts detected - abort the revert and restore branch
                    GitHelper.run_git_command(
                        ["revert", "--abort"],
                        self.base_path,
                        check=False,
                        timeout_config=self.timeout_config,
                    )
                    # Restore original branch
                    GitHelper.run_git_command(
                        ["checkout", original_branch],
                        self.base_path,
                        check=False,
                        timeout_config=self.timeout_config,
                    )
                    return RollbackResult(
                        success=False,
                        restored_count=0,
                        failed_count=1,
                        conflicts=conflicts,
                        status="failed",
                        item_name=entry.item_name,
                        item_type=entry.item_type,
                        filepath=entry.filepath,
                    )

                # Check if there are no changes to commit
                status_check = GitHelper.run_git_command(
                    ["status", "--short"],
                    self.base_path,
                    timeout_config=self.timeout_config,
                )
                if not status_check.stdout.strip():
                    # No changes - revert was a no-op, which is okay
                    pass
                else:
                    # Some other error - raise it
                    raise ValueError(
                        f"Failed to commit revert on session branch: "
                        f"{commit_revert_result.stderr}"
                    )

            # Checkout main
            GitHelper.run_git_command(
                ["checkout", "main"], self.base_path, timeout_config=self.timeout_config
            )

            # Find the previous squash commit (parent of current HEAD)
            parent_result = GitHelper.run_git_command(
                ["rev-parse", "HEAD^"],
                self.base_path,
                timeout_config=self.timeout_config,
            )
            parent_sha = parent_result.stdout.strip()

            # Reset main to before previous squash
            GitHelper.run_git_command(
                ["reset", "--hard", parent_sha],
                self.base_path,
                timeout_config=self.timeout_config,
            )

            # Re-squash merge session branch (now with reverted commit)
            GitHelper.run_git_command(
                ["merge", "--squash", session_branch],
                self.base_path,
                check=False,
                timeout_config=self.timeout_config,
            )

            # Create new squash commit (only if there are changes to commit)
            squash_msg = (
                f"docimp session {manifest.session_id} "
                f"(squash, change {entry_id} reverted)"
            )
            commit_result = GitHelper.run_git_command(
                ["commit", "-m", squash_msg],
                self.base_path,
                check=False,
                timeout_config=self.timeout_config,
            )

            # If commit failed, it might be because there were no changes
            # This is okay - it means the revert had no net effect
            if commit_result.returncode != 0:
                # Restore to the previous state
                GitHelper.run_git_command(
                    ["reset", "--hard", "HEAD"],
                    self.base_path,
                    check=False,
                    timeout_config=self.timeout_config,
                )

            # Update manifest to track reverted change
            # TODO: Add reverted tracking to manifest entries in future enhancement
            # For now, the revert is recorded as a git commit on the session branch

            return RollbackResult(
                success=True,
                restored_count=1,
                failed_count=0,
                conflicts=[],
                status="completed",
                item_name=entry.item_name,
                item_type=entry.item_type,
                filepath=entry.filepath,
            )

        except Exception as e:
            # Restore original branch on any error
            GitHelper.run_git_command(
                ["checkout", original_branch],
                self.base_path,
                check=False,
                timeout_config=self.timeout_config,
            )
            raise ValueError(f"Failed to rollback change: {str(e)}")

    def _rollback_from_in_progress_session(
        self, manifest: "TransactionManifest", entry: "TransactionEntry", entry_id: str
    ) -> RollbackResult:
        """Handle simple revert for in-progress sessions.

        Reverts the commit directly on the current branch.

        Parameters:
            manifest: Session manifest containing the entry
            entry: Transaction entry to rollback
            entry_id: Git commit SHA to revert

        Returns:
            RollbackResult with success status and conflict information
        """
        from src.utils.git_helper import GitHelper

        # Attempt git revert
        result = GitHelper.run_git_command(
            ["revert", "--no-commit", entry_id],
            self.base_path,
            check=False,
            timeout_config=self.timeout_config,
        )

        # Check for conflicts
        if result.returncode != 0:
            conflicts = self._detect_conflicts()

            if conflicts:
                # Abort the revert to leave working tree clean
                GitHelper.run_git_command(
                    ["revert", "--abort"],
                    self.base_path,
                    check=False,
                    timeout_config=self.timeout_config,
                )

                return RollbackResult(
                    success=False,
                    restored_count=0,
                    failed_count=1,
                    conflicts=conflicts,
                    status="failed",
                    item_name=entry.item_name,
                    item_type=entry.item_type,
                    filepath=entry.filepath,
                )
            else:
                # Non-conflict error
                return RollbackResult(
                    success=False,
                    restored_count=0,
                    failed_count=1,
                    conflicts=[],
                    status="failed",
                    item_name=entry.item_name,
                    item_type=entry.item_type,
                    filepath=entry.filepath,
                )

        # Commit the revert
        GitHelper.run_git_command(
            ["commit", "-m", f"Revert change {entry_id}"],
            self.base_path,
            timeout_config=self.timeout_config,
        )

        return RollbackResult(
            success=True,
            restored_count=1,
            failed_count=0,
            conflicts=[],
            status="completed",
            item_name=entry.item_name,
            item_type=entry.item_type,
            filepath=entry.filepath,
        )

    def _detect_conflicts(self) -> list[str]:
        """Detect merge conflicts in the working tree.

        Checks for all git conflict status codes:
        - UU: both modified
        - AA: both added
        - DD: both deleted
        - AU: added by us
        - UA: added by them
        - DU: deleted by us
        - UD: deleted by them

        Returns:
            List of file paths with conflicts
        """
        from src.utils.git_helper import GitHelper

        status_result = GitHelper.run_git_command(
            ["status", "--short"], self.base_path, timeout_config=self.timeout_config
        )

        # All conflict markers in git status --short
        conflict_markers = ["UU ", "AA ", "DD ", "AU ", "UA ", "DU ", "UD "]

        conflicts = []
        for line in status_result.stdout.split("\n"):
            for marker in conflict_markers:
                if line.startswith(marker):
                    # Conflict detected
                    filepath = line[3:].strip()
                    conflicts.append(filepath)
                    break

        return conflicts

    def rollback_multiple(self, entry_ids: list[str]) -> RollbackResult:
        """Rollback multiple changes by reverting their git commits.

        Parameters:
            entry_ids: List of git commit SHAs to revert

        Returns:
            RollbackResult with aggregate success status

        Raises:
            ValueError: If git unavailable
        """
        if not self.git_available:
            raise ValueError("Git backend not available - cannot rollback changes")

        total_restored = 0
        total_failed = 0
        all_conflicts = []

        for entry_id in entry_ids:
            result = self.rollback_change(entry_id)
            total_restored += result.restored_count
            total_failed += result.failed_count
            all_conflicts.extend(result.conflicts)

        # Determine overall status
        if total_failed == 0:
            status = "completed"
            success = True
        elif total_restored > 0:
            status = "partial_rollback"
            success = False
        else:
            status = "failed"
            success = False

        return RollbackResult(
            success=success,
            restored_count=total_restored,
            failed_count=total_failed,
            conflicts=all_conflicts,
            status=status,
        )

    def get_change_diff(self, entry_id: str) -> str:
        """Get the diff for a specific change.

        Shows what would be reverted if this change were rolled back.

        Parameters:
            entry_id: Git commit SHA (short or full)

        Returns:
            Diff output as string

        Raises:
            ValueError: If git unavailable
        """
        if not self.git_available:
            raise ValueError("Git backend not available - cannot get diff")

        from src.utils.git_helper import GitHelper

        result = GitHelper.run_git_command(
            ["show", entry_id], self.base_path, timeout_config=self.timeout_config
        )

        return str(result.stdout)

    def find_orphaned_backups(self, max_age_days: int | None = None) -> list[Path]:
        """Find backup files (.bak) without corresponding transaction entries.

        Scans the project for .bak files and checks if they're tracked in any
        transaction.
        Optionally filters by file age.

        Parameters:
            max_age_days: Only return backups older than this many days.
                None = all ages.

        Returns:
            List of Path objects for orphaned backup files
        """
        from datetime import UTC, datetime, timedelta

        orphaned = []
        cutoff_time = None

        if max_age_days is not None:
            cutoff = datetime.now(UTC) - timedelta(days=max_age_days)
            cutoff_time = cutoff.timestamp()

        # Find all .bak files in the project
        for bak_file in self.base_path.rglob("*.bak"):
            # Skip if in .docimp directory
            if ".docimp" in bak_file.parts:
                continue

            # Check age if filtering
            if cutoff_time is not None:
                mtime = bak_file.stat().st_mtime
                if mtime > cutoff_time:
                    continue  # Too recent

            # Check if this backup is referenced in any transaction
            is_tracked = False

            from src.utils.state_manager import StateManager

            transactions_dir = (
                StateManager.get_state_dir(self.base_path)
                / "session-reports"
                / "transactions"
            )

            if transactions_dir.exists():
                for manifest_file in transactions_dir.glob("transaction-*.json"):
                    try:
                        manifest = self.load_manifest(manifest_file)
                        for entry in manifest.entries:
                            if Path(entry.backup_path) == bak_file:
                                is_tracked = True
                                break
                        if is_tracked:
                            break
                    except Exception:
                        continue

            if not is_tracked:
                orphaned.append(bak_file)

        return orphaned

    def cleanup_orphaned_backups(
        self, max_age_days: int = 7, dry_run: bool = False
    ) -> int:
        """Delete orphaned backup files older than specified age.

        Parameters:
            max_age_days: Delete backups older than this many days
            dry_run: If True, only report what would be deleted without deleting

        Returns:
            Number of backup files deleted (or would be deleted if dry_run)
        """
        orphaned = self.find_orphaned_backups(max_age_days=max_age_days)

        deleted_count = 0
        for bak_file in orphaned:
            if not dry_run:
                try:
                    bak_file.unlink()
                    deleted_count += 1
                except Exception:
                    # Ignore errors (file might be in use, permissions, etc.)
                    pass
            else:
                # Dry run - just count
                deleted_count += 1

        return deleted_count
