# Hook Event Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-optimized:subagent-driven-development (recommended) or superpowers-optimized:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `run` command to hookbridge that fires hook scripts locally with realistic mock payloads, requiring no live Claude Code or Codex session.
**Architecture:** Four waves. Wave 1 creates data files (payload schemas + platform spec update). Wave 2 creates the pure `generatePayload` function. Wave 3 wires the `run` command into the CLI. Wave 4 adds tests. Each wave verifies the existing 6-suite test run stays green.
**Tech Stack:** Node.js ≥16, zero npm dependencies, built-in `child_process`, `crypto`, `fs`, `path`, `assert`
**Assumptions:**
- Assumes hook commands in the schema follow the pattern `node {PLUGIN_ROOT}/path/to/script.js` — will NOT work correctly if hook commands use a different interpreter without adjusting the spawn call.
- Assumes `payloads/<platform-id>.json` lives at the repo root alongside `platforms/` — will NOT be found if `hookbridge.js` is symlinked from a different directory.
- Assumes `spawnSync` with `shell: true` is acceptable — it is the only safe way to run a full command string (not an array) cross-platform on Windows.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `payloads/claude-code.json` | Create | 26 event payload schemas for Claude Code; 6 verified, 20 inferred |
| `payloads/codex.json` | Create | 5 event payload schemas for Codex; all inferred |
| `platforms/claude-code.json` | Modify | Add `"env": {}` field for extensible env var injection |
| `platforms/codex.json` | Modify | Add `"env": {}` field |
| `src/payload-runner.js` | Create | Pure function `generatePayload(event, schemas, overrides)` → `{payload, warnings}` |
| `hookbridge.js` | Modify | Add `run` command, `--event`, `--tool`, `--merge`, `--script`, `--cwd` flags |
| `tests/payload-runner.test.js` | Create | Unit tests for `generatePayload`; no spawning |
| `tests/run-all.js` | Modify | Add `payload-runner.test.js` as 7th suite |

---

## Wave 1 — Data files (Tasks 1–2, parallel)

### Task 1: Create payload schema files

**Files:**
- Create: `payloads/claude-code.json`
- Create: `payloads/codex.json`

**Does NOT cover:** Sentinel resolution (Task 3). The CLI that reads these files (Task 4).

- [ ] **Step 1: Create `payloads/claude-code.json`**

