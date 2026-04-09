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
  const installPath = substituteMeta(ext.install_path || '$HOME/.codex/{meta.name}', ir.meta);
  const legacyInstallPaths = normalizeLegacyInstallPaths(ext.legacy_install_paths, ir.meta);

  const shimNeeded = { editTracking: false, sessionStats: false, subagentGuard: false, subagentStart: false };

  const myHooks = ir.hooks.filter(h => h.platforms.includes(PLATFORM_ID));
  result.fidelity.total = myHooks.length;
  const nativeHooks = [];

  for (const hook of myHooks) {
    if (hook.async === true) {
      result.losses.push(createLoss(PLATFORM_ID, `async:true on ${hook.event}`, 'warn',
        'Codex hook runner does not honour the async flag. Hook will run synchronously.'));
    }

    if (hook.type && hook.type !== 'command') {
      result.losses.push(createLoss(PLATFORM_ID, `${hook.event}(type:${hook.type})`, 'hard-limit',
        `Codex only supports "command" hook type. "${hook.type}" hooks have no Codex equivalent.`));
      result.fidelity.hardLimited++;
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
      result.fidelity.shimmed++;
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
      result.fidelity.shimmed++;
      continue;
    }

    if (hook.event === 'PostToolUse' && hook.matcher) {
      const matchers = hook.matcher.split('|');
      const unsupported = matchers.filter(m => !SUPPORTED_POST_TOOL_MATCHERS.includes(m));
      if (unsupported.length > 0) {
        if (unsupported.some(m => ['Edit', 'Write'].includes(m))) {
          shimNeeded.editTracking = true;
          result.losses.push(createLoss(PLATFORM_ID, `PostToolUse(${hook.matcher})`, 'shimmed',
            'Codex only emits PostToolUse for Bash — Edit/Write hooks approximated via transcript analysis.',
            {
              shimMechanism: 'Stop-time transcript analysis infers file edits → stop-shim.js',
              limitations: 'Fires once at session end, not per-edit. Deferred, not real-time.',
            }));
        }
        if (unsupported.some(m => m === 'Skill')) {
          shimNeeded.sessionStats = true;
          result.losses.push(createLoss(PLATFORM_ID, `PostToolUse(${hook.matcher})`, 'shimmed',
            'No Skill event surface on Codex — approximated via transcript analysis.',
            {
              shimMechanism: 'Stop-time transcript analysis detects Skill invocations → stop-shim.js',
              limitations: 'Fires once at session end, not per-invocation. Aggregate stats only.',
            }));
        }
        if (matchers.every(m => !SUPPORTED_POST_TOOL_MATCHERS.includes(m))) {
          result.fidelity.shimmed++;
          continue;
        }
      }
    }

    if (hook.event === 'PreToolUse' && hook.matcher) {
      const matchers = hook.matcher.split('|');
      const unsupported = matchers.filter(m => !SUPPORTED_PRE_TOOL_MATCHERS.includes(m));
      if (unsupported.length > 0 && matchers.every(m => !SUPPORTED_PRE_TOOL_MATCHERS.includes(m))) {
        result.losses.push(createLoss(PLATFORM_ID, `PreToolUse(${hook.matcher})`, 'hard-limit',
          'Codex does not expose PreToolUse for file operations. No approximation possible.',
          { workaround: 'Mitigate via AGENTS.md instructions.' }));
        result.fidelity.hardLimited++;
        continue;
      }
    }

    if (!SUPPORTED_EVENTS.includes(hook.event)) {
      result.losses.push(createLoss(PLATFORM_ID, hook.event, 'hard-limit',
        `${hook.event} is not a documented Codex lifecycle event.`));
      result.fidelity.hardLimited++;
      continue;
    }

    nativeHooks.push(hook);
  }

  result.fidelity.native = nativeHooks.length;

  // Build codex-hooks.json with the current documented top-level "hooks" wrapper.
  const hooksObj = {};
  for (const hook of nativeHooks) {
    if (!hooksObj[hook.event]) {
      hooksObj[hook.event] = [];
    }

    const resolvedCommand = buildCodexCommand(hook.command, installPath, legacyInstallPaths, ir.meta.name);
    const hookEntry = { type: 'command', command: resolvedCommand };
    const group = {};
    if (hook.matcher !== undefined) {
      group.matcher = hook.matcher;
    }
    group.hooks = [hookEntry];
    hooksObj[hook.event].push(group);
  }

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
    const shimCommand = buildCodexCommand('node {PLUGIN_ROOT}/hooks/codex/stop-shim.js', installPath, legacyInstallPaths, ir.meta.name);
    hooksObj.Stop.push({ hooks: [{ type: 'command', command: shimCommand }] });
  }

  result.files.set('hooks/codex-hooks.json', JSON.stringify({ hooks: hooksObj }, null, 2) + '\n');

  const manifest = {
    name: ir.meta.name,
    version: ir.meta.version,
    description: ext.description || ir.meta.description,
    ...(ir.meta.author && { author: { name: ir.meta.author } }),
    ...(ir.meta.homepage && { homepage: ir.meta.homepage }),
    ...(ir.meta.repository && { repository: ir.meta.repository }),
    ...(ir.meta.license && { license: ir.meta.license }),
    ...(ir.meta.keywords && { keywords: ir.meta.keywords }),
    skills: './skills/',
    interface: {
      displayName: ext.display_name || ir.meta.name,
      shortDescription: ext.short_description || ext.description || ir.meta.description,
    },
  };

  result.files.set('.codex-plugin/plugin.json', compactShortArrays(JSON.stringify(manifest, null, 2)) + '\n');

  if (ext.windows_hooks_supported === false) {
    result.losses.push(createLoss(PLATFORM_ID, 'Windows hook execution', 'warn',
      'Codex disables hooks on Windows. All hook parity requires macOS or Linux.'));
  }

  return result;
}

