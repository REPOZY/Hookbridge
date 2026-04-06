// plugin-compiler/src/parser.js
'use strict';

const yaml = require('../vendor/js-yaml');
const { VALID_EVENTS, VALID_HOOK_TYPES } = require('./ir');

const REGISTERED_ADAPTERS = ['claude-code', 'codex'];

/**
 * Parse plugin.universal.yaml content into an IR.
 * @param {string} yamlContent - raw YAML string
 * @returns {{ ir: PluginIR|null, errors: string[], warnings: string[] }}
 */
function parse(yamlContent) {
  const errors = [];
  const warnings = [];

  let raw;
  try {
    raw = yaml.load(yamlContent);
  } catch (e) {
    return { ir: null, errors: [`YAML parse error: ${e.message}`], warnings: [] };
  }

  if (!raw || typeof raw !== 'object') {
    return { ir: null, errors: ['Schema must be a YAML object'], warnings: [] };
  }

  // Validate meta
  const meta = raw.meta || {};
  if (!meta.name) errors.push('meta.name: required field missing');
  if (!meta.version) errors.push('meta.version: required field missing');
  if (!meta.platforms || !Array.isArray(meta.platforms) || meta.platforms.length === 0) {
    errors.push('meta.platforms: required non-empty array');
  } else {
    for (const p of meta.platforms) {
      if (!REGISTERED_ADAPTERS.includes(p)) {
        errors.push(`meta.platforms: unknown platform "${p}" — registered adapters are: ${REGISTERED_ADAPTERS.join(', ')}`);
      }
    }
  }

  // Validate hooks
  const hooks = raw.hooks || [];
  if (!Array.isArray(hooks)) {
    errors.push('hooks: must be an array');
  } else {
    hooks.forEach((hook, i) => {
      if (!hook.event) {
        errors.push(`hooks[${i}].event: required field missing`);
      } else if (!VALID_EVENTS.includes(hook.event)) {
        errors.push(`hooks[${i}].event: unknown event "${hook.event}" — valid events are: ${VALID_EVENTS.join(', ')}`);
      }
      const hookType = hook.type || 'command';
      if (!VALID_HOOK_TYPES.includes(hookType)) {
        errors.push(`hooks[${i}].type: unknown type "${hookType}" — valid types are: ${VALID_HOOK_TYPES.join(', ')}`);
      } else {
        if (hookType === 'command' && !hook.command) {
          errors.push(`hooks[${i}].command: required for type "command"`);
        }
        if (hookType === 'http' && !hook.url) {
          errors.push(`hooks[${i}].url: required for type "http"`);
        }
        if ((hookType === 'prompt' || hookType === 'agent') && !hook.prompt) {
          errors.push(`hooks[${i}].prompt: required for type "${hookType}"`);
        }
      }
      if (!hook.platforms || !Array.isArray(hook.platforms) || hook.platforms.length === 0) {
        errors.push(`hooks[${i}].platforms: required non-empty array`);
      } else {
        for (const p of hook.platforms) {
          if (!REGISTERED_ADAPTERS.includes(p)) {
            errors.push(`hooks[${i}].platforms: unknown platform "${p}" — registered adapters are: ${REGISTERED_ADAPTERS.join(', ')}`);
          }
          if (meta.platforms && Array.isArray(meta.platforms) && !meta.platforms.includes(p)) {
            warnings.push(`hooks[${i}].platforms: platform "${p}" not in meta.platforms — possible typo`);
          }
        }
      }
    });
  }

  // Validate skills
  const skills = raw.skills || [];

  // Validate extensions
  const extensions = raw.extensions || {};
  for (const key of Object.keys(extensions)) {
    if (!REGISTERED_ADAPTERS.includes(key)) {
      warnings.push(`extensions: unknown key "${key}" — does not match any registered adapter (${REGISTERED_ADAPTERS.join(', ')})`);
    }
  }

  if (errors.length > 0) {
    return { ir: null, errors, warnings };
  }

  const ir = {
    meta: {
      name: meta.name,
      version: String(meta.version),
      description: meta.description || '',
      platforms: meta.platforms,
      ...(meta.author && { author: meta.author }),
      ...(meta.homepage && { homepage: meta.homepage }),
      ...(meta.repository && { repository: meta.repository }),
      ...(meta.license && { license: meta.license }),
      ...(meta.keywords && { keywords: meta.keywords }),
    },
    hooks: hooks.map(h => ({
      event: h.event,
      ...(h.matcher !== undefined && { matcher: h.matcher }),
      type: h.type || 'command',
      ...(h.command !== undefined && { command: h.command }),
      ...(h.url !== undefined && { url: h.url }),
      ...(h.prompt !== undefined && { prompt: h.prompt }),
      ...(h.model !== undefined && { model: h.model }),
      ...(h.timeout !== undefined && { timeout: h.timeout }),
      ...(h.async !== undefined && { async: h.async }),
      platforms: h.platforms,
    })),
    skills,
    extensions,
  };

  return { ir, errors: [], warnings };
}

module.exports = { parse, REGISTERED_ADAPTERS };
