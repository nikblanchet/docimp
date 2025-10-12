"""Example module for testing."""

async def async_function(param1: str, param2: int = 5) -> bool:
    """An async function with parameters."""
    if param1:
        return True
    return False

class ExampleClass:
    def __init__(self, service):
        """Constructor with dependency injection."""
        self.service = service

    @property
    def value(self):
        return self._value
