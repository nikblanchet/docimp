"""Plan generator for prioritizing documentation improvements.

This module generates prioritized plans for documentation improvements by combining
items that need documentation (missing docs or poor quality) and sorting by impact score.
"""

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional

from ..models.code_item import CodeItem
from ..models.analysis_result import AnalysisResult
from ..audit.quality_rater import load_audit_results
from ..scoring.impact_scorer import ImpactScorer
from ..utils.state_manager import StateManager


@dataclass
class PlanItem:
    """Represents a single item in the improvement plan.

    This is similar to CodeItem but includes additional fields needed
    for the improve workflow, like the reason for inclusion.

    Attributes:
        name: Function/class/method name.
        type: Type of code element ('function', 'class', 'method').
        filepath: Path to source file.
        line_number: Line number in source file.
        language: Programming language.
        complexity: Cyclomatic complexity.
        impact_score: Priority score (0-100).
        has_docs: Whether documentation currently exists.
        audit_rating: Quality rating if audited (1-4).
        parameters: List of parameter names.
        return_type: Return type annotation if available.
        docstring: Existing documentation if present.
        export_type: Export style ('named', 'default', 'commonjs', 'internal').
        module_system: Module system ('esm', 'commonjs', 'unknown').
        reason: Human-readable reason for inclusion in plan.
    """

    name: str
    type: str
    filepath: str
    line_number: int
    language: str
    complexity: int
    impact_score: float
    has_docs: bool
    audit_rating: Optional[int]
    parameters: List[str]
    return_type: Optional[str]
    docstring: Optional[str]
    export_type: str
    module_system: str
    reason: str

    @classmethod
    def from_code_item(cls, item: CodeItem, reason: str) -> 'PlanItem':
        """Create a PlanItem from a CodeItem.

        Args:
            item: The CodeItem to convert.
            reason: Reason for including in the plan.

        Returns:
            A new PlanItem instance.
        """
        return cls(
            name=item.name,
            type=item.type,
            filepath=item.filepath,
            line_number=item.line_number,
            language=item.language,
            complexity=item.complexity,
            impact_score=item.impact_score,
            has_docs=item.has_docs,
            audit_rating=item.audit_rating,
            parameters=item.parameters,
            return_type=item.return_type,
            docstring=item.docstring,
            export_type=item.export_type,
            module_system=item.module_system,
            reason=reason
        )

    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output.

        Returns:
            Dictionary representation.
        """
        return asdict(self)


@dataclass
class PlanResult:
    """Container for a complete improvement plan.

    Attributes:
        items: List of PlanItems sorted by priority (impact score descending).
        total_items: Total number of items in the plan.
        missing_docs_count: Number of items with no documentation.
        poor_quality_count: Number of items with poor quality documentation.
    """

    items: List[PlanItem]
    total_items: int
    missing_docs_count: int
    poor_quality_count: int

    def to_dict(self) -> dict:
        """Serialize to dictionary for JSON output.

        Returns:
            Dictionary representation with all plan items.
        """
        return {
            'items': [item.to_dict() for item in self.items],
            'total_items': self.total_items,
            'missing_docs_count': self.missing_docs_count,
            'poor_quality_count': self.poor_quality_count
        }


def generate_plan(
    result: AnalysisResult,
    audit_file: Optional[Path] = None,
    quality_threshold: int = 2
) -> PlanResult:
    """Generate a prioritized documentation improvement plan.

    Combines items that need documentation (missing docs or poor quality)
    and sorts them by impact score for the improve workflow.

    Args:
        result: Analysis result containing all code items.
        audit_file: Path to audit results file. If None, uses StateManager.get_audit_file().
        quality_threshold: Items with audit rating <= this value are included (default: 2).
                          Scale: 1=Terrible, 2=OK, 3=Good, 4=Excellent.

    Returns:
        PlanResult with prioritized items to improve.
    """
    if audit_file is None:
        audit_file = StateManager.get_audit_file()

    # Load audit results if file exists
    audit_results = None
    if audit_file.exists():
        audit_results = load_audit_results(audit_file)

    # Apply audit ratings to items and recalculate impact scores
    if audit_results:
        scorer = ImpactScorer()
        for item in result.items:
            rating = audit_results.get_rating(item.filepath, item.name)
            if rating is not None:
                item.audit_rating = rating
                # Recalculate impact score with audit rating
                item.impact_score = scorer.calculate_score(item)

    plan_items: List[PlanItem] = []
    missing_docs_count = 0
    poor_quality_count = 0

    for item in result.items:
        reason = None

        # Include items with no documentation
        if not item.has_docs:
            reason = "Missing documentation"
            missing_docs_count += 1
        # Include items with poor quality documentation (if audited)
        elif item.audit_rating is not None and item.audit_rating <= quality_threshold:
            quality_labels = {1: "Terrible", 2: "OK"}
            quality_label = quality_labels.get(item.audit_rating, f"Rating {item.audit_rating}")
            reason = f"Poor quality documentation ({quality_label})"
            poor_quality_count += 1

        # Add to plan if we found a reason
        if reason:
            plan_items.append(PlanItem.from_code_item(item, reason))

    # Sort by impact score (descending - highest priority first)
    plan_items.sort(key=lambda x: x.impact_score, reverse=True)

    return PlanResult(
        items=plan_items,
        total_items=len(plan_items),
        missing_docs_count=missing_docs_count,
        poor_quality_count=poor_quality_count
    )


def save_plan(plan: PlanResult, output_file: Optional[Path] = None) -> None:
    """Save plan to JSON file for the improve command to load.

    Args:
        plan: PlanResult to save.
        output_file: Path to output file. If None, uses StateManager.get_plan_file().
    """
    if output_file is None:
        output_file = StateManager.get_plan_file()

    # Ensure state directory exists before writing
    StateManager.ensure_state_dir()
    with open(output_file, 'w') as f:
        json.dump(plan.to_dict(), f, indent=2)
