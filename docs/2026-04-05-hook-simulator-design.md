# hookbridge: Hook Event Simulator Design

**Date:** 2026-04-05
**Status:** Approved

---

## Goal

Add a `run` command to hookbridge that fires hook scripts locally with realistic mock payloads — no live Claude Code or Codex session required.

---

## Scope

**In scope:**
- `payloads/claude-code.json` and `payloads/codex.json` — one JSON file per platform containing all event payload schemas
- `src/payload-runner.js` — pure function that resolves dynamic sentinels and returns a mock payload
- `run` command in `hookbridge.js` — spawns hook scripts with the payload on stdin
- `tests/payload-runner.test.js`

**Not in scope:**
- Payload drift detection in `sync` (design leaves the door open; not implemented now)
- Auto-discovery of payload shapes from live sessions
- Non-Node.js hook scripts

---

## Architecture

```
plugin.universal.yaml
        │
        ▼  parser.js (existing)
        IR
        │
        ▼  hookbridge.js runRun()
           1. parse schema → find hooks for event × platform
           2. load payloads/<platform-id>.json
           3. payload-runner.js → resolve sentinels, apply overrides → {payload, warnings}
           4. for each matching hook command: spawn child_process with stdin=payload
           5. forward stdout/stderr; exit with hook exit code

payloads/
  claude-code.json       ← 26 event schemas, coverage annotated
  codex.json             ← 5 event schemas
src/
  payload-runner.js      ← pure function, no spawning, no file I/O (testable)
tests/
  payload-runner.test.js
hookbridge.js            ← add run command + new flags
```

`src/payload-runner.js` is a pure function — same pattern as `src/platform-syncer.js`. It takes an event name, platform spec, and overrides; returns `{ payload, warnings }`. The spawning lives in `hookbridge.js` only.

---

## Payload schema format

`payloads/claude-code.json` is a JSON object keyed by event name:

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
  }
}
```

Events not listed above (`FileChanged`, `PostCompact`, etc.) use `"coverage": "inferred"` with base fields + plausible event-specific fields.

### Coverage values

| Value | Meaning |
|---|---|
| `"verified"` | Payload shape confirmed from official docs or direct observation |
| `"inferred"` | Base fields certain; event-specific fields are best guesses |

When the runner uses an `"inferred"` schema, it prints a visible warning before running.

### Dynamic sentinels

All sentinels use `__name__` format. They are resolved recursively — they work inside nested objects, not just at the top level.

| Sentinel | Resolved to |
|---|---|
| `__session_id__` | `"sess_"` + 12 random hex chars |
| `__cwd__` | `process.cwd()` or `--cwd` flag value |
| `__transcript_path__` | `<cwd>/.claude/transcript.jsonl` |
| `__timestamp__` | `new Date().toISOString()` |
| `__tool_name__` | `"Bash"` by default, overridden by `--tool` flag |

---

## Run command interface

```bash
node hookbridge.js run --event <EventName> [options]

Required:
  --event <name>      Event to simulate (e.g. SessionStart, PreToolUse)

Options:
  --schema <path>     Plugin schema (default: ./plugin.universal.yaml)
  --platform <id>     Platform to simulate (default: claude-code)
  --tool <name>       Tool name for PreToolUse/PostToolUse events (default: Bash)
  --cwd <path>        Working directory in the payload (default: process.cwd())
  --merge <json>      JSON object merged into payload (overrides generated values)
  --script <path>     Run a specific script directly, bypassing schema lookup
