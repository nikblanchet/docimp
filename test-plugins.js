/**
 * Test script for plugin system validation.
 *
 * This script tests:
 * - Plugin loading
 * - Type validation plugin
 * - Style validation plugin
 * - Error handling
 */

import { PluginManager } from './cli/dist/plugins/PluginManager.js';

/**
 * Run all plugin tests.
 */
async function runTests() {
  console.log('Testing DocImp Plugin System\n');
  console.log('='.repeat(50));

  try {
    await testPluginLoading();
    await testTypeValidation();
    await testStyleValidation();
    console.log('\n' + '='.repeat(50));
    console.log('All tests passed!');
  } catch (error) {
    console.error('\n' + '='.repeat(50));
    console.error('Test failed:', error.message);
    process.exit(1);
  }
}

/**
 * Test plugin loading.
 */
async function testPluginLoading() {
  console.log('\n1. Testing Plugin Loading...');

  const manager = new PluginManager();
  await manager.loadPlugins([
    './plugins/validate-types.js',
    './plugins/jsdoc-style.js',
  ]);

  const loadedPlugins = manager.getLoadedPlugins();

  if (loadedPlugins.length !== 2) {
    throw new Error(`Expected 2 plugins, got ${loadedPlugins.length}`);
  }

  if (!loadedPlugins.includes('validate-types')) {
    throw new Error('validate-types plugin not loaded');
  }

  if (!loadedPlugins.includes('jsdoc-style')) {
    throw new Error('jsdoc-style plugin not loaded');
  }

  console.log('   Loaded plugins:', loadedPlugins.join(', '));
  console.log('   ✓ Plugin loading successful');
}

/**
 * Test type validation plugin.
 */
async function testTypeValidation() {
  console.log('\n2. Testing Type Validation Plugin...');

  const manager = new PluginManager();
  await manager.loadPlugins(['./plugins/validate-types.js']);

  // Test case 1: Parameter name mismatch
  console.log('   Test 2.1: Parameter name mismatch...');
  const badDoc = `/**
 * Add two numbers
 * @param {number} wrongName - First number
 * @param {number} b - Second number
 * @returns {number} Sum
 */`;

  const item = {
    name: 'add',
    type: 'function',
    filepath: 'test.js',
    line_number: 1,
    language: 'javascript',
    complexity: 2,
    export_type: 'named',
    parameters: ['a', 'b'],
    code: 'function add(a, b) { return a + b; }',
  };

  const config = {
    styleGuide: 'jsdoc',
    tone: 'concise',
    jsdocStyle: {
      enforceTypes: true,
    },
  };

  const results1 = await manager.runBeforeAccept(badDoc, item, config);

  if (results1.length === 0) {
    throw new Error('Expected validation result');
  }

  if (results1[0].accept !== false) {
    throw new Error('Expected validation to reject parameter mismatch');
  }

  console.log('   ✓ Parameter mismatch detected');
  console.log('   ✓ Error:', results1[0].reason.split('\n')[0]);

  // Test case 2: Valid documentation
  console.log('   Test 2.2: Valid documentation...');
  const goodDoc = `/**
 * Add two numbers
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum
 */`;

  const results2 = await manager.runBeforeAccept(goodDoc, item, config);

  if (results2[0].accept !== true) {
    throw new Error('Expected validation to accept correct parameters: ' + results2[0].reason);
  }

  console.log('   ✓ Valid documentation accepted');
}

/**
 * Test style validation plugin.
 */
async function testStyleValidation() {
  console.log('\n3. Testing Style Validation Plugin...');

  const manager = new PluginManager();
  await manager.loadPlugins(['./plugins/jsdoc-style.js']);

  // Test case 1: Missing punctuation
  console.log('   Test 3.1: Missing punctuation...');
  const noPunctuation = `/**
 * Add two numbers
 * @param {number} a - First number
 * @returns {number}
 */`;

  const item = {
    name: 'add',
    type: 'function',
    filepath: 'test.js',
    line_number: 1,
    language: 'javascript',
    complexity: 2,
    export_type: 'named',
  };

  const config = {
    styleGuide: 'jsdoc',
    tone: 'concise',
    jsdocStyle: {
      requireDescriptions: true,
      preferredTags: {
        return: 'returns',
      },
    },
  };

  const results1 = await manager.runBeforeAccept(noPunctuation, item, config);

  if (results1[0].accept !== false) {
    throw new Error('Expected validation to reject missing punctuation');
  }

  console.log('   ✓ Missing punctuation detected');

  // Check for auto-fix
  if (results1[0].autoFix) {
    console.log('   ✓ Auto-fix provided');
  }

  // Test case 2: Wrong tag alias
  console.log('   Test 3.2: Wrong tag alias (@return instead of @returns)...');
  const wrongTag = `/**
 * Add two numbers.
 * @param {number} a - First number
 * @return {number}
 */`;

  const results2 = await manager.runBeforeAccept(wrongTag, item, config);

  if (results2[0].accept !== false) {
    throw new Error('Expected validation to reject wrong tag alias');
  }

  console.log('   ✓ Wrong tag alias detected');

  if (results2[0].autoFix && results2[0].autoFix.includes('@returns')) {
    console.log('   ✓ Auto-fix converts @return to @returns');
  }

  // Test case 3: Valid documentation
  console.log('   Test 3.3: Valid documentation...');
  const goodDoc = `/**
 * Add two numbers.
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum
 */`;

  const results3 = await manager.runBeforeAccept(goodDoc, item, config);

  if (results3[0].accept !== true) {
    throw new Error('Expected validation to accept correct style: ' + results3[0].reason);
  }

  console.log('   ✓ Valid documentation accepted');
}

// Run the tests
runTests().catch(console.error);
