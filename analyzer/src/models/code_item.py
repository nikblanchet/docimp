"""CodeItem data model for representing parsed code elements."""

from dataclasses import dataclass, field, asdict
from typing import List, Optional


@dataclass
class CodeItem:
    """Represents a parsed function, class, or method from source code.

    This dataclass captures all relevant metadata about a code element including
    its location, complexity, documentation status, and language-specific details
    like module system and export type.

    Attributes:
        name: The name of the function, class, or method.
        type: The type of code element ('function', 'class', 'method').
        filepath: Absolute or relative path to the source file.
        line_number: Line number where the element is defined.
        end_line: Line number where the element ends (inclusive).
        language: Programming language ('python', 'typescript', 'javascript').
        complexity: Cyclomatic complexity score.
        has_docs: Whether documentation exists for this element.
        export_type: Export style ('named', 'default', 'commonjs', 'internal').
        module_system: Module system used ('esm', 'commonjs', 'unknown').
        parameters: List of parameter names.
        return_type: Return type annotation if available.
        docstring: Existing documentation string if present.
        impact_score: Calculated priority score (0-100), set by ImpactScorer.
        audit_rating: Quality rating from audit command (1-4), or None if skipped/not audited.
    """

    # Required identity fields
    name: str
    type: str
    filepath: str
    line_number: int
    end_line: int
    language: str

    # Required metric fields
    complexity: int
    has_docs: bool

    # Required language-specific fields
    export_type: str
    module_system: str

    # Optional metadata with defaults
    parameters: List[str] = field(default_factory=list)
    return_type: Optional[str] = None
    docstring: Optional[str] = None

    # Computed/augmented fields with defaults
    impact_score: float = 0.0
    audit_rating: Optional[int] = None

    def to_dict(self) -> dict:
        """Serialize CodeItem to a JSON-compatible dictionary.

        Returns:
            Dictionary representation of the CodeItem with all fields.
        """
        return asdict(self)

    def __repr__(self) -> str:
        """Human-readable representation for debugging."""
        docs_indicator = "📝" if self.has_docs else "❌"
        return (
            f"CodeItem({docs_indicator} {self.type} '{self.name}' "
            f"@ {self.filepath}:{self.line_number}, "
            f"complexity={self.complexity}, impact={self.impact_score:.1f})"
        )
