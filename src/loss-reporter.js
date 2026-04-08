// plugin-compiler/src/loss-reporter.js
'use strict';

/**
 * Generate loss-report.md content.
 * @param {Loss[]} losses
 * @param {Object<string, string[]>} filesByPlatform — { platformId: [filenames] }
 * @param {Object} meta — { version, schema }
 * @param {Object<string, {total:number, native:number, shimmed:number, hardLimited:number}>} [fidelityByPlatform]
 * @returns {string}
 */
function generateReport(losses, filesByPlatform, meta, fidelityByPlatform = {}) {
  const lines = [];
  lines.push('# Plugin Compiler — Loss Report');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Schema: ${meta.schema}`);
  lines.push(`Compiler: ${meta.version}`);
  lines.push('');

  // Summary table
  lines.push('## Summary');
  lines.push('| Platform | Files | Fidelity | Approximated | Hard Limits | Warnings | Errors |');
  lines.push('|---|---|---|---|---|---|---|');

  const platforms = Object.keys(filesByPlatform);
  for (const p of platforms) {
    const pLosses = losses.filter(l => l.platform === p);
    const shimmed = pLosses.filter(l => l.severity === 'shimmed').length;
    const hardLimits = pLosses.filter(l => l.severity === 'hard-limit').length;
    const warns = pLosses.filter(l => l.severity === 'warn').length;
    const errors = pLosses.filter(l => l.severity === 'error').length;

    const f = fidelityByPlatform[p];
    let fidelityStr = '—';
    if (f && f.total > 0) {
      const fires = f.native + f.shimmed;
      const pct = Math.round((fires / f.total) * 100);
      fidelityStr = `${fires}/${f.total} (${pct}%)`;
    }

    lines.push(`| ${p} | ${filesByPlatform[p].length} | ${fidelityStr} | ${shimmed} | ${hardLimits} | ${warns} | ${errors} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Per-platform details
  for (const p of platforms) {
    lines.push(`## ${p}`);
    const pLosses = losses.filter(l => l.platform === p);
    if (pLosses.length === 0) {
      lines.push('No losses. All features fully supported natively.');
      lines.push('');
      lines.push('---');
      lines.push('');
      continue;
    }

    for (const loss of pLosses) {
      const label = loss.severity === 'shimmed' ? 'APPROXIMATED'
        : loss.severity === 'hard-limit' ? 'HARD LIMIT'
        : loss.severity === 'error' ? 'ERROR'
        : 'WARN';

      lines.push(`### ${label} — ${loss.feature}`);
      lines.push(`**Reason:** ${loss.reason}`);

      if (loss.shimMechanism) {
        lines.push(`**Approximation mechanism:** ${loss.shimMechanism}`);
      }
      if (loss.limitations) {
        lines.push(`**Limitation:** ${loss.limitations}`);
      }
      if (loss.workaround) {
        lines.push(`**Workaround:** ${loss.workaround}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = { generateReport };
