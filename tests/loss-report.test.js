// plugin-compiler/tests/loss-report.test.js
'use strict';

const assert = require('assert');
const { generateReport } = require('../src/loss-reporter');

// Test: report includes summary table
{
  const losses = [
    { platform: 'codex', feature: 'async:true', severity: 'warn', reason: 'Not supported' },
  ];
  const files = { 'claude-code': ['hooks.json', 'plugin.json'], codex: ['codex-hooks.json', 'plugin.json'] };
  const report = generateReport(losses, files, { version: '0.1.0', schema: 'plugin.universal.yaml' });
  assert.ok(report.includes('## Summary'), 'Has summary section');
  assert.ok(report.includes('claude-code'), 'Lists claude-code');
  assert.ok(report.includes('codex'), 'Lists codex');
  console.log('PASS: report has summary table');
}

// Test: approximated entries show mechanism and limitations
{
  const losses = [
    {
      platform: 'codex', feature: 'PostToolUse(Edit|Write)', severity: 'shimmed',
      reason: 'Not native', shimMechanism: 'transcript analysis', limitations: 'Deferred',
    },
  ];
  const files = { codex: ['codex-hooks.json'] };
  const report = generateReport(losses, files, { version: '0.1.0', schema: 'test.yaml' });
  assert.ok(report.includes('APPROXIMATED'), 'Has APPROXIMATED label');
  assert.ok(report.includes('transcript analysis'), 'Shows approximation mechanism');
  assert.ok(report.includes('Deferred'), 'Shows limitation');
  console.log('PASS: approximated entries show mechanism and limitations');
}

// Test: hard-limit entries show reason
{
  const losses = [
    {
      platform: 'codex', feature: 'PreToolUse(Read|Edit|Write)', severity: 'hard-limit',
      reason: 'No hook point', workaround: 'Use AGENTS.md',
    },
  ];
  const files = { codex: ['codex-hooks.json'] };
  const report = generateReport(losses, files, { version: '0.1.0', schema: 'test.yaml' });
  assert.ok(report.includes('HARD LIMIT'), 'Has HARD LIMIT label');
  assert.ok(report.includes('No hook point'), 'Shows reason');
  console.log('PASS: hard-limit entries show reason');
}

// Test: platform with no losses says so
{
  const losses = [];
  const files = { 'claude-code': ['hooks.json'] };
  const report = generateReport(losses, files, { version: '0.1.0', schema: 'test.yaml' });
  assert.ok(report.includes('No compiler losses among hooks targeted to this platform.'), 'Reports scoped no-loss wording for clean platform');
  console.log('PASS: clean platform says no losses');
}

// Test: fidelity column shown in summary table when data provided
{
  const losses = [];
  const files = { 'claude-code': ['hooks.json'], codex: ['codex-hooks.json'] };
  const fidelity = {
    'claude-code': { total: 3, native: 3, shimmed: 0, hardLimited: 0 },
    codex:         { total: 3, native: 1, shimmed: 1, hardLimited: 1 },
  };
  const report = generateReport(losses, files, { version: '1.0.0', schema: 'test.yaml' }, fidelity);
  assert.ok(report.includes('Fidelity'), 'Has Fidelity column header');
  assert.ok(report.includes('3/3 (100%)'), 'claude-code shows 100%');
  assert.ok(report.includes('2/3 (67%)'), 'codex shows 67% (1 native + 1 shimmed fires, 1 lost)');
  console.log('PASS: fidelity column in summary table');
}

// Test: fidelity column shows — when no fidelity data
{
  const losses = [];
  const files = { 'claude-code': ['hooks.json'] };
  const report = generateReport(losses, files, { version: '1.0.0', schema: 'test.yaml' });
  assert.ok(report.includes('Fidelity'), 'Fidelity column header present even without data');
  assert.ok(report.includes('—'), 'Shows — when no fidelity data');
  console.log('PASS: fidelity column shows — without data');
}

console.log('\nAll loss report tests passed.');
