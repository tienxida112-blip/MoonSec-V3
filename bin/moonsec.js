#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { obfuscate } = require('../src/obfuscate');

function usage() {
  console.log(`MoonSec V3  —  Lua/Roblox VM obfuscator

Usage:
  node bin/moonsec.js <input.lua> [-o output.lua] [--seed N] [--no-watermark]
`);
}

function arg(args, name, def) {
  const i = args.indexOf(name);
  if (i < 0) return def;
  return args[i + 1];
}

function main(argv) {
  if (!argv.length || argv[0] === 'help' || argv[0] === '-h' || argv[0] === '--help') {
    return usage();
  }
  if (argv[0] === 'obfuscate') argv = argv.slice(1);
  const input = argv[0];
  if (!input) return usage();
  const src = fs.readFileSync(input, 'utf8');
  const out = arg(argv, '-o', input.replace(/\.lua$/, '') + '.obfuscated.lua');
  const seed = arg(argv, '--seed');
  const res = obfuscate(src, {
    seed: seed !== undefined ? Number(seed) : undefined,
    watermark: !argv.includes('--no-watermark'),
  });
  fs.writeFileSync(out, res.output);
  console.log(`obfuscated ${input} -> ${out}  (${Buffer.byteLength(res.output, 'utf8')} bytes)`);
}

main(process.argv.slice(2));
