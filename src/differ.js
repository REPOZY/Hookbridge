// plugin-compiler/src/differ.js
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Compare compiled output against files on disk.
 * @param {Map<string, string>} compiledFiles — outputPath → content
 * @param {string} rootDir — base directory for resolving paths
 * @returns {{ matches: string[], diffs: Array<{file: string, type: 'changed'|'missing', detail: string}> }}
 */
function diff(compiledFiles, rootDir) {
  const matches = [];
  const diffs = [];

  for (const [filePath, content] of compiledFiles) {
    const fullPath = path.resolve(rootDir, filePath);

    if (!fs.existsSync(fullPath)) {
      diffs.push({ file: filePath, type: 'missing', detail: 'File does not exist yet' });
      continue;
    }

    const diskContent = fs.readFileSync(fullPath, 'utf8');
    // Normalize line endings for comparison
    const normalizedCompiled = content.replace(/\r\n/g, '\n').trim();
    const normalizedDisk = diskContent.replace(/\r\n/g, '\n').trim();

    if (normalizedCompiled === normalizedDisk) {
      matches.push(filePath);
    } else {
      // Generate simple line-by-line diff summary
      const compiledLines = normalizedCompiled.split('\n');
      const diskLines = normalizedDisk.split('\n');
      let diffCount = 0;
      const maxLen = Math.max(compiledLines.length, diskLines.length);
      for (let i = 0; i < maxLen; i++) {
        if (compiledLines[i] !== diskLines[i]) diffCount++;
      }
      diffs.push({ file: filePath, type: 'changed', detail: `${diffCount} lines differ` });
    }
  }

  return { matches, diffs };
}

module.exports = { diff };
