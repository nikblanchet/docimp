"""Calculator module with basic arithmetic operations.

This module provides various mathematical functions with different
levels of complexity and documentation quality for testing DocImp.
"""


def add(a: float, b: float) -> float:
    """Add two numbers together.

    Parameters
    ----------
    a : float
        First number
    b : float
        Second number

    Returns
    -------
    float
        Sum of a and b
    """
    return a + b


def subtract(x, y):
    """Subtract two numbers."""
    return x - y


def multiply(a: float, b: float) -> float:
    return a * b


def divide(numerator: float, denominator: float) -> float:
    """Divide one number by another with error handling.

    Parameters
    ----------
    numerator : float
        Number to divide
    denominator : float
        Number to divide by

    Returns
    -------
    float
        Result of division

    Raises
    ------
    ValueError
        If denominator is zero
    """
    if denominator == 0:
        raise ValueError("Cannot divide by zero")
    return numerator / denominator


def calculate_factorial(n: int) -> int:
    """Calculate factorial using recursion.

    Parameters
    ----------
    n : int
        Non-negative integer

    Returns
    -------
    int
        Factorial of n
    """
    if n < 0:
        raise ValueError("Factorial not defined for negative numbers")
    if n == 0 or n == 1:
        return 1
    return n * calculate_factorial(n - 1)


def power(base: float, exponent: int) -> float:
    if exponent == 0:
        return 1
    if exponent < 0:
        return 1 / power(base, -exponent)

    result = 1
    for _ in range(exponent):
        result *= base
    return result


def calculate_average(numbers: list) -> float:
    """Calculate the average of a list of numbers.

    Parameters
    ----------
    numbers : list
        List of numbers

    Returns
    -------
    float
        Average value
    """
    if not numbers:
        return 0.0
    return sum(numbers) / len(numbers)


class Calculator:
    """Calculator class with memory feature."""

    def __init__(self):
        """Initialize calculator with zero memory."""
        self.memory = 0

    def add_to_memory(self, value: float) -> None:
        """Add value to memory.

        Parameters
        ----------
        value : float
            Value to add
        """
        self.memory += value

    def clear_memory(self):
        self.memory = 0

    def get_memory(self) -> float:
        """Get current memory value.

        Returns
        -------
        float
            Current memory value
        """
        return self.memory
