"""Coverage calculator for computing documentation metrics."""

from typing import Dict, List

from ..models.analysis_result import LanguageMetrics
from ..models.code_item import CodeItem


class CoverageCalculator:
    """Calculates documentation coverage metrics from parsed code items.

    This class computes both overall coverage percentages and per-language
    breakdowns including complexity and impact score averages.
    """

    def calculate_coverage(self, items: list[CodeItem]) -> float:
        """Calculate overall documentation coverage percentage.

        Args:
            items: List of CodeItem objects to analyze.

        Returns:
            Coverage percentage (0-100), or 0.0 if no items.
        """
        if not items:
            return 0.0

        documented = sum(1 for item in items if item.has_docs)
        return (documented / len(items)) * 100.0

    def calculate_by_language(
        self, items: list[CodeItem]
    ) -> dict[str, LanguageMetrics]:
        """Calculate coverage metrics broken down by programming language.

        Args:
            items: List of CodeItem objects to analyze.

        Returns:
            Dictionary mapping language names to LanguageMetrics objects.
        """
        # Group items by language
        by_lang: dict[str, list[CodeItem]] = {}
        for item in items:
            if item.language not in by_lang:
                by_lang[item.language] = []
            by_lang[item.language].append(item)

        # Calculate metrics for each language
        metrics: dict[str, LanguageMetrics] = {}
        for language, lang_items in by_lang.items():
            total = len(lang_items)
            documented = sum(1 for item in lang_items if item.has_docs)
            coverage = (documented / total * 100.0) if total > 0 else 0.0

            # Calculate averages
            avg_complexity = (
                sum(item.complexity for item in lang_items) / total
                if total > 0
                else 0.0
            )
            avg_impact = (
                sum(item.impact_score for item in lang_items) / total
                if total > 0
                else 0.0
            )

            metrics[language] = LanguageMetrics(
                language=language,
                total_items=total,
                documented_items=documented,
                coverage_percent=coverage,
                avg_complexity=avg_complexity,
                avg_impact_score=avg_impact,
            )

        return metrics

    def count_documented(self, items: list[CodeItem]) -> int:
        """Count the number of documented items.

        Args:
            items: List of CodeItem objects to count.

        Returns:
            Number of items with has_docs=True.
        """
        return sum(1 for item in items if item.has_docs)
