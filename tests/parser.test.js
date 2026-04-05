// plugin-compiler/tests/parser.test.js
'use strict';

const assert = require('assert');
const { parse } = require('../src/parser');

// Helper: minimal valid schema
function minimalSchema(overrides = {}) {
  return {
    meta: { name: 'test-plugin', version: '1.0.0', description: 'Test', platforms: ['claude-code'] },
    hooks: [{ event: 'SessionStart', command: 'node {PLUGIN_ROOT}/start.js', platforms: ['claude-code'] }],
    skills: [{ path: 'skills/', recursive: true }],
    extensions: {},
    ...overrides,
  };
}

function yamlFromObj(obj) {
  const yaml = require('../vendor/js-yaml');
  return yaml.dump(obj);
}

// Test: valid schema parses to correct IR shape
{
  const input = yamlFromObj(minimalSchema());
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, 'No errors for valid schema');
  assert.strictEqual(result.ir.meta.name, 'test-plugin');
  assert.strictEqual(result.ir.hooks.length, 1);
  assert.strictEqual(result.ir.hooks[0].event, 'SessionStart');
  assert.deepStrictEqual(result.ir.hooks[0].platforms, ['claude-code']);
  console.log('PASS: valid schema parses correctly');
}

// Test: missing required field → error
{
  const input = yamlFromObj(minimalSchema({ meta: { name: 'test', platforms: ['claude-code'] } }));
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('version')), 'Should report missing version');
  console.log('PASS: missing version produces error');
}

// Test: empty platforms → error
{
  const schema = minimalSchema();
  schema.meta.platforms = [];
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('platforms')), 'Should report empty platforms');
  console.log('PASS: empty platforms produces error');
}

// Test: unknown event → error
{
  const schema = minimalSchema();
  schema.hooks[0].event = 'ToolCall';
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('ToolCall')), 'Should report unknown event');
  console.log('PASS: unknown event produces error');
}

// Test: unknown platform in hook → error
{
  const schema = minimalSchema();
  schema.hooks[0].platforms = ['cursor'];
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('cursor')), 'Should report unknown platform');
  console.log('PASS: unknown platform produces error');
}

// Test: unknown extensions key → warning, not error
{
  const schema = minimalSchema();
  schema.extensions = { gemini: { foo: 'bar' } };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, 'Unknown extension is not an error');
  assert.ok(result.warnings.some(w => w.includes('gemini')), 'Should warn about unknown extension');
  console.log('PASS: unknown extension key produces warning');
}

// Test: {PLUGIN_ROOT} placeholder preserved through parser
{
  const input = yamlFromObj(minimalSchema());
  const result = parse(input);
  assert.ok(result.ir.hooks[0].command.includes('{PLUGIN_ROOT}'), 'Placeholder preserved');
  console.log('PASS: {PLUGIN_ROOT} preserved through parser');
}

// Test: hook missing command → error
{
  const schema = minimalSchema();
  delete schema.hooks[0].command;
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('command')), 'Should report missing command');
  console.log('PASS: missing command produces error');
}

// Test: hook missing platforms → error
{
  const schema = minimalSchema();
  delete schema.hooks[0].platforms;
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('platforms')), 'Should report missing platforms');
  console.log('PASS: missing platforms on hook produces error');
}

// Test: hook with no type field defaults to 'command' in IR
{
  const input = yamlFromObj(minimalSchema());
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.ir.hooks[0].type, 'command', 'Default type is command');
  console.log('PASS: hook type defaults to command');
}

// Test: explicit valid type passes validation
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'http', url: 'https://example.com/hook', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors}`);
  assert.strictEqual(result.ir.hooks[0].type, 'http');
  assert.strictEqual(result.ir.hooks[0].url, 'https://example.com/hook');
  console.log('PASS: http type with url parses correctly');
}

// Test: unknown type → error
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'grpc', command: 'node x.js', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('grpc')), 'Should report unknown type');
  console.log('PASS: unknown type produces error');
}

// Test: http type without url → error
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'http', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('url')), 'Should require url for http');
  console.log('PASS: http type without url produces error');
}

// Test: prompt type without prompt field → error
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'prompt', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('prompt')), 'Should require prompt for prompt type');
  console.log('PASS: prompt type without prompt produces error');
}

// Test: agent type with prompt field passes
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'agent', prompt: 'Verify tests pass', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors}`);
  assert.strictEqual(result.ir.hooks[0].prompt, 'Verify tests pass');
  console.log('PASS: agent type with prompt parses correctly');
}

// Test: new events (e.g. FileChanged, Notification) are accepted
{
  const schema = minimalSchema();
  schema.hooks = [
    { event: 'FileChanged', command: 'node {PLUGIN_ROOT}/watch.js', platforms: ['claude-code'] },
    { event: 'Notification', command: 'node {PLUGIN_ROOT}/notify.js', platforms: ['claude-code'] },
    { event: 'PostCompact', command: 'node {PLUGIN_ROOT}/compact.js', platforms: ['claude-code'] },
  ];
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors}`);
  assert.strictEqual(result.ir.hooks.length, 3);
  console.log('PASS: new events FileChanged, Notification, PostCompact accepted');
}

console.log('\nAll parser tests passed.');
