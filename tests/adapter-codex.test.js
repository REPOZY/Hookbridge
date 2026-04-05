// plugin-compiler/tests/adapter-codex.test.js
'use strict';

const assert = require('assert');
const { emit } = require('../src/adapters/codex');

function makeIR(hooks = [], extensions = {}) {
  return {
    meta: { name: 'test-plugin', version: '1.0.0', description: 'Test', platforms: ['codex'] },
    hooks,
    skills: [{ path: 'skills/', recursive: true }],
    extensions: {
      codex: {
        install_path: '$HOME/.codex/{meta.name}',
        concurrent_hooks: true,
        hooks_require_flag: 'features.codex_hooks = true',
        windows_hooks_supported: false,
      },
      ...extensions,
    },
  };
}

// Test: {PLUGIN_ROOT} → $HOME/.codex/{meta.name} with if-guard
{
  const ir = makeIR([
    { event: 'UserPromptSubmit', command: 'node {PLUGIN_ROOT}/skill-activator.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const raw = result.files.get('hooks/codex-hooks.json');
  assert.ok(raw.includes('$HOME/.codex/test-plugin'), `Expected install path, got: ${raw}`);
  assert.ok(raw.includes('if [ -f'), 'Expected if-guard');
  console.log('PASS: {PLUGIN_ROOT} substituted with install path guard');
}

// Test: no outer "hooks" wrapper (Codex format)
{
  const ir = makeIR([
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/stop.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  assert.ok(output.Stop, 'Stop key exists at root');
  assert.strictEqual(output.hooks, undefined, 'No outer hooks wrapper');
  console.log('PASS: no outer hooks wrapper');
}

// Test: async: true → warn loss
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/start.js', async: true, platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(result.losses.some(l => l.severity === 'warn' && l.feature.includes('async')), 'async produces warn');
  console.log('PASS: async:true produces warn loss');
}

// Test: PostToolUse(Edit|Write) → shimmed loss, hook NOT emitted natively
{
  const ir = makeIR([
    { event: 'PostToolUse', matcher: 'Edit|Write', command: 'node {PLUGIN_ROOT}/track.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  const postToolEntries = output.PostToolUse || [];
  const hasEditWrite = postToolEntries.some(e => e.matcher === 'Edit|Write');
  assert.strictEqual(hasEditWrite, false, 'Edit|Write not emitted natively');
  assert.ok(result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('Edit|Write')), 'shimmed loss emitted');
  assert.ok(result.shims.has('hooks/codex/stop-shim.js'), 'stop-shim.js generated');
  console.log('PASS: PostToolUse(Edit|Write) shimmed');
}

// Test: SubagentStop → shimmed loss
{
  const ir = makeIR([
    { event: 'SubagentStop', command: 'node {PLUGIN_ROOT}/guard.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('SubagentStop')), 'SubagentStop shimmed');
  console.log('PASS: SubagentStop shimmed');
}

// Test: PreToolUse(Read|Edit|Write) → hard-limit
{
  const ir = makeIR([
    { event: 'PreToolUse', matcher: 'Read|Edit|Write', command: 'node {PLUGIN_ROOT}/safety.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(result.losses.some(l => l.severity === 'hard-limit'), 'hard-limit loss emitted');
  console.log('PASS: PreToolUse(Read|Edit|Write) produces hard-limit');
}

// Test: .codex-plugin/plugin.json manifest generated with skills and hooks fields
{
  const ir = makeIR([]);
  const result = emit(ir);
  assert.ok(result.files.has('.codex-plugin/plugin.json'), 'codex plugin.json generated');
  const manifest = JSON.parse(result.files.get('.codex-plugin/plugin.json'));
  assert.strictEqual(manifest.name, 'test-plugin');
  assert.strictEqual(manifest.skills, './skills/');
  assert.strictEqual(manifest.hooks, './hooks/codex-hooks.json');
  console.log('PASS: codex plugin.json generated with skills and hooks');
}

// Test: non-command type hook targeting codex → hard-limit loss, not emitted
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://example.com/stop', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  assert.strictEqual(output.Stop, undefined, 'http type hook not emitted on Codex');
  assert.ok(
    result.losses.some(l => l.severity === 'hard-limit' && l.feature.includes('http')),
    'hard-limit loss emitted for http type'
  );
  console.log('PASS: non-command type hook produces hard-limit on Codex');
}

// Test: SubagentStart → shimmed loss, stop-shim generated
{
  const ir = makeIR([
    { event: 'SubagentStart', command: 'node {PLUGIN_ROOT}/hooks/subagent-start.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(
    result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('SubagentStart')),
    'SubagentStart shimmed loss emitted'
  );
  assert.ok(result.shims.has('hooks/codex/stop-shim.js'), 'stop-shim.js generated');
  const shimContent = result.shims.get('hooks/codex/stop-shim.js');
  assert.ok(shimContent.includes('subagent-start.js'), 'Shim references subagent-start.js');
  console.log('PASS: SubagentStart shimmed with stop-shim');
}

console.log('\nAll Codex adapter tests passed.');
