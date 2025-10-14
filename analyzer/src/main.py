"""Command-line interface for the documentation analyzer.

This module provides the main entry point for running the analyzer from the
command line. It uses argparse to handle subcommands and configuration.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .analysis.analyzer import DocumentationAnalyzer
from .claude.claude_client import ClaudeClient
from .claude.prompt_builder import PromptBuilder
from .parsers.python_parser import PythonParser
from .parsers.typescript_parser import TypeScriptParser
from .scoring.impact_scorer import ImpactScorer


def create_analyzer() -> DocumentationAnalyzer:
    """Create a DocumentationAnalyzer with all available parsers.

    Returns:
        DocumentationAnalyzer: Configured analyzer instance.
    """
    return DocumentationAnalyzer(
        parsers={
            'python': PythonParser(),
            'typescript': TypeScriptParser(),
            'javascript': TypeScriptParser()
        },
        scorer=ImpactScorer()
    )


def format_json(result) -> str:
    """Format analysis result as JSON.

    Args:
        result: AnalysisResult object to format.

    Returns:
        JSON string representation.
    """
    # Convert to dictionary for JSON serialization
    data = {
        'coverage_percent': result.coverage_percent,
        'total_items': result.total_items,
        'documented_items': result.documented_items,
        'by_language': {
            lang: {
                'language': metrics.language,
                'total_items': metrics.total_items,
                'documented_items': metrics.documented_items,
                'coverage_percent': metrics.coverage_percent,
                'avg_complexity': metrics.avg_complexity,
                'avg_impact_score': metrics.avg_impact_score
            }
            for lang, metrics in result.by_language.items()
        },
        'items': [
            {
                'name': item.name,
                'type': item.type,
                'filepath': item.filepath,
                'line_number': item.line_number,
                'language': item.language,
                'complexity': item.complexity,
                'impact_score': item.impact_score,
                'has_docs': item.has_docs,
                'export_type': item.export_type,
                'module_system': item.module_system
            }
            for item in result.items
        ]
    }
    return json.dumps(data, indent=2)


def format_summary(result) -> str:
    """Format analysis result as human-readable summary.

    Args:
        result: AnalysisResult object to format.

    Returns:
        Formatted summary string.
    """
    lines = []
    lines.append("=" * 60)
    lines.append("Documentation Coverage Analysis")
    lines.append("=" * 60)
    lines.append("")
    lines.append(f"Overall Coverage: {result.coverage_percent:.1f}% "
                 f"({result.documented_items}/{result.total_items} items)")
    lines.append("")

    if result.by_language:
        lines.append("By Language:")
        lines.append("-" * 60)
        for lang, metrics in sorted(result.by_language.items()):
            lines.append(f"  {lang.capitalize()}:")
            lines.append(f"    Coverage: {metrics.coverage_percent:.1f}% "
                        f"({metrics.documented_items}/{metrics.total_items})")
            lines.append(f"    Avg Complexity: {metrics.avg_complexity:.1f}")
            lines.append(f"    Avg Impact Score: {metrics.avg_impact_score:.1f}")
            lines.append("")

    # Show undocumented items by priority
    undocumented = [item for item in result.items if not item.has_docs]
    if undocumented:
        lines.append("Top Undocumented Items (by impact):")
        lines.append("-" * 60)
        sorted_items = sorted(undocumented, key=lambda x: x.impact_score, reverse=True)
        for item in sorted_items[:10]:  # Show top 10
            lines.append(f"  [{item.impact_score:5.1f}] {item.type:8s} "
                        f"{item.name:30s} ({item.filepath}:{item.line_number})")

        if len(undocumented) > 10:
            lines.append(f"  ... and {len(undocumented) - 10} more")

    lines.append("")
    lines.append("=" * 60)
    return "\n".join(lines)


def cmd_analyze(args: argparse.Namespace) -> int:
    """Handle the analyze subcommand.

    Args:
        args: Parsed command-line arguments.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Create analyzer
        analyzer = create_analyzer()

        # Run analysis
        if args.verbose:
            print(f"Analyzing: {args.path}", file=sys.stderr)

        result = analyzer.analyze(args.path, verbose=args.verbose)

        # Format output
        if args.format == 'json':
            output = format_json(result)
        else:  # summary
            output = format_summary(result)

        # Write to stdout
        print(output)

        return 0

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc(file=sys.stderr)
        return 1


