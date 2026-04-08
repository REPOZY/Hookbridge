// plugin-compiler/src/ir.js
'use strict';

/**
 * Intermediate Representation types for plugin-compiler.
 *
 * All types are plain objects — no classes, no prototypes.
 * This file defines factory functions and validators.
 */

/**
 * @typedef {Object} HookEntry
 * @property {string} event
 * @property {string} [matcher]
 * @property {string} [type] - 'command'|'http'|'prompt'|'agent' (default: 'command')
 * @property {string} [command] - required when type === 'command'
 * @property {string} [url] - required when type === 'http'
 * @property {string} [prompt] - required when type === 'prompt' or 'agent'
 * @property {string} [model] - optional for prompt/agent types
 * @property {number} [timeout] - optional for any type
 * @property {boolean} [async] - optional, command type only
 * @property {string[]} platforms
 */

/**
 * @typedef {Object} SkillEntry
 * @property {string} path
 * @property {boolean} [recursive]
 */

/**
 * @typedef {Object} PluginMeta
 * @property {string} name
 * @property {string} version
 * @property {string} description
 * @property {string[]} platforms
 * @property {string} [author]
 * @property {string} [homepage]
 * @property {string} [repository]
 */

/**
 * @typedef {Object} PluginIR
 * @property {PluginMeta} meta
 * @property {HookEntry[]} hooks
 * @property {SkillEntry[]} skills
 * @property {Object<string, unknown>} extensions
 */

/**
 * @typedef {Object} Loss
 * @property {string} platform
 * @property {string} feature
 * @property {'shimmed'|'hard-limit'|'warn'|'error'} severity
 * @property {string} reason
 * @property {string} [shimMechanism]
 * @property {string} [limitations]
 * @property {string} [workaround]
 */

/**
 * @typedef {Object} AdapterResult
 * @property {Map<string, string>} files
 * @property {Map<string, string>} shims
 * @property {Loss[]} losses
 * @property {{total: number, native: number, shimmed: number, hardLimited: number}} fidelity
 */

function createAdapterResult() {
  return { files: new Map(), shims: new Map(), losses: [], fidelity: { total: 0, native: 0, shimmed: 0, hardLimited: 0 } };
}

function createLoss(platform, feature, severity, reason, extra = {}) {
  return { platform, feature, severity, reason, ...extra };
}

const VALID_EVENTS = [
  'SessionStart', 'SessionEnd', 'InstructionsLoaded',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied',
  'UserPromptSubmit',
  'SubagentStart', 'SubagentStop', 'TeammateIdle', 'TaskCreated', 'TaskCompleted',
  'Stop', 'StopFailure',
  'FileChanged', 'CwdChanged', 'ConfigChange',
  'WorktreeCreate', 'WorktreeRemove',
  'Notification', 'PreCompact', 'PostCompact',
  'Elicitation', 'ElicitationResult',
];

const VALID_HOOK_TYPES = ['command', 'http', 'prompt', 'agent'];

module.exports = { createAdapterResult, createLoss, VALID_EVENTS, VALID_HOOK_TYPES };
