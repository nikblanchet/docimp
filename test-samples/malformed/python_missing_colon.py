"""Test file with intentional syntax error: missing colon after class definition."""


class BrokenClass  # Missing colon here
    def __init__(self):
        self.value = 42
