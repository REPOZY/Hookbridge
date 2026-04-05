// hookbridge/tests/run-all.js
'use strict';

const { execSync } = require('child_process');
const path = require('path');

const tests = [
  'parser.test.js',
  'adapter-claude-code.test.js',
  'adapter-codex.test.js',
  'loss-report.test.js',
  'integration.test.js',
  'platform-syncer.test.js',
  'payload-runner.test.js',
];

const testsDir = __dirname;
let passed = 0;
let failed = 0;

for (const test of tests) {
  const testPath = path.join(testsDir, test);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${test}`);
  console.log('='.repeat(60));

  try {
    execSync(`node "${testPath}"`, { stdio: 'inherit', timeout: 30000 });
    passed++;
  } catch (e) {
    console.error(`FAILED: ${test}`);
    failed++;
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${tests.length} total`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
