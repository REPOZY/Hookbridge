# Hookbridge

**One file. Every platform.**

Hookbridge lets you build a plugin for AI coding tools — like Claude Code or Codex — without having to maintain separate, incompatible files for each one.

---

## The problem

AI coding tools like **Claude Code** (by Anthropic) and **Codex** (by OpenAI) both support *plugins*. Plugins can run scripts automatically when things happen — when a session starts, when you submit a prompt, when a file gets edited. These automatic scripts are called **hooks**.

The problem: Claude Code and Codex have completely different formats for hooks. They use different file names, different JSON structures, different ways of referencing paths, and different sets of supported events. A plugin built for one platform simply won't work on the other.

**Without Hookbridge**, a plugin author has to maintain two separate files by hand:

```
hooks/
├── hooks.json          ← Claude Code format
└── codex-hooks.json    ← Codex format (completely different structure)
```

These files get out of sync. A change in one is forgotten in the other. And if a feature exists in Claude Code but not in Codex, there's no guidance on what to do.

**With hookbridge**, you write one source file:

```yaml
# plugin.universal.yaml — you only touch this file
hooks:
  - event: SessionStart
    command: "node {PLUGIN_ROOT}/hooks/session-start.js"
    platforms: [claude-code, codex]
```

Then run one command:

```bash
node hookbridge.js compile --schema plugin.universal.yaml --out .
```

Hookbridge generates both platform files automatically — correctly formatted, correctly structured, never out of sync. If a feature you're using doesn't exist on one of the platforms, it tells you exactly what it shimmed (approximated) and what it couldn't support at all.

---

## Who this is for

- **Plugin authors** who want their plugin to work on both Claude Code and Codex without maintaining two separate hook files
- **Anyone adding new platforms** — Hookbridge is designed to be extended with adapters for new AI coding tools as the ecosystem grows

---

## Quick start

**Step 1 — Copy the example schema and adapt it to your plugin:**

```bash
cp example/plugin.universal.yaml my-plugin.yaml
```

Open `my-plugin.yaml` and fill in your plugin's details (name, author, hooks).

**Step 2 — Check your schema is valid:**

```bash
node hookbridge.js validate --schema my-plugin.yaml
```

**Step 3 — Compile to your plugin's root directory:**

```bash
node hookbridge.js compile --schema my-plugin.yaml --out /path/to/your/plugin
```

This writes `hooks/hooks.json` (Claude Code), `hooks/codex-hooks.json` (Codex), and the plugin manifests for both platforms. It also writes `loss-report.md` — more on that below.

**Step 4 — Check for drift after any manual edits:**

```bash
node hookbridge.js diff --schema my-plugin.yaml --out /path/to/your/plugin
```

**Step 5 — Test your hooks locally without a live session:**

```bash
node hookbridge.js run --event SessionStart --schema my-plugin.yaml
```

