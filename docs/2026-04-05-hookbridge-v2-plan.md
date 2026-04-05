# hookbridge v2: Events Expansion + Sync Command

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-optimized:subagent-driven-development (recommended) or superpowers-optimized:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand hookbridge from 6 to 26 Claude Code events, add http/prompt/agent hook types, and add a `sync` command that detects future platform doc changes.
**Architecture:** Five sequential waves. Waves 1–4 implement code; Wave 5 adds tests. Tasks within the same wave are file-independent and can be dispatched in parallel. Each wave ends with a full test run to catch regressions before the next wave begins.
**Tech Stack:** Node.js ≥16, zero npm dependencies, built-in `assert`, `https`, `crypto`, `fs`
**Assumptions:**
- Assumes `node tests/run-all.js` from the repo root runs all tests — will NOT work if run-all.js is moved.
- Assumes `platforms/` directory lives at repo root alongside `hookbridge.js` — will NOT work if the CLI is run from a different directory with a relative `--schema` path.
- Assumes Claude Code docs at `code.claude.com/docs/en/hooks` remain server-rendered HTML — sync extraction will break silently if the page becomes JS-only (mitigated by hash detection).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/ir.js` | Modify | Add 20 events to VALID_EVENTS, add VALID_HOOK_TYPES |
| `platforms/claude-code.json` | Create | Known state for Claude Code platform |
| `platforms/codex.json` | Create | Known state for Codex platform |
| `src/parser.js` | Modify | Parse `type` field, conditional required-field validation |
| `src/adapters/claude-code.js` | Modify | Emit all 4 hook types natively |
| `src/adapters/codex.js` | Modify | Non-command hard-limit, SubagentStart shim |
| `src/shims/stop-shim-template.js` | Modify | Add `subagentStart` section |
| `src/platform-syncer.js` | Create | Pure fetch/extract/compare function |
| `hookbridge.js` | Modify | Add `sync` command, `--platform` flag |
| `tests/parser.test.js` | Modify | Add type field tests |
| `tests/adapter-claude-code.test.js` | Modify | Add http/prompt/agent type tests |
| `tests/adapter-codex.test.js` | Modify | Add non-command hard-limit, SubagentStart tests |
| `tests/platform-syncer.test.js` | Create | Test syncer with mock fetcher |
| `example/plugin.universal.yaml` | Modify | Demonstrate new events and hook types |

---

## Wave 1 — Foundation (Tasks 1–2, parallel)

### Task 1: Expand VALID_EVENTS and add VALID_HOOK_TYPES in ir.js

**Files:**
- Modify: `src/ir.js`

**Does NOT cover:** Parser validation of the new types (Task 3). Adapter support for new events/types (Tasks 4–6).

- [ ] **Step 1: Replace VALID_EVENTS and add VALID_HOOK_TYPES**

```javascript
// src/ir.js — replace the existing VALID_EVENTS constant and add VALID_HOOK_TYPES

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
```

- [ ] **Step 2: Update HookEntry typedef to reflect new optional fields**

```javascript
// Replace the existing @typedef {Object} HookEntry block with:

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
```

- [ ] **Step 3: Add VALID_HOOK_TYPES to exports**

```javascript
// Replace the final line:
module.exports = { createAdapterResult, createLoss, VALID_EVENTS, VALID_HOOK_TYPES };
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 5: Commit**

```bash
git add src/ir.js
git commit -m "feat(ir): expand VALID_EVENTS to 26, add VALID_HOOK_TYPES"
```

---

### Task 2: Create platform spec files

**Files:**
- Create: `platforms/claude-code.json`
- Create: `platforms/codex.json`

**Does NOT cover:** The `sync` command that reads these files (Task 8). Updating hashes (populated on first `sync` run).

- [ ] **Step 1: Create platforms/claude-code.json**

