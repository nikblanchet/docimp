"""
Diagnostic script to verify issue #67: PythonParser method duplication.

This script is TEMPORARY and will be deleted after verification.
It exists to definitively prove whether methods are being extracted twice.
"""

import sys
from pathlib import Path

# Add analyzer to path
sys.path.insert(0, str(Path(__file__).parent / 'analyzer'))

from src.parsers.python_parser import PythonParser

def main():
    parser = PythonParser()
    test_file = Path(__file__).parent / 'examples' / 'test_simple.py'

    print("=" * 70)
    print("VERIFYING ISSUE #67: PythonParser Method Duplication")
    print("=" * 70)
    print(f"\nParsing: {test_file}")
    print()

    items = parser.parse_file(str(test_file))

    print(f"Total items extracted: {len(items)}")
    print()
    print("All extracted items:")
    print("-" * 70)

    for i, item in enumerate(items, 1):
        print(f"{i}. {item.type:10} | {item.name:30} | line {item.line_number}")

    print()
    print("=" * 70)
    print("ANALYSIS")
    print("=" * 70)

    # Expected counts based on test_simple.py:
    # - 1 function: async_function
    # - 1 class: ExampleClass
    # - 2 methods: ExampleClass.__init__, ExampleClass.value
    # Total: 4 items

    expected_count = 4
    actual_count = len(items)

    print(f"\nExpected items: {expected_count}")
    print(f"Actual items:   {actual_count}")

    if actual_count > expected_count:
        print(f"\n⚠️  BUG CONFIRMED: {actual_count - expected_count} duplicate items found!")

        # Look for duplicates by checking if method names appear both with and without class prefix
        methods_with_class = [item.name for item in items if item.type == 'method']
        functions = [item.name for item in items if item.type == 'function']

        print("\nFunctions extracted:")
        for name in functions:
            print(f"  - {name}")

        print("\nMethods extracted:")
        for name in methods_with_class:
            print(f"  - {name}")

        # Check if any function names match the unprefixed method names
        duplicates = []
        for method_name in methods_with_class:
            # Extract just the method part (after the dot)
            if '.' in method_name:
                simple_name = method_name.split('.')[1]
                if simple_name in functions:
                    duplicates.append((simple_name, method_name))

        if duplicates:
            print("\nDuplicate detection:")
            for func_name, method_name in duplicates:
                print(f"  - '{func_name}' (function) is same as '{method_name}' (method)")

    elif actual_count == expected_count:
        print("\n✓ No duplication detected. Issue #67 may have been fixed already.")

    else:
        print(f"\n⚠️  Unexpected: Found FEWER items than expected!")

    print("\n" + "=" * 70)

if __name__ == '__main__':
    main()
