"""Core documentation analyzer with dependency injection."""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set
from ..models.code_item import CodeItem
from ..models.analysis_result import AnalysisResult, ParseFailure
from ..parsers.base_parser import BaseParser
from ..scoring.impact_scorer import ImpactScorer
from .coverage_calculator import CoverageCalculator


class DocumentationAnalyzer:
    """Orchestrates code parsing, scoring, and coverage analysis.

    This class coordinates the analysis workflow by discovering files,
    dispatching to appropriate parsers, calculating impact scores, and
    computing coverage metrics. It uses dependency injection for all
    major components to enable testability.

    Attributes:
        parsers: Dictionary mapping language names to parser instances.
        scorer: ImpactScorer instance for calculating priority scores.
        calculator: CoverageCalculator for computing metrics.
    """

    # Default file patterns to exclude during discovery
    DEFAULT_EXCLUDES = {
        "node_modules",
        "venv",
        "__pycache__",
        "dist",
        "build",
        ".git",
        ".pytest_cache",
        ".mypy_cache",
        "coverage",
        ".tox",
        "eggs",
        ".eggs",
        "tests",  # Exclude test directories
        "test",  # Common test directory name
        "__tests__",  # Jest convention
    }

    # File extension to language mapping
    EXTENSION_MAP = {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".cjs": "javascript",
        ".mjs": "javascript",
    }

    def __init__(
        self,
        parsers: Dict[str, BaseParser],
        scorer: ImpactScorer,
        calculator: Optional[CoverageCalculator] = None,
        exclude_patterns: Optional[Set[str]] = None,
    ) -> None:
        """Initialize the analyzer with injected dependencies.

        Args:
            parsers: Dictionary mapping language names to parser instances.
                     Keys should be 'python', 'typescript', 'javascript'.
            scorer: ImpactScorer instance for calculating impact scores.
            calculator: Optional CoverageCalculator (creates default if None).
            exclude_patterns: Optional set of directory names to exclude.
                            Merged with DEFAULT_EXCLUDES.
        """
        self.parsers = parsers
        self.scorer = scorer
        self.calculator = calculator or CoverageCalculator()

        # Merge default excludes with user-provided patterns
        self.exclude_patterns = self.DEFAULT_EXCLUDES.copy()
        if exclude_patterns:
            self.exclude_patterns.update(exclude_patterns)

    def analyze(
        self, path: str, verbose: bool = False, strict: bool = False
    ) -> AnalysisResult:
        """Analyze documentation coverage for a codebase.

        Args:
            path: Path to a file or directory to analyze.
            verbose: If True, print progress information to stderr.
            strict: If True, fail immediately on first parse error instead of
                   collecting failures and continuing.

        Returns:
            AnalysisResult containing all parsed items and metrics.

        Raises:
            FileNotFoundError: If the specified path does not exist.
            ValueError: If the path resolves to an invalid location.
            SyntaxError: If strict=True and a file has syntax errors.
            RuntimeError: If strict=True and a parser infrastructure fails.
        """
        # Resolve path to absolute form (handles symlinks and relative paths)
        # This prevents issues with path traversal and ensures consistent paths
        try:
            path_obj = Path(path).resolve(strict=True)
        except (FileNotFoundError, RuntimeError) as e:
            raise FileNotFoundError(f"Path does not exist or is invalid: {path}") from e

        # Discover files
        files = self._discover_files(path_obj)

        if verbose:
            print(f"Discovered {len(files)} files to analyze", file=sys.stderr)

        # Parse all files
        all_items: List[CodeItem] = []
        parse_failures: List[ParseFailure] = []
        for i, filepath in enumerate(files, 1):
            if verbose and len(files) > 10:
                # Show progress for large codebases
                if i % 10 == 0 or i == len(files):
                    print(f"Progress: {i}/{len(files)} files parsed", file=sys.stderr)

            items, failure = self._parse_file(filepath, strict=strict)
            all_items.extend(items)
            if failure:
                parse_failures.append(failure)

        # Check for total parse failure
        if len(all_items) == 0 and len(parse_failures) > 0:
            raise ValueError(
                f"Failed to parse all {len(parse_failures)} files. "
                f"No code items could be analyzed. Check file syntax and "
                f"parser compatibility."
            )

        # Calculate impact scores for all items
        for item in all_items:
            item.impact_score = self.scorer.calculate_score(item)

        # Compute coverage metrics
        coverage = self.calculator.calculate_coverage(all_items)
        documented_count = self.calculator.count_documented(all_items)
        by_language = self.calculator.calculate_by_language(all_items)

        return AnalysisResult(
            items=all_items,
            coverage_percent=coverage,
            total_items=len(all_items),
            documented_items=documented_count,
            by_language=by_language,
            parse_failures=parse_failures,
        )

    def _discover_files(self, path: Path) -> List[Path]:
        """Discover all parseable source files in a directory tree.

        Args:
            path: Path object to search (file or directory).

        Returns:
            List of Path objects for files that can be parsed.
        """
        if path.is_file():
            # Single file - check if it's parseable
            if self._is_parseable(path):
                return [path]
            return []

        # Directory - walk recursively
        files: List[Path] = []
        for root, dirs, filenames in os.walk(path):
            # Filter out excluded directories
            dirs[:] = [d for d in dirs if d not in self.exclude_patterns]

            # Check each file
            for filename in filenames:
                filepath = Path(root) / filename
                if self._is_parseable(filepath):
                    files.append(filepath)

        return sorted(files)  # Sort for deterministic ordering

    def _is_parseable(self, filepath: Path) -> bool:
        """Check if a file can be parsed based on its extension.

        Args:
            filepath: Path object to check.

        Returns:
            True if the file extension is recognized, False otherwise.
        """
        return filepath.suffix in self.EXTENSION_MAP

    def _parse_file(
        self, filepath: Path, strict: bool = False
    ) -> tuple[List[CodeItem], Optional[ParseFailure]]:
        """Parse a single file using the appropriate language parser.

        Args:
            filepath: Path object to parse.
            strict: If True, raise exceptions on parse errors instead of
                   collecting them as failures.

        Returns:
            Tuple of (items, failure) where:
            - items: List of CodeItem objects extracted from the file
            - failure: ParseFailure object if parsing failed, None otherwise

        Raises:
            SyntaxError: If strict=True and file has syntax errors.
            RuntimeError: If strict=True and parser infrastructure fails.
            FileNotFoundError: If strict=True and file is not found.
        """
        # Determine language from extension
        extension = filepath.suffix
        language = self.EXTENSION_MAP.get(extension)

        if not language:
            return [], None

        # Get appropriate parser
        parser = self.parsers.get(language)
        if not parser:
            # No parser available for this language
            return [], None

        try:
            return parser.parse_file(str(filepath)), None
        except (SyntaxError, ValueError, RuntimeError, FileNotFoundError, OSError) as e:
            # In strict mode, fail immediately on parse errors
            if strict:
                raise
            # Handle expected parsing errors gracefully - capture first line of error
            error_msg = str(e).split("\n")[0] or "Unknown parse error"
            print(f"Warning: Failed to parse {filepath}: {error_msg}", file=sys.stderr)
            return [], ParseFailure(filepath=str(filepath), error=error_msg)
        except Exception as e:
            # Unexpected errors indicate programming errors - log and re-raise
            error_msg = str(e).split("\n")[0] or "Unknown error"
            print(
                f"Error: Unexpected exception parsing {filepath}: {error_msg}",
                file=sys.stderr,
            )
            raise
