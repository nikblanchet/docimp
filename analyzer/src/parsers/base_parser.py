"""Abstract base class for language parsers."""

from abc import ABC, abstractmethod

from ..models.code_item import CodeItem


class BaseParser(ABC):
    """
    Abstract base class defining the interface for language-specific parsers.

    All parser implementations must inherit from this class and implement
    the parse_file method to extract code items from source files.
    """

    @abstractmethod
    def parse_file(self, filepath: str) -> list[CodeItem]:
        """
        Parse a source file and extract code items.

        Parameters
        ----------
        filepath : str
            Absolute or relative path to the source file to parse

        Returns
        -------
        List[CodeItem]
            List of extracted code items (functions, classes, methods)

        Raises
        ------
        FileNotFoundError
            If the specified file does not exist
        SyntaxError
            If the file contains syntax errors that prevent parsing
        """
        pass