```json
{
  "SessionStart": {
    "coverage": "verified",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "SessionStart"
    }
  },
  "SessionEnd": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "SessionEnd",
      "exit_code": 0
    }
  },
  "InstructionsLoaded": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "InstructionsLoaded",
      "instructions": "You are a helpful assistant."
    }
  },
  "PreToolUse": {
    "coverage": "verified",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PreToolUse",
      "tool_name": "__tool_name__",
      "tool_input": { "command": "ls -la" }
    }
  },
  "PostToolUse": {
    "coverage": "verified",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PostToolUse",
      "tool_name": "__tool_name__",
      "tool_input": { "command": "ls -la" },
      "tool_response": "file1.txt\nfile2.txt"
    }
  },
  "PostToolUseFailure": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PostToolUseFailure",
      "tool_name": "__tool_name__",
      "tool_input": { "command": "ls -la" },
      "error": "Command failed with exit code 1"
    }
  },
  "PermissionRequest": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PermissionRequest",
      "tool_name": "__tool_name__",
      "action": "execute",
      "resource": "rm -rf /tmp/test"
    }
  },
  "PermissionDenied": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PermissionDenied",
      "tool_name": "__tool_name__",
      "action": "execute",
      "reason": "User denied permission"
    }
  },
  "UserPromptSubmit": {
    "coverage": "verified",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "UserPromptSubmit",
      "prompt": "What files are in this directory?"
    }
  },
  "SubagentStart": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "SubagentStart",
      "subagent_id": "subagent_abc123"
    }
  },
  "SubagentStop": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "SubagentStop",
      "subagent_id": "subagent_abc123",
      "exit_code": 0
    }
  },
  "TeammateIdle": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "TeammateIdle",
      "teammate_id": "teammate_xyz"
    }
  },
  "TaskCreated": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "TaskCreated",
      "task_id": "task_001",
      "title": "Example task"
    }
  },
  "TaskCompleted": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "TaskCompleted",
      "task_id": "task_001",
      "title": "Example task"
    }
  },
  "Stop": {
    "coverage": "verified",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "Stop",
      "stop_hook_active": true
    }
  },
  "StopFailure": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "StopFailure",
      "error": "Hook timed out"
    }
  },
  "FileChanged": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "FileChanged",
      "file": "__cwd__/src/example.js"
    }
  },
  "CwdChanged": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "CwdChanged",
      "old_cwd": "__cwd__",
      "new_cwd": "__cwd__/subdir"
    }
  },
  "ConfigChange": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "ConfigChange",
      "key": "model",
      "old_value": "claude-sonnet-4-6",
      "new_value": "claude-opus-4-6"
    }
  },
  "WorktreeCreate": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "WorktreeCreate",
      "worktree_path": "__cwd__/.worktrees/feature-branch",
      "branch": "feature-branch"
    }
  },
  "WorktreeRemove": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "WorktreeRemove",
      "worktree_path": "__cwd__/.worktrees/feature-branch"
    }
  },
  "Notification": {
    "coverage": "verified",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "Notification",
      "message": "Claude needs your input to continue.",
      "title": "Claude Code"
    }
  },
  "PreCompact": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PreCompact",
      "context_tokens": 180000
    }
  },
  "PostCompact": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "PostCompact",
      "tokens_before": 180000,
      "tokens_after": 45000
    }
  },
  "Elicitation": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "Elicitation",
      "elicitation_id": "elicit_001",
      "prompt": "Please provide your API key."
    }
  },
  "ElicitationResult": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "transcript_path": "__transcript_path__",
      "cwd": "__cwd__",
      "hook_event_name": "ElicitationResult",
      "elicitation_id": "elicit_001",
      "result": "sk-example-key"
    }
  }
}
```

- [ ] **Step 2: Create `payloads/codex.json`**

```json
{
  "SessionStart": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "cwd": "__cwd__",
      "hook_event_name": "SessionStart"
    }
  },
  "PreToolUse": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "cwd": "__cwd__",
      "hook_event_name": "PreToolUse",
      "tool_name": "__tool_name__",
      "tool_input": { "command": "ls -la" }
    }
  },
  "PostToolUse": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "cwd": "__cwd__",
      "hook_event_name": "PostToolUse",
      "tool_name": "__tool_name__",
      "tool_input": { "command": "ls -la" },
      "tool_output": "file1.txt\nfile2.txt"
    }
  },
  "UserPromptSubmit": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "cwd": "__cwd__",
      "hook_event_name": "UserPromptSubmit",
      "prompt": "What files are in this directory?"
    }
  },
  "Stop": {
    "coverage": "inferred",
    "payload": {
      "session_id": "__session_id__",
      "cwd": "__cwd__",
      "hook_event_name": "Stop"
    }
  }
}
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "require('./payloads/claude-code.json'); require('./payloads/codex.json'); console.log('PASS')"`
Expected: `PASS`

- [ ] **Step 4: Verify claude-code.json has exactly 26 events**

