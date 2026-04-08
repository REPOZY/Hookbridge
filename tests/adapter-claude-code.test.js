// plugin-compiler/tests/adapter-claude-code.test.js
'use strict';

const assert = require('assert');
const { emit } = require('../src/adapters/claude-code');

function makeIR(hooks = [], extensions = {}) {
  return {
    meta: { name: 'test-plugin', version: '1.0.0', description: 'Test', platforms: ['claude-code'] },
    hooks,
    skills: [{ path: 'skills/', recursive: true }],
    extensions: { 'claude-code': { env_var: 'CLAUDE_PLUGIN_ROOT', hook_quoting: 'escaped-double-quotes' }, ...extensions },
  };
}

// Test: hook with matcher emits group object with matcher key
{
  const ir = makeIR([
    { event: 'PostToolUse', matcher: 'Edit|Write', command: 'node {PLUGIN_ROOT}/track.js', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  assert.strictEqual(output.hooks.PostToolUse[0].matcher, 'Edit|Write');
  console.log('PASS: matcher emitted correctly');
}

// Test: hook without matcher emits group without matcher key
{
  const ir = makeIR([
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/stop.js', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  assert.strictEqual(output.hooks.Stop[0].matcher, undefined);
  console.log('PASS: no matcher when absent');
}

// Test: async: true emits "async": true
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/ctx.js', async: true, platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  assert.strictEqual(output.hooks.SessionStart[0].hooks[0].async, true);
  console.log('PASS: async: true emitted');
}

// Test: {PLUGIN_ROOT} replaced with "${CLAUDE_PLUGIN_ROOT}" using escaped double-quotes
{
  const ir = makeIR([
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/stop.js', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const command = output.hooks.Stop[0].hooks[0].command;
  assert.ok(command.includes('"${CLAUDE_PLUGIN_ROOT}/stop.js"'), `Expected escaped quotes in command, got: ${command}`);
  // Also verify the raw JSON has the backslash-escaped quotes (hooks.json contract)
  const raw = result.files.get('hooks/hooks.json');
  assert.ok(raw.includes('\\"${CLAUDE_PLUGIN_ROOT}/stop.js\\"'), `Expected backslash-escaped quotes in JSON, got: ${raw}`);
  console.log('PASS: {PLUGIN_ROOT} substituted with escaped double-quotes');
}

// Test: multiple hooks same event → in schema order
{
  const ir = makeIR([
    { event: 'PreToolUse', matcher: 'Bash', command: 'node {PLUGIN_ROOT}/a.js', platforms: ['claude-code'] },
    { event: 'PreToolUse', matcher: 'Bash', command: 'node {PLUGIN_ROOT}/b.js', platforms: ['claude-code'] },
    { event: 'PreToolUse', matcher: 'Bash', command: 'node {PLUGIN_ROOT}/c.js', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const commands = output.hooks.PreToolUse.map(g => g.hooks[0].command);
  assert.ok(commands[0].includes('/a.js'), 'First hook is a.js');
  assert.ok(commands[1].includes('/b.js'), 'Second hook is b.js');
  assert.ok(commands[2].includes('/c.js'), 'Third hook is c.js');
  console.log('PASS: hooks emitted in schema order');
}

// Test: hook with platforms: [codex] only → skipped, no loss
{
  const ir = makeIR([
    { event: 'PreToolUse', matcher: 'Bash', command: 'node {PLUGIN_ROOT}/codex-only.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  assert.strictEqual(output.hooks.PreToolUse, undefined, 'Codex-only hook not emitted');
  assert.strictEqual(result.losses.length, 0, 'No loss for codex-only hook');
  console.log('PASS: codex-only hook skipped without loss');
}

// Test: SubagentStop emits correctly
{
  const ir = makeIR([
    { event: 'SubagentStop', command: 'node {PLUGIN_ROOT}/guard.js', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  assert.ok(output.hooks.SubagentStop, 'SubagentStop event exists');
  console.log('PASS: SubagentStop emitted');
}

// Test: plugin.json manifest generated
{
  const ir = makeIR([]);
  const result = emit(ir);
  assert.ok(result.files.has('.claude-plugin/plugin.json'), 'plugin.json generated');
  const manifest = JSON.parse(result.files.get('.claude-plugin/plugin.json'));
  assert.strictEqual(manifest.name, 'test-plugin');
  assert.strictEqual(manifest.version, '1.0.0');
  console.log('PASS: plugin.json manifest generated');
}

// Test: http type hook emits correct hookEntry structure
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://audit.example.com/stop', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.strictEqual(hookEntry.type, 'http');
  assert.strictEqual(hookEntry.url, 'https://audit.example.com/stop');
  assert.strictEqual(hookEntry.command, undefined, 'http type has no command field');
  console.log('PASS: http type emits correct hookEntry');
}

// Test: prompt type hook emits correct hookEntry structure
{
  const ir = makeIR([
    { event: 'Stop', type: 'prompt', prompt: 'Are all tasks done?', model: 'claude-haiku-4-5', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.strictEqual(hookEntry.type, 'prompt');
  assert.strictEqual(hookEntry.prompt, 'Are all tasks done?');
  assert.strictEqual(hookEntry.model, 'claude-haiku-4-5');
  assert.strictEqual(hookEntry.command, undefined, 'prompt type has no command field');
  console.log('PASS: prompt type emits correct hookEntry');
}

// Test: agent type hook emits correct hookEntry structure
{
  const ir = makeIR([
    { event: 'Stop', type: 'agent', prompt: 'Run tests and verify they pass.', timeout: 120, platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.strictEqual(hookEntry.type, 'agent');
  assert.strictEqual(hookEntry.prompt, 'Run tests and verify they pass.');
  assert.strictEqual(hookEntry.timeout, 120);
  console.log('PASS: agent type emits correct hookEntry');
}

// Test: http type does NOT substitute {PLUGIN_ROOT} in URL
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://example.com/{PLUGIN_ROOT}/stop', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.ok(hookEntry.url.includes('{PLUGIN_ROOT}'), 'URL passes through unchanged');
  console.log('PASS: http type does not substitute {PLUGIN_ROOT} in url');
}

// Test: fidelity — all hooks are native on claude-code
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/start.js', platforms: ['claude-code'] },
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/stop.js', platforms: ['claude-code'] },
    { event: 'PostToolUse', matcher: 'Edit|Write', command: 'node {PLUGIN_ROOT}/track.js', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  assert.strictEqual(result.fidelity.total, 3, 'total is 3');
  assert.strictEqual(result.fidelity.native, 3, 'all 3 native');
  assert.strictEqual(result.fidelity.shimmed, 0, 'none shimmed');
  assert.strictEqual(result.fidelity.hardLimited, 0, 'none lost');
  console.log('PASS: fidelity — all hooks native on claude-code');
}

// Test: fidelity — hooks targeting only other platforms don't count
{
  const ir = makeIR([
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/stop.js', platforms: ['claude-code'] },
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/codex-stop.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.strictEqual(result.fidelity.total, 1, 'only 1 hook targets claude-code');
  assert.strictEqual(result.fidelity.native, 1, '1 native');
  console.log('PASS: fidelity — cross-platform hooks not double-counted');
}

console.log('\nAll Claude Code adapter tests passed.');
