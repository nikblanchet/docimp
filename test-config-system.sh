#!/bin/bash
#
# Test script for configuration system (Step 10)
#
# This script validates that the configuration loader works correctly
# with various inputs and error conditions.

set -e  # Exit on error

echo "=== Configuration System Tests ==="
echo

# Change to project root
cd "$(dirname "$0")"

# Ensure CLI is built
echo "Building CLI..."
cd cli
npm run build
cd ..
echo "✓ Build complete"
echo

# Test 1: Load default config automatically
echo "Test 1: Load default config (docimp.config.js)"
node cli/dist/index.js analyze examples
echo "✓ Test 1 passed"
echo

# Test 2: Load config with verbose output
echo "Test 2: Load config with verbose flag"
node cli/dist/index.js analyze examples --verbose
echo "✓ Test 2 passed"
echo

# Test 3: Explicit config path
echo "Test 3: Explicit config path"
node cli/dist/index.js analyze examples --config ./docimp.config.js --verbose
echo "✓ Test 3 passed"
echo

# Test 4: Invalid style guide (should fail)
echo "Test 4: Invalid style guide (should fail)"
cat > /tmp/test-invalid-style.js << 'EOF'
export default {
  styleGuide: 'invalid',
  tone: 'concise',
};
EOF

if node cli/dist/index.js analyze examples --config /tmp/test-invalid-style.js 2>&1 | grep -q "Invalid styleGuide"; then
  echo "✓ Test 4 passed (validation error caught)"
else
  echo "✗ Test 4 failed (validation should have failed)"
  exit 1
fi
echo

# Test 5: Invalid tone (should fail)
echo "Test 5: Invalid tone (should fail)"
cat > /tmp/test-invalid-tone.js << 'EOF'
export default {
  styleGuide: 'jsdoc',
  tone: 'super-friendly',
};
EOF

if node cli/dist/index.js analyze examples --config /tmp/test-invalid-tone.js 2>&1 | grep -q "Invalid tone"; then
  echo "✓ Test 5 passed (validation error caught)"
else
  echo "✗ Test 5 failed (validation should have failed)"
  exit 1
fi
echo

# Test 6: Invalid impact weights (should fail)
echo "Test 6: Invalid impact weights (should fail)"
cat > /tmp/test-invalid-weights.js << 'EOF'
export default {
  styleGuide: 'jsdoc',
  tone: 'concise',
  impactWeights: {
    complexity: 1.5,
    quality: 0.4,
  },
};
EOF

if node cli/dist/index.js analyze examples --config /tmp/test-invalid-weights.js 2>&1 | grep -q "Invalid impactWeights"; then
  echo "✓ Test 6 passed (validation error caught)"
else
  echo "✗ Test 6 failed (validation should have failed)"
  exit 1
fi
echo

# Test 7: Valid CommonJS config
echo "Test 7: CommonJS config format"
cat > /tmp/test-commonjs.js << 'EOF'
module.exports = {
  styleGuide: 'numpy',
  tone: 'detailed',
  impactWeights: {
    complexity: 0.7,
    quality: 0.3,
  },
};
EOF

node cli/dist/index.js analyze examples --config /tmp/test-commonjs.js --verbose
echo "✓ Test 7 passed"
echo

# Test 8: Nonexistent config file (should fail)
echo "Test 8: Nonexistent config file (should fail)"
if node cli/dist/index.js analyze examples --config /tmp/does-not-exist.js 2>&1 | grep -q "not found"; then
  echo "✓ Test 8 passed (file not found error caught)"
else
  echo "✗ Test 8 failed (should have reported file not found)"
  exit 1
fi
echo

# Cleanup temp files
rm -f /tmp/test-*.js

echo "=== All Configuration Tests Passed ==="
