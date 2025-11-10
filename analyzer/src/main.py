"""Command-line interface for the documentation analyzer.

This module provides the main entry point for running the analyzer from the
command line. It uses argparse to handle subcommands and configuration.
"""

import argparse
import json
import sys
from pathlib import Path

from .analysis.analyzer import DocumentationAnalyzer
from .audit.quality_rater import AuditResult, save_audit_results
from .claude.claude_client import ClaudeClient
from .claude.prompt_builder import PromptBuilder
from .parsers.python_parser import PythonParser
from .parsers.typescript_parser import TypeScriptParser
from .planning.plan_generator import generate_plan, save_plan
from .scoring.impact_scorer import ImpactScorer
from .utils.git_helper import GitHelper, GitTimeoutConfig
from .utils.state_manager import StateManager
from .utils.workflow_state_manager import WorkflowStateManager
from .writer.docstring_writer import DocstringWriter
from .writer.transaction_manager import TransactionManager


def create_analyzer(parsers: dict, scorer: ImpactScorer) -> DocumentationAnalyzer:
    """Create a DocumentationAnalyzer with injected dependencies.

    Args:
        parsers: Dictionary mapping language names to parser instances.
        scorer: Impact scorer instance for calculating priority scores.

    Returns:
        DocumentationAnalyzer: Configured analyzer instance.
    """
    return DocumentationAnalyzer(parsers=parsers, scorer=scorer)


