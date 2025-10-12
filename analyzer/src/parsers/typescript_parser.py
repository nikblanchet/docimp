"""TypeScript/JavaScript parser using Node.js and TypeScript compiler.

This parser spawns a Node.js subprocess to leverage the TypeScript compiler API
for parsing .ts, .js, .cjs, and .mjs files with full JSDoc validation.
"""

import json
import subprocess
import sys
from pathlib import Path
from typing import List, Optional
from .base_parser import BaseParser
from ..models.code_item import CodeItem


class TypeScriptParser(BaseParser):
    """
    Parser for TypeScript and JavaScript files using the TypeScript compiler.

    Handles .ts, .js, .cjs, .mjs files with:
    - Full JSDoc type-checking (via checkJs: true)
    - ESM and CommonJS module system detection
    - Cyclomatic complexity calculation
    - Export type detection (named, default, commonjs)
    """

    def __init__(self):
        """Initialize the TypeScript parser and locate the Node.js helper script."""
        # Find the compiled JavaScript helper
        # Path from analyzer/src/parsers -> cli/dist
        current_file = Path(__file__)
        project_root = current_file.parent.parent.parent.parent
        self.helper_path = project_root / 'cli' / 'dist' / 'ts-js-parser-helper.js'

        if not self.helper_path.exists():
            raise FileNotFoundError(
                f"TypeScript parser helper not found at {self.helper_path}. "
                "Run 'cd cli && npm install && npm run build' to compile the TypeScript parser."
            )

    def parse_file(self, filepath: str) -> List[CodeItem]:
        """
        Parse a TypeScript or JavaScript file and extract code items.

        Parameters
        ----------
        filepath : str
            Path to the TypeScript or JavaScript source file (.ts, .js, .cjs, .mjs)

        Returns
        -------
        List[CodeItem]
            List of extracted functions, classes, methods, and interfaces

        Raises
        ------
        FileNotFoundError
            If the file does not exist
        SyntaxError
            If the file contains invalid TypeScript/JavaScript syntax
        RuntimeError
            If the Node.js subprocess fails
        """
        try:
            # Spawn Node.js process to run the compiled JavaScript parser helper
            result = subprocess.run(
                ['node', str(self.helper_path), filepath],
                capture_output=True,
                text=True,
                timeout=30
            )

            # Parse JSON output from Node.js (even on error, might be error JSON)
            try:
                items_data = json.loads(result.stdout if result.stdout else result.stderr)
            except json.JSONDecodeError as e:
                # If we can't parse JSON and there was an error, report it
                if result.returncode != 0:
                    error_msg = result.stderr or result.stdout or "TypeScript parser helper failed"
                    raise RuntimeError(
                        f"Failed to run TypeScript parser. Error: {error_msg}\n"
                        f"Make sure Node.js is installed and the TypeScript helper is compiled."
                    )
                raise SyntaxError(f"Failed to parse output from TypeScript parser: {e}\nOutput: {result.stdout}")

            # Check for error response
            if isinstance(items_data, dict) and 'error' in items_data:
                error_message = items_data['error']
                if 'File not found' in error_message:
                    raise FileNotFoundError(error_message)
                else:
                    raise SyntaxError(error_message)

            # Convert JSON data to CodeItem objects
            items: List[CodeItem] = []
            for item_data in items_data:
                items.append(CodeItem(
                    name=item_data['name'],
                    type=item_data['type'],
                    filepath=item_data['filepath'],
                    line_number=item_data['line_number'],
                    language=item_data['language'],
                    complexity=item_data['complexity'],
                    impact_score=item_data['impact_score'],
                    has_docs=item_data['has_docs'],
                    parameters=item_data['parameters'],
                    return_type=item_data.get('return_type'),
                    docstring=item_data.get('docstring'),
                    export_type=item_data['export_type'],
                    module_system=item_data['module_system'],
                    audit_rating=None  # Will be set by audit command if needed
                ))

            return items

        except subprocess.TimeoutExpired:
            raise RuntimeError(f"TypeScript parser timed out while parsing {filepath}")
        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {filepath}")
        except Exception as e:
            raise RuntimeError(f"Error parsing TypeScript/JavaScript file {filepath}: {e}")