```

### Primary flow (schema-centric, default)

1. Parse `plugin.universal.yaml`
2. Find all hooks matching `event × platform`
3. Load `payloads/<platform-id>.json`, look up the event
4. Generate mock payload (resolve sentinels, apply `--tool`, `--cwd`, `--merge`)
5. Print the payload to the terminal for visibility
6. For each matching hook command: resolve `{PLUGIN_ROOT}` to `path.resolve(args.out)` (default: `.`), then `child_process.spawn` the resolved command string with payload on stdin
7. Forward stdout and stderr to terminal
8. Print exit code per hook; exit 1 if any hook exited non-zero

`{PLUGIN_ROOT}` resolves to `--out` (default `.`) because that is the plugin author's working directory — the same root they'd compile into. Users should run `hookbridge run` from their plugin root.

### Secondary flow (script override)

When `--script` is given, skip schema lookup and run that script directly with the generated payload. Still requires `--event` and `--platform` to determine which payload to generate.

### Example terminal output

```
hookbridge run — SessionStart on claude-code

  payload:
  {
    "session_id": "sess_a3f8c21d9b04",
    "transcript_path": "/Users/you/project/.claude/transcript.jsonl",
    "cwd": "/Users/you/project",
    "hook_event_name": "SessionStart"
  }

  ▶  node /Users/you/project/hooks/session-start.js
  [script stdout appears here]
  ✓  exit 0
```

---

## Payload delivery mechanism

Claude Code delivers hook payloads via **stdin** as a JSON string. The run command replicates this exactly:

```javascript
const child = child_process.spawn('node', [scriptPath], {
  stdio: ['pipe', 'inherit', 'inherit'],
  cwd: resolvedCwd,
  env: { ...process.env, ...platformEnvVars },
});
child.stdin.write(JSON.stringify(payload));
child.stdin.end();
```

`platformEnvVars` comes from an `"env"` field in `platforms/claude-code.json` (currently empty, extensible without code changes):
```json
{
  "env": {}
}
```

---

## `src/payload-runner.js` interface

```javascript
/**
 * Generate a mock payload for the given event and platform.
 * Pure function — no file I/O, no spawning.
 *
 * @param {string} event - e.g. 'SessionStart'
 * @param {Object} payloadSchemas - contents of payloads/<platform-id>.json
 * @param {Object} overrides - { cwd, toolName, merge }
 * @returns {{ payload: Object, warnings: string[] }}
 */
function generatePayload(event, payloadSchemas, overrides) { ... }

module.exports = { generatePayload };
```

Returns `warnings` (not throws) so the CLI can print them before running the script without crashing.

---

## Error handling

| Scenario | Behavior |
|---|---|
| `--event` missing | Error: "run requires --event" |
| Event not in VALID_EVENTS | Error: "unknown event X" |
| No hooks match event × platform in schema | Warning + exit 0: "No hooks for X on Y — nothing to run" |
| `payloads/<platform-id>.json` missing | Error: "no payload schema file found for platform X — run is not yet supported for this platform" |
| Event not in payload schema file | Warning: "No payload schema for X — using base payload only" + runs with base fields |
| `--merge` is not valid JSON | Error: "invalid JSON in --merge" |
| Script file does not exist | Error: "script not found: <path>" |
| Script exits non-zero | Propagate exit code, print: "✗ exit N" |

---

## Testing strategy

`tests/payload-runner.test.js` — unit tests, no spawning:

- `generatePayload` returns correct fields for verified events
- `generatePayload` returns `warnings` for inferred events
- Sentinels resolved in nested objects
- `--merge` values override generated values
- `--tool` overrides `__tool_name__` sentinel
- Missing event falls back to base payload with warning
- Base payload always contains `session_id`, `cwd`, `hook_event_name`

---

## Failure modes (resolved)

| Failure | Severity | Mitigation |
|---|---|---|
| Payload schema fields don't match platform's actual payloads | Minor | `coverage` field is explicit; `"inferred"` events print warning; schemas improve over time |
| Platform sets env vars alongside stdin that scripts depend on | Minor | `"env"` field in platform spec; runner sets them when spawning; starts empty, expandable without code changes |
| Event has no payload schema at all | Minor | Falls back to minimal base payload + warning; script still runs |

---

## File map

| File | Action |
|---|---|
| `payloads/claude-code.json` | Create |
| `payloads/codex.json` | Create |
| `src/payload-runner.js` | Create |
| `hookbridge.js` | Modify — add `run` command and new CLI flags |
| `tests/payload-runner.test.js` | Create |
| `platforms/claude-code.json` | Modify — add `"env": {}` field |
| `platforms/codex.json` | Modify — add `"env": {}` field |
