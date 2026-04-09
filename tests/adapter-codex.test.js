'use strict';

const assert = require('assert');
const { emit } = require('../src/adapters/codex');

function makeIR(hooks = [], codexExtension = {}) {
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
        ...codexExtension,
      },
    },
  };
}

// Test: {PLUGIN_ROOT} → bootstrapped bash wrapper with top-level hooks wrapper
{
  const ir = makeIR([
    { event: 'UserPromptSubmit', command: 'node {PLUGIN_ROOT}/hooks/codex/user-prompt-submit-adapter.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const raw = result.files.get('hooks/codex-hooks.json');
  const output = JSON.parse(raw);
  const command = output.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.ok(raw.includes('"hooks": {'), 'Expected top-level hooks wrapper');
  assert.ok(command.startsWith("bash -lc 'adapter=\"hooks/codex/user-prompt-submit-adapter.js\""), `Expected bash wrapper, got: ${command}`);
  assert.ok(command.includes('.nvm/nvm.sh'), 'Expected nvm bootstrap');
  assert.ok(command.includes('$HOME/.codex/test-plugin'), 'Expected install path');
  assert.ok(command.includes('$HOME/.codex/plugins/cache'), 'Expected plugin cache lookup');
  console.log('PASS: node command wrapped with current Codex bootstrap');
}

// Test: legacy_install_paths are included when configured
{
  const ir = makeIR(
    [{ event: 'Stop', command: 'node {PLUGIN_ROOT}/hooks/codex/stop-adapter.js', platforms: ['codex'] }],
    { legacy_install_paths: ['$HOME/.codex/old-plugin'] }
  );
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  const command = output.hooks.Stop[0].hooks[0].command;
  assert.ok(command.includes('$HOME/.codex/old-plugin'), 'Expected configured legacy install path');
  console.log('PASS: legacy install paths included');
}

// Test: top-level "hooks" wrapper (current Codex format)
{
  const ir = makeIR([
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/hooks/codex/stop-adapter.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  assert.ok(output.hooks.Stop, 'Stop key exists under hooks');
  assert.strictEqual(output.Stop, undefined, 'No root-level Stop key');
  console.log('PASS: top-level hooks wrapper emitted');
}

// Test: async: true → warn loss
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/hooks/codex/session-start-adapter.js', async: true, platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(result.losses.some(l => l.severity === 'warn' && l.feature.includes('async')), 'async produces warn');
  console.log('PASS: async:true produces warn loss');
}

// Test: PostToolUse(Edit|Write) → approximated loss, hook NOT emitted natively
{
  const ir = makeIR([
    { event: 'PostToolUse', matcher: 'Edit|Write', command: 'node {PLUGIN_ROOT}/hooks/track.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  const postToolEntries = output.hooks.PostToolUse || [];
  const hasEditWrite = postToolEntries.some(e => e.matcher === 'Edit|Write');
  assert.strictEqual(hasEditWrite, false, 'Edit|Write not emitted natively');
  assert.ok(result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('Edit|Write')), 'approximated loss emitted');
  assert.ok(result.shims.has('hooks/codex/stop-shim.js'), 'stop-shim.js generated');
  console.log('PASS: PostToolUse(Edit|Write) approximated');
}

// Test: SubagentStop → approximated loss
{
  const ir = makeIR([
    { event: 'SubagentStop', command: 'node {PLUGIN_ROOT}/guard.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('SubagentStop')), 'SubagentStop approximated');
  console.log('PASS: SubagentStop approximated');
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

// Test: .codex-plugin/plugin.json manifest generated without hooks field
{
  const ir = makeIR([]);
  const result = emit(ir);
  assert.ok(result.files.has('.codex-plugin/plugin.json'), 'codex plugin.json generated');
  const manifest = JSON.parse(result.files.get('.codex-plugin/plugin.json'));
  assert.strictEqual(manifest.name, 'test-plugin');
  assert.strictEqual(manifest.skills, './skills/');
  assert.strictEqual(manifest.hooks, undefined, 'No hooks field in current Codex manifest');
  console.log('PASS: codex plugin.json generated without hooks field');
}

// Test: non-command type hook targeting codex → hard-limit loss, not emitted
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://example.com/stop', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  assert.strictEqual(output.hooks.Stop, undefined, 'http type hook not emitted on Codex');
  assert.ok(
    result.losses.some(l => l.severity === 'hard-limit' && l.feature.includes('http')),
    'hard-limit loss emitted for http type'
  );
  console.log('PASS: non-command type hook produces hard-limit on Codex');
}

// Test: SubagentStart → approximated loss, stop-shim generated
{
  const ir = makeIR([
    { event: 'SubagentStart', command: 'node {PLUGIN_ROOT}/hooks/subagent-start.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(
    result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('SubagentStart')),
    'SubagentStart approximated loss emitted'
  );
  assert.ok(result.shims.has('hooks/codex/stop-shim.js'), 'stop-shim.js generated');
  const shimContent = result.shims.get('hooks/codex/stop-shim.js');
  assert.ok(shimContent.includes('subagent-start.js'), 'Shim references subagent-start.js');
  console.log('PASS: SubagentStart approximated with stop-shim');
}

// Test: AdapterResult has fidelity shape with zero values before population
{
  const { createAdapterResult } = require('../src/ir');
  const r = createAdapterResult();
  assert.ok('fidelity' in r, 'fidelity key present');
  assert.strictEqual(r.fidelity.total, 0, 'total defaults to 0');
  assert.strictEqual(r.fidelity.native, 0, 'native defaults to 0');
  assert.strictEqual(r.fidelity.shimmed, 0, 'shimmed defaults to 0');
  assert.strictEqual(r.fidelity.hardLimited, 0, 'hardLimited defaults to 0');
  console.log('PASS: AdapterResult has fidelity shape');
}

// Test: fidelity — all native hooks
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/hooks/codex/session-start-adapter.js', platforms: ['codex'] },
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/hooks/codex/stop-adapter.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.strictEqual(result.fidelity.total, 2, 'total is 2');
  assert.strictEqual(result.fidelity.native, 2, 'both native');
  assert.strictEqual(result.fidelity.shimmed, 0, 'none shimmed');
  assert.strictEqual(result.fidelity.hardLimited, 0, 'none lost');
  console.log('PASS: fidelity counts — all native');
}

// Test: fidelity — shimmed hooks
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/hooks/codex/session-start-adapter.js', platforms: ['codex'] },
    { event: 'SubagentStart', command: 'node {PLUGIN_ROOT}/hooks/subagent-start.js', platforms: ['codex'] },
    { event: 'SubagentStop', command: 'node {PLUGIN_ROOT}/hooks/subagent-stop.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.strictEqual(result.fidelity.total, 3, 'total is 3');
  assert.strictEqual(result.fidelity.native, 1, '1 native');
  assert.strictEqual(result.fidelity.shimmed, 2, '2 shimmed');
  assert.strictEqual(result.fidelity.hardLimited, 0, 'none lost');
  console.log('PASS: fidelity counts — shimmed hooks');
}

// Test: fidelity — hard-limited hooks
{
  const ir = makeIR([
    { event: 'Stop', command: 'node {PLUGIN_ROOT}/hooks/codex/stop-adapter.js', platforms: ['codex'] },
    { event: 'PreToolUse', matcher: 'Read|Edit|Write', command: 'node {PLUGIN_ROOT}/safety.js', platforms: ['codex'] },
    { event: 'InstructionsLoaded', command: 'node {PLUGIN_ROOT}/inst.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.strictEqual(result.fidelity.total, 3, 'total is 3');
  assert.strictEqual(result.fidelity.native, 1, '1 native');
  assert.strictEqual(result.fidelity.shimmed, 0, 'none shimmed');
  assert.strictEqual(result.fidelity.hardLimited, 2, '2 lost');
  console.log('PASS: fidelity counts — hard-limited hooks');
}

// Test: fidelity — async:true warn does not reduce native count
{
  const ir = makeIR([
    { event: 'SessionStart', command: 'node {PLUGIN_ROOT}/hooks/codex/session-start-adapter.js', async: true, platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.strictEqual(result.fidelity.total, 1, 'total is 1');
  assert.strictEqual(result.fidelity.native, 1, 'still native despite async warn');
  assert.strictEqual(result.fidelity.shimmed, 0);
  assert.strictEqual(result.fidelity.hardLimited, 0);
  console.log('PASS: fidelity — async:true warn does not reduce native count');
}

console.log('\nAll Codex adapter tests passed.');