def cmd_suggest(args: argparse.Namespace) -> int:
    """Handle the suggest subcommand.

    Args:
        args: Parsed command-line arguments.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Parse the target (filepath:itemname format)
        if ':' not in args.target:
            print("Error: Target must be in format 'filepath:itemname'", file=sys.stderr)
            print("Example: examples/test.py:my_function", file=sys.stderr)
            return 1

        filepath, item_name = args.target.rsplit(':', 1)
        filepath = Path(filepath)

        if not filepath.exists():
            print(f"Error: File not found: {filepath}", file=sys.stderr)
            return 1

        # Read the file
        with open(filepath, 'r') as f:
            code_content = f.read()

        # Determine language from file extension
        ext = filepath.suffix.lower()
        if ext == '.py':
            language = 'python'
        elif ext in ['.ts']:
            language = 'typescript'
        elif ext in ['.js', '.cjs', '.mjs']:
            language = 'javascript'
        else:
            print(f"Error: Unsupported file type: {ext}", file=sys.stderr)
            return 1

        # Extract the specific function/class code (simple approach for MVP)
        # For a full implementation, we'd use the parsers to find the exact location
        # For now, just use the whole file as context
        target_code = code_content  # Simplified for MVP

        # Create Claude client and prompt builder
        try:
            client = ClaudeClient()
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            print("Please set the ANTHROPIC_API_KEY environment variable", file=sys.stderr)
            return 1

        builder = PromptBuilder(
            style_guide=args.style_guide,
            tone=args.tone
        )

        # Build prompt
        prompt = builder.build_prompt(
            code=target_code,
            item_name=item_name,
            item_type='function',  # Simplified for MVP
            language=language
        )

        if args.verbose:
            print(f"Generating documentation for: {item_name}", file=sys.stderr)
            print(f"Style: {args.style_guide}, Tone: {args.tone}", file=sys.stderr)
            print("", file=sys.stderr)

        # Generate documentation
        docstring = client.generate_docstring(prompt)

        # Output the result
        print(docstring)

        return 0

    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc(file=sys.stderr)
        return 1


def main(argv: Optional[list] = None) -> int:
    """Main entry point for the CLI.

    Args:
        argv: Command-line arguments (defaults to sys.argv).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    parser = argparse.ArgumentParser(
        prog='analyzer',
        description='Analyze documentation coverage in Python, TypeScript, and JavaScript codebases'
    )

    parser.add_argument(
        '--version',
        action='version',
        version='%(prog)s 0.1.0'
    )

    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # Analyze command
    analyze_parser = subparsers.add_parser(
        'analyze',
        help='Analyze documentation coverage'
    )
    analyze_parser.add_argument(
        'path',
        help='Path to file or directory to analyze'
    )
    analyze_parser.add_argument(
        '--format',
        choices=['json', 'summary'],
        default='summary',
        help='Output format (default: summary)'
    )
    analyze_parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    # Suggest command
    suggest_parser = subparsers.add_parser(
        'suggest',
        help='Generate documentation suggestion for a specific item using Claude'
    )
    suggest_parser.add_argument(
        'target',
        help='Target in format filepath:itemname (e.g., examples/test.py:my_function)'
    )
    suggest_parser.add_argument(
        '--style-guide',
        choices=['jsdoc', 'numpy', 'google', 'sphinx'],
        default='numpy',
        help='Documentation style guide (default: numpy)'
    )
    suggest_parser.add_argument(
        '--tone',
        choices=['concise', 'detailed', 'friendly'],
        default='concise',
        help='Documentation tone (default: concise)'
    )
    suggest_parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    # Parse arguments
    args = parser.parse_args(argv)

    # Handle no command
    if not args.command:
        parser.print_help()
        return 1

    # Dispatch to command handler
    if args.command == 'analyze':
        return cmd_analyze(args)
    elif args.command == 'suggest':
        return cmd_suggest(args)

    return 1


if __name__ == '__main__':
    sys.exit(main())
