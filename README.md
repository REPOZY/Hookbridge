# hookbridge

**One file. Every platform.**

hookbridge lets you build a plugin for AI coding tools — like Claude Code or Codex — without having to maintain separate, incompatible files for each one.

---

## The problem

AI coding tools like **Claude Code** (by Anthropic) and **Codex** (by OpenAI) both support *plugins*. Plugins can run scripts automatically when things happen — when a session starts, when you submit a prompt, when a file gets edited. These automatic scripts are called **hooks**.

The problem: Claude Code and Codex have completely different formats for hooks. They use different file names, different JSON structures, different ways of referencing paths, and different sets of supported events. A plugin built for one platform simply won't work on the other.

**Without hookbridge**, a plugin author has to maintain two separate files by hand:

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

hookbridge generates both platform files automatically — correctly formatted, correctly structured, never out of sync. If a feature you're using doesn't exist on one of the platforms, it tells you exactly what it shimmed (approximated) and what it couldn't support at all.

---

## Who this is for

- **Plugin authors** who want their plugin to work on both Claude Code and Codex without maintaining two separate hook files
- **Anyone adding new platforms** — hookbridge is designed to be extended with adapters for new AI coding tools as the ecosystem grows

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

### `{PLUGIN_ROOT}` — the universal path placeholder

Use `{PLUGIN_ROOT}` in every hook command instead of a hardcoded path. hookbridge replaces it with the correct platform-specific path resolution:

- Claude Code: `"${MY_PLUGIN_ROOT}/hooks/start.js"` (environment variable)
- Codex: `if [ -f "$HOME/.codex/my-plugin/hooks/start.js" ]; then ...` (install path with fallback)

### Supported hook events

| Event | Claude Code | Codex |
|---|---|---|
| `SessionStart` | ✅ Native | ✅ Native |
| `UserPromptSubmit` | ✅ Native | ✅ Native |
| `PreToolUse` | ✅ Native | ✅ Native (Bash only) |
| `PostToolUse` | ✅ Native | ⚠️ Native (Bash only) — Edit/Write shimmed |
| `Stop` | ✅ Native | ✅ Native |
| `SubagentStop` | ✅ Native | 🔧 Shimmed |

---

## The loss report

Not every Claude Code feature exists in Codex (and vice versa). When hookbridge compiles your schema, it writes a `loss-report.md` explaining every gap it found:

| Severity | What it means |
|---|---|
| ✅ **Native** | Works perfectly on this platform |
| 🔧 **Shimmed** | hookbridge generated a workaround script that approximates the behavior. It works, but with limitations (usually fires at session end rather than in real time) |
| 🚫 **Hard limit** | This feature is impossible on this platform. No workaround exists. |
| ⚠️ **Warning** | Supported, but with a caveat (e.g. the `async` flag is ignored on Codex) |

The loss report is not a failure — it's information. It tells you exactly what your plugin users will experience on each platform.

---

## Running the tests

hookbridge has no dependencies beyond Node.js. Tests use Node's built-in `assert` module.

```bash
node tests/run-all.js
```

---

## Extending hookbridge: adding a new platform

hookbridge is built to support more platforms as the AI coding tool ecosystem grows. Each platform is a self-contained adapter file.

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

---

## License

MIT