Run: `node -e "const s = require('./payloads/claude-code.json'); console.log(Object.keys(s).length + ' events')"`
Expected: `26 events`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tjerk Pieksma\Documents\Github\hookbridge"
git add payloads/claude-code.json payloads/codex.json
git commit -m "feat(payloads): add canonical payload schemas for claude-code (26 events) and codex (5 events)"
```

---

### Task 2: Add env field to platform spec files

**Files:**
- Modify: `platforms/claude-code.json`
- Modify: `platforms/codex.json`

**Does NOT cover:** Reading the env field at runtime (Task 4).

- [ ] **Step 1: Add `"env": {}` to `platforms/claude-code.json`**

Read the current file first. Add `"env": {}` as a new top-level field after `"pageHashes"`:

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
  "pageHashes": {
    "https://code.claude.com/docs/en/hooks": "de322c7dda43e3f4c21ebe7c1cfb97837088996db64f5822da783416986547c9"
  },
  "env": {}
}
```

- [ ] **Step 2: Add `"env": {}` to `platforms/codex.json`**

Read `platforms/codex.json` first. Add `"env": {}` as the last field before the closing `}`. Use the Edit tool — do NOT rewrite the whole file, as that would lose the current `pageHashes` hash value.

The final two lines of the file should become:
```json
  "pageHashes": { ... },
  "env": {}
}
```

- [ ] **Step 3: Verify both files are valid JSON and contain the env field**

Run: `node -e "const c = require('./platforms/claude-code.json'); const x = require('./platforms/codex.json'); console.log('claude-code env:', JSON.stringify(c.env), '| codex env:', JSON.stringify(x.env))"`
Expected: `claude-code env: {} | codex env: {}`

- [ ] **Step 4: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 6 passed, 0 failed, 6 total`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tjerk Pieksma\Documents\Github\hookbridge"
git add platforms/claude-code.json platforms/codex.json
git commit -m "feat(platforms): add env field for hook runner env var injection"
```

---

## Wave 2 — Pure function (Task 3)

### Task 3: Create src/payload-runner.js

**Files:**
- Create: `src/payload-runner.js`

**Does NOT cover:** Spawning child processes (Task 4). Reading payload files from disk (Task 4). CLI flag handling (Task 4).

- [ ] **Step 1: Create `src/payload-runner.js` with the full implementation**

```javascript
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
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "const r = require('./src/payload-runner'); console.log('exports:', Object.keys(r).join(', '))"`
Expected: `exports: generatePayload`

- [ ] **Step 3: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 6 passed, 0 failed, 6 total`

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Tjerk Pieksma\Documents\Github\hookbridge"
git add src/payload-runner.js
git commit -m "feat: add payload-runner — pure generatePayload function with sentinel resolution"
```

---

## Wave 3 — CLI command (Task 4)

### Task 4: Add run command to hookbridge.js

**Files:**
- Modify: `hookbridge.js`

**Does NOT cover:** The `generatePayload` function itself (Task 3). The payload schema files (Task 1). Tests for `generatePayload` (Task 5).

- [ ] **Step 1: Add new requires at the top of hookbridge.js**

After the existing `require` block (after line `const { syncPlatform } = require('./src/platform-syncer');`), add:

```javascript
const { spawnSync } = require('child_process');
const { generatePayload } = require('./src/payload-runner');
const { VALID_EVENTS } = require('./src/ir');
```

- [ ] **Step 2: Update `parseArgs` — add new args and flags**

Replace the `args` initialisation line:
```javascript
const args = { command: null, schema: 'plugin.universal.yaml', out: '.', dryRun: false, platform: null };
```
With:
```javascript
const args = { command: null, schema: 'plugin.universal.yaml', out: '.', dryRun: false, platform: null, event: null, tool: 'Bash', merge: null, script: null, cwd: null };
```

Inside the `while` loop, add these five new `else if` branches alongside the existing ones:
```javascript
    else if (argv[i] === '--event' && argv[i + 1]) { args.event = argv[++i]; }
    else if (argv[i] === '--tool' && argv[i + 1]) { args.tool = argv[++i]; }
    else if (argv[i] === '--merge' && argv[i + 1]) { args.merge = argv[++i]; }
    else if (argv[i] === '--script' && argv[i + 1]) { args.script = argv[++i]; }
    else if (argv[i] === '--cwd' && argv[i + 1]) { args.cwd = argv[++i]; }
```