function substituteMeta(value, meta) {
  return String(value).replace(/\{meta\.name\}/g, meta.name);
}

function normalizeLegacyInstallPaths(legacyInstallPaths, meta) {
  if (!Array.isArray(legacyInstallPaths)) return [];
  return legacyInstallPaths.map(p => substituteMeta(p, meta)).filter(Boolean);
}

function buildCodexCommand(command, installPath, legacyInstallPaths, pluginName) {
  const resolved = command.replace(/\{PLUGIN_ROOT\}/g, installPath);
  const nodePrefix = 'node ';
  if (!resolved.startsWith(nodePrefix)) {
    return resolved;
  }

  const scriptPath = resolved.slice(nodePrefix.length).trim();
  const relativeScriptPath = deriveRelativeScriptPath(scriptPath, [installPath, ...legacyInstallPaths]);
  if (!relativeScriptPath) {
    // Fall back to the simple resolved command if we can't safely recover the plugin-relative path.
    return resolved;
  }

  return buildBootstrappedNodeCommand(relativeScriptPath, [installPath, ...legacyInstallPaths], pluginName);
}

function deriveRelativeScriptPath(scriptPath, candidateRoots) {
  for (const root of candidateRoots) {
    const prefix = root.endsWith('/') ? root : `${root}/`;
    if (scriptPath.startsWith(prefix)) {
      return scriptPath.slice(prefix.length);
    }
  }
  return null;
}

function buildBootstrappedNodeCommand(relativeScriptPath, candidateRoots, pluginName) {
  const uniqueRoots = Array.from(new Set(candidateRoots.filter(Boolean)));
  const shellRoots = uniqueRoots.map(root => `"${escapeForDoubleQuotes(root)}"`).join(' ');
  const adapter = escapeForDoubleQuotes(relativeScriptPath);

  return `bash -lc 'adapter="${adapter}"; if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi; if ! command -v node >/dev/null 2>&1; then echo "{}"; exit 0; fi; plugin_root=""; for dir in ${shellRoots}; do if [ -f "$dir/$adapter" ]; then plugin_root="$dir"; break; fi; done; if [ -z "$plugin_root" ] && [ -L "$HOME/.codex/hooks.json" ]; then hooks_target=$(readlink "$HOME/.codex/hooks.json" 2>/dev/null || printf ""); if [ -n "$hooks_target" ]; then candidate=$(dirname "$(dirname "$hooks_target")"); if [ -f "$candidate/$adapter" ]; then plugin_root="$candidate"; fi; fi; fi; if [ -z "$plugin_root" ] && [ -d "$HOME/.codex/plugins/cache" ]; then adapter_path=$(find "$HOME/.codex/plugins/cache" -path "*/$adapter" -print -quit 2>/dev/null); if [ -n "$adapter_path" ]; then plugin_root=$(dirname "$(dirname "$(dirname "$adapter_path")")"); fi; fi; if [ -n "$plugin_root" ]; then node "$plugin_root/$adapter"; else echo "{}"; fi'`;
}

function escapeForDoubleQuotes(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function compactShortArrays(json) {
  return json.replace(/\[\n(\s+"[^"]{1,40}",?\n)+\s+\]/g, (match) => {
    const items = match.match(/"[^"]+"/g);
    return '[' + items.join(', ') + ']';
  });
}

module.exports = { emit, PLATFORM_ID };
