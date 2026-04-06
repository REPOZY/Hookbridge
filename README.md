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

**With Hookbridge**, you write one source file:

```yaml
# plugin.universal.yaml — you only touch this file
hooks:
  - event: SessionStart
    command: "node {PLUGIN_ROOT}/hooks/session-start.js"
    platforms: [claude-code, codex]
```

Then run one command from your plugin root:

```bash
hookbridge compile
```

Hookbridge generates both platform files automatically — correctly formatted, correctly structured, never out of sync. If a feature you're using doesn't exist on one of the platforms, it tells you exactly what it shimmed (approximated) and what it couldn't support at all.

---

## Who this is for

- **Plugin authors starting fresh** — write `plugin.universal.yaml` once, compile to all platforms
- **Plugin authors with an existing plugin** — migrate in minutes; see [I already have a plugin](#i-already-have-a-plugin) below
- **Anyone adding new platforms** — Hookbridge is designed to be extended with adapters for new AI coding tools as the ecosystem grows
- **AI-assisted developers** — both usage sections below include ready-to-paste prompts for generating or migrating your schema with an AI assistant

---

## Installation

```bash
npm install -g hookbridge
```

Or use it without installing via npx:

```bash
npx hookbridge compile
```

Requires Node.js 16 or later. No other dependencies.

---

## Quick start (new plugin)

**Step 1 — Create your `plugin.universal.yaml`:**

Copy the example and edit it manually:

```bash
cp node_modules/hookbridge/example/plugin.universal.yaml plugin.universal.yaml
```

Or copy it from [example/plugin.universal.yaml](example/plugin.universal.yaml) and fill in your plugin's details (name, author, hooks).

> **Using an AI assistant?** Paste this into Claude, Codex, or any AI that has access to your filesystem:
>
> ```
> I'm creating a new hookbridge plugin and need you to generate plugin.universal.yaml for me.
>
> Before writing anything:
> 1. Read my current directory. Look for hook scripts in hooks/, manifest files
>    (.claude-plugin/plugin.json, .codex-plugin/plugin.json), README, and package.json.
>    Use these to infer: plugin name, description, license, keywords, and which hooks are needed.
> 2. For the Claude Code env var: look in any existing hooks.json — it appears in every command
>    path as ${ENV_VAR_NAME}/... Extract it from there.
> 3. For the Codex install path: always $HOME/.codex/{plugin-name} — standard Codex convention.
> 4. For anything you still cannot determine, ask me before generating.
>
> Once you have everything, generate a complete plugin.universal.yaml and place it in the
> root of the plugin directory (alongside hooks/ and skills/).
> Use {PLUGIN_ROOT} in all hook command paths. Follow the hookbridge schema exactly.
> ```
>
> The AI will explore your project, ask only for what it can't find, then generate a valid `plugin.universal.yaml`. Run `hookbridge validate` afterward to confirm it's correct.

**Step 2 — Check your schema is valid:**

```bash
hookbridge validate
```

**Step 3 — Compile to your plugin's root directory:**

```bash
hookbridge compile
```

Run this from your plugin's root directory (where `plugin.universal.yaml` lives). Hookbridge writes `hooks/hooks.json` (Claude Code), `hooks/codex-hooks.json` (Codex), and the plugin manifests for both platforms. It also writes `loss-report.md` — more on that below.

**Step 4 — Check for drift after any manual edits:**

```bash
hookbridge diff
```

**Step 5 — Test your hooks locally without a live session:**

```bash
hookbridge run --event SessionStart
```

This fires every hook that matches `SessionStart` with a realistic mock payload — no Claude Code or Codex session needed. See the [run command](#the-run-command) section below.

---

## I already have a plugin

If you already have a working plugin with hand-written `hooks.json` and `codex-hooks.json`, Hookbridge can take over — and `hookbridge diff` makes the migration verifiable with zero risk.

**Step 1 — Write `plugin.universal.yaml` that matches your existing hooks**

Look at your existing `hooks/hooks.json` and recreate the same hooks in `plugin.universal.yaml`. Use the [source file reference](#the-source-file-pluginuniversalyaml) below as a guide. Put the file in your plugin's root directory alongside `hooks/`.

> **Using an AI assistant?** This step is the one most worth delegating. Paste this into Claude, Codex, or any AI that has access to your filesystem:
>
> ```
> I want to migrate my existing plugin to hookbridge. Generate a plugin.universal.yaml for me.
>
> Read these files from my current directory:
> - hooks/hooks.json
> - hooks/codex-hooks.json (if it exists)
> - .claude-plugin/plugin.json (if it exists)
> - .codex-plugin/plugin.json (if it exists)
>
> From hooks.json, extract the Claude Code env var from the command paths (it appears as ${ENV_VAR}/...).
> From the manifest files, extract name, description, license, keywords, display_name, and short_description.
> For the Codex install path: always $HOME/.codex/{plugin-name} — standard Codex convention.
>
> Generate the complete plugin.universal.yaml, place it in the root of the plugin directory
> (alongside hooks/ and skills/), and use {PLUGIN_ROOT} in all hook command paths.
> ```
>
> Then run `hookbridge diff` — if the output says "All files match", the migration is verified and complete.

**Step 2 — Compile to a temporary location first**

```bash
hookbridge compile --out /tmp/hb-preview
```

This generates the files without touching your existing plugin directory.

**Step 3 — Verify the output matches your existing files**

```bash
hookbridge diff
```

Hookbridge compiles in memory and compares the result against the files currently on disk. If everything matches, you'll see:

```
All 4 files match.
```

If there are differences, the diff tells you exactly which files differ and how. Fix your `plugin.universal.yaml` until `diff` reports a clean match.

**Step 4 — Switch over**

Once `diff` is clean:

```bash
hookbridge compile
```

From this point, `plugin.universal.yaml` is your source of truth. Never edit `hooks/hooks.json` or `hooks/codex-hooks.json` directly — they will be overwritten on the next compile. Any future hook changes go into `plugin.universal.yaml` only.

**Step 5 — Add compile to your workflow**

Add hookbridge to your build or publish step so the generated files are always in sync:

```bash
# In a Makefile, CI step, or pre-publish script:
hookbridge compile
```

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
  license: "MIT"                # Optional — emitted into both plugin manifests
  keywords: ["tag1", "tag2"]    # Optional — emitted into both plugin manifests
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
    display_name: "My Plugin"       # Optional — human-readable name shown in Codex UI
                                    # Defaults to meta.name if omitted
    short_description: "One-liner"  # Optional — short blurb shown in Codex UI
                                    # Defaults to description if omitted
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

## CLI reference

All commands are run from your plugin's root directory (where `plugin.universal.yaml` lives). All flags have sensible defaults — in the normal case you won't need any of them.

```
hookbridge <command> [options]

Commands:
  compile    Read plugin.universal.yaml, emit platform files + loss report
  validate   Parse and validate schema only
  diff       Compare compiled output against files on disk
  sync       Check platform docs for new or removed hook events
  run        Simulate an event and fire matching hook scripts locally
  help       Show help

Options (all commands):
  --schema <path>   Path to plugin.universal.yaml (default: ./plugin.universal.yaml)
  --out <dir>       Output root directory (default: . — current directory)
  --platform <id>   Limit to one platform (e.g. codex)

Options (run command only):
  --event <name>    Event to simulate (required)
  --tool <name>     Tool name for tool events (default: Bash)
  --merge <json>    JSON merged into the payload (overrides generated values)
  --script <path>   Run a specific script directly, bypassing schema lookup
  --cwd <path>      Working directory in the payload (default: process.cwd())
```

---

## The run command

Test your hook scripts locally without starting a real Claude Code or Codex session:

```bash
hookbridge run --event SessionStart
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

**Examples:**

```bash
# Fire all SessionStart hooks in your schema
hookbridge run --event SessionStart

# Simulate a PostToolUse with a specific tool
hookbridge run --event PostToolUse --tool Edit

# Override specific payload fields
hookbridge run --event UserPromptSubmit --merge '{"prompt":"hello"}'

# Test a specific script directly (no schema needed)
hookbridge run --event SessionStart --script hooks/session-start.js

# Test against Codex payloads
hookbridge run --event SessionStart --platform codex
```

> **Note on payload accuracy:**
> - **Claude Code:** 6 events (`SessionStart`, `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `Notification`) are verified from official docs. The remaining 20 are inferred — Hookbridge will print a visible warning before running.
> - **Codex:** All 5 events are verified directly from the [Codex CLI source code](https://github.com/openai/codex) (open source). Codex payloads include additional fields not present in Claude Code: `model`, `permission_mode`, `turn_id` (tool events), `tool_use_id` (tool events), and `source` (SessionStart).

---

## The sync command

Platform docs change. New hook events get added, old ones get removed. Running `sync` checks the live documentation for each platform and tells you what's changed:

```bash
hookbridge sync
```

```
hookbridge sync — checking 2 platform(s)

  claude-code... ✓
  codex... ✓

Report: ./platform-sync-report.md
```

If new events are detected, the report lists them and tells you exactly what to update. The command exits 1 if any changes are found — useful in CI.

```bash
hookbridge sync --platform claude-code   # Check one platform only
```

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

## Running the tests

```bash
npm test
```

---

## License

MIT
