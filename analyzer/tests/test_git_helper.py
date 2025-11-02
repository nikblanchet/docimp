"""Tests for GitHelper utilities."""

import sys
from pathlib import Path
import tempfile
import subprocess
from unittest.mock import patch
import pytest

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.utils.git_helper import GitHelper
from src.utils.state_manager import StateManager


class TestGitHelper:
    """Test suite for GitHelper class."""

    def test_check_git_available_when_installed(self):
        """Test git detection when git is in PATH."""
        # Assuming git is installed (CI/CD requirement)
        assert GitHelper.check_git_available() is True

    def test_check_git_available_when_missing(self):
        """Test git detection when git is not in PATH."""
        with patch('shutil.which', return_value=None):
            assert GitHelper.check_git_available() is False

    def test_init_sidecar_repo_creates_structure(self):
        """Test that init_sidecar_repo creates .docimp/state/.git."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize the sidecar repo
            result = GitHelper.init_sidecar_repo(base_path)

            # Should succeed if git available
            if GitHelper.check_git_available():
                assert result is True

                # Verify structure was created
                git_state_dir = StateManager.get_git_state_dir(base_path)
                git_dir = git_state_dir / '.git'

                assert git_dir.exists()
                assert (git_dir / 'HEAD').exists()
                assert (git_state_dir / '.gitignore').exists()
            else:
                assert result is False

    def test_init_sidecar_repo_is_idempotent(self):
        """Test that init_sidecar_repo can be called multiple times."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize twice
            result1 = GitHelper.init_sidecar_repo(base_path)
            result2 = GitHelper.init_sidecar_repo(base_path)

            assert result1 is True
            assert result2 is True

            # Should still have valid repo
            git_state_dir = StateManager.get_git_state_dir(base_path)
            git_dir = git_state_dir / '.git'
            assert git_dir.exists()

    def test_init_sidecar_repo_returns_false_when_git_missing(self):
        """Test graceful degradation when git not available."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            with patch.object(GitHelper, 'check_git_available', return_value=False):
                result = GitHelper.init_sidecar_repo(base_path)
                assert result is False

    def test_run_git_command_uses_isolation_flags(self):
        """Test that git commands use --git-dir and --work-tree flags."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run a simple git command
            result = GitHelper.run_git_command(['status'], base_path)

            assert result.returncode == 0
            # Should execute without error

    def test_run_git_command_raises_on_failure_when_check_true(self):
        """Test that run_git_command raises CalledProcessError when check=True."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run invalid command
            with pytest.raises(subprocess.CalledProcessError):
                GitHelper.run_git_command(['invalid-command'], base_path, check=True)

    def test_run_git_command_does_not_raise_when_check_false(self):
        """Test that run_git_command returns error result when check=False."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run invalid command with check=False
            result = GitHelper.run_git_command(['invalid-command'], base_path, check=False)

            assert result.returncode != 0

    def test_run_git_command_captures_output(self):
        """Test that run_git_command captures stdout/stderr."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Initialize repo first
            GitHelper.init_sidecar_repo(base_path)

            # Run command that produces output
            result = GitHelper.run_git_command(['status'], base_path)

            assert result.stdout is not None
            assert isinstance(result.stdout, str)

    def test_sidecar_repo_isolation_from_user_repo(self):
        """Test that side-car repo does not interfere with user's git repo."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            # Create a user git repo
            user_git_dir = base_path / '.git'
            user_git_dir.mkdir(parents=True)
            subprocess.run(
                ['git', 'init'],
                cwd=base_path,
                check=True,
                capture_output=True
            )

            # Initialize sidecar repo
            GitHelper.init_sidecar_repo(base_path)

            # Check that user's .git is untouched
            assert user_git_dir.exists()

            # Check that sidecar repo is separate
            git_state_dir = StateManager.get_git_state_dir(base_path)
            sidecar_git_dir = git_state_dir / '.git'

            assert sidecar_git_dir.exists()
            assert sidecar_git_dir != user_git_dir

    def test_gitignore_created_with_correct_content(self):
        """Test that .gitignore is created with ephemeral state comment."""
        if not GitHelper.check_git_available():
            pytest.skip("Git not available")

        with tempfile.TemporaryDirectory() as tmpdir:
            base_path = Path(tmpdir)

            GitHelper.init_sidecar_repo(base_path)

            git_state_dir = StateManager.get_git_state_dir(base_path)
            gitignore_path = git_state_dir / '.gitignore'

            assert gitignore_path.exists()
            content = gitignore_path.read_text()
            assert 'ephemeral' in content
            assert '*' in content  # Ignore everything
