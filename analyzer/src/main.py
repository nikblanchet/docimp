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
from .audit.quality_rater import save_audit_results, AuditResult
from .claude.claude_client import ClaudeClient
from .claude.prompt_builder import PromptBuilder
from .parsers.python_parser import PythonParser
from .parsers.typescript_parser import TypeScriptParser
from .planning.plan_generator import generate_plan, save_plan
from .scoring.impact_scorer import ImpactScorer
from .utils.state_manager import StateManager
from .writer.docstring_writer import DocstringWriter


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
        # Ensure state directory exists
        StateManager.ensure_state_dir()

        # Validate write permission BEFORE clearing (in case files are read-only)
        analyze_file = StateManager.get_analyze_file()
        StateManager.validate_write_permission(analyze_file)

        # Clear session reports unless --keep-old-reports flag is set
        if args.keep_old_reports:
            if args.verbose:
                print("Keeping previous session reports", file=sys.stderr)
        else:
            files_removed = StateManager.clear_session_reports()
            if files_removed > 0:
                print(f"Cleared {files_removed} previous session report(s)", file=sys.stderr)

        # Create analyzer
        analyzer = create_analyzer()

        # Run analysis
        if args.verbose:
            print(f"Analyzing: {args.path}", file=sys.stderr)

        result = analyzer.analyze(args.path, verbose=args.verbose)

        # Save analysis result to state directory
        with open(analyze_file, 'w') as f:
            f.write(format_json(result))

        if args.verbose:
            print(f"Analysis saved to: {analyze_file}", file=sys.stderr)

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


def cmd_audit(args: argparse.Namespace) -> int:
    """Handle the audit subcommand.

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
            print(f"Finding documented items in: {args.path}", file=sys.stderr)

        result = analyzer.analyze(args.path, verbose=args.verbose)

        # Filter for items WITH documentation
        documented_items = [item for item in result.items if item.has_docs]

        if args.verbose:
            print(f"Found {len(documented_items)} documented items", file=sys.stderr)

        # Format output as JSON for TypeScript to consume
        data = {
            'items': [
                {
                    'name': item.name,
                    'type': item.type,
                    'filepath': item.filepath,
                    'line_number': item.line_number,
                    'language': item.language,
                    'complexity': item.complexity,
                    'docstring': item.docstring,
                    'audit_rating': item.audit_rating
                }
                for item in documented_items
            ]
        }

        print(json.dumps(data, indent=2))
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


def cmd_apply_audit(args: argparse.Namespace) -> int:
    """Handle the apply-audit subcommand to save audit ratings.

    Args:
        args: Parsed command-line arguments.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Ensure state directory exists
        StateManager.ensure_state_dir()

        # Read audit data from stdin
        audit_data = json.load(sys.stdin)

        # Convert to AuditResult
        audit_result = AuditResult(ratings=audit_data.get('ratings', {}))

        # Save to file
        save_audit_results(audit_result, Path(args.audit_file))

        if args.verbose:
            total_ratings = sum(len(items) for items in audit_result.ratings.values())
            print(f"Saved {total_ratings} audit ratings to {args.audit_file}", file=sys.stderr)

        return 0

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback
            traceback.print_exc(file=sys.stderr)
        return 1