- [ ] **Step 3: Update `printHelp` — add run command and new options**

In the Commands section, add:
```
  run        Simulate an event and fire matching hook scripts locally
```

In the Options section, add:
```
  --event <name>    Event to simulate (e.g. SessionStart, PreToolUse)
  --tool <name>     Tool name for tool events (default: Bash)
  --merge <json>    JSON merged into the payload (overrides generated values)
  --script <path>   Run a specific script directly, bypassing schema lookup
  --cwd <path>      Working directory in the payload (default: process.cwd())
```

- [ ] **Step 4: Add `runRun` function before the `// Main` comment**

```javascript
function runRun(args) {
  const platformId = args.platform || 'claude-code';

  // Validate --event
  if (!args.event) {
    console.error('Error: run requires --event (e.g. --event SessionStart)');
    process.exit(2);
  }
  if (!VALID_EVENTS.includes(args.event)) {
    console.error(`Error: unknown event "${args.event}"\nValid events: ${VALID_EVENTS.join(', ')}`);
    process.exit(2);
  }

  // Load payload schemas
  const payloadsDir = path.join(__dirname, 'payloads');
  const payloadFile = path.join(payloadsDir, `${platformId}.json`);
  if (!fs.existsSync(payloadFile)) {
    console.error(`Error: no payload schema file found for platform "${platformId}" — run is not yet supported for this platform`);
    process.exit(2);
  }
  const payloadSchemas = JSON.parse(fs.readFileSync(payloadFile, 'utf8'));

  // Load platform spec for env vars
  const platformSpecFile = path.join(__dirname, 'platforms', `${platformId}.json`);
  const platformSpec = fs.existsSync(platformSpecFile)
    ? JSON.parse(fs.readFileSync(platformSpecFile, 'utf8'))
    : {};
  const platformEnvVars = platformSpec.env || {};

  // Parse --merge
  let merge = null;
  if (args.merge) {
    try {
      merge = JSON.parse(args.merge);
    } catch (e) {
      console.error(`Error: invalid JSON in --merge: ${e.message}`);
      process.exit(2);
    }
  }

  const resolvedCwd = path.resolve(args.cwd || process.cwd());

  const overrides = {
    cwd: resolvedCwd,
    toolName: args.tool || 'Bash',
    merge,
  };

  // Generate payload
  const { payload, warnings } = generatePayload(args.event, payloadSchemas, overrides);

  console.log(`\nhookbridge run — ${args.event} on ${platformId}\n`);

  for (const w of warnings) {
    console.warn(`  ⚠  ${w}`);
  }
  if (warnings.length > 0) console.log('');

  console.log('  payload:');
  const payloadLines = JSON.stringify(payload, null, 2).split('\n');
  for (const line of payloadLines) console.log('  ' + line);
  console.log('');

  // Determine which commands to run
  const commands = [];

  if (args.script) {
    const scriptPath = path.resolve(args.script);
    if (!fs.existsSync(scriptPath)) {
      console.error(`Error: script not found: ${scriptPath}`);
      process.exit(2);
    }
    commands.push(`node "${scriptPath}"`);
  } else {
    // Schema-centric: parse schema and find matching hooks
    const schemaPath = path.resolve(args.schema);
    if (!fs.existsSync(schemaPath)) {
      console.error(`Error: schema file not found: ${schemaPath}`);
      process.exit(2);
    }
    const yamlContent = fs.readFileSync(schemaPath, 'utf8');
    const { ir, errors } = parse(yamlContent);
    if (errors.length > 0) {
      console.error('Schema invalid — cannot run.\n');
      for (const e of errors) console.error(`  ${e}`);
      process.exit(2);
    }

    const pluginRoot = path.resolve(args.out);
    const matchingHooks = ir.hooks.filter(
      h => h.event === args.event &&
           h.platforms.includes(platformId) &&
           (h.type || 'command') === 'command'
    );

    if (matchingHooks.length === 0) {
      console.log(`  No hooks for ${args.event} on ${platformId} — nothing to run.`);
      process.exit(0);
    }

    for (const hook of matchingHooks) {
      const cmd = hook.command.replace(/\{PLUGIN_ROOT\}/g, pluginRoot);
      commands.push(cmd);
    }
  }

  // Run each command synchronously
  const payloadJson = JSON.stringify(payload);
  let anyFailed = false;

  for (const cmd of commands) {
    console.log(`  ▶  ${cmd}`);
    const result = spawnSync(cmd, {
      shell: true,
      input: payloadJson,
      stdio: ['pipe', 'inherit', 'inherit'],
      env: { ...process.env, ...platformEnvVars },
    });

    if (result.error) {
      console.error(`  ✗  spawn error: ${result.error.message}`);
      anyFailed = true;
    } else if (result.status !== 0) {
      console.log(`  ✗  exit ${result.status}`);
      anyFailed = true;
    } else {
      console.log(`  ✓  exit 0`);
    }
    console.log('');
  }

  if (anyFailed) process.exit(1);
}
```

