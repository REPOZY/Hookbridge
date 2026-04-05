// plugin-compiler/src/adapters/codex.js
'use strict';

const { createAdapterResult, createLoss } = require('../ir');
const { generateStopShim } = require('../shims/stop-shim-template');

const PLATFORM_ID = 'codex';

const SUPPORTED_EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'Stop'];
const SUPPORTED_POST_TOOL_MATCHERS = ['Bash'];
const SUPPORTED_PRE_TOOL_MATCHERS = ['Bash'];

function emit(ir) {
  const result = createAdapterResult();
  const ext = ir.extensions.codex || {};
  const installPath = (ext.install_path || '$HOME/.codex/{meta.name}')
    .replace('{meta.name}', ir.meta.name);

  const shimNeeded = { editTracking: false, sessionStats: false, subagentGuard: false, subagentStart: false };

  const myHooks = ir.hooks.filter(h => h.platforms.includes(PLATFORM_ID));
  const nativeHooks = [];

  for (const hook of myHooks) {
    if (hook.async === true) {
      result.losses.push(createLoss(PLATFORM_ID, `async:true on ${hook.event}`, 'warn',
        'Codex hook runner does not honour the async flag. Hook will run synchronously.'));
    }

    if (hook.type && hook.type !== 'command') {
      result.losses.push(createLoss(PLATFORM_ID, `${hook.event}(type:${hook.type})`, 'hard-limit',
        `Codex only supports "command" hook type. "${hook.type}" hooks have no Codex equivalent.`));
      continue;
    }

    if (hook.event === 'SubagentStop') {
      shimNeeded.subagentGuard = true;
      result.losses.push(createLoss(PLATFORM_ID, 'SubagentStop', 'shimmed',
        'SubagentStop is not a documented Codex lifecycle event.',
        {
          shimMechanism: 'Stop-time transcript analysis detects subagent invocations → stop-shim.js',
          limitations: 'Reactive, not preventive. Enforcement happens after the subagent has already run.',
        }));
      continue;
    }

    if (hook.event === 'SubagentStart') {
      shimNeeded.subagentStart = true;
      result.losses.push(createLoss(PLATFORM_ID, 'SubagentStart', 'shimmed',
        'SubagentStart is not a documented Codex lifecycle event.',
        {
          shimMechanism: 'Stop-time transcript analysis detects Agent tool invocations → stop-shim.js',
          limitations: 'Reactive, not preventive. Fires at session end, not at subagent spawn time.',
        }));
      continue;
    }

    if (hook.event === 'PostToolUse' && hook.matcher) {
      const matchers = hook.matcher.split('|');
      const unsupported = matchers.filter(m => !SUPPORTED_POST_TOOL_MATCHERS.includes(m));
      if (unsupported.length > 0) {
        if (unsupported.some(m => ['Edit', 'Write'].includes(m))) {
          shimNeeded.editTracking = true;
          result.losses.push(createLoss(PLATFORM_ID, `PostToolUse(${hook.matcher})`, 'shimmed',
            'Codex only emits PostToolUse for Bash — Edit/Write hooks shimmed via transcript analysis.',
            {
              shimMechanism: 'Stop-time transcript analysis infers file edits → stop-shim.js',
              limitations: 'Fires once at session end, not per-edit. Deferred, not real-time.',
            }));
        }
        if (unsupported.some(m => m === 'Skill')) {
          shimNeeded.sessionStats = true;
          result.losses.push(createLoss(PLATFORM_ID, `PostToolUse(${hook.matcher})`, 'shimmed',
            'No Skill event surface on Codex — shimmed via transcript analysis.',
            {
              shimMechanism: 'Stop-time transcript analysis detects Skill invocations → stop-shim.js',
              limitations: 'Fires once at session end, not per-invocation. Aggregate stats only.',
            }));
        }
        if (matchers.every(m => !SUPPORTED_POST_TOOL_MATCHERS.includes(m))) {
          continue;
        }
      }
    }

    if (hook.event === 'PreToolUse' && hook.matcher) {
      const matchers = hook.matcher.split('|');
      const unsupported = matchers.filter(m => !SUPPORTED_PRE_TOOL_MATCHERS.includes(m));
      if (unsupported.length > 0 && matchers.every(m => !SUPPORTED_PRE_TOOL_MATCHERS.includes(m))) {
        result.losses.push(createLoss(PLATFORM_ID, `PreToolUse(${hook.matcher})`, 'hard-limit',
          'Codex does not expose PreToolUse for file operations. No shim possible.',
          { workaround: 'Mitigate via AGENTS.md instructions.' }));
        continue;
      }
    }

    if (!SUPPORTED_EVENTS.includes(hook.event)) {
      result.losses.push(createLoss(PLATFORM_ID, hook.event, 'hard-limit',
        `${hook.event} is not a documented Codex lifecycle event.`));
      continue;
    }

    nativeHooks.push(hook);
  }

  // Build codex-hooks.json (no outer "hooks" wrapper)
  const hooksObj = {};
  for (const hook of nativeHooks) {
    if (!hooksObj[hook.event]) {
      hooksObj[hook.event] = [];
    }

    const resolvedCommand = buildCodexCommand(hook.command, installPath, ir.meta.name);
    const hookEntry = { type: 'command', command: resolvedCommand };
    const group = {};
    if (hook.matcher !== undefined) {
      group.matcher = hook.matcher;
    }
    group.hooks = [hookEntry];
    hooksObj[hook.event].push(group);
  }

  // Generate stop-shim if any shimmed features needed
  if (shimNeeded.editTracking || shimNeeded.sessionStats || shimNeeded.subagentGuard || shimNeeded.subagentStart) {
    const shimSource = generateStopShim({
      editTracking: shimNeeded.editTracking,
      sessionStats: shimNeeded.sessionStats,
      subagentGuard: shimNeeded.subagentGuard,
      subagentStart: shimNeeded.subagentStart,
      pluginRoot: `(function() {
    const candidates = [
      path.join(process.env.HOME || '', '.codex', '${ir.meta.name}'),
      path.join(process.env.HOME || '', '.codex', 'superpowers'),
    ];
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
    return candidates[0];
  })()`,
    });
    result.shims.set('hooks/codex/stop-shim.js', shimSource);

    if (!hooksObj.Stop) hooksObj.Stop = [];
    const shimCommand = buildCodexCommand('node {PLUGIN_ROOT}/hooks/codex/stop-shim.js', installPath, ir.meta.name);
    hooksObj.Stop.push({ hooks: [{ type: 'command', command: shimCommand }] });
  }

  result.files.set('hooks/codex-hooks.json', JSON.stringify(hooksObj, null, 2) + '\n');

  // Build .codex-plugin/plugin.json
  const manifest = {
    name: ir.meta.name,
    version: ir.meta.version,
    description: ext.description || ir.meta.description,
    ...(ir.meta.author && { author: { name: ir.meta.author } }),
    ...(ir.meta.homepage && { homepage: ir.meta.homepage }),
    ...(ir.meta.repository && { repository: ir.meta.repository }),
    skills: './skills/',
    hooks: './hooks/codex-hooks.json',
    interface: {
      displayName: ir.meta.name,
      shortDescription: ext.description || ir.meta.description,
    },
  };

  result.files.set('.codex-plugin/plugin.json', compactShortArrays(JSON.stringify(manifest, null, 2)) + '\n');

  if (ext.windows_hooks_supported === false) {
    result.losses.push(createLoss(PLATFORM_ID, 'Windows hook execution', 'warn',
      'Codex disables hooks on Windows. All hook parity requires macOS or Linux.'));
  }

  return result;
}

function buildCodexCommand(command, installPath, pluginName) {
  const resolved = command.replace(/\{PLUGIN_ROOT\}/g, installPath);
  const altPath = installPath.replace(pluginName, 'superpowers');

  const nodePrefix = 'node ';
  if (resolved.startsWith(nodePrefix)) {
    const scriptPath = resolved.slice(nodePrefix.length);
    const altScriptPath = scriptPath.replace(installPath, altPath);
    return `if [ -f "${scriptPath}" ]; then node "${scriptPath}"; elif [ -f "${altScriptPath}" ]; then node "${altScriptPath}"; else echo '{}'; fi`;
  }

  return resolved;
}

/**
 * Compact JSON arrays of short strings onto single lines.
 */
function compactShortArrays(json) {
  return json.replace(/\[\n(\s+"[^"]{1,40}",?\n)+\s+\]/g, (match) => {
    const items = match.match(/"[^"]+"/g);
    return '[' + items.join(', ') + ']';
  });
}

module.exports = { emit, PLATFORM_ID };
