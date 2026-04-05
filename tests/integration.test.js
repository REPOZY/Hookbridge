// hookbridge/tests/integration.test.js
'use strict';

const assert = require('assert');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const COMPILER = path.join(__dirname, '..', 'hookbridge.js');
const SCHEMA = path.join(__dirname, '..', 'example', 'plugin.universal.yaml');

// Skip if example schema doesn't exist yet
if (!fs.existsSync(SCHEMA)) {
  console.log('SKIP: example/plugin.universal.yaml not found');
  process.exit(0);
}

// Test: validate passes
{
  const result = execSync(`node "${COMPILER}" validate --schema "${SCHEMA}"`, { encoding: 'utf8' });
  assert.ok(result.includes('Schema valid'), 'Schema should be valid');
  console.log('PASS: schema validates');
}

// Test: compile + diff (round-trip idempotency)
{
  const tmpDir = path.join(__dirname, '..', '.test-output');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`node "${COMPILER}" compile --schema "${SCHEMA}" --out "${tmpDir}"`, { encoding: 'utf8' });

    // Compile again to same dir
    execSync(`node "${COMPILER}" compile --schema "${SCHEMA}" --out "${tmpDir}"`, { encoding: 'utf8' });

    // Diff should show all matches
    const diffResult = execSync(`node "${COMPILER}" diff --schema "${SCHEMA}" --out "${tmpDir}"`, { encoding: 'utf8' });
    assert.ok(diffResult.includes('All') && diffResult.includes('match'), 'Round-trip should produce identical output');
    console.log('PASS: round-trip idempotency');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Test: dry-run produces no output files
{
  const tmpDir = path.join(__dirname, '..', '.test-output-dry');
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    execSync(`node "${COMPILER}" compile --schema "${SCHEMA}" --out "${tmpDir}" --dry-run`, { encoding: 'utf8' });
    const files = fs.readdirSync(tmpDir);
    assert.strictEqual(files.length, 0, 'dry-run should write no files');
    console.log('PASS: dry-run writes no files');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

console.log('\nAll integration tests passed.');
