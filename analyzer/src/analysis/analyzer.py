"""Core documentation analyzer with dependency injection."""

import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set
from ..models.code_item import CodeItem
from ..models.analysis_result import AnalysisResult
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
        'node_modules',
        'venv',
        '__pycache__',
        'dist',
        'build',
        '.git',
        '.pytest_cache',
        '.mypy_cache',
        'coverage',
        '.tox',
        'eggs',
        '.eggs',
        'tests',  # Exclude test directories
        'test',   # Common test directory name
        '__tests__',  # Jest convention
    }

    # File extension to language mapping
    EXTENSION_MAP = {
        '.py': 'python',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.cjs': 'javascript',
        '.mjs': 'javascript',
    }

    def __init__(
        self,
        parsers: Dict[str, BaseParser],
        scorer: ImpactScorer,
        calculator: Optional[CoverageCalculator] = None,
        exclude_patterns: Optional[Set[str]] = None
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

    def analyze(self, path: str, verbose: bool = False) -> AnalysisResult:
        """Analyze documentation coverage for a codebase.

        Args:
            path: Path to a file or directory to analyze.
            verbose: If True, print progress information to stderr.

        Returns:
            AnalysisResult containing all parsed items and metrics.

        Raises:
            FileNotFoundError: If the specified path does not exist.
            ValueError: If the path resolves to an invalid location.
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
        for i, filepath in enumerate(files, 1):
            if verbose and len(files) > 10:
                # Show progress for large codebases
                if i % 10 == 0 or i == len(files):
                    print(f"Progress: {i}/{len(files)} files parsed", file=sys.stderr)

            items = self._parse_file(filepath)
            all_items.extend(items)

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
            by_language=by_language
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

    def _parse_file(self, filepath: Path) -> List[CodeItem]:
        """Parse a single file using the appropriate language parser.

        Args:
            filepath: Path object to parse.

        Returns:
            List of CodeItem objects extracted from the file.
            Returns empty list if parsing fails or no parser available.
        """
        # Determine language from extension
        extension = filepath.suffix
        language = self.EXTENSION_MAP.get(extension)

        if not language:
            return []

        # Get appropriate parser
        parser = self.parsers.get(language)
        if not parser:
            # No parser available for this language
            return []

        try:
            return parser.parse_file(str(filepath))
        except Exception as e:
            # Handle parsing errors gracefully
            print(f"Warning: Failed to parse {filepath}: {e}", file=sys.stderr)
            return []
