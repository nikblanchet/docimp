"""Test file with intentional syntax error: incomplete if statement."""


def check_value(x):
    """Check if a value meets certain conditions."""
    if x > 0
        return True  # Missing colon after if condition
    return False
