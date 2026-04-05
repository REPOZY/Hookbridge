// hookbridge/tests/payload-runner.test.js
'use strict';

const assert = require('assert');
const { generatePayload } = require('../src/payload-runner');

// Load the real payload schemas for integration with actual data
const claudeCodeSchemas = require('../payloads/claude-code.json');

// Test: verified event returns correct base fields with no warnings
{
  const { payload, warnings } = generatePayload('SessionStart', claudeCodeSchemas, {});
  assert.ok(payload.session_id.startsWith('sess_'), 'session_id starts with sess_');
  assert.strictEqual(payload.hook_event_name, 'SessionStart', 'hook_event_name set correctly');
  assert.ok(typeof payload.cwd === 'string', 'cwd is a string');
  assert.ok(typeof payload.transcript_path === 'string', 'transcript_path is a string');
  assert.ok(payload.transcript_path.includes('.claude'), 'transcript_path contains .claude');
  assert.strictEqual(warnings.length, 0, `No warnings for verified event, got: ${warnings}`);
  console.log('PASS: SessionStart verified event returns correct fields, no warnings');
}

// Test: inferred event returns a warning
{
  const { payload, warnings } = generatePayload('FileChanged', claudeCodeSchemas, {});
  assert.ok(payload.session_id.startsWith('sess_'), 'session_id present');
  assert.strictEqual(payload.hook_event_name, 'FileChanged', 'hook_event_name set');
  assert.ok(warnings.length > 0, 'Warning emitted for inferred event');
  assert.ok(warnings[0].toLowerCase().includes('inferred'), 'Warning mentions inferred');
  console.log('PASS: FileChanged inferred event returns warning');
}

// Test: sentinels resolved in nested objects
{
  const schemas = {
    TestEvent: {
      coverage: 'verified',
      payload: {
        session_id: '__session_id__',
        cwd: '__cwd__',
        hook_event_name: 'TestEvent',
        nested: { tool: '__tool_name__', deep: { ts: '__timestamp__' } },
      },
    },
  };
  const { payload } = generatePayload('TestEvent', schemas, { toolName: 'Write' });
  assert.strictEqual(payload.nested.tool, 'Write', 'Nested __tool_name__ resolved');
  assert.ok(typeof payload.nested.deep.ts === 'string', 'Deeply nested __timestamp__ resolved');
  console.log('PASS: sentinels resolved in nested objects');
}

// Test: --merge overrides generated values and adds new fields
{
  const { payload } = generatePayload('SessionStart', claudeCodeSchemas, {
    merge: { session_id: 'custom-id-123', extra_field: 'hello' },
  });
  assert.strictEqual(payload.session_id, 'custom-id-123', 'merge overrides session_id');
  assert.strictEqual(payload.extra_field, 'hello', 'merge adds new field');
  console.log('PASS: merge overrides generated values');
}

// Test: --tool overrides __tool_name__ sentinel
{
  const { payload } = generatePayload('PreToolUse', claudeCodeSchemas, { toolName: 'Edit' });
  assert.strictEqual(payload.tool_name, 'Edit', 'tool_name overridden by toolName option');
  console.log('PASS: --tool overrides __tool_name__ sentinel');
}

// Test: --cwd overrides __cwd__ sentinel and propagates to transcript_path
{
  const pathModule = require('path');
  const { payload } = generatePayload('SessionStart', claudeCodeSchemas, { cwd: '/custom/project' });
  assert.strictEqual(payload.cwd, '/custom/project', 'cwd overridden');
  const normalizedTranscript = payload.transcript_path.split(pathModule.sep).join('/');
  assert.ok(normalizedTranscript.startsWith('/custom/project'), 'transcript_path uses custom cwd');
  console.log('PASS: --cwd overrides __cwd__ sentinel');
}

// Test: missing event falls back to base payload with warning
{
  const { payload, warnings } = generatePayload('NonExistentEvent', claudeCodeSchemas, {});
  assert.ok(payload.session_id.startsWith('sess_'), 'base session_id present');
  assert.ok(typeof payload.cwd === 'string', 'base cwd present');
  assert.strictEqual(payload.hook_event_name, 'NonExistentEvent', 'hook_event_name set to requested event');
  assert.ok(warnings.length > 0, 'Warning emitted for missing schema');
  assert.ok(warnings[0].includes('No payload schema'), 'Warning says No payload schema');
  console.log('PASS: missing event falls back to base payload with warning');
}

// Test: base payload always contains required fields
{
  const { payload } = generatePayload('Stop', claudeCodeSchemas, {});
  assert.ok('session_id' in payload, 'payload has session_id');
  assert.ok('cwd' in payload, 'payload has cwd');
  assert.ok('hook_event_name' in payload, 'payload has hook_event_name');
  console.log('PASS: base payload always contains required fields');
}

// Test: each call generates a unique session_id
{
  const { payload: p1 } = generatePayload('SessionStart', claudeCodeSchemas, {});
  const { payload: p2 } = generatePayload('SessionStart', claudeCodeSchemas, {});
  assert.notStrictEqual(p1.session_id, p2.session_id, 'Each call generates a unique session_id');
  console.log('PASS: each call generates a unique session_id');
}

// Test: schema object is not mutated between calls
{
  const schemas = {
    ImmutableEvent: {
      coverage: 'verified',
      payload: { session_id: '__session_id__', cwd: '__cwd__', hook_event_name: 'ImmutableEvent' },
    },
  };
  generatePayload('ImmutableEvent', schemas, { cwd: '/first/call' });
  const { payload } = generatePayload('ImmutableEvent', schemas, { cwd: '/second/call' });
  assert.strictEqual(payload.cwd, '/second/call', 'Second call uses its own cwd, not polluted by first');
  assert.strictEqual(schemas.ImmutableEvent.payload.cwd, '__cwd__', 'Original schema template sentinel unchanged');
  console.log('PASS: schema object not mutated between calls');
}

console.log('\nAll payload runner tests passed.');
