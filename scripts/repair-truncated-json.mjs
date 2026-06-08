#!/usr/bin/env node
// Repair a JSON file truncated mid-write by finding the last position where
// every opened bracket is still tracked, then closing the remaining open
// brackets to produce valid JSON. Data after the truncation is unrecoverable;
// this preserves the longest valid prefix.

import fs from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error('Usage: repair-truncated-json.mjs <input> <output>');
  process.exit(1);
}

const src = fs.readFileSync(inputPath, 'utf8');

let inString = false;
let escape = false;
const stack = [];        // each entry: '{' or '['
let lastCleanPos = -1;
let lastCleanStack = null;

for (let i = 0; i < src.length; i++) {
  const ch = src[i];

  if (escape) { escape = false; continue; }
  if (inString) {
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"')  { inString = false; }
    continue;
  }
  if (ch === '"') { inString = true; continue; }

  if (ch === '{' || ch === '[') {
    stack.push(ch);
  } else if (ch === '}' || ch === ']') {
    const top = stack.pop();
    if ((ch === '}' && top !== '{') || (ch === ']' && top !== '[')) {
      console.error(`Mismatched bracket at position ${i}: expected close of ${top}, got ${ch}`);
      break;
    }
    // Just closed a complete value. This is a clean cut point.
    lastCleanPos = i + 1;
    lastCleanStack = [...stack];
  }
}

if (lastCleanPos < 0) {
  console.error('No clean cut point found — file is irreparable by this method.');
  process.exit(2);
}

const truncated = src.slice(0, lastCleanPos);
const closes = lastCleanStack
  .slice()
  .reverse()
  .map(c => (c === '{' ? '}' : ']'))
  .join('');

const repaired = truncated + closes + '\n';

try {
  JSON.parse(repaired);
} catch (e) {
  console.error('Repair output failed validation:', e.message);
  process.exit(3);
}

fs.writeFileSync(outputPath, repaired);

console.log(`Original size:    ${src.length} bytes`);
console.log(`Repaired size:    ${repaired.length} bytes`);
console.log(`Bytes preserved:  ${lastCleanPos} (${((lastCleanPos / src.length) * 100).toFixed(2)}%)`);
console.log(`Bytes discarded:  ${src.length - lastCleanPos}`);
console.log(`Brackets closed:  ${closes.length} (${closes})`);
console.log(`Wrote:            ${outputPath}`);