- [ ] **Step 5: Add `run` case to the switch statement**

Add before `case 'help':`:
```javascript
  case 'run': runRun(args); break;
```

- [ ] **Step 6: Smoke-test the run command with --script**

Create a minimal test script first:
```bash
echo "process.stdin.resume(); process.stdin.once('data', d => { const p = JSON.parse(d); console.log('GOT:', p.hook_event_name); });" > /tmp/test-hook.js
```
On Windows, write this file manually or use node -e to create it, then run:
```
node hookbridge.js run --event SessionStart --script /tmp/test-hook.js
```
Expected: Output shows the payload JSON and `GOT: SessionStart`, then `✓  exit 0`.

- [ ] **Step 7: Verify existing tests still pass**

Run: `node tests/run-all.js`
Expected: `Results: 6 passed, 0 failed, 6 total`

- [ ] **Step 8: Commit**

```bash
cd "C:\Users\Tjerk Pieksma\Documents\Github\hookbridge"
git add hookbridge.js
git commit -m "feat: add run command — simulate hook events locally with mock payloads"
```

---

## Wave 4 — Tests (Task 5)

### Task 5: Create payload-runner tests and register in run-all.js

**Files:**
- Create: `tests/payload-runner.test.js`
- Modify: `tests/run-all.js`

**Does NOT cover:** Integration tests for the spawn behavior (those require child processes and are out of scope — the pure function is fully tested here).

- [ ] **Step 1: Create `tests/payload-runner.test.js`**

