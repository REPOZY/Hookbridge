#!/usr/bin/env node
// hookbridge/hookbridge.js
'use strict';

const fs = require('fs');
const path = require('path');
const { parse } = require('./src/parser');
const { getAdapter } = require('./src/adapter-registry');
const { generateReport } = require('./src/loss-reporter');
const { diff } = require('./src/differ');
const { syncPlatform } = require('./src/platform-syncer');
const { spawnSync } = require('child_process');
const { generatePayload } = require('./src/payload-runner');
const { VALID_EVENTS } = require('./src/ir');

const VERSION = '0.1.0';

function printHelp() {
  console.log(`hookbridge v${VERSION}

Usage: node hookbridge.js <command> [options]

Commands:
  compile    Read plugin.universal.yaml, emit platform files + shims + loss report
  validate   Parse and validate schema only
  diff       Compare compiled output against files on disk
  sync       Check platform docs for new or removed hook events
  run        Simulate an event and fire matching hook scripts locally
  help       Show this help

Options:
  --schema <path>   Path to plugin.universal.yaml (default: ./plugin.universal.yaml)
  --out <dir>       Output root directory (default: .)
  --dry-run         Print what would be written without touching disk
  --platform <id>   Limit sync to one platform (e.g. codex)
  --event <name>    Event to simulate (e.g. SessionStart, PreToolUse)
  --tool <name>     Tool name for tool events (default: Bash)
  --merge <json>    JSON merged into the payload (overrides generated values)
  --script <path>   Run a specific script directly, bypassing schema lookup
  --cwd <path>      Working directory in the payload (default: process.cwd())
`);
}

function parseArgs(argv) {
  const args = { command: null, schema: 'plugin.universal.yaml', out: '.', dryRun: false, platform: null, event: null, tool: 'Bash', merge: null, script: null, cwd: null };
  let i = 2; // skip node and script path
  if (argv[i] && !argv[i].startsWith('-')) {
    args.command = argv[i++];
  }
  while (i < argv.length) {
    if (argv[i] === '--schema' && argv[i + 1]) { args.schema = argv[++i]; }
    else if (argv[i] === '--out' && argv[i + 1]) { args.out = argv[++i]; }
    else if (argv[i] === '--dry-run') { args.dryRun = true; }
    else if (argv[i] === '--platform' && argv[i + 1]) { args.platform = argv[++i]; }
    else if (argv[i] === '--event' && argv[i + 1]) { args.event = argv[++i]; }
    else if (argv[i] === '--tool' && argv[i + 1]) { args.tool = argv[++i]; }
    else if (argv[i] === '--merge' && argv[i + 1]) { args.merge = argv[++i]; }
    else if (argv[i] === '--script' && argv[i + 1]) { args.script = argv[++i]; }
    else if (argv[i] === '--cwd' && argv[i + 1]) { args.cwd = argv[++i]; }
    i++;
  }
  return args;
}

