#!/usr/bin/env node
import chroma from 'chroma-js';

const hexValues = process.argv.slice(2);

if (hexValues.length === 0) {
  console.error('Usage: node hex-to-oklch.js <hex> [hex] ...');
  process.exit(1);
}

hexValues.forEach(hex => {
  try {
    const color = chroma(hex);
    const oklch = color.oklch();
    // Format: oklch(L C H)
    const formatted = `oklch(${oklch[0].toFixed(2)} ${oklch[1].toFixed(2)} ${oklch[2].toFixed(0)})`;
    console.log(`${hex.toUpperCase()} → ${formatted}`);
  } catch (err) {
    console.error(`Error converting ${hex}:`, err.message);
  }
});
