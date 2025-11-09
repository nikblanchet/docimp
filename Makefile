.PHONY: setup lint format test test-cov typecheck quality clean help

# Setup environment
setup:
	@echo "Creating uv environment..."
	uv venv
	@echo "Installing dependencies..."
	uv pip sync requirements-dev.lock
	uv pip install -e .
	@echo "✓ Environment ready"

# Linting
lint:
	@echo "Linting Python code..."
	uv run ruff check analyzer/

# Formatting
format:
	@echo "Formatting Python code..."
	uv run ruff format analyzer/

# Testing
test:
	@echo "Running Python tests..."
	uv run pytest analyzer/tests/ -v

test-cov:
	@echo "Running Python tests with coverage..."
	uv run pytest analyzer/tests/ -v --cov=analyzer/src --cov-report=term

# Type checking
typecheck:
	@echo "Type checking Python code..."
	uv run mypy analyzer/src --ignore-missing-imports

# Run all quality checks
quality: lint typecheck test
	@echo "✓ All quality checks passed"

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	rm -rf .coverage htmlcov/
	@echo "✓ Cleaned"

# Help
help:
	@echo "DocImp Python Development Commands"
	@echo ""
	@echo "  make setup      - Create environment and install dependencies"
	@echo "  make lint       - Run ruff linting"
	@echo "  make format     - Format code with ruff"
	@echo "  make test       - Run pytest"
	@echo "  make test-cov   - Run pytest with coverage"
	@echo "  make typecheck  - Run mypy type checking"
	@echo "  make quality    - Run all quality checks"
	@echo "  make clean      - Remove build artifacts"
