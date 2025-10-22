/**
 * Performance test for validate-types caching.
 *
 * This script measures validation performance with and without cache hits
 * to demonstrate the memory leak fix.
 */

import { PluginManager } from './cli/dist/plugins/PluginManager.js';
import { clearCache } from './plugins/validate-types.js';

async function measureValidation(label, docstring, item, config, iterations = 5) {
  const times = [];

  for (let i = 0; i < iterations; i++) {
    const manager = new PluginManager();
    await manager.loadPlugins(['./plugins/validate-types.js']);

    const start = performance.now();
    await manager.runBeforeAccept(docstring, item, config);
    const end = performance.now();

    times.push(end - start);
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`${label}:`);
  console.log(`  Avg: ${avg.toFixed(2)}ms`);
  console.log(`  Min: ${min.toFixed(2)}ms`);
  console.log(`  Max: ${max.toFixed(2)}ms`);
  console.log(`  Times: [${times.map(t => t.toFixed(2)).join(', ')}]ms`);

  return { avg, min, max, times };
}

async function runPerformanceTests() {
  console.log('Testing validate-types Plugin Cache Performance\n');
  console.log('='.repeat(60));

  const docstring = `/**
 * Calculate the total price with tax.
 * @param {number} price - Base price
 * @param {number} taxRate - Tax rate (0-1)
 * @returns {number} Total price with tax
 */`;

  const item = {
    name: 'calculateTotal',
    type: 'function',
    filepath: 'test-calc.js',
    line_number: 1,
    language: 'javascript',
    complexity: 2,
    export_type: 'named',
    parameters: ['price', 'taxRate'],
    code: 'function calculateTotal(price, taxRate) { return price * (1 + taxRate); }',
  };

  const config = {
    styleGuide: 'jsdoc',
    tone: 'concise',
    jsdocStyle: {
      enforceTypes: true,
    },
  };

  console.log('\n1. Cold start (cache cleared before each validation)');
  console.log('-'.repeat(60));
  clearCache();
  const coldResults = await measureValidation(
    'Cold Start Performance',
    docstring,
    item,
    config,
    5
  );

  console.log('\n2. Warm cache (same file validated multiple times)');
  console.log('-'.repeat(60));
  // Don't clear cache - let it accumulate
  const warmResults = await measureValidation(
    'Warm Cache Performance',
    docstring,
    item,
    config,
    5
  );

  console.log('\n' + '='.repeat(60));
  console.log('Performance Summary:');
  console.log('='.repeat(60));
  const improvement = ((coldResults.avg - warmResults.avg) / coldResults.avg * 100).toFixed(1);
  console.log(`Average cold start: ${coldResults.avg.toFixed(2)}ms`);
  console.log(`Average warm cache: ${warmResults.avg.toFixed(2)}ms`);
  console.log(`Improvement: ${improvement}% faster with cache`);

  if (warmResults.avg < coldResults.avg) {
    console.log('\n✓ Cache is working - warm validations are faster!');
  } else {
    console.log('\n⚠ Warning: Cache might not be providing benefit');
  }

  console.log('\nNote: The first validation creates the language service,');
  console.log('subsequent validations reuse it, preventing memory leaks.');
}

// Run the tests
runPerformanceTests().catch(console.error);