```json
{
  "id": "claude-code",
  "docUrls": ["https://code.claude.com/docs/en/hooks"],
  "knownEvents": [
    "SessionStart", "SessionEnd", "InstructionsLoaded",
    "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "PermissionDenied",
    "UserPromptSubmit",
    "SubagentStart", "SubagentStop", "TeammateIdle", "TaskCreated", "TaskCompleted",
    "Stop", "StopFailure",
    "FileChanged", "CwdChanged", "ConfigChange",
    "WorktreeCreate", "WorktreeRemove",
    "Notification", "PreCompact", "PostCompact",
    "Elicitation", "ElicitationResult"
  ],
  "knownHookTypes": ["command", "http", "prompt", "agent"],
  "lastChecked": "2026-04-05",
  "pageHashes": {}
}
```

- [ ] **Step 2: Create platforms/codex.json**

```json
{
  "id": "codex",
  "docUrls": ["https://developers.openai.com/codex/hooks"],
  "knownEvents": [
    "SessionStart", "PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"
  ],
  "knownHookTypes": ["command"],
  "lastChecked": "2026-04-05",
  "pageHashes": {}
}
```

- [ ] **Step 3: Verify files are valid JSON**

Run: `node -e "require('./platforms/claude-code.json'); require('./platforms/codex.json'); console.log('PASS: spec files valid JSON')"`
Expected: `PASS: spec files valid JSON`

- [ ] **Step 4: Commit**

```bash
git add platforms/claude-code.json platforms/codex.json
git commit -m "feat(platforms): add platform spec files for claude-code and codex"
```

---

## Wave 2 — Parser + Claude Code Adapter (Tasks 3–4, parallel)

### Task 3: Update parser.js — type field and conditional validation

**Files:**
- Modify: `src/parser.js`

**Does NOT cover:** Adapter-level handling of new hook types (Tasks 4–5). The `type` field for existing `command` hooks already defaults to `'command'` — no migration needed.

- [ ] **Step 1: Import VALID_HOOK_TYPES from ir.js**

```javascript
// Replace the existing require line at the top:
const { VALID_EVENTS, VALID_HOOK_TYPES } = require('./ir');
```

- [ ] **Step 2: Replace the existing `command` required-field check with type-aware validation**

Find this block inside `hooks.forEach((hook, i) => { ... })` (after the platforms validation):
```javascript
      if (!hook.command) {
        errors.push(`hooks[${i}].command: required field missing`);
      }
```

Replace it with:
```javascript
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
```

- [ ] **Step 3: Update IR construction to include type and new optional fields**

