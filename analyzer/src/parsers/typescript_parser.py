"""TypeScript/JavaScript parser using Node.js and TypeScript compiler.

This parser spawns a Node.js subprocess to leverage the TypeScript compiler API
for parsing .ts, .js, .cjs, and .mjs files with full JSDoc validation.
"""

import json
import os
import subprocess
from pathlib import Path

from ..models.code_item import CodeItem
from .base_parser import BaseParser


class TypeScriptParser(BaseParser):
    """
    Parser for TypeScript and JavaScript files using the TypeScript compiler.

    Handles .ts, .js, .cjs, .mjs files with:
    - Full JSDoc type-checking (via checkJs: true)
    - ESM and CommonJS module system detection
    - Cyclomatic complexity calculation
    - Export type detection (named, default, commonjs)
    """

    MAX_SUBPROCESS_OUTPUT_LEN = 200

    def __init__(self, helper_path: Path | None = None):
        """Initialize the TypeScript parser and locate the Node.js CLI script.

        Uses a three-tier resolution strategy:
        1. Explicit helper_path parameter (highest priority, for dependency injection)
        2. DOCIMP_TS_HELPER_PATH environment variable (for CI/CD and custom deployments)
        3. Auto-detection fallback (for development environment)

        Args:
            helper_path: Optional explicit path to compiled ts-js-parser-cli.js.
                        If None, uses environment variable or auto-detection.

        Raises:
            FileNotFoundError: If the helper script cannot be found at the
                resolved path.
        """
        if helper_path:
            # Priority 1: Explicit parameter (dependency injection)
            self.helper_path = helper_path
        else:
            # Priority 2: Environment variable
            env_path = os.environ.get("DOCIMP_TS_HELPER_PATH")
            if env_path:
                self.helper_path = Path(env_path)
            else:
                # Priority 3: Auto-detection fallback
                self.helper_path = self._find_helper()

        if not self.helper_path.exists():
            raise FileNotFoundError(
                f"TypeScript parser CLI not found at {self.helper_path}.\n"
                f"Options to resolve:\n"
                f"1. Build the TypeScript CLI: "
                f"'cd cli && npm install && npm run build'\n"
                f"2. Set environment variable: "
                f"export DOCIMP_TS_HELPER_PATH="
                f"/path/to/ts-js-parser-cli.js\n"
                f"3. Pass helper_path parameter explicitly: "
                f"TypeScriptParser(helper_path=Path('/path/to/cli.js'))"
            )

    def _find_helper(self) -> Path:
        """Auto-detect helper path using multiple fallback strategies.

        Returns:
            Path: Best-guess path to ts-js-parser-cli.js (may not exist).
        """
        # Strategy 1: Development environment
        # (from analyzer/src/parsers -> cli/dist/parsers)
        current_file = Path(__file__)
        project_root = current_file.parent.parent.parent.parent
        dev_path = project_root / "cli" / "dist" / "parsers" / "ts-js-parser-cli.js"

        if dev_path.exists():
            return dev_path

        # Future: Strategy 2 could check for pip-installed package location
        # using pkg_resources or importlib.resources for installed packages

        # Return development path as default
        # (will trigger FileNotFoundError with helpful message)
        return dev_path

    def _truncate_output(self, text: str) -> str:
        """Truncate subprocess output for error messages.

        Args:
            text: The text to truncate.

        Returns:
            Truncated text with ellipsis if longer than MAX_SUBPROCESS_OUTPUT_LEN,
            or original text if shorter.
        """
        if len(text) > self.MAX_SUBPROCESS_OUTPUT_LEN:
            return text[: self.MAX_SUBPROCESS_OUTPUT_LEN] + "..."
        return text

    def parse_file(self, filepath: str) -> list[CodeItem]:
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
                ["node", str(self.helper_path), filepath],
                capture_output=True,
                text=True,
                timeout=30,
            )

            # Parse JSON output from Node.js (even on error, might be error JSON)
            try:
                items_data = json.loads(
                    result.stdout if result.stdout else result.stderr
                )
            except json.JSONDecodeError as e:
                # Log subprocess output for debugging
                stdout_preview = self._truncate_output(result.stdout)
                stderr_preview = self._truncate_output(result.stderr)

                # If we can't parse JSON and there was an error,
                # this is a parser infrastructure issue
                if result.returncode != 0:
                    error_msg = (
                        result.stderr
                        or result.stdout
                        or "TypeScript parser helper failed"
                    )
                    raise RuntimeError(
                        f"Failed to run TypeScript parser helper "
                        f"(returncode={result.returncode}).\n"
                        f"Error: {error_msg}\n"
                        f"Stdout: {stdout_preview}\n"
                        f"Stderr: {stderr_preview}\n"
                        f"Make sure Node.js is installed and the TypeScript "
                        f"helper is compiled."
                    )
                # Returncode is 0 but JSON is malformed
                # - this is also an infrastructure issue
                raise RuntimeError(
                    f"TypeScript parser helper returned invalid JSON (returncode=0).\n"
                    f"JSONDecodeError: {e}\n"
                    f"Stdout: {stdout_preview}\n"
                    f"Stderr: {stderr_preview}\n"
                    f"This indicates a problem with the parser helper, "
                    f"not the source code."
                )

            # Check for error response
            if isinstance(items_data, dict) and "error" in items_data:
                error_message = items_data["error"]
                if "File not found" in error_message:
                    raise FileNotFoundError(error_message)
                else:
                    raise SyntaxError(error_message)

            # Convert JSON data to CodeItem objects
            items: list[CodeItem] = []
            for item_data in items_data:
                items.append(
                    CodeItem(
                        name=item_data["name"],
                        type=item_data["type"],
                        filepath=item_data["filepath"],
                        line_number=item_data["line_number"],
                        end_line=item_data["end_line"],
                        language=item_data["language"],
                        complexity=item_data["complexity"],
                        impact_score=item_data["impact_score"],
                        has_docs=item_data["has_docs"],
                        parameters=item_data["parameters"],
                        return_type=item_data.get("return_type"),
                        docstring=item_data.get("docstring"),
                        export_type=item_data["export_type"],
                        module_system=item_data["module_system"],
                        audit_rating=None,  # Will be set by audit command if needed
                    )
                )

            return items

        except subprocess.TimeoutExpired:
            raise RuntimeError(f"TypeScript parser timed out while parsing {filepath}")
        except FileNotFoundError:
            raise FileNotFoundError(f"File not found: {filepath}")
        except Exception as e:
            raise RuntimeError(
                f"Error parsing TypeScript/JavaScript file {filepath}: {e}"
            )
