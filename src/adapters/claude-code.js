// plugin-compiler/src/adapters/claude-code.js
'use strict';

const { createAdapterResult } = require('../ir');

const PLATFORM_ID = 'claude-code';

/**
 * Emit Claude Code hook files from the IR.
 * @param {PluginIR} ir
 * @returns {AdapterResult}
 */
function emit(ir) {
  const result = createAdapterResult();
  const ext = ir.extensions['claude-code'] || {};
  const envVar = ext.env_var || 'CLAUDE_PLUGIN_ROOT';

  // Filter hooks for this platform
  const myHooks = ir.hooks.filter(h => h.platforms.includes(PLATFORM_ID));

  // Group by event, preserving declaration order
  const eventGroups = new Map();
  for (const hook of myHooks) {
    if (!eventGroups.has(hook.event)) {
      eventGroups.set(hook.event, []);
    }
    eventGroups.get(hook.event).push(hook);
  }

  // Build hooks.json structure
  const hooksObj = {};
  for (const [event, hooks] of eventGroups) {
    hooksObj[event] = hooks.map(hook => {
      const hookType = hook.type || 'command';
      let hookEntry;

      if (hookType === 'command') {
        const command = hook.command.replace(
          /\{PLUGIN_ROOT\}([^\s]*)/g,
          `"\${${envVar}}$1"`
        );
        hookEntry = { type: 'command', command };
        if (hook.async !== undefined) hookEntry.async = hook.async;
        if (hook.timeout !== undefined) hookEntry.timeout = hook.timeout;
      } else if (hookType === 'http') {
        hookEntry = { type: 'http', url: hook.url };
        if (hook.headers !== undefined) hookEntry.headers = hook.headers;
        if (hook.allowedEnvVars !== undefined) hookEntry.allowedEnvVars = hook.allowedEnvVars;
        if (hook.timeout !== undefined) hookEntry.timeout = hook.timeout;
      } else if (hookType === 'prompt' || hookType === 'agent') {
        hookEntry = { type: hookType, prompt: hook.prompt };
        if (hook.model !== undefined) hookEntry.model = hook.model;
        if (hook.timeout !== undefined) hookEntry.timeout = hook.timeout;
      }

      const group = {};
      if (hook.matcher !== undefined) group.matcher = hook.matcher;
      group.hooks = [hookEntry];
      return group;
    });
  }

  result.files.set('hooks/hooks.json', JSON.stringify({ hooks: hooksObj }, null, 2) + '\n');

  // Build .claude-plugin/plugin.json
  const manifest = {
    name: ir.meta.name,
    description: ext.description || ir.meta.description,
    version: ir.meta.version,
    ...(ir.meta.author && { author: { name: ir.meta.author } }),
    ...(ir.meta.homepage && { homepage: ir.meta.homepage }),
    ...(ir.meta.repository && { repository: ir.meta.repository }),
    ...(ir.meta.license && { license: ir.meta.license }),
    ...(ir.meta.keywords && { keywords: ir.meta.keywords }),
  };

  result.files.set('.claude-plugin/plugin.json', compactShortArrays(JSON.stringify(manifest, null, 2)) + '\n');

  return result;
}

/**
 * Compact JSON arrays of short strings onto single lines.
 * Turns multi-line arrays like ["a",\n"b"] into ["a", "b"].
 */
function compactShortArrays(json) {
  return json.replace(/\[\n(\s+"[^"]{1,40}",?\n)+\s+\]/g, (match) => {
    const items = match.match(/"[^"]+"/g);
    return '[' + items.join(', ') + ']';
  });
}

module.exports = { emit, PLATFORM_ID };
