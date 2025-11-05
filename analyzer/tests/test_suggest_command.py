"""
Tests for suggest command feedback integration.

This module tests that the suggest command properly passes feedback
to PromptBuilder when the --feedback flag is provided.
"""

import sys
from pathlib import Path
from unittest.mock import Mock, patch, mock_open
import argparse

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.main import cmd_suggest
from src.claude.claude_client import ClaudeClient
from src.claude.prompt_builder import PromptBuilder


class TestSuggestCommandFeedbackIntegration:
    """Test feedback parameter integration in cmd_suggest."""

    def test_suggest_without_feedback(self):
        """Test suggest command without feedback parameter."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Test prompt"
        mock_client.generate_docstring.return_value = "Test docstring"

        args = argparse.Namespace(
            target="test.py:test_function",
            style_guide="google",
            tone="concise",
            verbose=False,
            feedback=None,  # No feedback
        )

        # Mock file reading
        test_code = "def test_function():\n    pass"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        mock_builder.build_prompt.assert_called_once()
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["feedback"] is None
        mock_client.generate_docstring.assert_called_once_with("Test prompt")

    def test_suggest_with_feedback(self):
        """Test suggest command with feedback parameter."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Test prompt with feedback"
        mock_client.generate_docstring.return_value = "Improved docstring"

        feedback_text = "Add more detail about error handling"
        args = argparse.Namespace(
            target="test.py:test_function",
            style_guide="google",
            tone="concise",
            verbose=False,
            feedback=feedback_text,
        )

        # Mock file reading
        test_code = "def test_function():\n    pass"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        mock_builder.build_prompt.assert_called_once()
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["feedback"] == feedback_text
        mock_client.generate_docstring.assert_called_once_with(
            "Test prompt with feedback"
        )

    def test_suggest_with_multiline_feedback(self):
        """Test suggest command handles multiline feedback correctly."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Test prompt"
        mock_client.generate_docstring.return_value = "Docstring"

        multiline_feedback = """Please improve by:
1. Adding parameter descriptions
2. Including examples
3. Explaining return value"""

        args = argparse.Namespace(
            target="test.py:test_function",
            style_guide="google",
            tone="concise",
            verbose=False,
            feedback=multiline_feedback,
        )

        # Mock file reading
        test_code = "def test_function(a, b):\n    return a + b"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["feedback"] == multiline_feedback
        assert "Adding parameter descriptions" in call_kwargs["feedback"]
        assert "Including examples" in call_kwargs["feedback"]

    def test_suggest_with_special_characters_in_feedback(self):
        """Test suggest command handles special characters in feedback."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Test prompt"
        mock_client.generate_docstring.return_value = "Docstring"

        feedback_with_special_chars = (
            'Use @param tags, add `code` formatting, and "quotes"'
        )
        args = argparse.Namespace(
            target="test.py:test_function",
            style_guide="google",
            tone="concise",
            verbose=False,
            feedback=feedback_with_special_chars,
        )

        # Mock file reading
        test_code = "def test_function():\n    pass"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["feedback"] == feedback_with_special_chars
        assert "@param" in call_kwargs["feedback"]
        assert "`code`" in call_kwargs["feedback"]
        assert '"quotes"' in call_kwargs["feedback"]

    def test_suggest_feedback_passed_for_python_file(self):
        """Test feedback is passed correctly for Python files."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Python prompt"
        mock_client.generate_docstring.return_value = "Python docstring"

        args = argparse.Namespace(
            target="module.py:my_function",
            style_guide="google",
            tone="concise",
            verbose=False,
            feedback="Add examples",
        )

        # Mock file reading
        test_code = "def my_function(x):\n    return x * 2"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["language"] == "python"
        assert call_kwargs["feedback"] == "Add examples"

    def test_suggest_feedback_passed_for_typescript_file(self):
        """Test feedback is passed correctly for TypeScript files."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "TS prompt"
        mock_client.generate_docstring.return_value = "TS docstring"

        args = argparse.Namespace(
            target="module.ts:myFunction",
            style_guide="tsdoc-typedoc",
            tone="concise",
            verbose=False,
            feedback="Use TSDoc format",
        )

        # Mock file reading
        test_code = "function myFunction(x: number): number { return x * 2; }"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["language"] == "typescript"
        assert call_kwargs["feedback"] == "Use TSDoc format"

    def test_suggest_feedback_passed_for_javascript_file(self):
        """Test feedback is passed correctly for JavaScript files."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "JS prompt"
        mock_client.generate_docstring.return_value = "JS docstring"

        args = argparse.Namespace(
            target="module.js:myFunction",
            style_guide="jsdoc-vanilla",
            tone="concise",
            verbose=False,
            feedback="Add type annotations",
        )

        # Mock file reading
        test_code = "function myFunction(x) { return x * 2; }"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["language"] == "javascript"
        assert call_kwargs["feedback"] == "Add type annotations"

    def test_suggest_verbose_mode_with_feedback(self):
        """Test verbose output doesn't interfere with feedback."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Verbose prompt"
        mock_client.generate_docstring.return_value = "Verbose docstring"

        args = argparse.Namespace(
            target="test.py:test_function",
            style_guide="google",
            tone="detailed",
            verbose=True,  # Verbose mode
            feedback="Make it more detailed",
        )

        # Mock file reading and stderr
        test_code = "def test_function():\n    pass"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                with patch("sys.stderr"):  # Suppress stderr output in tests
                    # Execute
                    exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        assert call_kwargs["feedback"] == "Make it more detailed"
        # Note: tone is set during PromptBuilder initialization, not in build_prompt
        # call

    def test_suggest_empty_feedback_treated_as_none(self):
        """Test that empty string feedback is passed as empty string (not
        converted to None)."""
        # Setup
        mock_client = Mock(spec=ClaudeClient)
        mock_builder = Mock(spec=PromptBuilder)
        mock_builder.build_prompt.return_value = "Prompt"
        mock_client.generate_docstring.return_value = "Docstring"

        args = argparse.Namespace(
            target="test.py:test_function",
            style_guide="google",
            tone="concise",
            verbose=False,
            feedback="",  # Empty string
        )

        # Mock file reading
        test_code = "def test_function():\n    pass"
        with patch("builtins.open", mock_open(read_data=test_code)):
            with patch("pathlib.Path.exists", return_value=True):
                # Execute
                exit_code = cmd_suggest(args, mock_client, mock_builder)

        # Verify
        assert exit_code == 0
        call_kwargs = mock_builder.build_prompt.call_args.kwargs
        # Empty string is passed as-is (PromptBuilder will handle stripping)
        assert call_kwargs["feedback"] == ""