Find the IR construction block (`const ir = { ... }`). Replace the `hooks` mapping:
```javascript
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
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 5: Commit**

```bash
git add src/parser.js
git commit -m "feat(parser): add hook type field with conditional required-field validation"
```

---

### Task 4: Update claude-code adapter — emit all 4 hook types

**Files:**
- Modify: `src/adapters/claude-code.js`

**Does NOT cover:** Codex adapter handling of non-command types (Task 5). The `{PLUGIN_ROOT}` substitution only applies to `command` type — http/prompt/agent URLs and prompts pass through unchanged by design.

- [ ] **Step 1: Replace the hookEntry construction block inside the hooksObj loop**

Find the `hooks.map(hook => {` block (roughly lines 33–52). Replace the entire map callback body:

```javascript
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
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 3: Commit**

```bash
git add src/adapters/claude-code.js
git commit -m "feat(adapter/claude-code): emit http, prompt, and agent hook types natively"
```

---

## Wave 3 — Codex Adapter + Stop Shim (Tasks 5–6, parallel)

### Task 5: Update codex adapter — non-command hard-limit and SubagentStart shim

**Files:**
- Modify: `src/adapters/codex.js`

**Does NOT cover:** The stop-shim-template `subagentStart` section (Task 6 — needed for the shim to actually run SubagentStart logic).

- [ ] **Step 1: Add `subagentStart` to shimNeeded initialization**

Find: `const shimNeeded = { editTracking: false, sessionStats: false, subagentGuard: false };`
Replace: `const shimNeeded = { editTracking: false, sessionStats: false, subagentGuard: false, subagentStart: false };`

- [ ] **Step 2: Add non-command type hard-limit — insert BEFORE the SubagentStop block**

The SubagentStop block starts at roughly line 30 with `if (hook.event === 'SubagentStop') {`. Insert this block immediately before it:

```javascript
    if (hook.type && hook.type !== 'command') {
      result.losses.push(createLoss(PLATFORM_ID, `${hook.event}(type:${hook.type})`, 'hard-limit',
        `Codex only supports "command" hook type. "${hook.type}" hooks have no Codex equivalent.`));
      continue;
    }
```

- [ ] **Step 3: Add SubagentStart shim — insert AFTER the SubagentStop block**

The SubagentStop block ends with `continue; }`. Insert immediately after the closing `}`:

```javascript
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
```

- [ ] **Step 4: Pass subagentStart to generateStopShim**

Find the `generateStopShim({` call. Add `subagentStart: shimNeeded.subagentStart,` to the options object:

```javascript
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
```

- [ ] **Step 5: Update the shimNeeded condition to include subagentStart**

Find: `if (shimNeeded.editTracking || shimNeeded.sessionStats || shimNeeded.subagentGuard) {`
Replace: `if (shimNeeded.editTracking || shimNeeded.sessionStats || shimNeeded.subagentGuard || shimNeeded.subagentStart) {`

- [ ] **Step 6: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 7: Commit**

```bash
git add src/adapters/codex.js
git commit -m "feat(adapter/codex): hard-limit non-command types, shim SubagentStart"
```

---

### Task 6: Update stop-shim-template.js — add subagentStart section

**Files:**
- Modify: `src/shims/stop-shim-template.js`

**Does NOT cover:** The codex.js call that passes `subagentStart` (already done in Task 5). The shim assumes the plugin provides a `hooks/subagent-start.js` file with a `handleFromTranscript` export — plugin authors must implement this themselves.

- [ ] **Step 1: Add subagentStart parameter to the function signature**

Find: `function generateStopShim({ editTracking, sessionStats, subagentGuard, pluginRoot }) {`
Replace: `function generateStopShim({ editTracking, sessionStats, subagentGuard, subagentStart, pluginRoot }) {`

- [ ] **Step 2: Add the subagentStart section — insert after the subagentGuard section**

The subagentGuard section ends with `}` before the closing of the outer `if (subagentGuard)` block. Insert after it:

```javascript
  if (subagentStart) {
    sections.push(`
    // --- Subagent Start (shimmed from SubagentStart) ---
    const agentStartEntries = toolCalls.filter(tc =>
      ['Agent', 'agent', 'dispatch_agent'].includes(tc.tool_name || tc.function?.name || '')
    );
    if (agentStartEntries.length > 0) {
      try {
        const subagentStartHook = require(path.join(PLUGIN_ROOT, 'hooks', 'subagent-start.js'));
        if (typeof subagentStartHook.handleFromTranscript === 'function') {
          subagentStartHook.handleFromTranscript(agentStartEntries, cwd);
        }
      } catch (e) {
        console.error('[stop-shim] subagent start error:', e.message);
      }
    }`);
  }
```

- [ ] **Step 3: Update the generated file header comment**

Find: `// GENERATED by plugin-compiler — do not edit by hand.`
Replace: `// GENERATED by hookbridge — do not edit by hand.`

- [ ] **Step 4: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 5: Commit**

```bash
git add src/shims/stop-shim-template.js
git commit -m "feat(shims): add subagentStart section to stop-shim-template"
```

---

## Wave 4 — Sync Infrastructure (Tasks 7–8, parallel)

### Task 7: Create src/platform-syncer.js

**Files:**
- Create: `src/platform-syncer.js`

**Does NOT cover:** Writing the sync report to disk or reading platforms/ files (Task 8 — the syncer is a pure function with no file I/O). The `fetcher` parameter exists for testability; production callers omit it and get the default `fetchUrl`.

- [ ] **Step 1: Create the full file**

```javascript
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
```

- [ ] **Step 2: Verify the module loads without errors**

Run: `node -e "const s = require('./src/platform-syncer'); console.log('PASS: platform-syncer loads, exports:', Object.keys(s).join(', '))"`
Expected: `PASS: platform-syncer loads, exports: syncPlatform, extractEvents, sha256, fetchUrl`

- [ ] **Step 3: Commit**

```bash
git add src/platform-syncer.js
git commit -m "feat: add platform-syncer — pure fetch/extract/compare function"
```

---

### Task 8: Add sync command to hookbridge.js

**Files:**
- Modify: `hookbridge.js`

**Does NOT cover:** The syncer logic itself (Task 7). The sync command updates `pageHashes` in the platform spec files on disk after each run to enable future change detection.

- [ ] **Step 1: Add platform-syncer require at top of file**

After the existing requires at the top of `hookbridge.js`, add:
```javascript
const { syncPlatform } = require('./src/platform-syncer');
```

- [ ] **Step 2: Add `--platform` to parseArgs**

In `parseArgs`, add inside the while loop alongside the other `else if` flags:
```javascript
    else if (argv[i] === '--platform' && argv[i + 1]) { args.platform = argv[++i]; }
```

Also add `platform: null` to the initial `args` object:
```javascript
  const args = { command: null, schema: 'plugin.universal.yaml', out: '.', dryRun: false, platform: null };
```

- [ ] **Step 3: Add sync command mention to printHelp**

In `printHelp`, add `sync` to the Commands list:
```
  sync       Check platform docs for new or removed hook events
```

And add to Options:
```
  --platform <id>   Limit sync to one platform (e.g. codex)
```

- [ ] **Step 4: Add generateSyncReport function**

Add before the `// Main` comment at the bottom:

```javascript
function generateSyncReport(allResults) {
  const lines = [
    '# Platform Sync Report',
    '',
    `_Generated: ${new Date().toISOString().slice(0, 10)}_`,
    '',
  ];

  for (const result of allResults) {
    lines.push(`## ${result.platformId}`, '');

    if (result.fetchErrors.length > 0) {
      lines.push('### Fetch Errors');
      for (const e of result.fetchErrors) {
        lines.push(`- ❌ \`${e.url}\`: ${e.error}`);
      }
      lines.push('');
    }

    if (result.extractionFailed) {
      lines.push('### ⚠️ Page Changed — Manual Review Required');
      lines.push('The page content changed but no events could be extracted.');
      lines.push('Review the doc URL manually and update the platform spec file.');
      lines.push('');
    }

    if (result.newEvents.length > 0) {
      lines.push('### 🆕 New Events Detected');
      lines.push('These appear in the docs but are not in hookbridge:');
      for (const e of result.newEvents) lines.push(`- \`${e}\``);
      lines.push('');
      lines.push('**Action:** Add to `src/ir.js` VALID_EVENTS and update the relevant adapter.');
      lines.push('');
    }

    if (result.removedEvents.length > 0) {
      lines.push('### 🗑️ Events No Longer in Documentation');
      for (const e of result.removedEvents) lines.push(`- \`${e}\``);
      lines.push('');
      lines.push('**Action:** Verify removal, then remove from `src/ir.js` VALID_EVENTS and update adapters.');
      lines.push('');
    }

    const anyChange = Object.values(result.pageChanged).some(Boolean);
    if (!anyChange && result.newEvents.length === 0 && result.removedEvents.length === 0 && result.fetchErrors.length === 0) {
      lines.push('✅ No changes detected — hookbridge is up to date.', '');
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 5: Add runSync async function**

Add before the `// Main` comment:

```javascript
async function runSync(args) {
  const platformsDir = path.join(__dirname, 'platforms');

  if (!fs.existsSync(platformsDir)) {
    console.error('Error: platforms/ directory not found at: ' + platformsDir);
    process.exit(2);
  }

  let specFiles = fs.readdirSync(platformsDir).filter(f => f.endsWith('.json'));
  if (specFiles.length === 0) {
    console.error('Error: no .json spec files found in platforms/');
    process.exit(2);
  }

  let specs = specFiles.map(f => JSON.parse(fs.readFileSync(path.join(platformsDir, f), 'utf8')));

  if (args.platform) {
    specs = specs.filter(s => s.id === args.platform);
    if (specs.length === 0) {
      console.error(`Error: no spec file found for platform "${args.platform}"`);
      process.exit(2);
    }
  }

  console.log(`hookbridge sync — checking ${specs.length} platform(s)\n`);

  const allResults = [];
  for (const spec of specs) {
    process.stdout.write(`  ${spec.id}...`);
    const result = await syncPlatform(spec);
    allResults.push({ result, spec });

    const issues = result.fetchErrors.length + result.newEvents.length + result.removedEvents.length;
    if (result.extractionFailed) {
      console.log(' ⚠  page changed — manual review needed');
    } else if (issues > 0) {
      console.log(` ⚠  ${issues} issue(s) found`);
    } else {
      console.log(' ✓');
    }

    // Update page hashes in spec file
    const updatedSpec = {
      ...spec,
      lastChecked: new Date().toISOString().slice(0, 10),
      pageHashes: { ...(spec.pageHashes || {}), ...result.newPageHashes },
    };
    fs.writeFileSync(
      path.join(platformsDir, `${spec.id}.json`),
      JSON.stringify(updatedSpec, null, 2) + '\n',
      'utf8'
    );
  }

  const reportContent = generateSyncReport(allResults.map(r => r.result));
  const reportPath = path.join(path.resolve(args.out), 'platform-sync-report.md');
  fs.writeFileSync(reportPath, reportContent, 'utf8');
  console.log(`\nReport: ${reportPath}`);

  const hasIssues = allResults.some(({ result }) =>
    result.fetchErrors.length > 0 ||
    result.newEvents.length > 0 ||
    result.removedEvents.length > 0 ||
    result.extractionFailed
  );
  process.exit(hasIssues ? 1 : 0);
}
```

- [ ] **Step 6: Add sync case to the switch statement**

Add inside the `switch (args.command)` block before `default:`:
```javascript
  case 'sync':
    runSync(args).catch(e => {
      console.error(`hookbridge: sync error\n  ${e.stack || e.message}`);
      process.exit(1);
    });
    break;
```

- [ ] **Step 7: Verify the sync command runs without crashing (dry run against live docs)**

Run: `node hookbridge.js sync --out .`
Expected: Output shows `claude-code... ✓` or `⚠`, writes `platform-sync-report.md`, exits 0 or 1. No unhandled exceptions.

- [ ] **Step 8: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 9: Commit**

```bash
git add hookbridge.js
git commit -m "feat: add sync command — detect platform doc changes and report drift"
```

---

## Wave 5 — Tests (Tasks 9–11, parallel)

### Task 9: Update parser tests

**Files:**
- Modify: `tests/parser.test.js`

**Does NOT cover:** Adapter-level tests for new types (Task 10).

- [ ] **Step 1: Add type field tests at the end of parser.test.js, before the final console.log**

```javascript
// Test: hook with no type field defaults to 'command' in IR
{
  const input = yamlFromObj(minimalSchema());
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.ir.hooks[0].type, 'command', 'Default type is command');
  console.log('PASS: hook type defaults to command');
}

// Test: explicit valid type passes validation
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'http', url: 'https://example.com/hook', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors}`);
  assert.strictEqual(result.ir.hooks[0].type, 'http');
  assert.strictEqual(result.ir.hooks[0].url, 'https://example.com/hook');
  console.log('PASS: http type with url parses correctly');
}

// Test: unknown type → error
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'grpc', command: 'node x.js', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('grpc')), 'Should report unknown type');
  console.log('PASS: unknown type produces error');
}

