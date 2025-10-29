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

from dataclasses import dataclass, asdict, field
from typing import List, Optional
from pathlib import Path
import json
import shutil
from datetime import datetime


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
        status: Current state ('in_progress', 'committed', 'rolled_back', 'partial_rollback')
        git_commit_sha: Git commit SHA of the squash commit (None if in_progress)
    """
    session_id: str
    started_at: str
    completed_at: Optional[str] = None
    entries: List[TransactionEntry] = field(default_factory=list)
    status: str = 'in_progress'
    git_commit_sha: Optional[str] = None


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

    def __init__(self, base_path: Optional[Path] = None, use_git: bool = True):
        """Initialize TransactionManager with optional git support.

        Args:
            base_path: Project root directory. If None, disables git (for backward compat).
            use_git: Whether to use git backend. Defaults to True.
        """
        from src.utils.git_helper import GitHelper
        from src.utils.state_manager import StateManager

        self.base_path = base_path if base_path else Path.cwd()

        # Only use git if explicitly requested AND base_path is set AND git is available
        self.git_available = (
            use_git and
            base_path is not None and
            GitHelper.check_git_available()
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
            branch_name = f'docimp/session-{session_id}'
            GitHelper.run_git_command(
                ['checkout', '-b', branch_name],
                self.base_path
            )

        return TransactionManifest(
            session_id=session_id,
            started_at=datetime.utcnow().isoformat()
        )

    def record_write(
        self,
        manifest: TransactionManifest,
        filepath: str,
        backup_path: str,
        item_name: str,
        item_type: str,
        language: str
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
        timestamp = datetime.utcnow().isoformat()
        entry_id = None

        if self.git_available:
            from src.utils.git_helper import GitHelper

            # Convert filepath to relative path from base_path for git
            try:
                file_path_obj = Path(filepath)
                if file_path_obj.is_absolute():
                    rel_filepath = file_path_obj.relative_to(self.base_path)
                else:
                    rel_filepath = Path(filepath)
            except ValueError:
                # File is outside work-tree, can't use git for this file
                entry_id = f'entry-{len(manifest.entries)}'
            else:
                # Git add the modified file (using relative path)
                GitHelper.run_git_command(['add', str(rel_filepath)], self.base_path)

                # Create commit with metadata in message
                commit_msg = f"""docimp: Add docs to {item_name}

Metadata:
  item_name: {item_name}
  item_type: {item_type}
  language: {language}
  filepath: {filepath}
  backup_path: {backup_path}
  timestamp: {timestamp}"""

                GitHelper.run_git_command(
                    ['commit', '-m', commit_msg],
                    self.base_path
                )

                # Get the commit SHA (short hash)
                result = GitHelper.run_git_command(
                    ['rev-parse', '--short', 'HEAD'],
                    self.base_path
                )
                entry_id = result.stdout.strip()
        else:
            # Fallback: generate simple ID
            entry_id = f'entry-{len(manifest.entries)}'

        entry = TransactionEntry(
            entry_id=entry_id,
            filepath=filepath,
            backup_path=backup_path,
            timestamp=timestamp,
            item_name=item_name,
            item_type=item_type,
            language=language,
            success=True
        )
        manifest.entries.append(entry)

    def commit_transaction(self, manifest: TransactionManifest) -> None:
        """Mark transaction as committed and delete all backup files.

        Merges the session git branch into main with --squash, creating a single
        squash commit for the entire session. Deletes backup files.

        Parameters:
            manifest: Transaction manifest to commit
        """
        manifest.status = 'committed'
        manifest.completed_at = datetime.utcnow().isoformat()

        if self.git_available:
            from src.utils.git_helper import GitHelper

            branch_name = f'docimp/session-{manifest.session_id}'

            # Checkout main branch
            GitHelper.run_git_command(['checkout', 'main'], self.base_path)

            # Merge session branch with squash
            GitHelper.run_git_command(
                ['merge', '--squash', branch_name],
                self.base_path,
                check=False  # May fail if no changes
            )

            # Create squash commit
            squash_msg = f'docimp session {manifest.session_id} (squash)'
            result = GitHelper.run_git_command(
                ['commit', '-m', squash_msg],
                self.base_path,
                check=False  # May fail if nothing to commit
            )

            # Get squash commit SHA if successful
            if result.returncode == 0:
                sha_result = GitHelper.run_git_command(
                    ['rev-parse', '--short', 'HEAD'],
                    self.base_path
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
        if manifest.status == 'committed':
            raise ValueError(
                f"Cannot rollback committed transaction {manifest.session_id}"
            )
        if manifest.status == 'rolled_back':
            raise ValueError(
                f"Transaction {manifest.session_id} already rolled back"
            )

        restored_count = 0
        for entry in manifest.entries:
            backup = Path(entry.backup_path)
            target = Path(entry.filepath)

            if backup.exists():
                shutil.copy2(backup, target)
                backup.unlink()
                restored_count += 1

        manifest.status = 'rolled_back'
        manifest.completed_at = datetime.utcnow().isoformat()
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

        with open(path, 'w') as f:
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
        with open(path, 'r') as f:
            data = json.load(f)

        # Reconstruct TransactionEntry objects from dicts
        if 'entries' in data and data['entries']:
            data['entries'] = [TransactionEntry(**e) for e in data['entries']]

        return TransactionManifest(**data)

    def list_uncommitted_transactions(
        self,
        transactions_dir: Path
    ) -> List[TransactionManifest]:
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
            transactions_dir.glob('transaction-*.json'),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        ):
            manifest = self.load_manifest(manifest_file)
            if manifest.status == 'in_progress':
                uncommitted.append(manifest)

        return uncommitted

    def cleanup_old_transactions(
        self,
        transactions_dir: Path,
        keep_count: int
    ) -> int:
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
            transactions_dir.glob('transaction-*.json'),
            key=lambda p: p.stat().st_mtime,
            reverse=True
        )

        # Separate uncommitted (always keep) from committed/rolled_back
        uncommitted_files = []
        completed_files = []

        for manifest_file in all_manifests:
            manifest = self.load_manifest(manifest_file)
            if manifest.status == 'in_progress':
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
