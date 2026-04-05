// hookbridge/tests/platform-syncer.test.js
'use strict';

const assert = require('assert');
const { syncPlatform, extractEvents, sha256 } = require('../src/platform-syncer');

// --- Pure utility tests (synchronous) ---

// Test: extractEvents finds PascalCase names in table rows
{
  const content = '| `SessionStart` | When session begins |\n| `Stop` | When done |';
  const events = extractEvents(content);
  assert.ok(events.includes('SessionStart'), 'Found SessionStart');
  assert.ok(events.includes('Stop'), 'Found Stop');
  console.log('PASS: extractEvents finds events in table rows');
}

// Test: extractEvents filters blocklist words
{
  const content = '| `Bash` | Bash tool |\n| `FileChanged` | File changed |';
  const events = extractEvents(content);
  assert.ok(!events.includes('Bash'), 'Bash is filtered out');
  assert.ok(events.includes('FileChanged'), 'FileChanged is kept');
  console.log('PASS: extractEvents filters blocklist');
}

// Test: extractEvents ignores non-table backtick occurrences
{
  const content = 'Use `SessionStart` in your config. | `RealEvent` | desc |';
  const events = extractEvents(content);
  assert.ok(!events.includes('SessionStart'), 'Non-table backtick ignored');
  assert.ok(events.includes('RealEvent'), 'Table-row event found');
  console.log('PASS: extractEvents ignores non-table backticks');
}

// Test: sha256 returns consistent 64-char hex string
{
  const hash = sha256('hello world');
  assert.strictEqual(hash.length, 64);
  assert.strictEqual(hash, sha256('hello world'), 'Same input = same hash');
  assert.notStrictEqual(hash, sha256('different'), 'Different input = different hash');
  console.log('PASS: sha256 produces consistent hashes');
}

// --- Async syncPlatform tests ---

(async function() {

  // Test: syncPlatform detects new event in docs
  {
    const spec = {
      id: 'test',
      docUrls: ['https://example.com/hooks'],
      knownEvents: ['SessionStart'],
      knownHookTypes: ['command'],
      lastChecked: '2026-01-01',
      pageHashes: {},
    };
    const mockContent = '| `SessionStart` | start |\n| `NewEvent` | new event |';
    const mockFetcher = async () => ({ content: mockContent, error: null });

    const result = await syncPlatform(spec, mockFetcher);
    assert.ok(result.newEvents.includes('NewEvent'), 'NewEvent detected as new');
    assert.strictEqual(result.removedEvents.length, 0, 'No removed events');
    assert.strictEqual(result.fetchErrors.length, 0);
    console.log('PASS: syncPlatform detects new events');
  }

  // Test: syncPlatform detects removed event
  {
    const spec = {
      id: 'test',
      docUrls: ['https://example.com/hooks'],
      knownEvents: ['SessionStart', 'OldEvent'],
      knownHookTypes: ['command'],
      lastChecked: '2026-01-01',
      pageHashes: {},
    };
    const mockContent = '| `SessionStart` | start |';
    const mockFetcher = async () => ({ content: mockContent, error: null });

    const result = await syncPlatform(spec, mockFetcher);
    assert.ok(result.removedEvents.includes('OldEvent'), 'OldEvent detected as removed');
    assert.strictEqual(result.newEvents.length, 0);
    console.log('PASS: syncPlatform detects removed events');
  }

  // Test: syncPlatform detects page hash change
  {
    const spec = {
      id: 'test',
      docUrls: ['https://example.com/hooks'],
      knownEvents: ['SessionStart'],
      knownHookTypes: ['command'],
      lastChecked: '2026-01-01',
      pageHashes: { 'https://example.com/hooks': sha256('old content') },
    };
    const mockFetcher = async () => ({ content: '| `SessionStart` | start |', error: null });

    const result = await syncPlatform(spec, mockFetcher);
    assert.strictEqual(result.pageChanged['https://example.com/hooks'], true, 'Page change detected');
    console.log('PASS: syncPlatform detects page hash change');
  }

  // Test: syncPlatform reports fetch error and does not crash
  {
    const spec = {
      id: 'test',
      docUrls: ['https://unreachable.example.com/hooks'],
      knownEvents: ['SessionStart'],
      knownHookTypes: ['command'],
      lastChecked: '2026-01-01',
      pageHashes: {},
    };
    const mockFetcher = async () => ({ content: null, error: 'HTTP 404' });

    const result = await syncPlatform(spec, mockFetcher);
    assert.strictEqual(result.fetchErrors.length, 1);
    assert.ok(result.fetchErrors[0].error.includes('404'));
    console.log('PASS: syncPlatform reports fetch errors gracefully');
  }

  // Test: extractionFailed when page changed but no events extracted
  {
    const spec = {
      id: 'test',
      docUrls: ['https://example.com/hooks'],
      knownEvents: ['SessionStart'],
      knownHookTypes: ['command'],
      lastChecked: '2026-01-01',
      pageHashes: { 'https://example.com/hooks': sha256('old') },
    };
    const mockFetcher = async () => ({ content: 'No tables here, page was restructured.', error: null });

    const result = await syncPlatform(spec, mockFetcher);
    assert.strictEqual(result.pageChanged['https://example.com/hooks'], true);
    assert.strictEqual(result.extractionFailed, true, 'extractionFailed set');
    console.log('PASS: syncPlatform flags extractionFailed when page changed but no events found');
  }

  console.log('\nAll platform syncer tests passed.');

})().catch(e => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