// Test: http type without url → error
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'http', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('url')), 'Should require url for http');
  console.log('PASS: http type without url produces error');
}

// Test: prompt type without prompt field → error
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'prompt', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.ok(result.errors.some(e => e.includes('prompt')), 'Should require prompt for prompt type');
  console.log('PASS: prompt type without prompt produces error');
}

// Test: agent type with prompt field passes
{
  const schema = minimalSchema();
  schema.hooks[0] = { event: 'Stop', type: 'agent', prompt: 'Verify tests pass', platforms: ['claude-code'] };
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors}`);
  assert.strictEqual(result.ir.hooks[0].prompt, 'Verify tests pass');
  console.log('PASS: agent type with prompt parses correctly');
}

// Test: new events (e.g. FileChanged, Notification) are accepted
{
  const schema = minimalSchema();
  schema.hooks = [
    { event: 'FileChanged', command: 'node {PLUGIN_ROOT}/watch.js', platforms: ['claude-code'] },
    { event: 'Notification', command: 'node {PLUGIN_ROOT}/notify.js', platforms: ['claude-code'] },
    { event: 'PostCompact', command: 'node {PLUGIN_ROOT}/compact.js', platforms: ['claude-code'] },
  ];
  const input = yamlFromObj(schema);
  const result = parse(input);
  assert.strictEqual(result.errors.length, 0, `Unexpected errors: ${result.errors}`);
  assert.strictEqual(result.ir.hooks.length, 3);
  console.log('PASS: new events FileChanged, Notification, PostCompact accepted');
}
```

