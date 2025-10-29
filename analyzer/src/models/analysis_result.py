"""AnalysisResult data model for aggregated code analysis results."""

from dataclasses import dataclass, field, asdict
from typing import List, Dict, Union
from .code_item import CodeItem


@dataclass
class ParseFailure:
    """Represents a file that failed to parse.

    Attributes:
        filepath: Absolute path to the file that failed to parse.
        error: First line of the error message from the exception.
    """

    filepath: str
    error: str

    def to_dict(self) -> dict[str, str]:
        """Serialize ParseFailure to a JSON-compatible dictionary.

        Returns:
            Dictionary representation of the ParseFailure (filepath and error strings).
        """
        return asdict(self)


@dataclass
class LanguageMetrics:
    """Documentation coverage metrics for a specific programming language.

    Attributes:
        language: The programming language name.
        total_items: Total number of code elements found.
        documented_items: Number of elements with documentation.
        coverage_percent: Percentage of documented elements (0-100).
        avg_complexity: Average cyclomatic complexity across all items.
        avg_impact_score: Average impact score across all items.
    """

    language: str
    total_items: int
    documented_items: int
    coverage_percent: float
    avg_complexity: float = 0.0
    avg_impact_score: float = 0.0

    def to_dict(self) -> dict[str, Union[str, int, float]]:
        """Serialize LanguageMetrics to a JSON-compatible dictionary.

        Returns:
            Dictionary representation of the LanguageMetrics.
        """
        return asdict(self)


@dataclass
class AnalysisResult:
    """Aggregated results from analyzing a codebase.

    This dataclass contains all parsed code items along with computed coverage
    metrics, both overall and broken down by programming language.

    Attributes:
        items: List of all parsed CodeItem objects.
        coverage_percent: Overall documentation coverage percentage (0-100).
        total_items: Total number of code elements analyzed.
        documented_items: Number of elements with documentation.
        by_language: Dictionary mapping language names to their metrics.
        parse_failures: List of files that failed to parse.
    """

    items: List[CodeItem]
    coverage_percent: float
    total_items: int
    documented_items: int
    by_language: Dict[str, LanguageMetrics] = field(default_factory=dict)
    parse_failures: List[ParseFailure] = field(default_factory=list)

    def to_dict(self) -> dict[str, Union[List[dict[str, Union[str, int, float, bool, List[str], None]]], float, int, Dict[str, dict[str, Union[str, int, float]]], List[dict[str, str]]]]:
        """Serialize AnalysisResult to a JSON-compatible dictionary.

        Returns:
            Dictionary representation with all items and metrics.
        """
        result = asdict(self)
        # Ensure nested dataclasses are also converted
        result['items'] = [item.to_dict() if hasattr(item, 'to_dict') else item
                          for item in self.items]
        result['by_language'] = {
            lang: metrics.to_dict() if hasattr(metrics, 'to_dict') else metrics
            for lang, metrics in self.by_language.items()
        }
        result['parse_failures'] = [failure.to_dict() if hasattr(failure, 'to_dict') else failure
                                   for failure in self.parse_failures]
        return result

    def get_undocumented_items(self) -> List[CodeItem]:
        """Get all items without documentation.

        Returns:
            List of CodeItem objects where has_docs is False.
        """
        return [item for item in self.items if not item.has_docs]

    def get_items_by_language(self, language: str) -> List[CodeItem]:
        """Get all items for a specific programming language.

        Args:
            language: The language to filter by ('python', 'typescript', 'javascript').

        Returns:
            List of CodeItem objects for the specified language.
        """
        return [item for item in self.items if item.language == language]

    def get_top_priority_items(self, limit: int = 10) -> List[CodeItem]:
        """Get the highest priority items by impact score.

        Args:
            limit: Maximum number of items to return.

        Returns:
            List of CodeItem objects sorted by impact_score descending.
        """
        return sorted(self.items, key=lambda x: x.impact_score, reverse=True)[:limit]

    def __repr__(self) -> str:
        """Human-readable representation for debugging."""
        return (
            f"AnalysisResult(total={self.total_items}, "
            f"documented={self.documented_items}, "
            f"coverage={self.coverage_percent:.1f}%, "
            f"languages={list(self.by_language.keys())})"
        )
