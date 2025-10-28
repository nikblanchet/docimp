"""Test file with intentional syntax error: inconsistent indentation."""


def process_data(items):
    """Process a list of items."""
    for item in items:
        if item > 0:
            print(item)
      print("Inconsistent indentation here")  # Wrong indentation level
