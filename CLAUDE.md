# CLAUDE.md

## Testing

```bash
node tests/run-all.js          # run all 5 suites
node tests/parser.test.js      # run a single suite
```

No test framework — tests use Node's built-in `assert` module directly.

## Critical constraints

- **Zero npm dependencies.** Do not add any. `js-yaml` is vendored in `vendor/` — do not replace it with an npm package. If a new dependency seems needed, vendor it as a single file instead.
- **Adding a platform adapter requires changes in three places:**
  1. Create `src/adapters/<platform-id>.js` with an `emit(ir)` export
  2. Register it in `src/adapter-registry.js`
  3. Add the platform ID to `REGISTERED_ADAPTERS` in `src/parser.js` — missing this causes validation errors for any schema that targets the new platform
