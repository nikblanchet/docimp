"""Valid Python file with proper documentation."""


def calculate_area(width: float, height: float) -> float:
    """
    Calculate the area of a rectangle.

    Parameters:
        width: Rectangle width in units
        height: Rectangle height in units

    Returns:
        Area in square units
    """
    return width * height


class Shape:
    """Represents a geometric shape."""

    def __init__(self, name: str):
        """
        Initialize a shape.

        Parameters:
            name: Name of the shape
        """
        self.name = name