def format_json(result) -> str:
    """Format analysis result as JSON.

    Args:
        result: AnalysisResult object to format.

    Returns:
        JSON string representation.
    """
    # Convert to dictionary for JSON serialization
    data = {
        "coverage_percent": result.coverage_percent,
        "total_items": result.total_items,
        "documented_items": result.documented_items,
        "by_language": {
            lang: {
                "language": metrics.language,
                "total_items": metrics.total_items,
                "documented_items": metrics.documented_items,
                "coverage_percent": metrics.coverage_percent,
                "avg_complexity": metrics.avg_complexity,
                "avg_impact_score": metrics.avg_impact_score,
            }
            for lang, metrics in result.by_language.items()
        },
        "items": [
            {
                "name": item.name,
                "type": item.type,
                "filepath": item.filepath,
                "line_number": item.line_number,
                "end_line": item.end_line,
                "language": item.language,
                "complexity": item.complexity,
                "impact_score": item.impact_score,
                "has_docs": item.has_docs,
                "parameters": item.parameters,
                "return_type": item.return_type,
                "docstring": item.docstring,
                "export_type": item.export_type,
                "module_system": item.module_system,
                "audit_rating": item.audit_rating,
            }
            for item in result.items
        ],
        "parse_failures": [
            {"filepath": failure.filepath, "error": failure.error}
            for failure in result.parse_failures
        ],
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
    lines.append(
        f"Overall Coverage: {result.coverage_percent:.1f}% "
        f"({result.documented_items}/{result.total_items} items)"
    )
    lines.append("")

    if result.by_language:
        lines.append("By Language:")
        lines.append("-" * 60)
        for lang, metrics in sorted(result.by_language.items()):
            lines.append(f"  {lang.capitalize()}:")
            lines.append(
                f"    Coverage: {metrics.coverage_percent:.1f}% "
                f"({metrics.documented_items}/{metrics.total_items})"
            )
            lines.append(f"    Avg Complexity: {metrics.avg_complexity:.1f}")
            lines.append(f"    Avg Impact Score: {metrics.avg_impact_score:.1f}")
            lines.append("")

    # Show undocumented items by priority
    undocumented = [item for item in result.items if not item.has_docs]
    if undocumented:
        lines.append("Top Undocumented Items (by impact):")
        lines.append("-" * 60)
        sorted_items = sorted(undocumented, key=lambda x: x.impact_score, reverse=True)
        lines.extend(
            f"  [{item.impact_score:5.1f}] {item.type:8s} "
            f"{item.name:30s} ({item.filepath}:{item.line_number})"
            for item in sorted_items[:10]  # Show top 10
        )

        if len(undocumented) > 10:
            lines.append(f"  ... and {len(undocumented) - 10} more")

    lines.append("")
    lines.append("=" * 60)
    return "\n".join(lines)


def cmd_analyze(args: argparse.Namespace, parsers: dict, scorer: ImpactScorer) -> int:
    """Handle the analyze subcommand.

    Args:
        args: Parsed command-line arguments.
        parsers: Dictionary mapping language names to parser instances
            (dependency injection).
        scorer: Impact scorer instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Ensure state directory exists
        StateManager.ensure_state_dir()

        # Validate write permission BEFORE clearing (in case files are read-only)
        analyze_file = StateManager.get_analyze_file()
        StateManager.validate_write_permission(analyze_file)

        # Clear session reports (default behavior to prevent stale data)
        files_removed = StateManager.clear_session_reports()
        if files_removed > 0 and args.verbose:
            print(
                f"Cleared {files_removed} previous session report(s)",
                file=sys.stderr,
            )

        # Create analyzer with injected dependencies
        analyzer = create_analyzer(parsers, scorer)

        # Run analysis
        if args.verbose:
            print(f"Analyzing: {args.path}", file=sys.stderr)

        result = analyzer.analyze(args.path, verbose=args.verbose, strict=args.strict)

        # Save analysis result to state directory
        with analyze_file.open("w") as f:
            f.write(format_json(result))

        if args.verbose:
            print(f"Analysis saved to: {analyze_file}", file=sys.stderr)

        # Format output
        if args.format == "json":
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


def cmd_audit(args: argparse.Namespace, parsers: dict, scorer: ImpactScorer) -> int:
    """Handle the audit subcommand.

    Args:
        args: Parsed command-line arguments.
        parsers: Dictionary mapping language names to parser instances
            (dependency injection).
        scorer: Impact scorer instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Create analyzer with injected dependencies
        analyzer = create_analyzer(parsers, scorer)

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
            "items": [
                {
                    "name": item.name,
                    "type": item.type,
                    "filepath": item.filepath,
                    "line_number": item.line_number,
                    "end_line": item.end_line,
                    "language": item.language,
                    "complexity": item.complexity,
                    "docstring": item.docstring,
                    "audit_rating": item.audit_rating,
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
        audit_result = AuditResult(ratings=audit_data.get("ratings", {}))

        # Save to file
        save_audit_results(audit_result, Path(args.audit_file))

        if args.verbose:
            total_ratings = sum(len(items) for items in audit_result.ratings.values())
            print(
                f"Saved {total_ratings} audit ratings to {args.audit_file}",
                file=sys.stderr,
            )

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


def cmd_plan(args: argparse.Namespace, parsers: dict, scorer: ImpactScorer) -> int:
    """Handle the plan subcommand.

    Args:
        args: Parsed command-line arguments.
        parsers: Dictionary mapping language names to parser instances
            (dependency injection).
        scorer: Impact scorer instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Ensure state directory exists
        StateManager.ensure_state_dir()

        # Create analyzer with injected dependencies
        analyzer = create_analyzer(parsers, scorer)

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
            quality_threshold=args.quality_threshold,
        )

        # Display warning if invalid ratings were found
        if plan.invalid_ratings_count > 0:
            if args.verbose:
                # Show detailed warnings for each invalid rating
                for inv in plan.invalid_ratings:
                    print(
                        f"Warning: Invalid audit rating {inv['rating']} for "
                        f"{inv['name']} in {inv['filepath']} (expected 1-4), "
                        f"skipped",
                        file=sys.stderr,
                    )
            else:
                # Show summary warning
                print(
                    f"Warning: {plan.invalid_ratings_count} invalid audit "
                    f"rating(s) skipped. Run with --verbose for details.",
                    file=sys.stderr,
                )

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


def cmd_suggest(
    args: argparse.Namespace, claude_client: ClaudeClient, prompt_builder: PromptBuilder
) -> int:
    """Handle the suggest subcommand.

    Args:
        args: Parsed command-line arguments.
        claude_client: ClaudeClient instance for API calls
            (dependency injection).
        prompt_builder: PromptBuilder instance for formatting prompts
            (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Parse the target (filepath:itemname format)
        if ":" not in args.target:
            print(
                "Error: Target must be in format 'filepath:itemname'", file=sys.stderr
            )
            print("Example: examples/test.py:my_function", file=sys.stderr)
            return 1

        filepath, item_name = args.target.rsplit(":", 1)
        filepath = Path(filepath)

        if not filepath.exists():
            print(f"Error: File not found: {filepath}", file=sys.stderr)
            return 1

        # Read the file
        with filepath.open() as f:
            code_content = f.read()

        # Determine language from file extension
        ext = filepath.suffix.lower()
        if ext == ".py":
            language = "python"
        elif ext in [".ts"]:
            language = "typescript"
        elif ext in [".js", ".cjs", ".mjs"]:
            language = "javascript"
        else:
            print(f"Error: Unsupported file type: {ext}", file=sys.stderr)
            return 1

        # Extract the specific function/class code (simple approach for MVP)
        # For a full implementation, we'd use the parsers to find the exact location
        # For now, just use the whole file as context
        target_code = code_content  # Simplified for MVP

        # Build prompt
        prompt = prompt_builder.build_prompt(
            code=target_code,
            item_name=item_name,
            item_type="function",  # Simplified for MVP
            language=language,
            feedback=args.feedback,
        )

        if args.verbose:
            print(f"Generating documentation for: {item_name}", file=sys.stderr)
            print(f"Style: {args.style_guide}, Tone: {args.tone}", file=sys.stderr)
            print("", file=sys.stderr)

        # Generate documentation
        docstring = claude_client.generate_docstring(prompt)

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


def cmd_apply(args: argparse.Namespace, docstring_writer: DocstringWriter) -> int:
    """Handle the apply subcommand to write documentation to files.

    Args:
        args: Parsed command-line arguments.
        docstring_writer: DocstringWriter instance for file operations
            (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Read apply data from stdin (sent by TypeScript CLI)
        apply_data = json.load(sys.stdin)

        filepath = apply_data.get("filepath")
        item_name = apply_data.get("item_name")
        item_type = apply_data.get("item_type")
        docstring = apply_data.get("docstring")
        language = apply_data.get("language")
        line_number = apply_data.get("line_number")
        backup_path = apply_data.get(
            "backup_path"
        )  # Optional, for transaction tracking

        if not all([filepath, item_name, item_type, docstring, language]):
            print("Error: Missing required fields in apply data", file=sys.stderr)
            return 1

        # Write docstring
        if args.verbose:
            print(
                f"Writing documentation for {item_name} in {filepath}", file=sys.stderr
            )

        success = docstring_writer.write_docstring(
            filepath=filepath,
            item_name=item_name,
            item_type=item_type,
            docstring=docstring,
            language=language,
            line_number=line_number,
            explicit_backup_path=backup_path,
        )

        if success:
            result = {"success": True, "filepath": filepath, "item_name": item_name}
            print(json.dumps(result))
            return 0
        else:
            print(json.dumps({"success": False, "error": "Failed to write docstring"}))
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


def cmd_list_sessions(args: argparse.Namespace, manager: TransactionManager) -> int:
    """Handle the list-sessions subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            print(
                "Error: Git not installed - session tracking unavailable",
                file=sys.stderr,
            )
            return 1

        # Get transactions directory
        transactions_dir = StateManager.get_state_dir() / "transactions"

        # List uncommitted sessions
        sessions = manager.list_uncommitted_transactions(transactions_dir)

        if not sessions:
            if args.format == "json":
                print(json.dumps([]))
            else:
                print("No active sessions found")
            return 0

        # Output format
        if args.format == "json":
            # JSON format for TypeScript CLI
            data = [
                {
                    "session_id": session.session_id,
                    "started_at": session.started_at,
                    "completed_at": session.completed_at,
                    "change_count": len(session.entries),
                    "status": session.status,
                }
                for session in sessions
            ]
            print(json.dumps(data, indent=2))
        else:
            # Human-readable table format
            print("=" * 80)
            print("Active DocImp Sessions")
            print("=" * 80)
            print(f"{'Session ID':<40} {'Started':<20} {'Changes':<10} {'Status':<10}")
            print("-" * 80)

            for session in sessions:
                print(
                    f"{session.session_id:<40} {session.started_at:<20} "
                    f"{len(session.entries):<10} {session.status:<10}"
                )

            print("=" * 80)
            print(f"\nTotal: {len(sessions)} session(s)")

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


def cmd_status(args: argparse.Namespace) -> int:
    """Handle the status subcommand.

    Displays workflow state including command execution status, staleness warnings,
    and actionable suggestions.

    Args:
        args: Parsed command-line arguments.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Load workflow state
        from datetime import datetime

        from .models.workflow_state_migrations import CURRENT_WORKFLOW_STATE_VERSION

        state = WorkflowStateManager.load_workflow_state()

        # Detect schema version (for display)
        workflow_file = StateManager.get_state_dir() / "workflow-state.json"
        schema_version = "legacy"
        migration_available = False
        if workflow_file.exists():
            with workflow_file.open(encoding="utf-8") as f:
                workflow_data = json.load(f)
                schema_version = workflow_data.get("schema_version", "legacy")
                migration_available = schema_version != CURRENT_WORKFLOW_STATE_VERSION

        # Helper to calculate staleness
        def is_stale(newer_cmd: str | None, older_cmd: str | None) -> tuple[bool, str]:
            """Check if older_cmd is stale compared to newer_cmd."""
            newer_state = getattr(state, f"last_{newer_cmd}") if newer_cmd else None
            older_state = getattr(state, f"last_{older_cmd}") if older_cmd else None

            if not newer_state or not older_state:
                return False, ""

            newer_time = datetime.fromisoformat(
                newer_state.timestamp.replace("Z", "+00:00")
            )
            older_time = datetime.fromisoformat(
                older_state.timestamp.replace("Z", "+00:00")
            )

            if newer_time > older_time:
                return True, f"{older_cmd} is stale (analyze re-run since {older_cmd})"
            return False, ""

        # Detect file modifications since last analyze
        import hashlib

        file_mods = 0
        if state.last_analyze:
            for filepath, checksum in state.last_analyze.file_checksums.items():
                try:
                    # Calculate current checksum
                    filepath_obj = Path(filepath)
                    if filepath_obj.exists():
                        with filepath_obj.open("rb") as file_handle:
                            current_checksum = hashlib.sha256(
                                file_handle.read()
                            ).hexdigest()
                        if current_checksum != checksum:
                            file_mods += 1
                    else:
                        file_mods += 1  # File deleted
                except OSError:
                    pass  # Skip inaccessible files

        # Build command states
        commands = []
        for cmd_name in ["analyze", "audit", "plan", "improve"]:
            cmd_state = getattr(state, f"last_{cmd_name}")
            if cmd_state:
                commands.append(
                    {
                        "command": cmd_name,
                        "status": "run",
                        "timestamp": cmd_state.timestamp,
                        "item_count": cmd_state.item_count,
                        "file_count": len(cmd_state.file_checksums),
                    }
                )
            else:
                commands.append({"command": cmd_name, "status": "not_run"})

        # Build staleness warnings
        staleness_warnings = []

        # Check if analyze is stale (files modified)
        if state.last_analyze and file_mods > 0:
            staleness_warnings.append(
                f"analyze is stale ({file_mods} file(s) modified since last run)"
            )

        # Check if audit is stale (analyze re-run)
        is_audit_stale, msg = is_stale("analyze", "audit")
        if is_audit_stale:
            staleness_warnings.append(msg)

        # Check if plan is stale (analyze or audit re-run)
        is_plan_stale_analyze, msg = is_stale("analyze", "plan")
        if is_plan_stale_analyze:
            staleness_warnings.append(msg)

        is_plan_stale_audit, msg = is_stale("audit", "plan")
        if is_plan_stale_audit:
            staleness_warnings.append("plan is stale (audit re-run since plan)")

        # Build suggestions
        suggestions = []
        if not state.last_analyze:
            suggestions.append("Run 'docimp analyze <path>' to analyze your codebase")
        elif file_mods > 0:
            suggestions.append("Run 'docimp analyze --incremental' to update analysis")
        elif not state.last_audit:
            suggestions.append(
                "Run 'docimp audit <path>' to rate documentation quality"
            )
        elif is_audit_stale:
            suggestions.append("Run 'docimp audit <path>' to refresh quality ratings")
        elif not state.last_plan:
            suggestions.append("Run 'docimp plan <path>' to generate improvement plan")
        elif is_plan_stale_analyze or is_plan_stale_audit:
            suggestions.append(
                "Run 'docimp plan <path>' to regenerate plan with latest data"
            )
        elif not state.last_improve:
            suggestions.append(
                "Run 'docimp improve <path>' to start improving documentation"
            )

        # Output format
        result = {
            "schema_version": schema_version,
            "schema_current": CURRENT_WORKFLOW_STATE_VERSION,
            "migration_available": migration_available,
            "commands": commands,
            "staleness_warnings": staleness_warnings,
            "suggestions": suggestions,
            "file_modifications": file_mods,
        }

        print(json.dumps(result, indent=2))
        return 0

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


def cmd_migrate_workflow_state(args: argparse.Namespace) -> int:
    """Handle the migrate-workflow-state subcommand.

    Manually migrate workflow-state.json with dry-run, check, version selection,
    and force options.

    Args:
        args: Parsed command-line arguments with dry_run, check, version, force.

    Returns:
        Exit code (0 for success, 1 for error).
    """
    from .models.workflow_state_migrations import (
        CURRENT_WORKFLOW_STATE_VERSION,
        apply_migrations,
        build_migration_path,
    )

    try:
        target_version = args.version or CURRENT_WORKFLOW_STATE_VERSION
        dry_run = args.dry_run
        check_mode = args.check
        force = args.force

        # Get workflow state file path
        workflow_file = StateManager.get_state_dir() / "workflow-state.json"

        # Check if file exists
        if not workflow_file.exists():
            if check_mode:
                # In check mode, no file means no migration needed
                print("No workflow state file found. No migration needed.")
                return 0
            print("No workflow state file found.", file=sys.stderr)
            print('Run "docimp analyze" to create workflow-state.json.')
            return 1

        # Load and parse file
        with workflow_file.open(encoding="utf-8") as f:
            data = json.load(f)
        current_version = data.get("schema_version", "legacy")

        # In check mode, just report status and exit
        if check_mode:
            if current_version == target_version:
                print(
                    f"Workflow state is at version {target_version}. "
                    "No migration needed."
                )
                return 0
            print(f"Migration needed: {current_version} → {target_version}")
            return 1

        # Display current state
        print("\nWorkflow State Migration\n")
        print(f"Current schema version: {current_version}")
        print(f"Target schema version:  {target_version}")

        # Check if migration needed
        if current_version == target_version:
            print("\nWorkflow state is already at target version. No migration needed.")
            return 0

        # Build migration path
        display_version = "none" if current_version == "legacy" else current_version
        try:
            if current_version == "legacy":
                migration_path = [f"legacy->{target_version}"]
            else:
                migration_path = build_migration_path(current_version, target_version)
        except ValueError:
            migration_path = [f"{display_version}->{target_version}"]

        print(f"\nMigration path: {' → '.join(migration_path)}")

        # Apply migrations
        migrated = apply_migrations(data, target_version)

        # Validate result
        from .models.workflow_state import WorkflowState

        try:
            WorkflowState.from_dict(migrated)
            print("Migration validation passed.")
        except (KeyError, ValueError) as validation_error:
            print(f"Migration validation failed: {validation_error}", file=sys.stderr)
            return 1

        if dry_run:
            print("\nDry run mode - no changes written.")
            print("\nMigrated data preview:")
            print(json.dumps(migrated, indent=2))
            return 0

        # Confirm before writing (unless --force)
        if not force:
            print(
                "\nThis will modify workflow-state.json. "
                "Create a backup first if needed."
            )
            response = input("Proceed with migration? [y/N] ").strip().lower()
            if response not in ("y", "yes"):
                print("Migration cancelled.")
                return 0

        # Write migrated data atomically (temp file + rename)
        temp_file = workflow_file.with_suffix(".json.tmp")
        with temp_file.open("w", encoding="utf-8") as f:
            json.dump(migrated, f, indent=2)
        temp_file.replace(workflow_file)

        print("\nMigration completed successfully.")
        print(f"Schema version updated to {target_version}.")
        return 0

    except ValueError as e:
        if not check_mode:
            print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        if not check_mode:
            print(f"Error: {e}", file=sys.stderr)
            if args.verbose:
                import traceback

                traceback.print_exc(file=sys.stderr)
        return 1


def cmd_list_changes(args: argparse.Namespace, manager: TransactionManager) -> int:
    """Handle the list-changes subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            print(
                "Error: Git not installed - session tracking unavailable",
                file=sys.stderr,
            )
            return 1

        # List changes in the session
        try:
            changes = manager.list_session_changes(args.session_id)
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            print(
                "Use 'docimp list-sessions' to see available sessions", file=sys.stderr
            )
            return 1

        if not changes:
            if args.format == "json":
                print(json.dumps([]))
            else:
                print(f"No changes found in session: {args.session_id}")
            return 0

        # Output format
        if args.format == "json":
            # JSON format for TypeScript CLI
            data = [
                {
                    "entry_id": change.entry_id,
                    "filepath": change.filepath,
                    "timestamp": change.timestamp,
                    "item_name": change.item_name,
                    "item_type": change.item_type,
                    "language": change.language,
                    "success": change.success,
                }
                for change in changes
            ]
            print(json.dumps(data, indent=2))
        else:
            # Human-readable table format
            print("=" * 100)
            print(f"Changes in Session: {args.session_id}")
            print("=" * 100)
            print(f"{'Entry ID':<12} {'File':<40} {'Item':<25} {'Timestamp':<20}")
            print("-" * 100)

            for change in changes:
                filepath_short = (
                    change.filepath[-37:]
                    if len(change.filepath) > 40
                    else change.filepath
                )
                item_short = (
                    change.item_name[:22] + "..."
                    if len(change.item_name) > 25
                    else change.item_name
                )
                timestamp_short = (
                    change.timestamp[:19]
                    if len(change.timestamp) > 20
                    else change.timestamp
                )
                print(
                    f"{change.entry_id:<12} {filepath_short:<40} "
                    f"{item_short:<25} {timestamp_short:<20}"
                )

            print("=" * 100)
            print(f"\nTotal: {len(changes)} change(s)")

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


def _build_git_timeout_config(args: argparse.Namespace) -> GitTimeoutConfig:
    """Build GitTimeoutConfig from CLI arguments.

    Args:
        args: Parsed command-line arguments with git timeout flags.

    Returns:
        GitTimeoutConfig instance with values from CLI or defaults.
    """
    return GitTimeoutConfig(
        base_timeout_ms=getattr(args, "git_timeout_base", 30000),
        fast_scale=getattr(args, "git_timeout_fast_scale", 0.167),
        slow_scale=getattr(args, "git_timeout_slow_scale", 4.0),
        max_timeout_ms=getattr(args, "git_timeout_max", 300000),
    )


def cmd_begin_transaction(args: argparse.Namespace, manager: TransactionManager) -> int:
    """Handle the begin-transaction subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            error_msg = "Git not installed - transaction tracking unavailable"
            if args.format == "json":
                result = {"success": False, "error": error_msg}
                print(json.dumps(result))
            else:
                print(f"Error: {error_msg}", file=sys.stderr)
            return 1

        # Begin the transaction
        session_id = args.session_id
        manager.begin_transaction(session_id)

        # Output result
        if args.format == "json":
            result = {
                "success": True,
                "message": f"Transaction initialized for session {session_id}",
            }
            print(json.dumps(result))
        else:
            print(f"Transaction initialized for session: {session_id}")

        return 0

    except Exception as e:
        error_msg = str(e)
        if args.format == "json":
            result = {"success": False, "error": error_msg}
            print(json.dumps(result))
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
            if args.verbose:
                import traceback

                traceback.print_exc(file=sys.stderr)
        return 1


def cmd_record_write(args: argparse.Namespace, manager: TransactionManager) -> int:
    """Handle the record-write subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            error_msg = "Git not installed - transaction tracking unavailable"
            if args.format == "json":
                result = {"success": False, "error": error_msg}
                print(json.dumps(result))
            else:
                print(f"Error: {error_msg}", file=sys.stderr)
            return 1

        # Get parameters
        session_id = args.session_id
        filepath = args.filepath
        backup_path = args.backup_path
        item_name = args.item_name
        item_type = args.item_type
        language = args.language

        # Create a minimal manifest for this session
        # The manifest is built from git commits, so we just need the session_id
        from datetime import UTC, datetime

        from .writer.transaction_manager import TransactionManifest

        manifest = TransactionManifest(
            session_id=session_id, started_at=datetime.now(UTC).isoformat()
        )

        # Record the write (creates git commit)
        manager.record_write(
            manifest, filepath, backup_path, item_name, item_type, language
        )

        # Output result
        if args.format == "json":
            result = {
                "success": True,
                "message": f"Recorded write for {item_name} in session {session_id}",
            }
            print(json.dumps(result))
        else:
            print(f"Recorded write for {item_name} in session: {session_id}")

        return 0

    except Exception as e:
        error_msg = str(e)
        if args.format == "json":
            result = {"success": False, "error": error_msg}
            print(json.dumps(result))
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
            if args.verbose:
                import traceback

                traceback.print_exc(file=sys.stderr)
        return 1


def cmd_commit_transaction(
    args: argparse.Namespace, manager: TransactionManager
) -> int:
    """Handle the commit-transaction subcommand.

    Finalizes a transaction by squash-merging the session branch to main,
    creating a single commit for the entire session, and deleting backup files.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            error_msg = "Git not installed - transaction commit unavailable"
            if args.format == "json":
                result = {"success": False, "error": error_msg}
                print(json.dumps(result))
            else:
                print(f"Error: {error_msg}", file=sys.stderr)
            return 1

        # Get session ID
        session_id = args.session_id

        # Create a minimal manifest for this session
        # The manifest will be populated from git commits
        from datetime import UTC, datetime

        from .writer.transaction_manager import TransactionManifest

        manifest = TransactionManifest(
            session_id=session_id, started_at=datetime.now(UTC).isoformat()
        )

        # Commit the transaction (squash merge to main, delete backups)
        manager.commit_transaction(manifest)

        # Output result
        if args.format == "json":
            result = {
                "success": True,
                "message": f"Transaction committed for session {session_id}",
                "squash_commit_sha": manifest.git_commit_sha,
            }
            print(json.dumps(result))
        else:
            print(f"Transaction committed for session: {session_id}")
            if manifest.git_commit_sha:
                print(f"Squash commit: {manifest.git_commit_sha}")

        return 0

    except Exception as e:
        error_msg = str(e)
        if args.format == "json":
            result = {"success": False, "error": error_msg}
            print(json.dumps(result))
        else:
            print(f"Error: {error_msg}", file=sys.stderr)
            if args.verbose:
                import traceback

                traceback.print_exc(file=sys.stderr)
        return 1


def cmd_rollback_session(args: argparse.Namespace, manager: TransactionManager) -> int:
    """Handle the rollback-session subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            print("Error: Git not installed - rollback unavailable", file=sys.stderr)
            return 1

        # Determine session ID (handle --last flag)
        session_id = args.session_id
        transactions_dir = StateManager.get_state_dir() / "transactions"

        if session_id == "last":
            # Find most recent session
            sessions = manager.list_uncommitted_transactions(transactions_dir)
            if not sessions:
                print("Error: No active sessions found", file=sys.stderr)
                return 1
            # Sort by started_at timestamp (most recent first)
            sessions.sort(key=lambda s: s.started_at, reverse=True)
            session_id = sessions[0].session_id

        # Load the session manifest
        manifest_path = transactions_dir / f"transaction-{session_id}.json"

        if not manifest_path.exists():
            print(f"Error: Session not found: {session_id}", file=sys.stderr)
            print(
                "Use 'docimp list-sessions' to see available sessions", file=sys.stderr
            )
            return 1

        manifest = manager.load_manifest(manifest_path)

        # Show session details (unless JSON output or no-confirm)
        if not args.no_confirm:
            print("=" * 60)
            print(f"Session: {manifest.session_id}")
            print(f"Started: {manifest.started_at}")
            print(f"Changes: {len(manifest.entries)}")
            print("=" * 60)

            # Prompt for confirmation
            response = input(
                "\nRollback this session? This will revert all changes. (y/N): "
            )
            if response.lower() not in ["y", "yes"]:
                print("Rollback cancelled")
                return 0

        # Perform rollback
        if not args.no_confirm:
            print("\nRolling back session...")

        restored_count = manager.rollback_transaction(manifest)

        # Output result
        if args.format == "json":
            # JSON format for TypeScript CLI
            result = {
                "success": True,
                "restored_count": restored_count,
                "status": manifest.status,
                "message": f"Rolled back {restored_count} file(s)",
            }
            print(json.dumps(result, indent=2))
        else:
            print(f"\nSuccess! Rolled back {restored_count} file(s)")
            print(f"Session marked as: {manifest.status}")

        return 0

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


def cmd_rollback_change(args: argparse.Namespace, manager: TransactionManager) -> int:
    """Handle the rollback-change subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            print("Error: Git not installed - rollback unavailable", file=sys.stderr)
            return 1

        # Determine entry ID (handle --last flag)
        entry_id = args.entry_id

        if entry_id == "last":
            # Find most recent change across all sessions
            transactions_dir = StateManager.get_state_dir() / "transactions"
            sessions = manager.list_uncommitted_transactions(transactions_dir)
            if not sessions:
                print("Error: No active sessions found", file=sys.stderr)
                return 1

            # Get all changes from all sessions and find the most recent
            all_changes = []
            for session in sessions:
                changes = manager.list_session_changes(session.session_id)
                all_changes.extend(changes)

            if not all_changes:
                print("Error: No changes found in any session", file=sys.stderr)
                return 1

            # Sort by timestamp (most recent first)
            all_changes.sort(key=lambda c: c.timestamp, reverse=True)
            entry_id = all_changes[0].entry_id

        # Get diff preview
        try:
            diff = manager.get_change_diff(entry_id)
        except Exception:
            print(f"Error: Change not found: {entry_id}", file=sys.stderr)
            return 1

        # Show diff (unless no-confirm or JSON output)
        if not args.no_confirm:
            print("=" * 60)
            print(f"Change: {entry_id}")
            print("=" * 60)
            print(diff)
            print("=" * 60)

            # Prompt for confirmation
            response = input("\nRollback this change? (y/N): ")
            if response.lower() not in ["y", "yes"]:
                print("Rollback cancelled")
                return 0

        # Perform rollback
        if not args.no_confirm:
            print("\nRolling back change...")

        result = manager.rollback_change(entry_id)

        # Output result
        if args.format == "json":
            # JSON format for TypeScript CLI
            result_data = {
                "success": result.success,
                "restored_count": result.restored_count,
                "failed_count": result.failed_count,
                "status": result.status,
                "conflicts": result.conflicts,
                "message": (
                    f"Rolled back {result.restored_count} file(s)"
                    if result.success
                    else f"Rollback failed: {result.failed_count} file(s) had conflicts"
                ),
            }
            print(json.dumps(result_data, indent=2))
        else:
            if result.success:
                print(f"\nSuccess! Rolled back {result.restored_count} file(s)")
            else:
                print(
                    f"\nRollback failed: {result.failed_count} file(s) had conflicts",
                    file=sys.stderr,
                )
                if result.conflicts:
                    print("\nConflict Details:", file=sys.stderr)
                    print(
                        "The following files have been modified since this "
                        "change was made:",
                        file=sys.stderr,
                    )
                    for conflict in result.conflicts:
                        print(f"  - {conflict}", file=sys.stderr)
                    print("\nResolution Options:", file=sys.stderr)
                    print("  1. Manually resolve conflicts:", file=sys.stderr)
                    print(
                        "     - Review the file and decide which version to keep",
                        file=sys.stderr,
                    )
                    print("     - Retry rollback after resolving", file=sys.stderr)
                    print("  2. Accept partial rollback:", file=sys.stderr)
                    print(
                        "     - Non-conflicting files were rolled back successfully",
                        file=sys.stderr,
                    )
                    print(
                        "     - Conflicting files remain in their current state",
                        file=sys.stderr,
                    )
                    print("  3. Use git directly:", file=sys.stderr)
                    print(
                        "     - git --git-dir=.docimp/state/.git "
                        "--work-tree=. revert <commit-sha>",
                        file=sys.stderr,
                    )

        return 0 if result.success else 1

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


def cmd_interactive_rollback(
    args: argparse.Namespace, manager: TransactionManager
) -> int:
    """Handle the interactive-rollback subcommand.

    Args:
        args: Parsed command-line arguments.
        manager: TransactionManager instance (dependency injection).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    try:
        # Check git availability
        if not GitHelper.check_git_available():
            print("Error: Git not installed - rollback unavailable", file=sys.stderr)
            return 1

        # Step 1: List sessions
        transactions_dir = StateManager.get_state_dir() / "transactions"
        sessions = manager.list_uncommitted_transactions(transactions_dir)

        if not sessions:
            print("No active sessions found")
            return 0

        print("=" * 60)
        print("Select a session to rollback:")
        print("=" * 60)

        for i, session in enumerate(sessions, 1):
            print(f"{i}. {session.session_id} ({len(session.entries)} changes)")

        # Get session selection
        while True:
            response = input(
                f"\nEnter session number (1-{len(sessions)}) or 'q' to quit: "
            )
            if response.lower() == "q":
                print("Cancelled")
                return 0
            try:
                session_idx = int(response) - 1
                if 0 <= session_idx < len(sessions):
                    break
                print(f"Please enter a number between 1 and {len(sessions)}")
            except ValueError:
                print("Please enter a valid number")

        selected_session = sessions[session_idx]

        # Step 2: List changes in selected session
        changes = manager.list_session_changes(selected_session.session_id)

        print("\n" + "=" * 60)
        print(f"Changes in session: {selected_session.session_id}")
        print("=" * 60)

        for i, change in enumerate(changes, 1):
            print(f"{i}. {change.item_name} in {change.filepath}")

        print(f"{len(changes) + 1}. Rollback entire session")

        # Get change selection
        while True:
            response = input(
                f"\nEnter change number (1-{len(changes) + 1}) or 'q' to quit: "
            )
            if response.lower() == "q":
                print("Cancelled")
                return 0
            try:
                change_idx = int(response) - 1
                if 0 <= change_idx <= len(changes):
                    break
                print(f"Please enter a number between 1 and {len(changes) + 1}")
            except ValueError:
                print("Please enter a valid number")

        # Step 3: Confirm and rollback
        if change_idx == len(changes):
            # Rollback entire session
            response = input(
                f"\nRollback entire session ({len(changes)} changes)? (y/N): "
            )
            if response.lower() not in ["y", "yes"]:
                print("Cancelled")
                return 0

            manifest_path = (
                transactions_dir / f"transaction-{selected_session.session_id}.json"
            )
            manifest = manager.load_manifest(manifest_path)
            restored_count = manager.rollback_transaction(manifest)
            print(f"\nSuccess! Rolled back {restored_count} file(s)")
        else:
            # Rollback individual change
            selected_change = changes[change_idx]
            response = input(
                f"\nRollback change to {selected_change.item_name}? (y/N): "
            )
            if response.lower() not in ["y", "yes"]:
                print("Cancelled")
                return 0

            result = manager.rollback_change(selected_change.entry_id)
            if result.success:
                print(f"\nSuccess! Rolled back {result.restored_count} file(s)")
            else:
                print(
                    f"\nRollback failed: {result.failed_count} file(s) had conflicts",
                    file=sys.stderr,
                )
                if result.conflicts:
                    print("\nConflict Details:", file=sys.stderr)
                    print(
                        "The following files have been modified since this "
                        "change was made:",
                        file=sys.stderr,
                    )
                    for conflict in result.conflicts:
                        print(f"  - {conflict}", file=sys.stderr)
                    print("\nResolution Options:", file=sys.stderr)
                    print("  1. Manually resolve conflicts and retry", file=sys.stderr)
                    print(
                        "  2. Accept partial rollback (non-conflicting files "
                        "rolled back)",
                        file=sys.stderr,
                    )
                    print(
                        "  3. Use git directly with --git-dir=.docimp/state/.git",
                        file=sys.stderr,
                    )
                return 1

        return 0

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        if args.verbose:
            import traceback

            traceback.print_exc(file=sys.stderr)
        return 1


def main(argv: list | None = None) -> int:
    """Main entry point for the CLI.

    Args:
        argv: Command-line arguments (defaults to sys.argv).

    Returns:
        Exit code (0 for success, 1 for error).
    """
    parser = argparse.ArgumentParser(
        prog="analyzer",
        description=(
            "Analyze documentation coverage in Python, TypeScript, and "
            "JavaScript codebases"
        ),
    )

    parser.add_argument("--version", action="version", version="%(prog)s 0.1.0")

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Analyze command
    analyze_parser = subparsers.add_parser(
        "analyze", help="Analyze documentation coverage"
    )
    analyze_parser.add_argument("path", help="Path to file or directory to analyze")
    analyze_parser.add_argument(
        "--format",
        choices=["json", "summary"],
        default="summary",
        help="Output format (default: summary)",
    )
    analyze_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )
    analyze_parser.add_argument(
        "--strict",
        action="store_true",
        help="Fail immediately on first parse error (for CI/CD and debugging)",
    )

    # Audit command
    audit_parser = subparsers.add_parser(
        "audit", help="Find documented items for quality rating"
    )
    audit_parser.add_argument("path", help="Path to file or directory to audit")
    audit_parser.add_argument(
        "--audit-file",
        default=str(StateManager.get_audit_file()),
        help=f"Path to audit results file (default: {StateManager.get_audit_file()})",
    )
    audit_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Apply-audit command
    apply_audit_parser = subparsers.add_parser(
        "apply-audit", help="Save audit ratings from stdin"
    )
    apply_audit_parser.add_argument(
        "--audit-file",
        default=str(StateManager.get_audit_file()),
        help=f"Path to audit results file (default: {StateManager.get_audit_file()})",
    )
    apply_audit_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Plan command
    plan_parser = subparsers.add_parser(
        "plan", help="Generate prioritized documentation improvement plan"
    )
    plan_parser.add_argument("path", help="Path to file or directory to analyze")
    plan_parser.add_argument(
        "--audit-file",
        default=str(StateManager.get_audit_file()),
        help=f"Path to audit results file (default: {StateManager.get_audit_file()})",
    )
    plan_parser.add_argument(
        "--plan-file",
        default=str(StateManager.get_plan_file()),
        help=f"Path to save plan file (default: {StateManager.get_plan_file()})",
    )
    plan_parser.add_argument(
        "--quality-threshold",
        type=int,
        default=2,
        choices=[1, 2, 3, 4],
        help="Include items with audit rating <= threshold (default: 2)",
    )
    plan_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Suggest command
    suggest_parser = subparsers.add_parser(
        "suggest",
        help="Generate documentation suggestion for a specific item using Claude",
    )
    suggest_parser.add_argument(
        "target",
        help="Target in format filepath:itemname (e.g., examples/test.py:my_function)",
    )
    suggest_parser.add_argument(
        "--style-guide",
        choices=[
            # Python (4 variants)
            "google",
            "numpy-rest",
            "numpy-markdown",
            "sphinx",
            # JavaScript (3 variants)
            "jsdoc-vanilla",
            "jsdoc-google",
            "jsdoc-closure",
            # TypeScript (3 variants)
            "tsdoc-typedoc",
            "tsdoc-aedoc",
            "jsdoc-ts",
        ],
        default="google",
        help="Documentation style guide (default: google)",
    )
    suggest_parser.add_argument(
        "--tone",
        choices=["concise", "detailed", "friendly"],
        default="concise",
        help="Documentation tone (default: concise)",
    )
    suggest_parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Claude API request timeout in seconds (default: 30.0)",
    )
    suggest_parser.add_argument(
        "--max-retries",
        type=int,
        default=3,
        help="Maximum retry attempts for Claude API (default: 3)",
    )
    suggest_parser.add_argument(
        "--retry-delay",
        type=float,
        default=1.0,
        help="Base delay between retries in seconds (default: 1.0)",
    )
    suggest_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )
    suggest_parser.add_argument(
        "--feedback",
        type=str,
        default=None,
        help="User feedback for regeneration (optional)",
    )

    # Apply command (write documentation to files)
    apply_parser = subparsers.add_parser(
        "apply", help="Apply documentation to a source file (reads JSON from stdin)"
    )
    apply_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # List-sessions command (list active sessions)
    list_sessions_parser = subparsers.add_parser(
        "list-sessions", help="List active DocImp sessions"
    )
    list_sessions_parser.add_argument(
        "--format",
        choices=["json", "table"],
        default="table",
        help="Output format (default: table)",
    )
    list_sessions_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Status command (display workflow state)
    status_parser = subparsers.add_parser(
        "status", help="Display workflow state and suggestions"
    )
    status_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Migrate-workflow-state command (migrate workflow-state.json)
    migrate_parser = subparsers.add_parser(
        "migrate-workflow-state",
        help="Migrate workflow-state.json to latest schema version",
    )
    migrate_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without making changes",
    )
    migrate_parser.add_argument(
        "--check",
        action="store_true",
        help="Exit code 1 if migration needed, 0 if current (for CI/CD)",
    )
    migrate_parser.add_argument(
        "--version",
        type=str,
        help="Target schema version (default: latest)",
    )
    migrate_parser.add_argument(
        "--force",
        action="store_true",
        help="Skip confirmation prompt",
    )
    migrate_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # List-changes command (list changes in a session)
    list_changes_parser = subparsers.add_parser(
        "list-changes", help="List changes in a specific session"
    )
    list_changes_parser.add_argument(
        "session_id", help="Session ID to list changes for"
    )
    list_changes_parser.add_argument(
        "--format",
        choices=["json", "table"],
        default="table",
        help="Output format (default: table)",
    )
    list_changes_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Begin-transaction command (initialize transaction tracking)
    begin_transaction_parser = subparsers.add_parser(
        "begin-transaction", help="Initialize transaction tracking for a session"
    )
    begin_transaction_parser.add_argument("session_id", help="Session UUID")
    begin_transaction_parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (json or text)",
    )
    begin_transaction_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )
    begin_transaction_parser.add_argument(
        "--git-timeout-base",
        type=int,
        default=30000,
        help="Base timeout for default git operations (milliseconds, default: 30000)",
    )
    begin_transaction_parser.add_argument(
        "--git-timeout-fast-scale",
        type=float,
        default=0.167,
        help="Scale factor for fast git operations (default: 0.167, produces 5s)",
    )
    begin_transaction_parser.add_argument(
        "--git-timeout-slow-scale",
        type=float,
        default=4.0,
        help="Scale factor for slow git operations (default: 4.0, produces 120s)",
    )
    begin_transaction_parser.add_argument(
        "--git-timeout-max",
        type=int,
        default=300000,
        help=(
            "Maximum timeout cap for any git operation (milliseconds, default: 300000)"
        ),
    )

    # Record-write command (record a documentation write in transaction)
    record_write_parser = subparsers.add_parser(
        "record-write", help="Record a documentation write in the current transaction"
    )
    record_write_parser.add_argument("session_id", help="Session UUID")
    record_write_parser.add_argument(
        "filepath", help="Absolute path to the modified file"
    )
    record_write_parser.add_argument("backup_path", help="Path to the backup file")
    record_write_parser.add_argument(
        "item_name", help="Name of the documented function/class/method"
    )
    record_write_parser.add_argument(
        "item_type", help="Type of code item (function, class, method)"
    )
    record_write_parser.add_argument(
        "language", help="Programming language (python, javascript, typescript)"
    )
    record_write_parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (json or text)",
    )
    record_write_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )
    record_write_parser.add_argument(
        "--git-timeout-base",
        type=int,
        default=30000,
        help="Base timeout for default git operations (milliseconds, default: 30000)",
    )
    record_write_parser.add_argument(
        "--git-timeout-fast-scale",
        type=float,
        default=0.167,
        help="Scale factor for fast git operations (default: 0.167, produces 5s)",
    )
    record_write_parser.add_argument(
        "--git-timeout-slow-scale",
        type=float,
        default=4.0,
        help="Scale factor for slow git operations (default: 4.0, produces 120s)",
    )
    record_write_parser.add_argument(
        "--git-timeout-max",
        type=int,
        default=300000,
        help=(
            "Maximum timeout cap for any git operation (milliseconds, default: 300000)"
        ),
    )

    # Commit-transaction command (finalize transaction with squash merge)
    commit_transaction_parser = subparsers.add_parser(
        "commit-transaction",
        help="Finalize transaction by squash-merging session to main",
    )
    commit_transaction_parser.add_argument("session_id", help="Session UUID")
    commit_transaction_parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="text",
        help="Output format (json or text)",
    )
    commit_transaction_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )
    commit_transaction_parser.add_argument(
        "--git-timeout-base",
        type=int,
        default=30000,
        help="Base timeout for default git operations (milliseconds, default: 30000)",
    )
    commit_transaction_parser.add_argument(
        "--git-timeout-fast-scale",
        type=float,
        default=0.167,
        help="Scale factor for fast git operations (default: 0.167, produces 5s)",
    )
    commit_transaction_parser.add_argument(
        "--git-timeout-slow-scale",
        type=float,
        default=4.0,
        help="Scale factor for slow git operations (default: 4.0, produces 120s)",
    )
    commit_transaction_parser.add_argument(
        "--git-timeout-max",
        type=int,
        default=300000,
        help=(
            "Maximum timeout cap for any git operation (milliseconds, default: 300000)"
        ),
    )

    # Rollback-session command (rollback entire session)
    rollback_session_parser = subparsers.add_parser(
        "rollback-session", help="Rollback an entire session (revert all changes)"
    )
    rollback_session_parser.add_argument(
        "session_id", help='Session ID to rollback, or "last" for most recent session'
    )
    rollback_session_parser.add_argument(
        "--format",
        choices=["json", "table"],
        default="table",
        help="Output format (default: table)",
    )
    rollback_session_parser.add_argument(
        "--no-confirm",
        action="store_true",
        help="Skip confirmation prompt (for scripting)",
    )
    rollback_session_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Rollback-change command (rollback individual change)
    rollback_change_parser = subparsers.add_parser(
        "rollback-change", help="Rollback a specific change"
    )
    rollback_change_parser.add_argument(
        "entry_id",
        help='Entry ID (commit SHA) to rollback, or "last" for most recent change',
    )
    rollback_change_parser.add_argument(
        "--format",
        choices=["json", "table"],
        default="table",
        help="Output format (default: table)",
    )
    rollback_change_parser.add_argument(
        "--no-confirm",
        action="store_true",
        help="Skip confirmation prompt (for scripting)",
    )
    rollback_change_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Interactive-rollback command (interactive session/change selection)
    interactive_rollback_parser = subparsers.add_parser(
        "interactive-rollback",
        help="Interactive rollback with session and change selection",
    )
    interactive_rollback_parser.add_argument(
        "--verbose", action="store_true", help="Enable verbose output"
    )

    # Parse arguments
    args = parser.parse_args(argv)

    # Handle no command
    if not args.command:
        parser.print_help()
        return 1

    # Instantiate dependencies (ONLY place with instantiation in Python)
    # These are shared across most commands
    parsers = {
        "python": PythonParser(),
        "typescript": TypeScriptParser(),
        "javascript": TypeScriptParser(),
    }
    scorer = ImpactScorer()

    # Dispatch to command handler with injected dependencies
    if args.command == "analyze":
        return cmd_analyze(args, parsers, scorer)
    elif args.command == "audit":
        return cmd_audit(args, parsers, scorer)
    elif args.command == "apply-audit":
        return cmd_apply_audit(args)
    elif args.command == "plan":
        return cmd_plan(args, parsers, scorer)
    elif args.command == "suggest":
        # Create Claude client and prompt builder for suggest command
        try:
            claude_client = ClaudeClient(
                timeout=args.timeout,
                max_retries=args.max_retries,
                retry_delay=args.retry_delay,
            )
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            print(
                "Please set the ANTHROPIC_API_KEY environment variable", file=sys.stderr
            )
            return 1
        prompt_builder = PromptBuilder(style_guide=args.style_guide, tone=args.tone)
        return cmd_suggest(args, claude_client, prompt_builder)
    elif args.command == "apply":
        # Create docstring writer for apply command
        apply_data = json.load(sys.stdin)
        base_path = apply_data.get("base_path", "/")
        docstring_writer = DocstringWriter(base_path=base_path)
        # Need to "rewind" stdin for cmd_apply to read it again
        import io

        sys.stdin = io.StringIO(json.dumps(apply_data))
        return cmd_apply(args, docstring_writer)
    elif args.command == "list-sessions":
        # Create transaction manager for session listing
        manager = TransactionManager()
        return cmd_list_sessions(args, manager)
    elif args.command == "status":
        # Display workflow state
        return cmd_status(args)
    elif args.command == "migrate-workflow-state":
        # Migrate workflow state
        return cmd_migrate_workflow_state(args)
    elif args.command == "list-changes":
        # Create transaction manager for change listing
        base_path = Path.cwd()
        manager = TransactionManager(base_path=base_path)
        return cmd_list_changes(args, manager)
    elif args.command == "begin-transaction":
        # Create transaction manager for beginning transaction
        base_path = Path.cwd()
        timeout_config = _build_git_timeout_config(args)
        manager = TransactionManager(base_path=base_path, timeout_config=timeout_config)
        return cmd_begin_transaction(args, manager)
    elif args.command == "record-write":
        # Create transaction manager for recording write
        base_path = Path.cwd()
        timeout_config = _build_git_timeout_config(args)
        manager = TransactionManager(base_path=base_path, timeout_config=timeout_config)
        return cmd_record_write(args, manager)
    elif args.command == "commit-transaction":
        # Create transaction manager for committing transaction
        base_path = Path.cwd()
        timeout_config = _build_git_timeout_config(args)
        manager = TransactionManager(base_path=base_path, timeout_config=timeout_config)
        return cmd_commit_transaction(args, manager)
    elif args.command == "rollback-session":
        # Create transaction manager for session rollback
        base_path = Path.cwd()
        manager = TransactionManager(base_path=base_path)
        return cmd_rollback_session(args, manager)
    elif args.command == "rollback-change":
        # Create transaction manager for change rollback
        base_path = Path.cwd()
        manager = TransactionManager(base_path=base_path)
        return cmd_rollback_change(args, manager)
    elif args.command == "interactive-rollback":
        # Create transaction manager for interactive rollback
        base_path = Path.cwd()
        manager = TransactionManager(base_path=base_path)
        return cmd_interactive_rollback(args, manager)

    return 1


if __name__ == "__main__":
    sys.exit(main())
