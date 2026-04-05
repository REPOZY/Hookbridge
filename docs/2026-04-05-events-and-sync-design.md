# hookbridge: Events Expansion + Sync Command Design

**Date:** 2026-04-05
**Status:** Approved

---

## Goal

Two independent workstreams:
1. Expand hookbridge from 6 → 26 Claude Code events, add support for new hook types (http, prompt, agent)
2. Add a `sync` command that detects future platform doc changes and reports drift

---

## Scope

**In scope:**
- `VALID_EVENTS` expanded to all 26 documented Claude Code events
- `VALID_HOOK_TYPES`: command, http, prompt, agent
- Claude Code adapter emits all 4 hook types natively
- Codex adapter: hard-limit losses for 19 unsupported events; SubagentStart shimmed; non-command types hard-limited
- `platforms/claude-code.json` and `platforms/codex.json` — versioned spec files
- `src/platform-syncer.js` — pure fetch/extract/compare function
- `sync` CLI command writes `platform-sync-report.md`
- All existing tests updated; new tests added

**Not in scope:**
- Auto-patching adapter code from sync results (human reviews the report)
- Support for Codex http/prompt/agent types (Codex only supports `command`)
- Fixing hardcoded "Superpowers Optimized" display name in codex.js manifest (separate issue)

---

## Architecture

```
plugin.universal.yaml
        │
        ▼  parser.js
        IR { meta, hooks[{ event, type, command|url|prompt, ... }] }
        │
   ┌────┴────────────────┐
   ▼                     ▼
claude-code.js         codex.js
emit all 4 types       command only; 19 hard-limits; SubagentStart shimmed

platforms/
  claude-code.json     ← 26 known events, 4 types, doc URL, page hash
  codex.json           ← 5 known events, 1 type, doc URL, page hash

src/platform-syncer.js  ← pure fn: fetch → extract → compare → report object
hookbridge.js sync cmd  ← orchestrates syncer, writes platform-sync-report.md
```

---

## VALID_EVENTS (26)

```
SessionStart, SessionEnd, InstructionsLoaded,
PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied,
UserPromptSubmit,
SubagentStart, SubagentStop, TeammateIdle, TaskCreated, TaskCompleted,
Stop, StopFailure,
FileChanged, CwdChanged, ConfigChange,
WorktreeCreate, WorktreeRemove,
Notification, PreCompact, PostCompact,
Elicitation, ElicitationResult
```

---

## Codex event classification (for all 26)

| Event | Codex status |
|---|---|
| SessionStart | Native |
| PreToolUse (Bash) | Native |
| PostToolUse (Bash) | Native |
| UserPromptSubmit | Native |
| Stop | Native |
| SubagentStop | Shimmed (existing) |
| SubagentStart | Shimmed (new — stop-time transcript analysis) |
| All other 19 events | Hard limit |

---

## IR changes (ir.js)

- `VALID_EVENTS`: expand to 26
- `VALID_HOOK_TYPES = ['command', 'http', 'prompt', 'agent']`
- `HookEntry` typedef: add `type` (default `'command'`), `url`, `prompt`, `model`, `timeout`
- `command` field: required only when `type === 'command'`

---

## Parser changes (parser.js)

- Parse `type` field; default to `'command'` if absent
- Validate against `VALID_HOOK_TYPES`
- Conditional required-field validation:
  - `command` type → `command` field required
  - `http` type → `url` field required
  - `prompt` or `agent` type → `prompt` field required
- `{PLUGIN_ROOT}` substitution remains command-only in adapters

---

## Claude Code adapter changes (src/adapters/claude-code.js)

Replace hardcoded `{ type: 'command', command }` with type-based emit:

```
command → { type: 'command', command, async? }
http    → { type: 'http', url, headers?, allowedEnvVars?, timeout? }
prompt  → { type: 'prompt', prompt, model?, timeout? }
agent   → { type: 'agent', prompt, model?, timeout? }
```

`{PLUGIN_ROOT}` substitution only applies to `command` type (command field only).

---

## Codex adapter changes (src/adapters/codex.js)

Add before existing catch-all (in this order):

1. **Non-command type hard-limit**: if `hook.type && hook.type !== 'command'` → hard-limit loss, skip hook
2. **SubagentStart shim**: same pattern as SubagentStop; adds `shimNeeded.subagentStart = true`
3. Existing catch-all at line 80 already handles remaining unsupported events generically

`stop-shim-template.js`: add `subagentStart` parameter; generates a section that detects Agent tool calls and invokes a `subagent-start.js` hook script.

