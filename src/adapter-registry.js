// plugin-compiler/src/adapter-registry.js
'use strict';

const claudeCode = require('./adapters/claude-code');
const codex = require('./adapters/codex');

const adapters = new Map([
  ['claude-code', claudeCode],
  ['codex', codex],
]);

/**
 * Get adapter by platform ID.
 * @param {string} platformId
 * @returns {{ emit: Function, PLATFORM_ID: string } | null}
 */
function getAdapter(platformId) {
  return adapters.get(platformId) || null;
}

/**
 * List all registered platform IDs.
 * @returns {string[]}
 */
function listPlatforms() {
  return Array.from(adapters.keys());
}

module.exports = { getAdapter, listPlatforms };
