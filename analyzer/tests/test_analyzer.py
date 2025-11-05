"""Tests for the DocumentationAnalyzer core orchestration."""

import sys
from pathlib import Path

import pytest

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.analysis.analyzer import DocumentationAnalyzer
from src.parsers.python_parser import PythonParser
from src.parsers.typescript_parser import TypeScriptParser
from src.scoring.impact_scorer import ImpactScorer

# Test fixture paths
PROJECT_ROOT = Path(__file__).parent.parent.parent
MALFORMED_SAMPLES = PROJECT_ROOT / "test-samples" / "malformed"
MIXED_SAMPLES = PROJECT_ROOT / "test-samples" / "mixed-valid-invalid"
EXAMPLES_DIR = PROJECT_ROOT / "examples"


class TestDocumentationAnalyzer:
    """Test suite for DocumentationAnalyzer with dependency injection."""

    @pytest.fixture
    def analyzer(self):
        """Create analyzer instance with all parsers."""
        return DocumentationAnalyzer(
            parsers={
                "python": PythonParser(),
                "typescript": TypeScriptParser(),
                "javascript": TypeScriptParser(),
            },
            scorer=ImpactScorer(),
        )

    @pytest.fixture
    def examples_dir(self):
        """Return path to examples directory."""
        project_root = Path(__file__).parent.parent.parent
        return str(project_root / "examples")

    def test_analyze_examples_directory(self, analyzer, examples_dir):
        """Test analyzing the examples directory."""
        result = analyzer.analyze(examples_dir)

        # Basic assertions
        assert len(result.items) >= 5, "Should find at least 5 code items in examples"
        assert result.total_items == len(result.items)
        assert 0 <= result.coverage_percent <= 100
        assert result.documented_items <= result.total_items

    def test_language_breakdown(self, analyzer, examples_dir):
        """Test that analyzer correctly categorizes items by language."""
        result = analyzer.analyze(examples_dir)

        # Check language-specific items
        python_items = [i for i in result.items if i.language == "python"]
        typescript_items = [i for i in result.items if i.language == "typescript"]
        javascript_items = [i for i in result.items if i.language == "javascript"]

        # Verify we have items from multiple languages
        assert len(python_items) > 0, "Should find Python items"
        assert len(typescript_items) + len(javascript_items) > 0, (
            "Should find TS/JS items"
        )

        print(f"✓ Python items: {len(python_items)}")
        print(f"✓ TypeScript items: {len(typescript_items)}")
        print(f"✓ JavaScript items: {len(javascript_items)}")

    def test_impact_scores_calculated(self, analyzer, examples_dir):
        """Test that impact scores are calculated for all items."""
        result = analyzer.analyze(examples_dir)

        for item in result.items:
            assert 0 <= item.impact_score <= 100, (
                f"Impact score for {item.name} should be 0-100, got {item.impact_score}"
            )

    def test_by_language_metrics(self, analyzer, examples_dir):
        """Test that per-language metrics are computed."""
        result = analyzer.analyze(examples_dir)

        assert len(result.by_language) > 0, "Should have language-specific metrics"

        for language, metrics in result.by_language.items():
            assert metrics.language == language
            assert metrics.total_items > 0
            assert 0 <= metrics.coverage_percent <= 100
            assert metrics.avg_complexity >= 0

    def test_file_exclusions(self, analyzer):
        """Test that excluded directories are skipped."""
        # Analyzer should have default exclusions
        assert "node_modules" in analyzer.exclude_patterns
        assert "venv" in analyzer.exclude_patterns
        assert "__pycache__" in analyzer.exclude_patterns

    def test_single_file_analysis(self, analyzer):
        """Test analyzing a single file."""
        project_root = Path(__file__).parent.parent.parent
        test_file = project_root / "examples" / "test_simple.py"

        result = analyzer.analyze(str(test_file))

        assert len(result.items) > 0, "Should parse items from single file"
        assert all(item.language == "python" for item in result.items)

    def test_nonexistent_path_raises_error(self, analyzer):
        """Test that analyzing nonexistent path raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            analyzer.analyze("/nonexistent/path/that/does/not/exist")

    def test_custom_exclude_patterns(self):
        """Test that custom exclude patterns are merged with defaults."""
        custom_excludes = {"custom_dir", "temp"}
        analyzer = DocumentationAnalyzer(
            parsers={"python": PythonParser()},
            scorer=ImpactScorer(),
            exclude_patterns=custom_excludes,
        )

        # Should have both default and custom excludes
        assert "node_modules" in analyzer.exclude_patterns
        assert "custom_dir" in analyzer.exclude_patterns
        assert "temp" in analyzer.exclude_patterns

    def test_strict_path_resolution(self, analyzer):
        """Test that paths are resolved with strict validation."""
        # Nonexistent path should raise FileNotFoundError
        with pytest.raises(FileNotFoundError, match="does not exist or is invalid"):
            analyzer.analyze("/this/path/definitely/does/not/exist/anywhere")

    def test_symlink_resolution(self, analyzer):
        """Test that symlinks are properly resolved during analysis."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            # Create a real directory with a Python file
            real_dir = Path(temp_dir) / "real_project"
            real_dir.mkdir()
            py_file = real_dir / "module.py"
            py_file.write_text("def foo():\n    pass")

            # Create a symlink to it
            symlink_dir = Path(temp_dir) / "link_to_project"
            symlink_dir.symlink_to(real_dir)

            # Analyze via symlink should work and resolve correctly
            result = analyzer.analyze(str(symlink_dir))

            assert len(result.items) > 0, "Should parse file via symlink"
            # The filepath in results should be the resolved real path
            for item in result.items:
                assert str(real_dir) in item.filepath, (
                    "Filepath should be resolved from symlink"
                )

    def test_parse_failure_tracking(self, analyzer):
        """Test that syntax errors are captured in parse_failures."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file so analysis doesn't fail entirely
            valid_file = temp_path / "valid.py"
            valid_file.write_text("def bar():\n    pass")

            # Create a file with syntax error
            broken_file = temp_path / "broken.py"
            broken_file.write_text("def foo(\n    # Missing closing paren")

            # Analyze should not crash
            result = analyzer.analyze(str(temp_path))

            # Should have captured the parse failure
            assert len(result.parse_failures) == 1, "Should capture one parse failure"
            assert str(broken_file) in result.parse_failures[0].filepath
            assert len(result.parse_failures[0].error) > 0, (
                "Error message should not be empty"
            )

    def test_analysis_continues_after_failures(self, analyzer):
        """Test that analysis continues after encountering parse failures."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file
            valid_file = temp_path / "valid.py"
            valid_file.write_text(
                'def good_function():\n    """A good function."""\n    pass'
            )

            # Create a file with syntax error
            broken_file = temp_path / "broken.py"
            broken_file.write_text("def bad(\n    # Syntax error")

            # Analyze should process both files
            result = analyzer.analyze(str(temp_path))

            # Should have one successful parse
            assert len(result.items) >= 1, "Should parse valid file"
            assert any("good_function" in item.name for item in result.items)

            # Should have one failure
            assert len(result.parse_failures) == 1, "Should capture parse failure"
            assert str(broken_file) in result.parse_failures[0].filepath

    def test_total_parse_failure_raises_error(self, analyzer):
        """Test that ValueError is raised when all files fail to parse."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create only broken files
            broken1 = temp_path / "broken1.py"
            broken1.write_text("def bad1(\n    # Syntax error")

            broken2 = temp_path / "broken2.py"
            broken2.write_text("class Bad2\n    # Missing colon")

            # Should raise ValueError when all files fail
            with pytest.raises(ValueError, match="Failed to parse all"):
                analyzer.analyze(str(temp_path))

    def test_parse_failures_empty_by_default(self, analyzer, examples_dir):
        """Test that parse_failures is empty when all files parse successfully."""
        result = analyzer.analyze(examples_dir)

        # All example files should parse successfully
        assert isinstance(result.parse_failures, list), (
            "parse_failures should be a list"
        )
        assert len(result.parse_failures) == 0, (
            "Should have no parse failures for valid files"
        )

    def test_empty_error_message_fallback(self, analyzer):
        """Test that empty error messages get fallback text."""
        import tempfile
        from unittest.mock import patch

        # Create a custom exception with empty string representation
        # Inherit from SyntaxError so it's caught as an expected exception
        class EmptyException(SyntaxError):
            def __str__(self):
                return ""

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file so analysis doesn't fail entirely
            valid_file = temp_path / "valid.py"
            valid_file.write_text("def bar():\n    pass")

            # Create a file that will trigger the empty error
            bad_file = temp_path / "bad.py"
            bad_file.write_text("def foo():\n    pass")

            # Create a mock that raises EmptyException only for bad.py
            original_parse = analyzer.parsers["python"].parse_file

            def mock_parse(filepath):
                if "bad.py" in filepath:
                    raise EmptyException()
                return original_parse(filepath)

            # Mock the parser to raise exception with empty string for bad.py only
            with patch.object(
                analyzer.parsers["python"], "parse_file", side_effect=mock_parse
            ):
                result = analyzer.analyze(str(temp_path))

                # Should have captured the parse failure with fallback message
                assert len(result.parse_failures) == 1, (
                    "Should capture one parse failure"
                )
                assert result.parse_failures[0].error == "Unknown parse error", (
                    "Should use fallback message for empty error"
                )
                assert "bad.py" in result.parse_failures[0].filepath, (
                    "Should capture the bad.py file"
                )

    def test_expected_exceptions_are_caught(self, analyzer):
        """Test that expected parsing exceptions are caught and tracked."""
        import tempfile
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file so analysis doesn't fail entirely
            valid_file = temp_path / "valid.py"
            valid_file.write_text("def bar():\n    pass")

            # Test each expected exception type
            expected_exceptions = [
                SyntaxError("syntax error"),
                ValueError("value error"),
                RuntimeError("runtime error"),
                FileNotFoundError("file not found"),
                OSError("os error"),
            ]

            for exc in expected_exceptions:
                # Create a file for this test
                test_file = temp_path / f"test_{exc.__class__.__name__}.py"
                test_file.write_text("def foo():\n    pass")

                # Mock parser to raise the exception
                original_parse = analyzer.parsers["python"].parse_file

                def mock_parse(filepath):
                    if exc.__class__.__name__ in filepath:
                        raise exc
                    return original_parse(filepath)

                with patch.object(
                    analyzer.parsers["python"], "parse_file", side_effect=mock_parse
                ):
                    # Should not raise - should capture in parse_failures
                    result = analyzer.analyze(str(temp_path))

                    # Should have captured at least one failure
                    assert len(result.parse_failures) >= 1, (
                        f"Should capture parse failure for {exc.__class__.__name__}"
                    )

                # Clean up test file
                test_file.unlink()

    def test_unexpected_exceptions_are_reraised(self, analyzer):
        """Test that unexpected exceptions are re-raised."""
        import tempfile
        from unittest.mock import patch

        # Create a custom unexpected exception
        class UnexpectedException(Exception):
            pass

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a test file
            test_file = temp_path / "test.py"
            test_file.write_text("def foo():\n    pass")

            # Mock parser to raise unexpected exception
            # Note: Combined with statements clean up right-to-left (pytest.raises
            # exits before patch). This is safe when contexts are independent, as
            # they are here (all our combined contexts are mocks/test fixtures).
            with (
                patch.object(
                    analyzer.parsers["python"],
                    "parse_file",
                    side_effect=UnexpectedException("unexpected"),
                ),
                pytest.raises(UnexpectedException),
            ):
                # Should re-raise the unexpected exception
                analyzer.analyze(str(temp_path))

    def test_strict_mode_fails_on_first_parse_error(self, analyzer):
        """Test that strict=True raises exception on first parse error."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file
            valid_file = temp_path / "valid.py"
            valid_file.write_text(
                'def good_function():\n    """A good function."""\n    pass'
            )

            # Create a file with syntax error
            broken_file = temp_path / "broken.py"
            broken_file.write_text(
                "def bad_function(\n    # Syntax error - missing closing paren"
            )

            # In strict mode, should raise SyntaxError immediately
            with pytest.raises(SyntaxError):
                analyzer.analyze(str(temp_path), strict=True)

    def test_non_strict_mode_collects_all_parse_errors(self, analyzer):
        """Test that strict=False (default) collects all parse errors.

        (without raising)."""
        import tempfile

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)

            # Create a valid file
            valid_file = temp_path / "valid.py"
            valid_file.write_text(
                'def good_function():\n    """A good function."""\n    pass'
            )

            # Create two files with syntax errors
            broken1 = temp_path / "broken1.py"
            broken1.write_text("def bad1(\n    # Missing closing paren")

            broken2 = temp_path / "broken2.py"
            broken2.write_text("class Bad2\n    # Missing colon")

            # In non-strict mode (default), should collect all failures
            result = analyzer.analyze(str(temp_path), strict=False)

            # Should have two parse failures
            assert len(result.parse_failures) == 2, "Should capture both parse failures"
            assert any("broken1.py" in f.filepath for f in result.parse_failures)
            assert any("broken2.py" in f.filepath for f in result.parse_failures)

            # Should still have parsed the valid file
            assert len(result.items) >= 1, "Should parse valid file"
            assert any("good_function" in item.name for item in result.items)

    def test_malformed_directory_analysis(self, analyzer):
        """Test analyzing test-samples/malformed/ directory with broken files.

        (Issue #199)."""
        # Analyze directory with malformed files
        result = analyzer.analyze(str(MALFORMED_SAMPLES))

        # TypeScript/JavaScript parsers use error recovery and parse partial ASTs
        # Only Python files with syntax errors fail to parse
        # Should have exactly 4 Python parse failures
        python_failures = [
            f for f in result.parse_failures if f.filepath.endswith(".py")
        ]
        assert len(python_failures) == 4, (
            f"Expected exactly 4 Python failures, got {len(python_failures)}. "
            f"Check that test-samples/malformed/ hasn't been modified."
        )

        # Check that Python malformed files are tracked as failures
        failed_files = [f.filepath for f in result.parse_failures]
        assert any("python_missing_colon.py" in f for f in failed_files), (
            "Python missing colon file should fail to parse"
        )
        assert any("python_unclosed_paren.py" in f for f in failed_files), (
            "Python unclosed paren file should fail to parse"
        )
        assert any("python_invalid_indentation.py" in f for f in failed_files), (
            "Python invalid indentation file should fail to parse"
        )
        assert any("python_incomplete_statement.py" in f for f in failed_files), (
            "Python incomplete statement file should fail to parse"
        )

        # Analysis should complete without crashing
        # TypeScript/JavaScript items may be present due to error recovery
        assert result.total_items >= 0, "Analysis should complete successfully"

    def test_mixed_valid_invalid_analysis(self, analyzer):
        """Test analyzing test-samples/mixed-valid-invalid/ with mix of files.

        (valid and broken files, Issue #199)."""
        # Analyze directory with 3 valid and 3 broken files
        result = analyzer.analyze(str(MIXED_SAMPLES))

        # Should have items from the 3 valid files + partial items
        # from TS/JS (error recovery)
        assert len(result.items) > 0, "Should parse valid files"

        # Python file with syntax error should fail
        # TypeScript/JavaScript use error recovery, so they may not fail
        assert len(result.parse_failures) >= 1, (
            f"Expected at least 1 parse failure (Python), "
            f"got {len(result.parse_failures)}"
        )

        # Check that Python broken file is tracked as failure
        failed_files = [f.filepath for f in result.parse_failures]
        assert any("broken_syntax.py" in f for f in failed_files), (
            "Python broken file should fail to parse"
        )

        # Check that valid files were parsed successfully
        item_names = [item.name for item in result.items]
        assert any(
            "calculate_area" in name or "Shape" in name for name in item_names
        ), "Should parse Python valid file"
        # TypeScript/JavaScript valid files should be parsed
        assert any(
            "DataProcessor" in name
            or "formatMessage" in name
            or "add" in name
            or "Calculator" in name
            for name in item_names
        ), "Should parse TypeScript/JavaScript valid files"

    def test_python_syntax_failures_tracked(self, analyzer):
        """Test that Python syntax failures are properly tracked.

        (in parse_failures, Issue #199)."""
        result = analyzer.analyze(str(MALFORMED_SAMPLES))

        # Get Python failures (by file extension)
        python_failures = [
            f for f in result.parse_failures if f.filepath.endswith(".py")
        ]
        assert len(python_failures) == 4, (
            f"Expected 4 Python failures, got {len(python_failures)}"
        )

        # Verify each Python failure has error message
        for failure in python_failures:
            assert failure.error, (
                f"Python failure {failure.filepath} should have error message"
            )
            assert (
                "Syntax error" in failure.error or "syntax" in failure.error.lower()
            ), f"Error should mention syntax: {failure.error}"

    def test_polyglot_analysis_with_python_errors(self, analyzer):
        """Test that Python syntax errors are handled while TS/JS use error

        recovery (Issue #199)."""
        result = analyzer.analyze(str(MALFORMED_SAMPLES))

        # Python files should fail to parse (4 failures expected)
        python_failures = [
            f for f in result.parse_failures if f.filepath.endswith(".py")
        ]
        assert len(python_failures) == 4, (
            f"Expected 4 Python failures, got {len(python_failures)}"
        )

        # TypeScript/JavaScript parsers use error recovery, so they may succeed
        # or partially succeed. The key is that analysis completes without crashing.
        assert result.total_items >= 0, "Analysis should complete successfully"

        # Verify Python failures have error messages
        for failure in python_failures:
            assert failure.error, "Python failures should have error messages"
            assert (
                "Syntax error" in failure.error or "syntax" in failure.error.lower()
            ), f"Error message should mention syntax: {failure.error}"
