# Example Project

This is a sample polyglot codebase for testing DocImp's documentation analysis and improvement capabilities.

## Purpose

This project exists solely for testing and demonstrating DocImp. It contains:

- **Python modules** with varying documentation quality
- **TypeScript services** with different JSDoc coverage levels
- **JavaScript utilities** using both ESM and CommonJS

## Project Structure

```
example-project/
├── src/
│   ├── python/
│   │   ├── calculator.py    # Basic arithmetic with mixed documentation
│   │   └── validator.py     # Input validation utilities
│   ├── typescript/
│   │   ├── service.ts       # User service with dependency injection
│   │   └── utils.ts         # Utility functions
│   └── javascript/
│       ├── api.js           # API client (ESM)
│       └── helpers.cjs      # Helper utilities (CommonJS)
├── tests/
│   └── test_calculator.py   # Test file
├── node_modules/
│   └── fake-package/        # Should be ignored by DocImp
└── README.md
```

## Documentation Quality Distribution

This project intentionally includes varying levels of documentation quality:

- **Excellent (4)**: Complete documentation with examples
- **Good (3)**: Solid documentation, clear descriptions
- **OK (2)**: Minimal documentation, missing details
- **Terrible (1)**: Very poor or misleading documentation
- **None**: Missing documentation entirely

## Complexity Distribution

Functions range from simple (complexity 1) to complex (complexity 10+):

- Simple arithmetic operations
- Input validation with multiple conditions
- Database operations with error handling
- Async retry logic with exponential backoff
- Recursive algorithms

## Testing with DocImp

To analyze this project with DocImp:

```bash
# From the example-project directory
cd test-samples/example-project/

# Analyze documentation coverage
docimp analyze .

# Audit documentation quality (interactive)
docimp audit .

# Generate improvement plan
docimp plan .

# Interactive documentation improvement
docimp improve .
```

## Restoration

After running `docimp improve` and modifying files, restore to original state:

```bash
git restore test-samples/example-project/
```

This will reset all files to their original state for repeated testing.
