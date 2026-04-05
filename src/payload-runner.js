// hookbridge/src/payload-runner.js
'use strict';

const crypto = require('crypto');
const path = require('path');

/**
 * Generate a random session ID.
 * @returns {string}
 */
function generateSessionId() {
  return 'sess_' + crypto.randomBytes(6).toString('hex');
}

/**
 * Recursively resolve __sentinel__ values in a plain object/array/string.
 * @param {*} value
 * @param {Object} ctx - { sessionId, cwd, timestamp, toolName }
 * @returns {*}
 */
function resolveSentinels(value, ctx) {
  if (typeof value === 'string') {
    switch (value) {
      case '__session_id__':      return ctx.sessionId;
      case '__cwd__':             return ctx.cwd;
      case '__transcript_path__': return path.join(ctx.cwd, '.claude', 'transcript.jsonl');
      case '__timestamp__':       return ctx.timestamp;
      case '__tool_name__':       return ctx.toolName;
      default:                    return value;
    }
  }
  if (Array.isArray(value)) {
    return value.map(v => resolveSentinels(v, ctx));
  }
  if (value !== null && typeof value === 'object') {
    const resolved = {};
    for (const [k, v] of Object.entries(value)) {
      resolved[k] = resolveSentinels(v, ctx);
    }
    return resolved;
  }
  return value;
}

/**
 * Generate a mock payload for the given event and platform.
 * Pure function — no file I/O, no spawning.
 *
 * @param {string} event - e.g. 'SessionStart'
 * @param {Object} payloadSchemas - contents of payloads/<platform-id>.json
 * @param {Object} [overrides] - { cwd?, toolName?, merge? }
 * @returns {{ payload: Object, warnings: string[] }}
 */
function generatePayload(event, payloadSchemas, overrides = {}) {
  const warnings = [];
  const cwd = overrides.cwd || process.cwd();
  const toolName = overrides.toolName || 'Bash';

  const ctx = {
    sessionId: generateSessionId(),
    cwd,
    timestamp: new Date().toISOString(),
    toolName,
  };

  let template;
  let coverage;

  if (payloadSchemas && payloadSchemas[event]) {
    // Deep-clone the template so we never mutate the schema object
    template = JSON.parse(JSON.stringify(payloadSchemas[event].payload));
    coverage = payloadSchemas[event].coverage;
  } else {
    // No schema found — fall back to minimal base payload
    template = {
      session_id: '__session_id__',
      transcript_path: '__transcript_path__',
      cwd: '__cwd__',
      hook_event_name: event,
    };
    warnings.push(
      `No payload schema for "${event}" — using base payload only. ` +
      `Verify fields against platform documentation.`
    );
    coverage = 'inferred';
  }

  let payload = resolveSentinels(template, ctx);

  // Warn for inferred coverage (only if we didn't already warn about missing schema)
  if (coverage === 'inferred' && warnings.length === 0) {
    warnings.push(
      `Payload for "${event}" is inferred — field shapes may differ from what the platform ` +
      `actually sends. Verify against a live session before relying on these fields.`
    );
  }

  // Apply merge overrides last (user-supplied values win)
  if (overrides.merge && typeof overrides.merge === 'object') {
    Object.assign(payload, overrides.merge);
  }

  return { payload, warnings };
}

module.exports = { generatePayload };