```javascript
// hookbridge/tests/payload-runner.test.js
'use strict';

const assert = require('assert');
const { generatePayload } = require('../src/payload-runner');

// Load the real payload schemas for integration with actual data
const claudeCodeSchemas = require('../payloads/claude-code.json');

// Test: verified event returns correct base fields with no warnings
{
  const { payload, warnings } = generatePayload('SessionStart', claudeCodeSchemas, {});
  assert.ok(payload.session_id.startsWith('sess_'), 'session_id starts with sess_');
  assert.strictEqual(payload.hook_event_name, 'SessionStart', 'hook_event_name set correctly');
  assert.ok(typeof payload.cwd === 'string', 'cwd is a string');
  assert.ok(typeof payload.transcript_path === 'string', 'transcript_path is a string');
  assert.ok(payload.transcript_path.includes('.claude'), 'transcript_path contains .claude');
  assert.strictEqual(warnings.length, 0, `No warnings for verified event, got: ${warnings}`);
  console.log('PASS: SessionStart verified event returns correct fields, no warnings');
}

// Test: inferred event returns a warning
{
  const { payload, warnings } = generatePayload('FileChanged', claudeCodeSchemas, {});
  assert.ok(payload.session_id.startsWith('sess_'), 'session_id present');
  assert.strictEqual(payload.hook_event_name, 'FileChanged', 'hook_event_name set');
  assert.ok(warnings.length > 0, 'Warning emitted for inferred event');
  assert.ok(warnings[0].toLowerCase().includes('inferred'), 'Warning mentions inferred');
  console.log('PASS: FileChanged inferred event returns warning');
}

// Test: sentinels resolved in nested objects
{
  const schemas = {
    TestEvent: {
      coverage: 'verified',
      payload: {
        session_id: '__session_id__',
        cwd: '__cwd__',
        hook_event_name: 'TestEvent',
        nested: { tool: '__tool_name__', deep: { ts: '__timestamp__' } },
      },
    },
  };
  const { payload } = generatePayload('TestEvent', schemas, { toolName: 'Write' });
  assert.strictEqual(payload.nested.tool, 'Write', 'Nested __tool_name__ resolved');
  assert.ok(typeof payload.nested.deep.ts === 'string', 'Deeply nested __timestamp__ resolved');
  console.log('PASS: sentinels resolved in nested objects');
}

// Test: --merge overrides generated values and adds new fields
{
  const { payload } = generatePayload('SessionStart', claudeCodeSchemas, {
    merge: { session_id: 'custom-id-123', extra_field: 'hello' },
  });
  assert.strictEqual(payload.session_id, 'custom-id-123', 'merge overrides session_id');
  assert.strictEqual(payload.extra_field, 'hello', 'merge adds new field');
  console.log('PASS: merge overrides generated values');
}

// Test: --tool overrides __tool_name__ sentinel
{
  const { payload } = generatePayload('PreToolUse', claudeCodeSchemas, { toolName: 'Edit' });
  assert.strictEqual(payload.tool_name, 'Edit', 'tool_name overridden by toolName option');
  console.log('PASS: --tool overrides __tool_name__ sentinel');
}

// Test: --cwd overrides __cwd__ sentinel and propagates to transcript_path
{
  const { payload } = generatePayload('SessionStart', claudeCodeSchemas, { cwd: '/custom/project' });
  assert.strictEqual(payload.cwd, '/custom/project', 'cwd overridden');
  assert.ok(payload.transcript_path.startsWith('/custom/project'), 'transcript_path uses custom cwd');
  console.log('PASS: --cwd overrides __cwd__ sentinel');
}

// Test: missing event falls back to base payload with warning
{
  const { payload, warnings } = generatePayload('NonExistentEvent', claudeCodeSchemas, {});
  assert.ok(payload.session_id.startsWith('sess_'), 'base session_id present');
  assert.ok(typeof payload.cwd === 'string', 'base cwd present');
  assert.strictEqual(payload.hook_event_name, 'NonExistentEvent', 'hook_event_name set to requested event');
  assert.ok(warnings.length > 0, 'Warning emitted for missing schema');
  assert.ok(warnings[0].includes('No payload schema'), 'Warning says No payload schema');
  console.log('PASS: missing event falls back to base payload with warning');
}

// Test: base payload always contains required fields
{
  const { payload } = generatePayload('Stop', claudeCodeSchemas, {});
  assert.ok('session_id' in payload, 'payload has session_id');
  assert.ok('cwd' in payload, 'payload has cwd');
  assert.ok('hook_event_name' in payload, 'payload has hook_event_name');
  console.log('PASS: base payload always contains required fields');
}

// Test: each call generates a unique session_id
{
  const { payload: p1 } = generatePayload('SessionStart', claudeCodeSchemas, {});
  const { payload: p2 } = generatePayload('SessionStart', claudeCodeSchemas, {});
  assert.notStrictEqual(p1.session_id, p2.session_id, 'Each call generates a unique session_id');
  console.log('PASS: each call generates a unique session_id');
}

// Test: schema object is not mutated between calls
{
  const schemas = {
    ImmutableEvent: {
      coverage: 'verified',
      payload: { session_id: '__session_id__', cwd: '__cwd__', hook_event_name: 'ImmutableEvent' },
    },
  };
  generatePayload('ImmutableEvent', schemas, { cwd: '/first/call' });
  const { payload } = generatePayload('ImmutableEvent', schemas, { cwd: '/second/call' });
  assert.strictEqual(payload.cwd, '/second/call', 'Second call uses its own cwd, not polluted by first');
  assert.strictEqual(schemas.ImmutableEvent.payload.cwd, '__cwd__', 'Original schema template sentinel unchanged');
  console.log('PASS: schema object not mutated between calls');
}

console.log('\nAll payload runner tests passed.');
```

