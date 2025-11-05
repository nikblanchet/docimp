"""Python parser using AST to extract code items."""

import ast

from ..models.code_item import CodeItem
from .base_parser import BaseParser


class PythonParser(BaseParser):
    """
    Parser for Python source files using the built-in AST module.

    Extracts functions, classes, and methods with metadata including
    cyclomatic complexity and docstring presence.
    """

    def parse_file(self, filepath: str) -> list[CodeItem]:
        """
        Parse a Python file and extract code items.

        Parameters
        ----------
        filepath : str
            Path to the Python source file

        Returns
        -------
        List[CodeItem]
            List of extracted functions, classes, and methods

        Raises
        ------
        FileNotFoundError
            If the file does not exist
        SyntaxError
            If the file contains invalid Python syntax
        """
        try:
            with open(filepath, encoding="utf-8") as f:
                source = f.read()

            tree = ast.parse(source, filename=filepath)
            items: list[CodeItem] = []

            # Build parent map to detect methods (functions inside classes)
            # This prevents method duplication while still extracting nested functions.
            # Uses ast.walk() for full traversal to capture functions at all
            # nesting levels. See issue #67.
            parent_map = {}
            for node in ast.walk(tree):
                for child in ast.iter_child_nodes(node):
                    parent_map[child] = node

            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    parent = parent_map.get(node)
                    if isinstance(parent, ast.ClassDef):
                        # Skip - this is a method, will be extracted when
                        # processing the class
                        continue
                    # This is a function (top-level or nested in another function)
                    item = self._extract_function(node, filepath)
                    if item:
                        items.append(item)
                elif isinstance(node, ast.ClassDef):
                    item = self._extract_class(node, filepath)
                    if item:
                        items.append(item)
                    # Also extract methods from the class
                    for method_node in node.body:
                        if isinstance(
                            method_node, (ast.FunctionDef, ast.AsyncFunctionDef)
                        ):
                            method_item = self._extract_method(
                                method_node, node.name, filepath
                            )
                            if method_item:
                                items.append(method_item)

            return items

        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {filepath}")
        except SyntaxError as e:
            raise SyntaxError(f"Syntax error in {filepath}: {e}")

    def _extract_function(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef, filepath: str
    ) -> CodeItem | None:
        """Extract a function definition as a CodeItem."""
        return CodeItem(
            name=node.name,
            type="function",
            filepath=filepath,
            line_number=node.lineno,
            end_line=node.end_lineno if node.end_lineno is not None else node.lineno,
            language="python",
            complexity=self._calculate_complexity(node),
            impact_score=0,  # Will be calculated by ImpactScorer
            has_docs=self._has_docstring(node),
            parameters=self._extract_parameters(node),
            return_type=self._extract_return_type(node),
            docstring=ast.get_docstring(node),
            export_type="internal",  # Python doesn't have explicit exports
            module_system="unknown",  # Python uses imports, not module systems
        )

    def _extract_class(self, node: ast.ClassDef, filepath: str) -> CodeItem | None:
        """Extract a class definition as a CodeItem."""
        return CodeItem(
            name=node.name,
            type="class",
            filepath=filepath,
            line_number=node.lineno,
            end_line=node.end_lineno if node.end_lineno is not None else node.lineno,
            language="python",
            complexity=self._calculate_complexity(node),
            impact_score=0,  # Will be calculated by ImpactScorer
            has_docs=self._has_docstring(node),
            parameters=[],  # Classes don't have parameters in Python
            return_type=None,
            docstring=ast.get_docstring(node),
            export_type="internal",
            module_system="unknown",
        )

    def _extract_method(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        class_name: str,
        filepath: str,
    ) -> CodeItem | None:
        """Extract a method definition as a CodeItem."""
        return CodeItem(
            name=f"{class_name}.{node.name}",
            type="method",
            filepath=filepath,
            line_number=node.lineno,
            end_line=node.end_lineno if node.end_lineno is not None else node.lineno,
            language="python",
            complexity=self._calculate_complexity(node),
            impact_score=0,  # Will be calculated by ImpactScorer
            has_docs=self._has_docstring(node),
            parameters=self._extract_parameters(node),
            return_type=self._extract_return_type(node),
            docstring=ast.get_docstring(node),
            export_type="internal",
            module_system="unknown",
        )

    def _has_docstring(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef | ast.Module
    ) -> bool:
        """Check if a node has a docstring."""
        return ast.get_docstring(node) is not None

    def _extract_parameters(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef
    ) -> list[str]:
        """Extract parameter names from a function."""
        params = []

        # Regular arguments
        for arg in node.args.args:
            params.append(arg.arg)

        # *args
        if node.args.vararg:
            params.append(f"*{node.args.vararg.arg}")

        # **kwargs
        if node.args.kwarg:
            params.append(f"**{node.args.kwarg.arg}")

        return params

    def _extract_return_type(
        self, node: ast.FunctionDef | ast.AsyncFunctionDef
    ) -> str | None:
        """Extract return type annotation if present."""
        if node.returns:
            return ast.unparse(node.returns)
        return None

    def _calculate_complexity(self, node: ast.AST) -> int:
        """
        Calculate cyclomatic complexity for a node.

        Cyclomatic complexity = number of decision points + 1
        Decision points: if, elif, for, while, except, with, assert, and, or

        Matches Radon's behavior: complexity is calculated separately per function.
        Nested function decision points do NOT contribute to parent complexity.
        """
        complexity = 1  # Base complexity

        # Use a manual traversal that stops at nested function boundaries
        def traverse(current_node: ast.AST) -> None:
            nonlocal complexity

            for child in ast.iter_child_nodes(current_node):
                # Stop traversal at nested function boundaries
                # Nested functions are extracted separately with their own complexity
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    continue

                # Count decision points
                if isinstance(
                    child, (ast.If, ast.While, ast.For, ast.AsyncFor)
                ) or isinstance(child, ast.ExceptHandler):
                    complexity += 1
                elif isinstance(child, ast.BoolOp):
                    complexity += len(child.values) - 1
                elif (
                    isinstance(
                        child,
                        (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp),
                    )
                    or isinstance(child, ast.Assert)
                    or isinstance(child, (ast.With, ast.AsyncWith))
                ):
                    complexity += 1

                # Recursively traverse non-function children
                traverse(child)

        traverse(node)
        return complexity