---

## Platform spec files

### platforms/claude-code.json
```json
{
  "id": "claude-code",
  "docUrls": ["https://code.claude.com/docs/en/hooks"],
  "knownEvents": [ ...26 events... ],
  "knownHookTypes": ["command", "http", "prompt", "agent"],
  "lastChecked": "2026-04-05",
  "pageHashes": {}
}
```

### platforms/codex.json
```json
{
  "id": "codex",
  "docUrls": ["https://developers.openai.com/codex/hooks"],
  "knownEvents": ["SessionStart", "PreToolUse", "PostToolUse", "UserPromptSubmit", "Stop"],
  "knownHookTypes": ["command"],
  "lastChecked": "2026-04-05",
  "pageHashes": {}
}
```

`pageHashes` starts empty; populated on first `sync` run.

---

## Platform syncer (src/platform-syncer.js)

Pure function — no side effects. Input: one platform spec object. Output:

```js
{
  platformId: 'claude-code',
  fetchErrors: [],
  pageChanged: { 'https://...': true/false },
  newEvents: [],        // in docs but not in knownEvents
  removedEvents: [],    // in knownEvents but not in docs
  newHookTypes: [],
  extractionFailed: false  // hash changed but 0 events extracted → alert
}
```

**Extraction strategy:** regex `\|\s*\`([A-Z][a-zA-Z]+)\`\s*\|` on fetched page content (table-row backtick names). Filtered against blocklist of known non-event PascalCase words: `Bash`, `Edit`, `Write`, `Read`, `Glob`, `Grep`, `Agent`, `WebFetch`, `WebSearch`, `JSON`, `Claude`, `MCP`.

**Dependencies:** Node.js built-in `https` (fetch), `crypto.createHash('sha256')` (hashing). Zero npm dependencies.

---

## Sync command (hookbridge.js)

```bash
node hookbridge.js sync                    # all platforms
node hookbridge.js sync --platform codex   # one platform
```

- Reads `platforms/*.json`
- Runs syncer per platform
- Writes `platform-sync-report.md` at `--out` directory
- Exit code 0 if no changes; exit code 1 if new/removed events or fetch errors detected (CI-friendly)

---

## Testing strategy

**Updated tests:**
- `tests/parser.test.js` — add: type field parsing, conditional required-field validation, invalid type rejection
- `tests/adapter-claude-code.test.js` — add: http type emit, prompt type emit, agent type emit
- `tests/adapter-codex.test.js` — add: non-command type hard-limit, SubagentStart shimmed loss

**New tests:**
- `tests/platform-syncer.test.js` — mock HTTPS responses; test: new event detection, removed event detection, hash change detection, extraction failure detection, fetch error handling

---

## Failure modes (resolved)

| Failure | Severity | Mitigation |
|---|---|---|
| Doc URL changes / 404 | Minor | Caught explicitly; report shows "fetch failed: [url]" |
| Regex extracts false-positive PascalCase words | Minor | Blocklist of known non-events; human reviews before any code change |
| SubagentStart shim fires at session end not at spawn time | Minor | Known limitation; documented in loss report as "reactive, not real-time" |
| Hash changes but regex extracts 0 events | Minor | `extractionFailed: true` in result; report says "page changed — manual review required" |

---

## Task groups for implementation plan

**Wave 1 (parallel, no dependencies):**
- Task 1: Update `src/ir.js` — VALID_EVENTS, VALID_HOOK_TYPES, HookEntry typedef
- Task 2: Create `platforms/claude-code.json` and `platforms/codex.json`

**Wave 2 (depends on Wave 1):**
- Task 3: Update `src/parser.js` — type field, conditional validation
- Task 4: Update `src/adapters/claude-code.js` — emit all 4 hook types

**Wave 3 (depends on Wave 2):**
- Task 5: Update `src/adapters/codex.js` — non-command hard-limit, SubagentStart shim
- Task 6: Update `src/shims/stop-shim-template.js` — add subagentStart section

**Wave 4 (depends on Wave 1, parallel):**
- Task 7: Create `src/platform-syncer.js`
- Task 8: Add `sync` command to `hookbridge.js`

**Wave 5 (depends on all above):**
- Task 9: Update all tests (`parser.test.js`, `adapter-claude-code.test.js`, `adapter-codex.test.js`)
- Task 10: Add `tests/platform-syncer.test.js`
- Task 11: Update `example/plugin.universal.yaml` to demonstrate new events and types