function runCompile(args) {
  const schemaPath = path.resolve(args.schema);
  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: schema file not found: ${schemaPath}`);
    process.exit(2);
  }

  const yamlContent = fs.readFileSync(schemaPath, 'utf8');
  const { ir, errors, warnings } = parse(yamlContent);

  if (warnings.length > 0) {
    for (const w of warnings) console.warn(`  WARN: ${w}`);
  }

  if (errors.length > 0) {
    console.error('hookbridge: schema validation failed\n');
    for (const e of errors) console.error(`  ${e}`);
    console.error(`\n${errors.length} errors. Nothing compiled.`);
    process.exit(2);
  }

  console.log(`hookbridge v${VERSION}\n`);
  console.log(`Compiling ${path.basename(schemaPath)}...\n`);

  const allLosses = [];
  const allFiles = new Map();
  const filesByPlatform = {};

  for (const platformId of ir.meta.platforms) {
    const adapter = getAdapter(platformId);
    if (!adapter) {
      console.error(`  No adapter registered for platform: ${platformId}`);
      process.exit(1);
    }

    try {
      const result = adapter.emit(ir);

      filesByPlatform[platformId] = [];

      // Merge files
      for (const [filePath, content] of result.files) {
        allFiles.set(filePath, content);
        filesByPlatform[platformId].push(filePath);
        console.log(`  ${platformId.padEnd(12)} +  ${filePath}`);
      }

      // Merge shims
      for (const [filePath, content] of result.shims) {
        allFiles.set(filePath, content);
        filesByPlatform[platformId].push(filePath);
        console.log(`  ${platformId.padEnd(12)} +  ${filePath} (shim)`);
      }

      allLosses.push(...result.losses);
    } catch (e) {
      console.error(`\nhookbridge: adapter error (${platformId})\n`);
      console.error(`  ${e.stack || e.message}`);
      process.exit(1);
    }
  }

  // Check for error-level losses
  const errorLosses = allLosses.filter(l => l.severity === 'error');
  if (errorLosses.length > 0) {
    console.error('\nError-level losses detected — nothing written:\n');
    for (const l of errorLosses) console.error(`  [${l.platform}] ERROR: ${l.feature} — ${l.reason}`);
    process.exit(1);
  }

  // Write files (unless dry-run)
  const outDir = path.resolve(args.out);
  if (!args.dryRun) {
    for (const [filePath, content] of allFiles) {
      const fullPath = path.join(outDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, content, 'utf8');
    }
  } else {
    console.log('\n  --dry-run: no files written to disk');
  }

  // Generate and write loss report
  const report = generateReport(allLosses, filesByPlatform, {
    version: VERSION,
    schema: path.basename(schemaPath),
  });
  const reportPath = path.join(outDir, 'loss-report.md');
  if (!args.dryRun) {
    fs.writeFileSync(reportPath, report, 'utf8');
  }

  // Print summary
  const shimmed = allLosses.filter(l => l.severity === 'shimmed').length;
  const hardLimits = allLosses.filter(l => l.severity === 'hard-limit').length;
  const warns = allLosses.filter(l => l.severity === 'warn').length;

  if (allLosses.length > 0) {
    console.log(`\nLoss report (${shimmed} shimmed, ${hardLimits} hard limits, ${warns} warnings):`);
    for (const l of allLosses) {
      const label = l.severity === 'shimmed' ? 'SHIM'
        : l.severity === 'hard-limit' ? 'HARD'
        : l.severity === 'error' ? 'ERR '
        : 'WARN';
      console.log(`  [${l.platform}]  ${label}  ${l.feature} — ${l.reason.split('.')[0]}`);
    }
  }

  console.log(`\nFull report written to: ${reportPath}`);
  console.log(`\nDone. ${allFiles.size} files${args.dryRun ? ' (dry-run)' : ' written'}, ${shimmed} shimmed, ${hardLimits} hard limits, ${warns} warnings.`);
}

function runValidate(args) {
  const schemaPath = path.resolve(args.schema);
  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: schema file not found: ${schemaPath}`);
    process.exit(2);
  }

  const yamlContent = fs.readFileSync(schemaPath, 'utf8');
  const { ir, errors, warnings } = parse(yamlContent);

  for (const w of warnings) console.warn(`  WARN: ${w}`);

  if (errors.length > 0) {
    console.error('Schema invalid:\n');
    for (const e of errors) console.error(`  ${e}`);
    process.exit(2);
  }

  console.log(`Schema valid — ${ir.meta.platforms.length} platforms, ${ir.hooks.length} hooks, ${ir.skills.length} skill paths`);
}

function runDiff(args) {
  const schemaPath = path.resolve(args.schema);
  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: schema file not found: ${schemaPath}`);
    process.exit(2);
  }

  const yamlContent = fs.readFileSync(schemaPath, 'utf8');
  const { ir, errors } = parse(yamlContent);

  if (errors.length > 0) {
    console.error('Schema invalid — cannot diff.\n');
    for (const e of errors) console.error(`  ${e}`);
    process.exit(2);
  }

  // Compile in memory
  const allFiles = new Map();
  for (const platformId of ir.meta.platforms) {
    const adapter = getAdapter(platformId);
    if (!adapter) continue;
    const result = adapter.emit(ir);
    for (const [p, c] of result.files) allFiles.set(p, c);
    for (const [p, c] of result.shims) allFiles.set(p, c);
  }

  const outDir = path.resolve(args.out);
  const { matches, diffs } = diff(allFiles, outDir);

  for (const m of matches) console.log(`  = ${m}  — matches compiler output`);
  for (const d of diffs) {
    const icon = d.type === 'missing' ? '?' : '!';
    console.log(`  ${icon} ${d.file}  — ${d.detail}`);
  }

  if (diffs.length === 0) {
    console.log(`\nAll ${matches.length} files match.`);
    process.exit(0);
  } else {
    console.log(`\n${matches.length} match, ${diffs.length} differ.`);
    process.exit(1);
  }
}

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

// Main
const args = parseArgs(process.argv);

switch (args.command) {
  case 'compile': runCompile(args); break;
  case 'validate': runValidate(args); break;
  case 'diff': runDiff(args); break;
  case 'sync':
    runSync(args).catch(e => {
      console.error(`hookbridge: sync error\n  ${e.stack || e.message}`);
      process.exit(1);
    });
    break;
  case 'run': runRun(args); break;
  case 'help': printHelp(); break;
  default:
    printHelp();
    process.exit(args.command ? 1 : 0);
}
