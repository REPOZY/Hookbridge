// hookbridge/src/platform-syncer.js
'use strict';

const https = require('https');
const http = require('http');
const crypto = require('crypto');

const EVENT_BLOCKLIST = new Set([
  'Bash', 'Edit', 'Write', 'Read', 'Glob', 'Grep', 'Agent',
  'WebFetch', 'WebSearch', 'JSON', 'Claude', 'MCP', 'HTTP',
  'SDK', 'API', 'CLI', 'URL', 'LLM', 'UI', 'TBD', 'SSE',
]);

/**
 * Fetch a URL using Node's built-in http/https module.
 * Follows one level of redirect.
 * @param {string} url
 * @returns {Promise<{content: string|null, error: string|null}>}
 */
function fetchUrl(url) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': 'hookbridge-syncer/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        resolve({ content: null, error: `HTTP ${res.statusCode}` });
        return;
      }
      let content = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { content += chunk; });
      res.on('end', () => resolve({ content, error: null }));
    });
    req.on('error', e => resolve({ content: null, error: e.message }));
    req.setTimeout(15000, () => { req.destroy(); resolve({ content: null, error: 'timeout after 15s' }); });
  });
}

/**
 * Hash a string with SHA-256.
 * @param {string} content
 * @returns {string}
 */
function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extract event names from fetched HTML/text content.
 * Finds PascalCase identifiers in table-row backtick positions: | `EventName` |
 * Filters against a blocklist of known non-event words.
 * @param {string} content
 * @returns {string[]}
 */
function extractEvents(content) {
  const events = new Set();
  const tablePattern = /\|\s*`([A-Z][a-zA-Z]+)`\s*\|/g;
  let match;
  while ((match = tablePattern.exec(content)) !== null) {
    const candidate = match[1];
    if (!EVENT_BLOCKLIST.has(candidate)) {
      events.add(candidate);
    }
  }
  return Array.from(events);
}

/**
 * Sync a single platform spec against its documentation URLs.
 * Pure function — no file I/O. Accepts an optional fetcher for testability.
 *
 * @param {Object} spec — contents of platforms/<id>.json
 * @param {Function} [fetcher] — defaults to fetchUrl; override in tests
 * @returns {Promise<Object>} sync result
 */
async function syncPlatform(spec, fetcher = fetchUrl) {
  const result = {
    platformId: spec.id,
    fetchErrors: [],
    pageChanged: {},
    newPageHashes: {},
    newEvents: [],
    removedEvents: [],
    newHookTypes: [],
    extractionFailed: false,
  };

  const allExtractedEvents = new Set();
  const knownSet = new Set(spec.knownEvents || []);

  for (const url of (spec.docUrls || [])) {
    const { content, error } = await fetcher(url);

    if (error) {
      result.fetchErrors.push({ url, error });
      continue;
    }

    const hash = sha256(content);
    result.newPageHashes[url] = hash;

    const storedHash = (spec.pageHashes || {})[url];
    result.pageChanged[url] = hash !== storedHash;

    const extracted = extractEvents(content);
    extracted.forEach(e => allExtractedEvents.add(e));

    if (result.pageChanged[url] && extracted.length === 0) {
      result.extractionFailed = true;
    }
  }

  if (allExtractedEvents.size > 0) {
    result.newEvents = Array.from(allExtractedEvents).filter(e => !knownSet.has(e));
    result.removedEvents = Array.from(knownSet).filter(e => !allExtractedEvents.has(e));
  }

  return result;
}

module.exports = { syncPlatform, extractEvents, sha256, fetchUrl };