This fires every hook that matches `SessionStart` with a realistic mock payload — no Claude Code or Codex session needed. See the [run command](#the-run-command) section below.

---

## The source file: plugin.universal.yaml

This is the only file you maintain by hand. Everything else gets generated from it.

```yaml
meta:
  name: my-plugin               # Your plugin's identifier
  version: "1.0.0"
  description: "What it does"
  author: "Your Name"
  homepage: "https://github.com/you/my-plugin"
  repository: "https://github.com/you/my-plugin"
  platforms: [claude-code, codex]   # Which platforms to compile for

hooks:
  - event: SessionStart             # When does this hook fire?
    command: "node {PLUGIN_ROOT}/hooks/start.js"  # What script runs?
    platforms: [claude-code, codex] # On which platforms?

  - event: PostToolUse
    matcher: "Edit|Write"           # Only fires when these tools are used
    command: "node {PLUGIN_ROOT}/hooks/track-edits.js"
    platforms: [claude-code]        # Claude Code only — Codex can't do this natively

  - event: PostToolUse              # Claude Code also supports http, prompt, agent types
    type: http
    url: "https://audit.example.com/tool-use"
    platforms: [claude-code]

skills:
  - path: skills/
    recursive: true

extensions:
  claude-code:
    env_var: MY_PLUGIN_ROOT         # The env var Claude Code uses to find your plugin
    description: "Claude Code description"

  codex:
    install_path: "$HOME/.codex/{meta.name}"
    description: "Codex description"
```

### Hook types

The `type` field controls how Claude Code dispatches the hook. Codex supports `command` only; other types produce a hard-limit loss on Codex.

| Type | Required field | Behavior |
|---|---|---|
| `command` (default) | `command` | Runs a shell command; payload delivered via stdin |
| `http` | `url` | POST request to the URL with payload as JSON body |
| `prompt` | `prompt` | Sends a prompt to Claude; supports optional `model` field |
| `agent` | `prompt` | Runs an agent with the prompt; supports optional `model` field |

### `{PLUGIN_ROOT}` — the universal path placeholder

Use `{PLUGIN_ROOT}` in every hook command instead of a hardcoded path. Hookbridge replaces it with the correct platform-specific path resolution:

- Claude Code: `"${MY_PLUGIN_ROOT}/hooks/start.js"` (environment variable)
- Codex: `if [ -f "$HOME/.codex/my-plugin/hooks/start.js" ]; then ...` (install path with fallback)

### Supported hook events

Claude Code supports 26 events. Codex supports 5. The table below shows the events both platforms share; the remaining Claude Code-only events are listed afterward.

| Event | Claude Code | Codex |
|---|---|---|
| `SessionStart` | ✅ Native | ✅ Native |
| `UserPromptSubmit` | ✅ Native | ✅ Native |
| `PreToolUse` | ✅ Native | ✅ Native (Bash only) |
| `PostToolUse` | ✅ Native | ⚠️ Native (Bash only) — Edit/Write shimmed |
| `Stop` | ✅ Native | ✅ Native |

**Claude Code-only events** (all produce a hard-limit loss on Codex):

`SessionEnd` · `InstructionsLoaded` · `PostToolUseFailure` · `PermissionRequest` · `PermissionDenied` · `SubagentStart` · `SubagentStop` · `TeammateIdle` · `TaskCreated` · `TaskCompleted` · `StopFailure` · `FileChanged` · `CwdChanged` · `ConfigChange` · `WorktreeCreate` · `WorktreeRemove` · `Notification` · `PreCompact` · `PostCompact` · `Elicitation` · `ElicitationResult`

`SubagentStop` and `SubagentStart` are shimmed on Codex via stop-time transcript analysis (fires at session end, not in real time).

---

## The sync command

Platform docs change. New hook events get added, old ones get removed. Running `sync` checks the live documentation for each platform and tells you what's changed:

```bash
node hookbridge.js sync
```

```
hookbridge sync — checking 2 platform(s)

  claude-code... ✓
  codex... ✓

Report: ./platform-sync-report.md
```

If new events are detected, the report lists them and tells you exactly what to update (`src/ir.js` VALID_EVENTS and the relevant adapter). The command exits 1 if any changes are found — useful in CI.

```bash
node hookbridge.js sync --platform claude-code   # Check one platform only
```

---

## The run command

Test your hook scripts locally without starting a real Claude Code or Codex session:

```bash
node hookbridge.js run --event SessionStart
```

Hookbridge generates a realistic mock payload and fires every hook in your schema that matches the event, passing the payload via stdin — exactly how the real platform does it.

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

**Options:**

```bash
--event <name>    Event to simulate (required)
--platform <id>   Platform to simulate (default: claude-code)
--tool <name>     Tool name for PreToolUse/PostToolUse payloads (default: Bash)
--cwd <path>      Working directory in the payload (default: process.cwd())
--merge <json>    JSON object merged into the payload (overrides generated values)
--script <path>   Run a specific script directly, bypassing schema lookup
```

**Examples:**

```bash
# Fire all SessionStart hooks in your schema
node hookbridge.js run --event SessionStart --schema my-plugin.yaml

# Simulate a PostToolUse with a specific tool
node hookbridge.js run --event PostToolUse --tool Edit

# Override specific payload fields
node hookbridge.js run --event UserPromptSubmit --merge '{"prompt":"hello"}'

# Test a specific script directly (no schema needed)
node hookbridge.js run --event SessionStart --script hooks/session-start.js
```

> **Note on payload accuracy:** The 6 core events (`SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `Notification`) use verified payload shapes from the official docs. The remaining 20 events use inferred shapes — Hookbridge will print a visible warning before running, reminding you to verify the fields against a live session.

---

## The loss report

Not every Claude Code feature exists in Codex (and vice versa). When Hookbridge compiles your schema, it writes a `loss-report.md` explaining every gap it found:

| Severity | What it means |
|---|---|
| ✅ **Native** | Works perfectly on this platform |
| 🔧 **Shimmed** | Hookbridge generated a workaround script that approximates the behavior. It works, but with limitations (usually fires at session end rather than in real time) |
| 🚫 **Hard limit** | This feature is impossible on this platform. No workaround exists. |
| ⚠️ **Warning** | Supported, but with a caveat (e.g. the `async` flag is ignored on Codex) |

The loss report is not a failure — it's information. It tells you exactly what your plugin users will experience on each platform.

---

## Running the tests

Hookbridge has no dependencies beyond Node.js. Tests use Node's built-in `assert` module.

```bash
node tests/run-all.js
```

---

## Extending Hookbridge: adding a new platform

Hookbridge is built to support more platforms as the AI coding tool ecosystem grows. Each platform is a self-contained adapter file.

**Three things to add** when supporting a new platform:

1. **Create the adapter:** `src/adapters/<platform-id>.js`
   — implement one function: `emit(ir)` that returns `{ files, shims, losses }`
   — see `src/adapters/claude-code.js` for a reference implementation

2. **Register the adapter:** add it to `src/adapter-registry.js`

3. **Register the platform ID:** add the ID to `REGISTERED_ADAPTERS` in `src/parser.js`
   *(this step is easy to forget — it's what lets schemas declare the new platform as a target)*

---

## How it works under the hood

```
plugin.universal.yaml
        │
        ▼
   parser.js     →   IR (Intermediate Representation)
                      A normalized, platform-agnostic object:
                      { meta, hooks, skills, extensions }
        │
   ┌────┴────┐
   ▼         ▼
claude-code  codex        Adapters — one per platform, stateless
   │         │            Each reads the IR and writes its own native files
   ▼         ▼
hooks.json  codex-hooks.json
+ .claude-plugin/plugin.json
+ .codex-plugin/plugin.json
+ stop-shim.js (Codex only, when needed)
+ loss-report.md
```

The key design decision: **adapters never see the raw YAML**. They only see the normalized IR. This means adding a new platform never requires understanding what another platform does — each adapter is fully independent.

The `sync` command reads `platforms/<id>.json` spec files to know what events are expected, fetches live doc pages, and compares them — no adapter code involved.

The `run` command reads `payloads/<id>.json` for mock payload templates, resolves dynamic fields (session IDs, paths, timestamps), then spawns your hook scripts with the payload on stdin. It never calls the adapters — it works directly from the schema's IR.

---

## License

MIT