- [ ] **Step 2: Run updated parser tests**

Run: `node tests/parser.test.js`
Expected: All existing 9 tests + 7 new tests pass, final line `All parser tests passed.`

- [ ] **Step 3: Run full suite**

Run: `node tests/run-all.js`
Expected: `Results: 5 passed, 0 failed, 5 total`

- [ ] **Step 4: Commit**

```bash
git add tests/parser.test.js
git commit -m "test(parser): add type field and new event tests"
```

---

### Task 10: Update adapter tests and create platform-syncer tests

**Files:**
- Modify: `tests/adapter-claude-code.test.js`
- Modify: `tests/adapter-codex.test.js`
- Create: `tests/platform-syncer.test.js`

**Does NOT cover:** Integration test changes (run-all.js already includes integration.test.js which uses example/ YAML — that's updated in Task 11).

- [ ] **Step 1: Add http/prompt/agent type tests to adapter-claude-code.test.js**

Add before the final `console.log('\nAll Claude Code adapter tests passed.')`:

```javascript
// Test: http type hook emits correct hookEntry structure
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://audit.example.com/stop', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.strictEqual(hookEntry.type, 'http');
  assert.strictEqual(hookEntry.url, 'https://audit.example.com/stop');
  assert.strictEqual(hookEntry.command, undefined, 'http type has no command field');
  console.log('PASS: http type emits correct hookEntry');
}

// Test: prompt type hook emits correct hookEntry structure
{
  const ir = makeIR([
    { event: 'Stop', type: 'prompt', prompt: 'Are all tasks done?', model: 'claude-haiku-4-5', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.strictEqual(hookEntry.type, 'prompt');
  assert.strictEqual(hookEntry.prompt, 'Are all tasks done?');
  assert.strictEqual(hookEntry.model, 'claude-haiku-4-5');
  assert.strictEqual(hookEntry.command, undefined, 'prompt type has no command field');
  console.log('PASS: prompt type emits correct hookEntry');
}

// Test: agent type hook emits correct hookEntry structure
{
  const ir = makeIR([
    { event: 'Stop', type: 'agent', prompt: 'Run tests and verify they pass.', timeout: 120, platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.strictEqual(hookEntry.type, 'agent');
  assert.strictEqual(hookEntry.prompt, 'Run tests and verify they pass.');
  assert.strictEqual(hookEntry.timeout, 120);
  console.log('PASS: agent type emits correct hookEntry');
}

// Test: http type does NOT substitute {PLUGIN_ROOT} in URL
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://example.com/{PLUGIN_ROOT}/stop', platforms: ['claude-code'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/hooks.json'));
  const hookEntry = output.hooks.Stop[0].hooks[0];
  assert.ok(hookEntry.url.includes('{PLUGIN_ROOT}'), 'URL passes through unchanged');
  console.log('PASS: http type does not substitute {PLUGIN_ROOT} in url');
}
```

- [ ] **Step 2: Add non-command hard-limit and SubagentStart tests to adapter-codex.test.js**

Add before the final `console.log('\nAll Codex adapter tests passed.')`:

```javascript
// Test: non-command type hook targeting codex → hard-limit loss, not emitted
{
  const ir = makeIR([
    { event: 'Stop', type: 'http', url: 'https://example.com/stop', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  const output = JSON.parse(result.files.get('hooks/codex-hooks.json'));
  assert.strictEqual(output.Stop, undefined, 'http type hook not emitted on Codex');
  assert.ok(
    result.losses.some(l => l.severity === 'hard-limit' && l.feature.includes('http')),
    'hard-limit loss emitted for http type'
  );
  console.log('PASS: non-command type hook produces hard-limit on Codex');
}

// Test: SubagentStart → shimmed loss, stop-shim generated
{
  const ir = makeIR([
    { event: 'SubagentStart', command: 'node {PLUGIN_ROOT}/hooks/subagent-start.js', platforms: ['codex'] },
  ]);
  const result = emit(ir);
  assert.ok(
    result.losses.some(l => l.severity === 'shimmed' && l.feature.includes('SubagentStart')),
    'SubagentStart shimmed loss emitted'
  );
  assert.ok(result.shims.has('hooks/codex/stop-shim.js'), 'stop-shim.js generated');
  const shimContent = result.shims.get('hooks/codex/stop-shim.js');
  assert.ok(shimContent.includes('subagent-start.js'), 'Shim references subagent-start.js');
  console.log('PASS: SubagentStart shimmed with stop-shim');
}
```

- [ ] **Step 3: Create tests/platform-syncer.test.js**

```javascript
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
```

- [ ] **Step 4: Add platform-syncer.test.js to run-all.js**

In `tests/run-all.js`, add `'platform-syncer.test.js'` to the `tests` array:

```javascript
const tests = [
  'parser.test.js',
  'adapter-claude-code.test.js',
  'adapter-codex.test.js',
  'loss-report.test.js',
  'integration.test.js',
  'platform-syncer.test.js',
];
```

- [ ] **Step 5: Run full suite**

Run: `node tests/run-all.js`
Expected: `Results: 6 passed, 0 failed, 6 total`

- [ ] **Step 6: Commit**

```bash
git add tests/adapter-claude-code.test.js tests/adapter-codex.test.js tests/platform-syncer.test.js tests/run-all.js
git commit -m "test: add hook type tests, SubagentStart tests, and platform-syncer test suite"
```

---

### Task 11: Update example/plugin.universal.yaml

**Files:**
- Modify: `example/plugin.universal.yaml`

**Does NOT cover:** Updating the superpowers-optimized `plugin-compiler/plugin.universal.yaml` — that is a separate file in a separate repo and is not managed here.

- [ ] **Step 1: Add new event and hook type examples to example/plugin.universal.yaml**

Replace the entire file with:

```yaml
# example/plugin.universal.yaml — minimal hookbridge example
# Compile with: node hookbridge.js compile --schema example/plugin.universal.yaml --out ./output

meta:
  name: my-plugin
  version: "1.0.0"
  description: "My plugin for Claude Code and Codex"
  author: "Your Name"
  homepage: "https://github.com/yourname/my-plugin"
  repository: "https://github.com/yourname/my-plugin"
  platforms: [claude-code, codex]

hooks:
  # Run on session start (both platforms)
  - event: SessionStart
    command: "node {PLUGIN_ROOT}/hooks/session-start.js"
    platforms: [claude-code, codex]

  # Run when user submits a prompt (both platforms)
  - event: UserPromptSubmit
    command: "node {PLUGIN_ROOT}/hooks/on-prompt.js"
    platforms: [claude-code, codex]

  # Track file edits — Claude Code native, Codex: shimmed via transcript analysis
  - event: PostToolUse
    matcher: "Edit|Write"
    command: "node {PLUGIN_ROOT}/hooks/track-edits.js"
    platforms: [claude-code]

  # Run on session stop (both platforms)
  - event: Stop
    command: "node {PLUGIN_ROOT}/hooks/on-stop.js"
    platforms: [claude-code, codex]

  # --- New Claude Code events (v2) ---

  # Re-inject context after compaction (Claude Code only — Codex: hard-limit)
  - event: PostCompact
    command: "node {PLUGIN_ROOT}/hooks/reinject-context.js"
    platforms: [claude-code]

  # Desktop notification when Claude needs input (Claude Code only — Codex: hard-limit)
  - event: Notification
    command: "node {PLUGIN_ROOT}/hooks/desktop-notify.js"
    platforms: [claude-code]

  # Audit config changes (Claude Code only — Codex: hard-limit)
  - event: ConfigChange
    command: "node {PLUGIN_ROOT}/hooks/audit-config.js"
    platforms: [claude-code]

  # --- New hook types (Claude Code only) ---

  # HTTP hook — POST event data to an audit endpoint (Claude Code only — Codex: hard-limit)
  - event: PostToolUse
    type: http
    url: "https://audit.example.com/tool-use"
    platforms: [claude-code]

  # Prompt hook — LLM evaluates whether all tasks are done (Claude Code only — Codex: hard-limit)
  - event: Stop
    type: prompt
    prompt: "Check if all tasks the user requested are complete. Return {\"ok\": true} if done, or {\"ok\": false, \"reason\": \"what remains\"} if not."
    platforms: [claude-code]

skills:
  - path: skills/
    recursive: true

extensions:
  claude-code:
    env_var: MY_PLUGIN_ROOT
    description: "My plugin for Claude Code"

  codex:
    install_path: "$HOME/.codex/{meta.name}"
    description: "My plugin for Codex"
```

- [ ] **Step 2: Verify the example compiles without errors**

Run: `node hookbridge.js compile --schema example/plugin.universal.yaml --out /tmp/hookbridge-example-test --dry-run`
Expected: Compile output shows hooks for claude-code and codex, no "Error:" lines. Hard-limit losses appear for Codex (PostCompact, Notification, ConfigChange, http type, prompt type) — this is expected and correct.

- [ ] **Step 3: Run full suite to confirm integration test still passes**

Run: `node tests/run-all.js`
Expected: `Results: 6 passed, 0 failed, 6 total`

- [ ] **Step 4: Commit**

```bash
git add example/plugin.universal.yaml
git commit -m "docs(example): demonstrate new events and hook types in example schema"
```

---

## Final Verification

After all 11 tasks:

```bash
node tests/run-all.js
```

Expected: `Results: 6 passed, 0 failed, 6 total`

```bash
node hookbridge.js validate --schema example/plugin.universal.yaml
```

Expected: `Schema valid — 2 platforms, 10 hooks, 1 skill paths`

```bash
node hookbridge.js compile --schema example/plugin.universal.yaml --out /tmp/hb-final --dry-run
```

Expected: Shows losses for Codex (hard-limit for new events/types), no errors.