- [ ] **Step 2: Run the test in isolation**

Run: `node tests/payload-runner.test.js`
Expected: All 10 tests pass, final line `All payload runner tests passed.`

- [ ] **Step 3: Add `payload-runner.test.js` to `tests/run-all.js`**

Find the `tests` array in `tests/run-all.js`. It currently lists 6 files. Add the 7th:
```javascript
const tests = [
  'parser.test.js',
  'adapter-claude-code.test.js',
  'adapter-codex.test.js',
  'loss-report.test.js',
  'integration.test.js',
  'platform-syncer.test.js',
  'payload-runner.test.js',
];
```

- [ ] **Step 4: Run full suite**

Run: `node tests/run-all.js`
Expected: `Results: 7 passed, 0 failed, 7 total`

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Tjerk Pieksma\Documents\Github\hookbridge"
git add tests/payload-runner.test.js tests/run-all.js
git commit -m "test: add payload-runner test suite (10 tests)"
```

---

## Final Verification

After all 5 tasks:

**Full test suite:**
```bash
node tests/run-all.js
```
Expected: `Results: 7 passed, 0 failed, 7 total`

**Help output shows run command:**
```bash
node hookbridge.js help
```
Expected: Output lists `run` in the Commands section.

**Validate example schema still works:**
```bash
node hookbridge.js validate --schema example/plugin.universal.yaml
```
Expected: `Schema valid — 2 platforms, 9 hooks, 1 skill paths`

**Run command with missing --event gives clear error:**
```bash
node hookbridge.js run
```
Expected: `Error: run requires --event (e.g. --event SessionStart)`, exit 2.

**Run command with unknown event gives clear error:**
```bash
node hookbridge.js run --event FakeEvent
```
Expected: `Error: unknown event "FakeEvent"`, exit 2.

---

## Self-Review

**Spec coverage check:**
- ✅ `payloads/claude-code.json` with 26 events → Task 1
- ✅ `payloads/codex.json` with 5 events → Task 1
- ✅ `platforms/*.json` env field → Task 2
- ✅ `src/payload-runner.js` pure function → Task 3
- ✅ `run` command in hookbridge.js → Task 4
- ✅ `--event`, `--tool`, `--merge`, `--script`, `--cwd`, `--platform` flags → Task 4
- ✅ Primary flow (schema-centric) → Task 4
- ✅ Secondary flow (--script override) → Task 4
- ✅ `{PLUGIN_ROOT}` resolved to `path.resolve(args.out)` → Task 4
- ✅ Payload on stdin via spawnSync → Task 4
- ✅ All error handling cases from spec → Task 4
- ✅ `tests/payload-runner.test.js` → Task 5
- ✅ `tests/run-all.js` updated → Task 5

**Type consistency:**
- `generatePayload(event, payloadSchemas, overrides)` defined in Task 3, called in Task 4 — signatures match.
- `overrides.merge` is an object (parsed from JSON string in Task 4 before being passed) — matches `typeof overrides.merge === 'object'` check in Task 3.
- `platformEnvVars` is `{}` by default — matches `Object.assign(spawnEnv, platformEnvVars)` usage.
