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

// Test: shimmed entries show mechanism and limitations
{
  const losses = [
    {
      platform: 'codex', feature: 'PostToolUse(Edit|Write)', severity: 'shimmed',
      reason: 'Not native', shimMechanism: 'transcript analysis', limitations: 'Deferred',
    },
  ];
  const files = { codex: ['codex-hooks.json'] };
  const report = generateReport(losses, files, { version: '0.1.0', schema: 'test.yaml' });
  assert.ok(report.includes('SHIMMED'), 'Has SHIMMED label');
  assert.ok(report.includes('transcript analysis'), 'Shows shim mechanism');
  assert.ok(report.includes('Deferred'), 'Shows limitation');
  console.log('PASS: shimmed entries show mechanism and limitations');
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
  assert.ok(report.includes('No losses'), 'Reports no losses for clean platform');
  console.log('PASS: clean platform says no losses');
}

console.log('\nAll loss report tests passed.');