def cmd_plan(args: argparse.Namespace) -> int:
    """Handle the plan subcommand.

    Args:
        args: Parsed command-line arguments.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Ensure state directory exists
        StateManager.ensure_state_dir()

        # Create analyzer
        analyzer = create_analyzer()

        # Run analysis
        if args.verbose:
            print(f"Analyzing: {args.path}", file=sys.stderr)

        result = analyzer.analyze(args.path, verbose=args.verbose)

        # Generate plan
        if args.verbose:
            print("Generating improvement plan...", file=sys.stderr)

        plan = generate_plan(
            result,
            audit_file=Path(args.audit_file),
            quality_threshold=args.quality_threshold
        )

        # Display warning if invalid ratings were found
        if plan.invalid_ratings_count > 0:
            if args.verbose:
                # Show detailed warnings for each invalid rating
                for inv in plan.invalid_ratings:
                    print(f"Warning: Invalid audit rating {inv['rating']} for {inv['name']} "
                          f"in {inv['filepath']} (expected 1-4), skipped",
                          file=sys.stderr)
            else:
                # Show summary warning
                print(f"Warning: {plan.invalid_ratings_count} invalid audit rating(s) skipped. "
                      f"Run with --verbose for details.",
                      file=sys.stderr)

        # Save plan to file
        plan_file = Path(args.plan_file)
        save_plan(plan, plan_file)

        if args.verbose:
            print(f"Plan saved to: {plan_file}", file=sys.stderr)

        # Output JSON to stdout
        print(json.dumps(plan.to_dict(), indent=2))

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


def cmd_apply(args: argparse.Namespace) -> int:
    """Handle the apply subcommand to write documentation to files.

    Args:
        args: Parsed command-line arguments.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Read apply data from stdin (sent by TypeScript CLI)
        apply_data = json.load(sys.stdin)

        filepath = apply_data.get('filepath')
        item_name = apply_data.get('item_name')
        item_type = apply_data.get('item_type')
        docstring = apply_data.get('docstring')
        language = apply_data.get('language')
        line_number = apply_data.get('line_number')
        base_path = apply_data.get('base_path', '/')

        if not all([filepath, item_name, item_type, docstring, language]):
            print("Error: Missing required fields in apply data", file=sys.stderr)
            return 1

        # Create writer with base_path for path validation
        writer = DocstringWriter(base_path=base_path)

        # Write docstring
        if args.verbose:
            print(f"Writing documentation for {item_name} in {filepath}", file=sys.stderr)

        success = writer.write_docstring(
            filepath=filepath,
            item_name=item_name,
            item_type=item_type,
            docstring=docstring,
            language=language,
            line_number=line_number
        )

        if success:
            result = {
                'success': True,
                'filepath': filepath,
                'item_name': item_name
            }
            print(json.dumps(result))
            return 0
        else:
            print(json.dumps({'success': False, 'error': 'Failed to write docstring'}))
            return 1

    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        return 1
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
        '--keep-old-reports',
        action='store_true',
        help='Preserve existing audit and plan files'
    )
    analyze_parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    # Audit command
    audit_parser = subparsers.add_parser(
        'audit',
        help='Find documented items for quality rating'
    )
    audit_parser.add_argument(
        'path',
        help='Path to file or directory to audit'
    )
    audit_parser.add_argument(
        '--audit-file',
        default=str(StateManager.get_audit_file()),
        help=f'Path to audit results file (default: {StateManager.get_audit_file()})'
    )
    audit_parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    # Apply-audit command
    apply_audit_parser = subparsers.add_parser(
        'apply-audit',
        help='Save audit ratings from stdin'
    )
    apply_audit_parser.add_argument(
        '--audit-file',
        default=str(StateManager.get_audit_file()),
        help=f'Path to audit results file (default: {StateManager.get_audit_file()})'
    )
    apply_audit_parser.add_argument(
        '--verbose',
        action='store_true',
        help='Enable verbose output'
    )

    # Plan command
    plan_parser = subparsers.add_parser(
        'plan',
        help='Generate prioritized documentation improvement plan'
    )
    plan_parser.add_argument(
        'path',
        help='Path to file or directory to analyze'
    )
    plan_parser.add_argument(
        '--audit-file',
        default=str(StateManager.get_audit_file()),
        help=f'Path to audit results file (default: {StateManager.get_audit_file()})'
    )
    plan_parser.add_argument(
        '--plan-file',
        default=str(StateManager.get_plan_file()),
        help=f'Path to save plan file (default: {StateManager.get_plan_file()})'
    )
    plan_parser.add_argument(
        '--quality-threshold',
        type=int,
        default=2,
        choices=[1, 2, 3, 4],
        help='Include items with audit rating <= threshold (default: 2)'
    )
    plan_parser.add_argument(
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
        choices=[
            # Python (4 variants)
            'google', 'numpy-rest', 'numpy-markdown', 'sphinx',
            # JavaScript (3 variants)
            'jsdoc-vanilla', 'jsdoc-google', 'jsdoc-closure',
            # TypeScript (3 variants)
            'tsdoc-typedoc', 'tsdoc-aedoc', 'jsdoc-ts'
        ],
        default='google',
        help='Documentation style guide (default: google)'
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

    # Apply command (write documentation to files)
    apply_parser = subparsers.add_parser(
        'apply',
        help='Apply documentation to a source file (reads JSON from stdin)'
    )
    apply_parser.add_argument(
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
    elif args.command == 'audit':
        return cmd_audit(args)
    elif args.command == 'apply-audit':
        return cmd_apply_audit(args)
    elif args.command == 'plan':
        return cmd_plan(args)
    elif args.command == 'suggest':
        return cmd_suggest(args)
    elif args.command == 'apply':
        return cmd_apply(args)

    return 1


if __name__ == '__main__':
    sys.exit(main())
