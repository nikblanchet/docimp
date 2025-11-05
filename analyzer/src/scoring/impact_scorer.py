"""Impact scoring engine for prioritizing documentation needs.

This module calculates impact scores (0-100) for code items based on their
cyclomatic complexity and optionally audit quality ratings. Higher scores
indicate higher priority for documentation improvement.
"""

import math
from typing import Optional

from ..models.code_item import CodeItem


class ImpactScorer:
    """Calculates impact scores for code items to prioritize documentation.

    The scorer uses cyclomatic complexity as the primary metric in the MVP,
    with optional incorporation of audit quality ratings. Scores range from
    0 to 100, where higher scores indicate higher priority.

    Attributes:
        complexity_weight: Weight for complexity score (default: 0.6).
        quality_weight: Weight for quality penalty (default: 0.4).
    """

    # Rating to penalty mapping for audit scores
    QUALITY_PENALTIES = {
        None: 100,  # No docs
        0: 100,  # No docs (explicit)
        1: 80,  # Terrible
        2: 40,  # OK
        3: 20,  # Good
        4: 0,  # Excellent
    }

    def __init__(
        self, complexity_weight: float = 0.6, quality_weight: float = 0.4
    ) -> None:
        """Initialize the impact scorer with configurable weights.

        Args:
            complexity_weight: Weight for complexity component (0-1).
            quality_weight: Weight for quality component (0-1).

        Raises:
            ValueError: If weights don't sum to 1.0 (±0.01).
        """
        weight_sum = complexity_weight + quality_weight
        if not math.isclose(weight_sum, 1.0, abs_tol=0.01):
            raise ValueError(f"Weights must sum to 1.0 (±0.01), got {weight_sum}")

        self.complexity_weight = complexity_weight
        self.quality_weight = quality_weight

    def calculate_score(self, item: CodeItem) -> float:
        """Calculate impact score for a code item.

        The scoring formula depends on whether audit data is available:

        Without audit:
            score = min(100, complexity * 5)

        With audit:
            score = (complexity_weight * complexity_score) +
                    (quality_weight * quality_penalty)

        Args:
            item: CodeItem to score.

        Returns:
            Impact score from 0 to 100.
        """
        # Calculate complexity-based score
        complexity_score = min(100.0, item.complexity * 5.0)

        # If no audit rating, use complexity only
        if item.audit_rating is None:
            return complexity_score

        # With audit rating, blend complexity and quality
        quality_penalty = self._get_quality_penalty(item.audit_rating)
        score = (
            self.complexity_weight * complexity_score
            + self.quality_weight * quality_penalty
        )

        return min(100.0, score)

    def _get_quality_penalty(self, rating: Optional[int]) -> float:
        """Map audit rating to quality penalty.

        Args:
            rating: Audit rating (1-4) or None if skipped/not audited.

        Returns:
            Quality penalty score (0-100).
        """
        return float(self.QUALITY_PENALTIES.get(rating, 100))
